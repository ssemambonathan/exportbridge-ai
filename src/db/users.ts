import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  try {
    const cleanDisplayName = (displayName || email.split('@')[0] || 'ExportBridge User').slice(0, 120);
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: cleanDisplayName,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: cleanDisplayName,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}
