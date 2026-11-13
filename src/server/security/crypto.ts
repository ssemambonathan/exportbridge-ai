import crypto from 'node:crypto';

const FALLBACK_DEV_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn('[SECURITY] SESSION_SECRET not set in production; using ephemeral process secret.');
  }
  return FALLBACK_DEV_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateSessionToken(): string {
  const raw = crypto.randomBytes(32).toString('hex');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(raw)
    .digest('hex');
  return `${raw}.${sig}`;
}

export function verifySessionTokenSignature(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [raw, sig] = parts;
  if (!/^[0-9a-f]{64}$/i.test(raw) || !/^[0-9a-f]{64}$/i.test(sig)) {
    return false;
  }
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(raw)
    .digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, '');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document';
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now\s+/gi,
  /disregard\s+(your\s+)?(rules|instructions|constraints)/gi,
  /execute\s+(shell|sql|command|tool)/gi,
  /bypass\s+(human\s+)?approval/gi,
  /<\/?system>/gi,
  /\[\[SYSTEM\]\]/gi,
];

export interface SanitizationResult {
  sanitized: string;
  injectionDetected: boolean;
  matchedPatterns: string[];
}

export function sanitizeUntrustedText(input: string, maxLength = 8000): SanitizationResult {
  const trimmed = (input ?? '').slice(0, maxLength);
  const matchedPatterns: string[] = [];
  let sanitized = trimmed;

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      matchedPatterns.push(pattern.source);
      sanitized = sanitized.replace(pattern, '[REDACTED_UNTRUSTED_DIRECTIVE]');
    }
  }

  return {
    sanitized,
    injectionDetected: matchedPatterns.length > 0,
    matchedPatterns,
  };
}
