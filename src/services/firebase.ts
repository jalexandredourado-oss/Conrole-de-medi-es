import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  getDocFromServer,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Contrato } from '../types/contract';
import { isInvalidSavedContractNumber } from '../utils/driveSpreadsheetSync';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without passing firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error handler strictly as mandated by the Firebase Integration Skill
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
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot as requested by skill
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}


// Convert contract ID to a valid Firestore document ID
export function getContratoDocId(contrato: Partial<Contrato>): string {
  if (contrato.numero && contrato.numero.includes('/')) {
    const cleanNum = contrato.numero.trim().replace(/\//g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanNum && !cleanNum.startsWith('c-')) return cleanNum;
  }
  if (contrato.id && contrato.id.trim()) {
    return contrato.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
  const num = (contrato.numero || 'novo').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `c_${num}_${Date.now()}`;
}

// Sanitize contract object to ensure no undefined values are sent to Firestore
export function sanitizeContratoForFirestore(contrato: Contrato): Record<string, any> {
  const clean: Record<string, any> = JSON.parse(
    JSON.stringify(contrato, (_key, value) => (value === undefined ? null : value))
  );
  clean.updatedAt = new Date().toISOString();
  return clean;
}

// Deduplicate contracts by contract number, strictly filtering out any invalid/phantom contracts
export function deduplicateContratos(list: Contrato[]): Contrato[] {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, Contrato>();
  for (const c of list) {
    if (!c || !c.numero) continue;
    if (isInvalidSavedContractNumber(c.numero)) continue;
    const key = c.numero.trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, c);
    } else {
      const existing = map.get(key)!;
      const existingWeight =
        (existing.empenhos?.length || 0) +
        (existing.medicoes?.length || 0) +
        (existing.pagamentos?.length || 0);
      const newWeight =
        (c.empenhos?.length || 0) +
        (c.medicoes?.length || 0) +
        (c.pagamentos?.length || 0);
      if (newWeight >= existingWeight) {
        map.set(key, c);
      }
    }
  }
  return Array.from(map.values());
}

// Check if Firestore contracts collection is empty and seed if necessary
export async function seedContratosIfEmpty(initial: Contrato[]): Promise<Contrato[]> {
  try {
    const snap = await getDocs(collection(db, 'contratos'));
    if (!snap.empty) {
      const list: Contrato[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Contrato;
        list.push({
          ...data,
          id: data.id || docSnap.id,
        });
      });
      return deduplicateContratos(list);
    }

    // Seed database if empty
    await batchSaveContratosToFirestore(initial);
    return initial;
  } catch (error: any) {
    const isPermissionError =
      error?.message?.includes('permission') ||
      error?.code?.includes('permission-denied');
    if (isPermissionError) {
      try {
        handleFirestoreError(error, OperationType.GET, 'contratos');
      } catch {
        // Handled per skill
      }
    } else {
      console.warn('Falha ao verificar/popular seed inicial no Firestore (utilizando cache local):', error?.message);
    }
    return initial;
  }
}

// Reset and replace all documents in Firestore
export async function resetFirestoreWithContratos(newContratos: Contrato[]): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'contratos'));
    if (!snap.empty) {
      const docs = snap.docs;
      const CHUNK_SIZE = 450;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const deleteBatch = writeBatch(db);
        chunk.forEach((docSnap) => {
          deleteBatch.delete(docSnap.ref);
        });
        await deleteBatch.commit();
      }
    }
    await batchSaveContratosToFirestore(newContratos, false);
  } catch (error) {
    console.error('Erro ao resetar dados no Firestore:', error);
  }
}

// Real-time listener for contracts collection
export function subscribeToContratos(
  onUpdate: (contratos: Contrato[]) => void,
  onError?: (error: Error) => void
): () => void {
  const colRef = collection(db, 'contratos');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: Contrato[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Contrato;
        list.push({
          ...data,
          id: data.id || docSnap.id,
        });
      });
      onUpdate(deduplicateContratos(list));
    },
    (error) => {
      if (onError) onError(error);
      const isPermissionError =
        error?.message?.includes('permission') ||
        error?.code?.includes('permission-denied');
      if (isPermissionError) {
        try {
          handleFirestoreError(error, OperationType.GET, 'contratos');
        } catch {
          // Handled per skill
        }
      } else {
        console.warn('Sincronização em tempo real de contratos (offline):', error?.message);
      }
    }
  );
}

// Save a single contract permanently
export async function saveContratoToFirestore(contrato: Contrato): Promise<void> {
  const docId = getContratoDocId(contrato);
  const path = `contratos/${docId}`;
  try {
    const data = sanitizeContratoForFirestore({ ...contrato, id: docId });
    await setDoc(doc(db, 'contratos', docId), data, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Delete a contract permanently from database
export async function deleteContratoFromFirestore(contratoOrId: string | Partial<Contrato>): Promise<void> {
  try {
    const idsToDelete = new Set<string>();
    if (typeof contratoOrId === 'string') {
      idsToDelete.add(contratoOrId);
      const cleanNum = contratoOrId.trim().replace(/\//g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
      if (cleanNum) idsToDelete.add(cleanNum);
      const stripped = cleanNum.startsWith('c-') ? cleanNum.slice(2) : cleanNum;
      if (stripped) idsToDelete.add(stripped);
    } else {
      const docId = getContratoDocId(contratoOrId);
      idsToDelete.add(docId);
      if (contratoOrId.id) idsToDelete.add(contratoOrId.id);
      if (contratoOrId.numero) {
        const clean = contratoOrId.numero.trim().replace(/\//g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
        if (clean) idsToDelete.add(clean);
        const stripped = clean.startsWith('c-') ? clean.slice(2) : clean;
        if (stripped) idsToDelete.add(stripped);
      }
    }
    for (const id of idsToDelete) {
      try {
        await deleteDoc(doc(db, 'contratos', id));
      } catch {
        // Silently continue for non-existent variants
      }
    }
  } catch (error) {
    console.error('Erro ao excluir contrato do banco de dados:', error);
  }
}

// Batch save multiple contracts (e.g., initial seed or backup restore)
export async function batchSaveContratosToFirestore(contratos: Contrato[], merge: boolean = true): Promise<void> {
  if (contratos.length === 0) return;
  try {
    const CHUNK_SIZE = 450;
    for (let i = 0; i < contratos.length; i += CHUNK_SIZE) {
      const chunk = contratos.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const c of chunk) {
        const docId = getContratoDocId(c);
        const data = sanitizeContratoForFirestore({ ...c, id: docId });
        if (merge) {
          batch.set(doc(db, 'contratos', docId), data, { merge: true });
        } else {
          batch.set(doc(db, 'contratos', docId), data);
        }
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'contratos');
  }
}

// Authentication helpers
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Erro ao autenticar com Google:', error);
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Erro ao sair:', error);
    throw error;
  }
}

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
