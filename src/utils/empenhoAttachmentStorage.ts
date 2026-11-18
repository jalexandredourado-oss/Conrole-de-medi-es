import { isStandaloneApp } from './isStandalone';

export interface StoredEmpenhoAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
  blob: Blob;
  objectUrl: string;
}

interface IndexedDbRecord {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  updatedAt: string;
  buffer: ArrayBuffer;
}

const DB_NAME = 'sistema_orcamento_empenhos_db';
const DB_VERSION = 1;
const STORE_NAME = 'anexos';

function openAttachmentDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Falha ao abrir banco local de anexos.'));
  });
}

function getApiBaseUrl(): string | null {
  if (typeof window === 'undefined') return '';
  if (!isStandaloneApp()) return '';
  const injected =
    typeof (window as any).__API_BASE_URL__ === 'string'
      ? String((window as any).__API_BASE_URL__).trim()
      : '';
  if (injected && /^https?:\/\//i.test(injected)) {
    return injected.replace(/\/+$/, '');
  }
  return null;
}

export function buildEmpenhoAnexoId(contratoIdOrNum: string, empenhoId: string): string {
  const cleanContrato = (contratoIdOrNum || 'contrato')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanEmp = (empenhoId || 'emp')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return `empdoc_${cleanContrato}_${cleanEmp}`;
}

export function formatAttachmentSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(2).replace('.', ',')} MB`;
}

async function putRecordInIndexedDb(record: IndexedDbRecord): Promise<void> {
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Erro ao gravar anexo no armazenamento local.'));
    };
  });
}

async function getRecordFromIndexedDb(id: string): Promise<IndexedDbRecord | null> {
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as IndexedDbRecord) || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Erro ao ler anexo do armazenamento local.'));
    };
  });
}

async function deleteRecordFromIndexedDb(id: string): Promise<void> {
  const db = await openAttachmentDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Erro ao remover anexo do armazenamento local.'));
    };
  });
}

export async function saveEmpenhoAttachment(
  anexoId: string,
  file: File
): Promise<{
  anexoId: string;
  anexoNome: string;
  anexoTipo: string;
  anexoTamanho: number;
  anexoAtualizadoEm: string;
}> {
  const buffer = await file.arrayBuffer();
  const mimeType =
    file.type ||
    (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
  const updatedAt = new Date().toISOString();

  await putRecordInIndexedDb({
    id: anexoId,
    fileName: file.name,
    mimeType,
    size: file.size,
    updatedAt,
    buffer,
  });

  // Espelha no servidor em segundo plano quando conectado ao sistema (não falha se estiver offline)
  const apiBase = getApiBaseUrl();
  if (apiBase !== null) {
    try {
      await fetch(`${apiBase}/api/empenhos/anexos/${encodeURIComponent(anexoId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: buffer,
      });
    } catch {
      // Offline ou index.html local: IndexedDB já persistiu com segurança
    }
  }

  return {
    anexoId,
    anexoNome: file.name,
    anexoTipo: mimeType,
    anexoTamanho: file.size,
    anexoAtualizadoEm: updatedAt,
  };
}

export async function loadEmpenhoAttachment(
  anexoId: string,
  fallbackMeta?: { fileName?: string; mimeType?: string; size?: number; updatedAt?: string }
): Promise<StoredEmpenhoAttachment | null> {
  try {
    const localRec = await getRecordFromIndexedDb(anexoId);
    if (localRec && localRec.buffer) {
      const mimeType = localRec.mimeType || fallbackMeta?.mimeType || 'application/pdf';
      const blob = new Blob([localRec.buffer], { type: mimeType });
      return {
        id: localRec.id,
        fileName: localRec.fileName || fallbackMeta?.fileName || 'empenho.pdf',
        mimeType,
        size: localRec.size || blob.size,
        updatedAt: localRec.updatedAt || fallbackMeta?.updatedAt || '',
        blob,
        objectUrl: URL.createObjectURL(blob),
      };
    }
  } catch {
    // Tenta buscar do servidor se IndexedDB não retornar
  }

  const apiBase = getApiBaseUrl();
  if (apiBase !== null) {
    try {
      const resp = await fetch(`${apiBase}/api/empenhos/anexos/${encodeURIComponent(anexoId)}`);
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const headerName = resp.headers.get('X-File-Name');
        const fileName = headerName
          ? decodeURIComponent(headerName)
          : fallbackMeta?.fileName || 'empenho.pdf';
        const mimeType =
          resp.headers.get('Content-Type') || fallbackMeta?.mimeType || 'application/pdf';
        const updatedAt = fallbackMeta?.updatedAt || new Date().toISOString();

        try {
          await putRecordInIndexedDb({
            id: anexoId,
            fileName,
            mimeType,
            size: buffer.byteLength,
            updatedAt,
            buffer,
          });
        } catch {
          // ignore cache write failure
        }

        const blob = new Blob([buffer], { type: mimeType });
        return {
          id: anexoId,
          fileName,
          mimeType,
          size: blob.size,
          updatedAt,
          blob,
          objectUrl: URL.createObjectURL(blob),
        };
      }
    } catch {
      // Offline / unreachable
    }
  }

  return null;
}

export async function downloadEmpenhoAttachment(
  anexoId: string,
  fallbackMeta?: { fileName?: string; mimeType?: string }
): Promise<boolean> {
  const loaded = await loadEmpenhoAttachment(anexoId, fallbackMeta);
  if (!loaded) return false;
  triggerBlobDownload(loaded.objectUrl, loaded.fileName);
  setTimeout(() => URL.revokeObjectURL(loaded.objectUrl), 2500);
  return true;
}

export function triggerBlobDownload(objectUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName || 'empenho.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function deleteEmpenhoAttachment(anexoId: string): Promise<void> {
  if (!anexoId) return;
  try {
    await deleteRecordFromIndexedDb(anexoId);
  } catch {
    // ignore
  }
  const apiBase = getApiBaseUrl();
  if (apiBase !== null) {
    try {
      await fetch(`${apiBase}/api/empenhos/anexos/${encodeURIComponent(anexoId)}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore offline
    }
  }
}
