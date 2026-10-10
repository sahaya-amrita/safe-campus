/**
 * Minimal promise wrapper around IndexedDB for the student offline stores.
 * Kept dependency-free on purpose; only the operations we use are exposed.
 */

export const OFFLINE_DB_NAME = 'safe-campus-student-offline';
const OFFLINE_DB_VERSION = 1;

export const STORES = {
  outbox: 'outbox',
  instructionPacks: 'instructionPacks',
} as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];

export class OfflineStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OfflineStorageError';
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new OfflineStorageError('IndexedDB is not available on this device'));
      return;
    }
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.outbox)) db.createObjectStore(STORES.outbox, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.instructionPacks)) {
        db.createObjectStore(STORES.instructionPacks, { keyPath: 'pack.id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new OfflineStorageError('Could not open offline storage', { cause: request.error }));
    request.onblocked = () => reject(new OfflineStorageError('Offline storage is blocked by another open tab'));
  });
  // Allow a later retry if opening failed (e.g. private mode toggled).
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Test helper: forget the cached connection so a fresh fake IndexedDB can be used. */
export function resetOfflineDbForTests(): void {
  void dbPromise?.then((db) => db.close()).catch(() => undefined);
  dbPromise = null;
}

/** Runs `work` in one transaction and resolves when the transaction commits. */
export async function runTransaction<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openOfflineDb();
  return new Promise<T | undefined>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      reject(new OfflineStorageError('Could not start an offline storage transaction', { cause: error }));
      return;
    }
    const request = work(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(new OfflineStorageError('Offline storage write failed', { cause: tx.error }));
    tx.onabort = () => reject(new OfflineStorageError('Offline storage transaction aborted', { cause: tx.error }));
  });
}
