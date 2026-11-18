import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { chatMessages, chatSessions, exportNotes, users } from './schema.ts';

export async function listExportNotesForUid(uid: string) {
  try {
    return await db
      .select({
        id: exportNotes.id,
        title: exportNotes.title,
        commodityLotCode: exportNotes.commodityLotCode,
        targetMarket: exportNotes.targetMarket,
        incoterm: exportNotes.incoterm,
        content: exportNotes.content,
        status: exportNotes.status,
        createdAt: exportNotes.createdAt,
        updatedAt: exportNotes.updatedAt,
      })
      .from(exportNotes)
      .innerJoin(users, eq(exportNotes.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(exportNotes.updatedAt));
  } catch (error) {
    console.error('Database query failed in listExportNotesForUid:', error);
    throw new Error('Failed to load export workspace notes.', { cause: error });
  }
}

export async function createExportNoteForUserId(
  userId: number,
  input: {
    title: string;
    commodityLotCode: string;
    targetMarket: string;
    incoterm: string;
    content: string;
  }
) {
  try {
    const [created] = await db
      .insert(exportNotes)
      .values({
        userId,
        title: input.title,
        commodityLotCode: input.commodityLotCode,
        targetMarket: input.targetMarket,
        incoterm: input.incoterm,
        content: input.content,
        status: 'active',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createExportNoteForUserId:', error);
    throw new Error('Failed to save export workspace note.', { cause: error });
  }
}

export async function archiveExportNoteForUserId(userId: number, noteId: number) {
  try {
    const [updated] = await db
      .update(exportNotes)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(exportNotes.id, noteId), eq(exportNotes.userId, userId)))
      .returning();
    return updated || null;
  } catch (error) {
    console.error('Database query failed in archiveExportNoteForUserId:', error);
    throw new Error('Failed to archive export workspace note.', { cause: error });
  }
}

export async function createChatSessionForUserId(
  userId: number,
  input: { title: string; persona: string; model: string }
) {
  try {
    const [created] = await db
      .insert(chatSessions)
      .values({
        userId,
        title: input.title.slice(0, 160),
        persona: input.persona,
        model: input.model,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Database query failed in createChatSessionForUserId:', error);
    throw new Error('Failed to create chat session.', { cause: error });
  }
}

export async function appendChatMessage(input: {
  sessionId: number;
  role: 'user' | 'model';
  content: string;
  model: string;
}) {
  try {
    const [created] = await db
      .insert(chatMessages)
      .values({
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        model: input.model,
      })
      .returning();
    await db
      .update(chatSessions)
      .set({ updatedAt: new Date(), model: input.model })
      .where(eq(chatSessions.id, input.sessionId));
    return created;
  } catch (error) {
    console.error('Database query failed in appendChatMessage:', error);
    throw new Error('Failed to persist chat message.', { cause: error });
  }
}

export async function listChatSessionsForUid(uid: string) {
  try {
    return await db
      .select({
        id: chatSessions.id,
        title: chatSessions.title,
        persona: chatSessions.persona,
        model: chatSessions.model,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
      })
      .from(chatSessions)
      .innerJoin(users, eq(chatSessions.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(chatSessions.updatedAt));
  } catch (error) {
    console.error('Database query failed in listChatSessionsForUid:', error);
    throw new Error('Failed to load chat sessions.', { cause: error });
  }
}

export async function getChatMessagesForUid(uid: string, sessionId: number) {
  try {
    const [ownedSession] = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .innerJoin(users, eq(chatSessions.userId, users.id))
      .where(and(eq(chatSessions.id, sessionId), eq(users.uid, uid)));
    if (!ownedSession) return null;

    return await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        model: chatMessages.model,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.id);
  } catch (error) {
    console.error('Database query failed in getChatMessagesForUid:', error);
    throw new Error('Failed to load chat messages.', { cause: error });
  }
}
