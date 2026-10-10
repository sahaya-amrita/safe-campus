import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbPackCacheStore } from './cacheStore';
import { resetOfflineDbForTests } from './idb';
import { OfflineQueue } from './offlineQueue';
import { IndexedDbQueueStore } from './queueStores';

beforeEach(() => {
  resetOfflineDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

describe('IndexedDB stores', () => {
  it('keeps queued entries across a simulated reload', async () => {
    const first = new OfflineQueue<{ status: string }, { id: string }>({
      store: new IndexedDbQueueStore(),
      isOnline: () => false,
      send: async () => ({ kind: 'accepted', result: { id: 'x' } }),
    });
    const { key } = await first.enqueue({ status: 'SAFE' });
    first.dispose();

    const reloaded = new OfflineQueue<{ status: string }, { id: string }>({
      store: new IndexedDbQueueStore(),
      isOnline: () => false,
      send: async () => ({ kind: 'accepted', result: { id: 'x' } }),
    });
    await reloaded.ready;
    expect(reloaded.getSnapshot().entries.map((e) => [e.key, e.lifecycle, e.problem])).toEqual([[key, 'QUEUED', 'OFFLINE']]);
  });

  it('replaces cached packs per language without touching other languages', async () => {
    const store = new IndexedDbPackCacheStore<{ id: string }>();
    await store.replaceGroup('en', [{ pack: { id: 'en-1' }, group: 'en', fetchedAt: 't1' }]);
    await store.replaceGroup('ta', [{ pack: { id: 'ta-1' }, group: 'ta', fetchedAt: 't1' }]);
    await store.replaceGroup('en', [{ pack: { id: 'en-2' }, group: 'en', fetchedAt: 't2' }]);

    expect((await store.load('en')).map((r) => r.pack.id)).toEqual(['en-2']);
    expect((await store.load('ta')).map((r) => r.pack.id)).toEqual(['ta-1']);
  });
});
