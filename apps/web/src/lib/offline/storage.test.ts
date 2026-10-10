import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { OFFLINE_DB_NAME, resetOfflineDbForTests } from './idb';
import { IndexedDbQueueStore } from './queueStores';
import { IndexedDbAttachmentStore, requestPersistentStorage, storageHeadroom } from './recordStore';

beforeEach(() => {
  resetOfflineDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

describe('schema upgrade v1 → v2', () => {
  it('adds the attachments store and keeps check-ins queued by the previous version', async () => {
    // Create the v1 database exactly as the previous release did, with one queued check-in.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(OFFLINE_DB_NAME, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore('outbox', { keyPath: 'key' });
        open.result.createObjectStore('instructionPacks', { keyPath: 'pack.id' });
      };
      open.onsuccess = () => {
        const tx = open.result.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').put({ key: 'old-1', payload: { status: 'SAFE' }, createdAt: 't', lifecycle: 'QUEUED', attempts: 0 });
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
      };
      open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
    });

    const queued = await new IndexedDbQueueStore().loadAll();
    expect(queued.map((e) => e.key)).toEqual(['old-1']);

    const photos = new IndexedDbAttachmentStore<{ id: string; bytes: ArrayBuffer }>();
    await photos.put({ id: 'p1', bytes: new Uint8Array([1, 2]).buffer });
    expect((await photos.getAll()).map((p) => p.id)).toEqual(['p1']);
    await photos.delete('p1');
    expect(await photos.getAll()).toEqual([]);
  });
});

describe('storage helpers', () => {
  it('reports headroom from StorageManager, or null when unknown', async () => {
    expect(await storageHeadroom({ estimate: async () => ({ quota: 1000, usage: 400 }) })).toEqual({ availableBytes: 600 });
    expect(await storageHeadroom({ estimate: async () => ({}) })).toEqual({ availableBytes: null });
    expect(await storageHeadroom({ estimate: async () => Promise.reject(new Error('blocked')) })).toEqual({ availableBytes: null });
    expect(await storageHeadroom(undefined)).toEqual({ availableBytes: null });
  });

  it('requests persistence without throwing', async () => {
    expect(await requestPersistentStorage({ persisted: async () => true, persist: async () => false })).toBe('granted');
    expect(await requestPersistentStorage({ persisted: async () => false, persist: async () => false })).toBe('denied');
    expect(await requestPersistentStorage(undefined)).toBe('unsupported');
  });
});
