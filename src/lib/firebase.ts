import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export type ChatModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-argon'
  | 'gemini-4-carbon';

export type ChatPersonaId =
  | 'export_compliance'
  | 'pricing_strategist'
  | 'buyer_diligence'
  | 'logistics_coordinator';

export interface FirestoreExportNote {
  id: string;
  ownerUid: string;
  title: string;
  commodityCode: string;
  targetMarket: string;
  content: string;
  status: 'active' | 'archived';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FirestoreChatThread {
  id: string;
  ownerUid: string;
  title: string;
  model: ChatModelId;
  persona: ChatPersonaId;
  status: 'open' | 'closed';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FirestoreChatMessage {
  id: string;
  ownerUid: string;
  role: 'user' | 'model';
  content: string;
  model: ChatModelId;
  createdAt?: unknown;
}

export async function signInWithGooglePopup(): Promise<{ user: User; idToken: string }> {
  const credential = await signInWithPopup(auth, googleAuthProvider);
  const idToken = await credential.user.getIdToken();
  return { user: credential.user, idToken };
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export function subscribeFirebaseAuth(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, cb);
}

export async function syncFirebaseUserProfiles(
  user: User,
  organisationName: string,
  preferredModel: ChatModelId = 'gemini-4-hydrogen'
) {
  const publicPath = `users/${user.uid}/public/profile`;
  const privatePath = `users/${user.uid}/private/info`;

  try {
    await setDoc(
      doc(db, 'users', user.uid, 'public', 'profile'),
      {
        uid: user.uid,
        displayName: (user.displayName || user.email?.split('@')[0] || 'Workspace Member').slice(0, 120),
        organisationName: (organisationName || 'ExportBridge Partner').slice(0, 160),
        role: 'member',
        updatedAt: serverTimestamp(),
      },
      { merge: false }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  try {
    const existingPrivate = await getDocFromServer(doc(db, 'users', user.uid, 'private', 'info')).catch(() => null);
    if (existingPrivate?.exists()) {
      await updateDoc(doc(db, 'users', user.uid, 'private', 'info'), {
        email: (user.email || 'unknown@exportbridge.local').slice(0, 200),
        preferredModel,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'users', user.uid, 'private', 'info'), {
        uid: user.uid,
        email: (user.email || 'unknown@exportbridge.local').slice(0, 200),
        preferredModel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export function subscribeExportNotes(
  ownerUid: string,
  onData: (notes: FirestoreExportNote[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'export_notes';
  const q = query(
    collection(db, path),
    where('ownerUid', '==', ownerUid),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: FirestoreExportNote[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FirestoreExportNote, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function createFirestoreExportNote(
  ownerUid: string,
  input: { title: string; commodityCode: string; targetMarket: string; content: string }
): Promise<string> {
  const path = 'export_notes';
  try {
    const ref = await addDoc(collection(db, path), {
      ownerUid,
      title: input.title.trim().slice(0, 160),
      commodityCode: input.commodityCode.trim().slice(0, 48),
      targetMarket: input.targetMarket.trim().slice(0, 80),
      content: input.content.trim().slice(0, 4000),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function archiveFirestoreExportNote(noteId: string): Promise<void> {
  const path = `export_notes/${noteId}`;
  try {
    await updateDoc(doc(db, 'export_notes', noteId), {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreExportNote(noteId: string): Promise<void> {
  const path = `export_notes/${noteId}`;
  try {
    await deleteDoc(doc(db, 'export_notes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createFirestoreChatThread(
  ownerUid: string,
  input: { title: string; model: ChatModelId; persona: ChatPersonaId }
): Promise<string> {
  const path = 'chat_threads';
  try {
    const ref = await addDoc(collection(db, path), {
      ownerUid,
      title: input.title.trim().slice(0, 160),
      model: input.model,
      persona: input.persona,
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function appendFirestoreChatMessage(
  threadId: string,
  ownerUid: string,
  input: { role: 'user' | 'model'; content: string; model: ChatModelId }
): Promise<string> {
  const path = `chat_threads/${threadId}/messages`;
  try {
    const ref = await addDoc(collection(db, 'chat_threads', threadId, 'messages'), {
      ownerUid,
      role: input.role,
      content: input.content.slice(0, 12000),
      model: input.model,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeChatThreads(
  ownerUid: string,
  onData: (threads: FirestoreChatThread[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'chat_threads';
  const q = query(
    collection(db, path),
    where('ownerUid', '==', ownerUid),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FirestoreChatThread, 'id'>),
        }))
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeChatMessages(
  threadId: string,
  ownerUid: string,
  onData: (messages: FirestoreChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `chat_threads/${threadId}/messages`;
  const q = query(
    collection(db, 'chat_threads', threadId, 'messages'),
    where('ownerUid', '==', ownerUid),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FirestoreChatMessage, 'id'>),
        }))
      );
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}
