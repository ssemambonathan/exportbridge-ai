# ExportBridge AI — Firestore Zero-Trust Security Specification

## 1. Master Source of Truth & Data Invariants
1. **Default-Deny Baseline**: Every unspecified document path defaults to `allow read, write: if false;`.
2. **Email Verification & Identity Binding**: Every client write requires `request.auth != null && request.auth.token.email_verified == true`, and every created document binds `ownerUid == request.auth.uid` (or `uid == request.auth.uid`).
3. **Split-Collection PII Isolation**: Email and personal preference data reside exclusively at `/users/{userId}/private/info` and are readable/writable only by `userId == request.auth.uid` or `isAdmin()`. Public display fields live at `/users/{userId}/public/profile`.
4. **Immutable Ownership & Temporal Integrity**: `uid`, `ownerUid`, and `createdAt` cannot be modified after creation. All `createdAt` and `updatedAt` timestamps must strictly equal `request.time`.
5. **Relational Master Gate on Subcollections**: `/chat_threads/{threadId}/messages/{messageId}` performs `get(/databases/$(database)/documents/chat_threads/$(threadId))` to verify that the parent thread exists, belongs to `request.auth.uid`, and is not in terminal state (`closed`).
6. **Terminal State Locking**: Once an `export_notes` document transitions to `status == 'archived'`, or a `chat_threads` document transitions to `status == 'closed'`, non-admin clients cannot mutate it again.
7. **Anti-Update-Gap & Strict Key Allowlisting**: Every `create` verifies `keys().hasAll(...) && keys().hasOnly(...)`. Every `update` invokes `isValid[Entity](incoming())` AND constrains `incoming().diff(existing()).affectedKeys().hasOnly(...)`.
8. **Role Escalation Prevention**: `/admins/{adminUid}` denies all client writes (`allow write: if false`). Users cannot set or elevate `role` beyond `['member', 'operator']` on their own public profile (`role` is immutable after creation for non-admins).
9. **Query Enforcer (`allow list`)**: Every `allow list` explicitly checks `resource.data.ownerUid == request.auth.uid` (or `isAdmin()`) with zero `get()`/`exists()` calls inside `list`.

---

## 2. Adversarial "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)

1. **Unauthenticated Create**: Anonymous caller inserts `/export_notes/note_1` with forged `ownerUid`.
2. **Unverified Email Write**: Signed-in user with `email_verified: false` attempts to create `/export_notes/note_2`.
3. **Identity Spoofing on Create**: User A (`uid-a`) attempts to create `/export_notes/note_3` with `ownerUid: "uid-b"`.
4. **Cross-Tenant PII Read**: User A (`uid-a`) attempts `get` on `/users/uid-b/private/info` containing User B's email.
5. **Blanket List Query Scraping**: User A queries `collection('export_notes')` without `where('ownerUid', '==', 'uid-a')`.
6. **Shadow Field Injection ("Ghost Field")**: User A creates `/export_notes/note_4` including extra field `isVerified: true` not in `hasOnly(...)`.
7. **Self-Admin Privilege Escalation**: User A attempts `setDoc` on `/admins/uid-a` to grant themselves admin privileges.
8. **Client-Forged Timestamp**: User A creates `/chat_threads/thread_1` with `createdAt` set to a past ISO string or client `Date` instead of server `request.time`.
9. **ID Poisoning / Resource Exhaustion**: User A targets `/export_notes/${'x'.repeat(300)}` or injects a `content` string exceeding `4000` characters.
10. **Terminal State Bypass**: User A attempts to update `content` on an `/export_notes/archived_1` document whose `existing().status == 'archived'`.
11. **Value Poisoning on Update**: User A sends an update changing `status` to an illegal value (`"deleted"` instead of `"archived"`) or non-string type (`12345`).
12. **Orphaned / Cross-Owner Subcollection Write**: User A attempts to append a message under `/chat_threads/thread_owned_by_B/messages/msg_1` with `ownerUid: "uid-a"`.
