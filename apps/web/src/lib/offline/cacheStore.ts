import { runTransaction, STORES } from './idb';

/** A cached document (stored by `pack.id`) plus when this device last fetched it from the server. */
export interface CachedRecord<T extends { id: string }> {
  pack: T;
  /** Grouping key, e.g. language. */
  group: string;
  fetchedAt: string;
}

export interface GroupedCacheStore<T extends { id: string }> {
  load(group: string): Promise<CachedRecord<T>[]>;
  /** Replaces every record in `group` atomically. */
  replaceGroup(group: string, records: CachedRecord<T>[]): Promise<void>;
}

/** IndexedDB-backed cache for read-only content such as instruction packs. */
export class IndexedDbPackCacheStore<T extends { id: string }> implements GroupedCacheStore<T> {
  async load(group: string): Promise<CachedRecord<T>[]> {
    const rows = await runTransaction<unknown[]>(STORES.instructionPacks, 'readonly', (store) => store.getAll());
    return ((rows ?? []) as CachedRecord<T>[]).filter((row) => row && row.group === group);
  }

  async replaceGroup(group: string, records: CachedRecord<T>[]): Promise<void> {
    await runTransaction(STORES.instructionPacks, 'readwrite', (store) => {
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          if ((cursor.value as CachedRecord<T>).group === group) cursor.delete();
          cursor.continue();
        } else {
          records.forEach((record) => store.put(record));
        }
      };
    });
  }
}

export class MemoryPackCacheStore<T extends { id: string }> implements GroupedCacheStore<T> {
  records: CachedRecord<T>[] = [];
  failReads = false;

  load(group: string): Promise<CachedRecord<T>[]> {
    if (this.failReads) return Promise.reject(new Error('Simulated read failure'));
    return Promise.resolve(structuredClone(this.records.filter((r) => r.group === group)));
  }

  replaceGroup(group: string, records: CachedRecord<T>[]): Promise<void> {
    this.records = [...this.records.filter((r) => r.group !== group), ...structuredClone(records)];
    return Promise.resolve();
  }
}
