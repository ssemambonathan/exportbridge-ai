import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { getDb, withTransaction } from '../db/database.ts';
import { generateSessionToken, hashPassword, hashToken, verifyPassword } from '../security/crypto.ts';
import { createRateLimiter, isInternalOpsRole, recordAuditLog } from '../security/rbac.ts';
import { AuthenticatedRequest, COOKIE_NAME, requireAuth, requirePermission } from '../middleware/auth.ts';
import { UserRole } from '../../shared/types.ts';

const router = Router();
const authLimiter = createRateLimiter(40, 60_000);

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(180),
  password: z.string().min(8).max(128),
  organisationName: z.string().min(2).max(160),
  organisationType: z.enum(['supplier', 'buyer', 'internal_ops']).default('supplier'),
  country: z.string().min(2).max(80).default('Uganda'),
  registrationNumber: z.string().max(80).optional(),
  website: z.string().max(200).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setSessionCookie(res: any, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post('/register', authLimiter, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid registration input', details: parsed.error.flatten() });
  }

  const data = parsed.data;
  const db = getDb();
  const normalizedEmail = data.email.trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // Public registration can create supplier or buyer orgs; internal_ops requires existing admin provisioning
  const safeOrgType = data.organisationType === 'internal_ops' ? 'supplier' : data.organisationType;
  const defaultRole: UserRole = safeOrgType === 'buyer' ? 'buyer_admin' : 'supplier_admin';

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  withTransaction((tx) => {
    tx.prepare(`
      INSERT INTO organisations (id, name, type, country, registration_number, website, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(
      orgId,
      data.organisationName.trim(),
      safeOrgType,
      data.country.trim(),
      data.registrationNumber?.trim() || null,
      data.website?.trim() || null
    );

    tx.prepare(`
      INSERT INTO users (id, email, full_name, password_hash, last_login_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(userId, normalizedEmail, data.fullName.trim(), hashPassword(data.password));

    tx.prepare(`
      INSERT INTO organisation_memberships (id, organisation_id, user_id, role, is_primary)
      VALUES (?, ?, ?, ?, 1)
    `).run(crypto.randomUUID(), orgId, userId, defaultRole);

    tx.prepare(`
      INSERT INTO sessions (id, user_id, organisation_id, token_hash, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), userId, orgId, tokenHash, expiresAt, req.ip || null, req.headers['user-agent'] || null);
  });

  recordAuditLog({
    organisationId: orgId,
    actorUserId: userId,
    eventType: 'user_registered',
    entityType: 'user',
    entityId: userId,
    action: `Registered organisation "${data.organisationName}" (${safeOrgType}) with admin user ${normalizedEmail}`,
    ipAddress: req.ip,
  });

  setSessionCookie(res, token);
  return res.status(201).json({
    token,
    user: {
      userId,
      email: normalizedEmail,
      fullName: data.fullName.trim(),
      organisationId: orgId,
      organisationName: data.organisationName.trim(),
      organisationType: safeOrgType,
      role: defaultRole,
      isDemoUser: false,
    },
  });
});

router.post('/login', authLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email and password are required.' });
  }

  const db = getDb();
  const email = parsed.data.email.trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as any;

  if (!user || user.status !== 'active' || !verifyPassword(parsed.data.password, user.password_hash)) {
    recordAuditLog({
      eventType: 'login_failed',
      severity: 'warning',
      action: `Failed login attempt for ${email}`,
      outcome: 'denied',
      ipAddress: req.ip,
    });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const membership = db.prepare(`
    SELECT m.role, o.id AS org_id, o.name AS org_name, o.type AS org_type, o.is_demo
    FROM organisation_memberships m
    JOIN organisations o ON o.id = m.organisation_id
    WHERE m.user_id = ? AND o.status = 'active'
    ORDER BY m.is_primary DESC, m.created_at ASC
    LIMIT 1
  `).get(user.id) as any;

  if (!membership) {
    return res.status(403).json({ error: 'No active organisation membership found for account.' });
  }

  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
  db.prepare(`
    INSERT INTO sessions (id, user_id, organisation_id, token_hash, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), user.id, membership.org_id, tokenHash, expiresAt, req.ip || null, req.headers['user-agent'] || null);

  recordAuditLog({
    organisationId: membership.org_id,
    actorUserId: user.id,
    eventType: 'user_login',
    entityType: 'user',
    entityId: user.id,
    action: `User ${email} signed in`,
    ipAddress: req.ip,
  });

  setSessionCookie(res, token);
  return res.json({
    token,
    user: {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      organisationId: membership.org_id,
      organisationName: membership.org_name,
      organisationType: membership.org_type,
      role: membership.role,
      isDemoUser: membership.is_demo === 1,
    },
  });
});

router.post('/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const authHeader = req.headers.authorization;
  const cookieHeader = req.headers.cookie;
  let rawToken: string | null = null;
  if (authHeader?.startsWith('Bearer ')) rawToken = authHeader.slice(7).trim();
  else if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)eb_session=([^;]+)/);
    if (match) rawToken = decodeURIComponent(match[1]);
  }
  if (rawToken) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(rawToken));
  }
  recordAuditLog({
    organisationId: req.auth?.organisationId,
    actorUserId: req.auth?.userId,
    eventType: 'user_logout',
    action: `User ${req.auth?.email} signed out`,
    ipAddress: req.ip,
  });
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ success: true });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  return res.json({ user: req.auth });
});

router.post('/forgot-password', authLimiter, (req, res) => {
  const email = z.string().email().safeParse(req.body?.email);
  if (!email.success) return res.status(400).json({ error: 'Valid email is required.' });

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.data.toLowerCase()) as { id: string } | undefined;
  let resetTokenPreview: string | undefined;

  if (user) {
    const rawToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), user.id, hashToken(rawToken), expiresAt);
    recordAuditLog({
      actorUserId: user.id,
      eventType: 'password_reset_requested',
      action: `Password reset token generated for ${email.data.toLowerCase()}`,
      ipAddress: req.ip,
    });
    // In local/test mode without SMTP configured, return integration boundary notice (token not leaked in prod)
    if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
      resetTokenPreview = rawToken;
    }
  }

  return res.json({
    message: 'If an account matches that email, password recovery instructions have been processed.',
    smtpConfigured: Boolean(process.env.SMTP_HOST),
    ...(resetTokenPreview ? { devResetToken: resetTokenPreview } : {}),
  });
});

router.post('/reset-password', authLimiter, (req, res) => {
  const parsed = z.object({
    token: z.string().min(10),
    newPassword: z.string().min(8).max(128),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid reset token and new password (min 8 chars) required.' });

  const db = getDb();
  const tokenHash = hashToken(parsed.data.token);
  const reset = db.prepare(`SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL`).get(tokenHash) as any;

  if (!reset || new Date(reset.expires_at).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired password reset token.' });
  }

  withTransaction((tx) => {
    tx.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      hashPassword(parsed.data.newPassword),
      reset.user_id
    );
    tx.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(reset.id);
    tx.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(reset.user_id);
  });

  recordAuditLog({
    actorUserId: reset.user_id,
    eventType: 'password_reset_completed',
    action: 'Password successfully reset and prior sessions invalidated',
    ipAddress: req.ip,
  });

  return res.json({ success: true });
});

// Organisation Management (Module 1)
router.get('/organisations', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const auth = req.auth!;
  const orgs = isInternalOpsRole(auth.role)
    ? db.prepare(`SELECT * FROM organisations ORDER BY created_at DESC`).all()
    : db.prepare(`SELECT * FROM organisations WHERE id = ?`).all(auth.organisationId);

  const members = isInternalOpsRole(auth.role)
    ? db.prepare(`
        SELECT m.id, m.organisation_id, m.role, m.created_at, u.id AS user_id, u.email, u.full_name, u.status
        FROM organisation_memberships m
        JOIN users u ON u.id = m.user_id
        ORDER BY m.created_at DESC
      `).all()
    : db.prepare(`
        SELECT m.id, m.organisation_id, m.role, m.created_at, u.id AS user_id, u.email, u.full_name, u.status
        FROM organisation_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.organisation_id = ?
        ORDER BY m.created_at DESC
      `).all(auth.organisationId);

  return res.json({ organisations: orgs, memberships: members });
});

router.post('/organisations/members', requireAuth, requirePermission('org:manage'), (req: AuthenticatedRequest, res) => {
  const parsed = z.object({
    email: z.string().email(),
    fullName: z.string().min(2),
    password: z.string().min(8),
    role: z.enum(['ops_manager', 'compliance_officer', 'supplier_admin', 'supplier_member', 'buyer_admin', 'buyer_member']),
    organisationId: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid member input', details: parsed.error.flatten() });

  const auth = req.auth!;
  const targetOrgId = isInternalOpsRole(auth.role) && parsed.data.organisationId
    ? parsed.data.organisationId
    : auth.organisationId;

  // Prevent non-internal users from assigning internal ops roles
  if (!isInternalOpsRole(auth.role) && ['ops_manager', 'compliance_officer'].includes(parsed.data.role)) {
    return res.status(403).json({ error: 'Forbidden: cannot assign internal operations role.' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'User with this email already exists.' });

  const newUserId = crypto.randomUUID();
  withTransaction((tx) => {
    tx.prepare(`INSERT INTO users (id, email, full_name, password_hash) VALUES (?, ?, ?, ?)`).run(
      newUserId,
      parsed.data.email.toLowerCase(),
      parsed.data.fullName.trim(),
      hashPassword(parsed.data.password)
    );
    tx.prepare(`INSERT INTO organisation_memberships (id, organisation_id, user_id, role, is_primary) VALUES (?, ?, ?, ?, 1)`).run(
      crypto.randomUUID(),
      targetOrgId,
      newUserId,
      parsed.data.role
    );
  });

  recordAuditLog({
    organisationId: targetOrgId,
    actorUserId: auth.userId,
    eventType: 'member_created',
    entityType: 'user',
    entityId: newUserId,
    action: `Added member ${parsed.data.email.toLowerCase()} with role ${parsed.data.role}`,
    ipAddress: req.ip,
  });

  return res.status(201).json({ userId: newUserId, email: parsed.data.email.toLowerCase(), role: parsed.data.role });
});

router.post('/firebase-sync', authLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Firebase Bearer ID token.' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const { adminAuth } = await import('../../lib/firebase-admin.ts');
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.email) {
      return res.status(400).json({ error: 'Verified email address is required from Google Sign-In.' });
    }

    const normalizedEmail = decoded.email.trim().toLowerCase();
    const displayName = (decoded.name || normalizedEmail.split('@')[0] || 'Google Workspace Member').slice(0, 120);

    // Sync user into Cloud SQL (PostgreSQL) lazily via Drizzle
    try {
      const { getOrCreateUser } = await import('../../db/users.ts');
      await getOrCreateUser(decoded.uid, normalizedEmail, displayName);
    } catch (sqlErr) {
      console.error('Non-fatal Cloud SQL user sync notice:', sqlErr);
    }

    const db = getDb();
    let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizedEmail) as any;
    let membership: any = null;

    if (user) {
      membership = db.prepare(`
        SELECT m.role, o.id AS org_id, o.name AS org_name, o.type AS org_type, o.is_demo
        FROM organisation_memberships m
        JOIN organisations o ON o.id = m.organisation_id
        WHERE m.user_id = ? AND o.status = 'active'
        ORDER BY m.is_primary DESC, m.created_at ASC
        LIMIT 1
      `).get(user.id);
    }

    if (!user || !membership) {
      const userId = user?.id || crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const assignedRole: UserRole = normalizedEmail === 'aurthursir08@gmail.com' ? 'founder_admin' : 'supplier_admin';
      const orgType = assignedRole === 'founder_admin' ? 'internal_ops' : 'supplier';

      withTransaction((tx) => {
        if (!user) {
          tx.prepare(`
            INSERT INTO users (id, email, full_name, password_hash, last_login_at)
            VALUES (?, ?, ?, ?, datetime('now'))
          `).run(userId, normalizedEmail, displayName, hashPassword(crypto.randomBytes(24).toString('hex')));
        }
        tx.prepare(`
          INSERT INTO organisations (id, name, type, country, is_demo)
          VALUES (?, ?, ?, ?, 0)
        `).run(orgId, `${displayName} Workspace`, orgType, 'Uganda');
        tx.prepare(`
          INSERT INTO organisation_memberships (id, organisation_id, user_id, role, is_primary)
          VALUES (?, ?, ?, ?, 1)
        `).run(crypto.randomUUID(), orgId, userId, assignedRole);
      });

      user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
      membership = {
        role: assignedRole,
        org_id: orgId,
        org_name: `${displayName} Workspace`,
        org_type: orgType,
        is_demo: 0,
      };
    }

    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
    db.prepare(`
      INSERT INTO sessions (id, user_id, organisation_id, token_hash, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), user.id, membership.org_id, tokenHash, expiresAt, req.ip || null, req.headers['user-agent'] || null);

    recordAuditLog({
      organisationId: membership.org_id,
      actorUserId: user.id,
      eventType: 'firebase_google_login',
      entityType: 'user',
      entityId: user.id,
      action: `User ${normalizedEmail} authenticated via Firebase Google Sign-In`,
      ipAddress: req.ip,
    });

    setSessionCookie(res, token);
    return res.json({
      token,
      user: {
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
        organisationId: membership.org_id,
        organisationName: membership.org_name,
        organisationType: membership.org_type,
        role: membership.role,
        isDemoUser: membership.is_demo === 1,
      },
    });
  } catch (err) {
    console.error('Firebase sync error:', err);
    return res.status(401).json({ error: 'Unable to verify Firebase Google Sign-In token.' });
  }
});

export default router;

