import { OfflineStorageError, runTransaction, STORES } from './idb';

/** Minimal keyed record store. Implementations must persist before resolving. */
export interface RecordStore<T extends { id: string }> {
  getAll(): Promise<T[]>;
  put(record: T): Promise<void>;
  delete(id: string): Promise<void>;
}

/** IndexedDB-backed store for the `attachments` object store. */
export class IndexedDbAttachmentStore<T extends { id: string }> implements RecordStore<T> {
  async getAll(): Promise<T[]> {
    return ((await runTransaction<unknown[]>(STORES.attachments, 'readonly', (s) => s.getAll())) ?? []) as T[];
  }
  async put(record: T): Promise<void> {
    await runTransaction(STORES.attachments, 'readwrite', (s) => s.put(record));
  }
  async delete(id: string): Promise<void> {
    await runTransaction(STORES.attachments, 'readwrite', (s) => s.delete(id));
  }
}

/** In-memory store for tests; can simulate a full device. */
export class MemoryRecordStore<T extends { id: string }> implements RecordStore<T> {
  readonly rows = new Map<string, T>();
  failWrites = false;
  async getAll(): Promise<T[]> {
    return [...this.rows.values()];
  }
  async put(record: T): Promise<void> {
    if (this.failWrites) throw new OfflineStorageError('Simulated write failure');
    this.rows.set(record.id, record);
  }
  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

export interface StorageHeadroom {
  /** Bytes still usable, or null when the browser cannot say. */
  availableBytes: number | null;
}

/** Best-effort free-space check (StorageManager.estimate). Never throws. */
export async function storageHeadroom(storage: Pick<StorageManager, 'estimate'> | undefined = globalThis.navigator?.storage): Promise<StorageHeadroom> {
  try {
    const estimate = await storage?.estimate();
    if (!estimate?.quota) return { availableBytes: null };
    return { availableBytes: Math.max(0, estimate.quota - (estimate.usage ?? 0)) };
  } catch {
    // Not supported (or blocked): callers proceed and rely on write errors.
    return { availableBytes: null };
  }
}

/**
 * Asks the browser not to evict this site's storage under pressure. Granted
 * at the browser's discretion (often only for installed PWAs). Never throws.
 */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = globalThis.navigator?.storage,
): Promise<'granted' | 'denied' | 'unsupported'> {
  try {
    if (!storage?.persist) return 'unsupported';
    if (await storage.persisted()) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
