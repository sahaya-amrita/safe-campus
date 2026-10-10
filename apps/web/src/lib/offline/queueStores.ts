import { runTransaction, STORES } from './idb';
import type { QueueEntry, QueueStore } from './offlineQueue';

/** Durable queue store backed by IndexedDB (survives reloads and app restarts). */
export class IndexedDbQueueStore<P, R> implements QueueStore<P, R> {
  async loadAll(): Promise<QueueEntry<P, R>[]> {
    const rows = await runTransaction<unknown[]>(STORES.outbox, 'readonly', (store) => store.getAll());
    return (rows ?? []).filter(isQueueEntry) as QueueEntry<P, R>[];
  }

  async put(entry: QueueEntry<P, R>): Promise<void> {
    await runTransaction(STORES.outbox, 'readwrite', (store) => store.put(entry));
  }
}

/** In-memory store for tests. */
export class MemoryQueueStore<P, R> implements QueueStore<P, R> {
  readonly rows = new Map<string, QueueEntry<P, R>>();
  failWrites = false;
  failReads = false;

  loadAll(): Promise<QueueEntry<P, R>[]> {
    if (this.failReads) return Promise.reject(new Error('Simulated read failure'));
    return Promise.resolve([...this.rows.values()].map((row) => structuredClone(row)));
  }

  put(entry: QueueEntry<P, R>): Promise<void> {
    if (this.failWrites) return Promise.reject(new Error('Simulated write failure'));
    this.rows.set(entry.key, structuredClone(entry));
    return Promise.resolve();
  }
}

const LIFECYCLES = new Set(['QUEUED', 'SENDING', 'ACCEPTED', 'FAILED']);

function isQueueEntry(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.key === 'string' &&
    typeof row.createdAt === 'string' &&
    typeof row.attempts === 'number' &&
    typeof row.lifecycle === 'string' &&
    LIFECYCLES.has(row.lifecycle)
  );
}
