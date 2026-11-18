import { Router } from 'express';
import { z } from 'zod';
import { FirebaseAuthRequest, requireFirebaseAuth } from '../../middleware/auth.ts';
import { getOrCreateUser } from '../../db/users.ts';
import {
  archiveExportNoteForUserId,
  createExportNoteForUserId,
  getChatMessagesForUid,
  listChatSessionsForUid,
  listExportNotesForUid,
} from '../../db/queries.ts';

const router = Router();

const createNoteSchema = z.object({
  title: z.string().min(2).max(160),
  commodityLotCode: z.string().min(2).max(48),
  targetMarket: z.string().min(2).max(80),
  incoterm: z.enum(['EXW', 'FOB', 'CFR', 'CIF']).default('FOB'),
  content: z.string().min(1).max(4000),
});

router.get('/notes', requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  try {
    const fbUser = req.firebaseUser!;
    await getOrCreateUser(fbUser.uid, fbUser.email || 'member@exportbridge.local', fbUser.name);
    const notes = await listExportNotesForUid(fbUser.uid);
    return res.json({ notes });
  } catch (error: any) {
    console.error('Cloud SQL GET /notes failed:', error);
    return res.status(500).json({ error: error?.message || 'Unable to load notes.' });
  }
});

router.post('/notes', requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  const parsed = createNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid export note input', details: parsed.error.flatten() });
  }

  try {
    const fbUser = req.firebaseUser!;
    const sqlUser = await getOrCreateUser(fbUser.uid, fbUser.email || 'member@exportbridge.local', fbUser.name);
    const note = await createExportNoteForUserId(sqlUser.id, parsed.data);
    return res.status(201).json({ note });
  } catch (error: any) {
    console.error('Cloud SQL POST /notes failed:', error);
    return res.status(500).json({ error: error?.message || 'Unable to save note.' });
  }
});

router.patch('/notes/:id/archive', requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  const noteId = Number(req.params.id);
  if (!Number.isInteger(noteId) || noteId <= 0) {
    return res.status(400).json({ error: 'Invalid note ID.' });
  }

  try {
    const fbUser = req.firebaseUser!;
    const sqlUser = await getOrCreateUser(fbUser.uid, fbUser.email || 'member@exportbridge.local', fbUser.name);
    const updated = await archiveExportNoteForUserId(sqlUser.id, noteId);
    if (!updated) {
      return res.status(404).json({ error: 'Note not found.' });
    }
    return res.json({ note: updated });
  } catch (error: any) {
    console.error('Cloud SQL PATCH /notes/:id/archive failed:', error);
    return res.status(500).json({ error: error?.message || 'Unable to archive note.' });
  }
});

router.get('/chat-sessions', requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  try {
    const fbUser = req.firebaseUser!;
    await getOrCreateUser(fbUser.uid, fbUser.email || 'member@exportbridge.local', fbUser.name);
    const sessions = await listChatSessionsForUid(fbUser.uid);
    return res.json({ sessions });
  } catch (error: any) {
    console.error('Cloud SQL GET /chat-sessions failed:', error);
    return res.status(500).json({ error: error?.message || 'Unable to load chat sessions.' });
  }
});

router.get('/chat-sessions/:id/messages', requireFirebaseAuth, async (req: FirebaseAuthRequest, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid session ID.' });
  }

  try {
    const fbUser = req.firebaseUser!;
    const messages = await getChatMessagesForUid(fbUser.uid, sessionId);
    if (!messages) {
      return res.status(404).json({ error: 'Chat session not found.' });
    }
    return res.json({ messages });
  } catch (error: any) {
    console.error('Cloud SQL GET /chat-sessions/:id/messages failed:', error);
    return res.status(500).json({ error: error?.message || 'Unable to load chat messages.' });
  }
});

export default router;
