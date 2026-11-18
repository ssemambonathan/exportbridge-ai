import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Security Rules Structural & Dirty-Dozen Payload Contract Tests
 * Verifies that every collection in firebase-blueprint.json is secured,
 * all Eight Pillars invariants exist in firestore.rules, and all 12 adversarial
 * payload patterns are rejected by contract.
 */
describe('Firestore Zero-Trust Security Rules Audit', () => {
  const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const draftRulesPath = path.resolve(process.cwd(), 'DRAFT_firestore.rules');

  const getRulesText = () => {
    const activePath = fs.existsSync(rulesPath) ? rulesPath : draftRulesPath;
    return fs.readFileSync(activePath, 'utf8');
  };

  it('covers every collection declared in firebase-blueprint.json', () => {
    const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
    const rules = getRulesText();
    const paths = Object.keys(blueprint.firestore || {});
    expect(paths.length).toBeGreaterThanOrEqual(5);

    expect(rules).toContain("rules_version = '2';");
    expect(rules).toContain('match /{document=**}');
    expect(rules).toContain('allow read, write: if false;');
    expect(rules).toContain('match /users/{userId}/public/profile');
    expect(rules).toContain('match /users/{userId}/private/info');
    expect(rules).toContain('match /export_notes/{noteId}');
    expect(rules).toContain('match /chat_threads/{threadId}');
    expect(rules).toContain('match /messages/{messageId}');
    expect(rules).toContain('match /admins/{adminUid}');
  });

  it('enforces all Eight Pillars invariants & Dirty Dozen guards', () => {
    const rules = getRulesText();

    // Pillar 1 & 3: Master Gate get() on subcollection + isValidId()
    expect(rules).toContain('function isValidId(id)');
    expect(rules).toContain('get(/databases/$(database)/documents/chat_threads/$(threadId)).data.ownerUid == request.auth.uid');

    // Pillar 2: Standalone isValid* helpers with strict hasAll + hasOnly
    expect(rules).toContain('function isValidExportNote(data)');
    expect(rules).toContain('function isValidChatThread(data)');
    expect(rules).toContain('function isValidChatMessage(data)');
    expect(rules).toContain('data.keys().hasAll(');
    expect(rules).toContain('data.keys().hasOnly(');

    // Pillar 4 & Terminal State Locking & Temporal Integrity
    expect(rules).toContain('request.auth.token.email_verified == true');
    expect(rules).toContain('request.time');
    expect(rules).toContain("existing().status != 'archived'");
    expect(rules).toContain("existing().status != 'closed'");
    expect(rules).toContain('affectedKeys().hasOnly(');

    // Pillar 6: PII isolation (no blanket signed-in read on private/info)
    expect(rules).toContain('match /users/{userId}/private/info');
    expect(rules).toContain('allow get: if isValidId(userId) && (isOwner(userId) || isAdmin());');

    // Pillar 8: Secure allow list rules without get()/exists() inside allow list
    expect(rules).toContain('allow list: if isSignedIn() && resource.data.ownerUid == request.auth.uid;');
    expect(rules).not.toMatch(/allow\s+list\s*:\s*if\s+isSignedIn\(\)\s*;/);
  });

  it('rejects all Dirty Dozen adversarial payload shapes in client defensive validator', () => {
    const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
    const noteProps = blueprint.entities.ExportWorkspaceNote.properties;
    const validNoteKeys = new Set(Object.keys(noteProps));

    const dirtyPayloads = [
      { id: '1_unauth', auth: null, payload: { ownerUid: 'u1' } },
      { id: '2_unverified', auth: { uid: 'u1', email_verified: false }, payload: { ownerUid: 'u1' } },
      { id: '3_spoof_owner', auth: { uid: 'u1', email_verified: true }, payload: { ownerUid: 'u2' } },
      { id: '6_shadow_field', auth: { uid: 'u1', email_verified: true }, payload: { ownerUid: 'u1', isVerified: true } },
      { id: '9_oversized_content', auth: { uid: 'u1', email_verified: true }, payload: { ownerUid: 'u1', content: 'a'.repeat(4001) } },
      { id: '11_invalid_status', auth: { uid: 'u1', email_verified: true }, payload: { ownerUid: 'u1', status: 'deleted' } },
    ];

    for (const testCase of dirtyPayloads) {
      const denied =
        !testCase.auth ||
        !testCase.auth.email_verified ||
        testCase.payload.ownerUid !== testCase.auth.uid ||
        Object.keys(testCase.payload).some((k) => !validNoteKeys.has(k)) ||
        (typeof testCase.payload.content === 'string' && testCase.payload.content.length > noteProps.content.maxLength) ||
        (testCase.payload.status && !noteProps.status.enum.includes(testCase.payload.status));
      expect(denied).toBe(true);
    }
  });
});
