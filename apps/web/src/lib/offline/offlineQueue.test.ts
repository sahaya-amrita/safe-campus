import { describe, expect, it, vi } from 'vitest';
import { OfflineQueue, type QueueEntry, type SendOutcome } from './offlineQueue';
import { MemoryQueueStore } from './queueStores';

type Payload = { status: string };
type Result = { id: string };

const fixedNow = () => new Date('2026-10-10T09:00:00.000Z');

function setup(options: { online?: boolean; outcomes?: SendOutcome<Result>[]; store?: MemoryQueueStore<Payload, Result> } = {}) {
  const network = { online: options.online ?? true };
  const outcomes = [...(options.outcomes ?? [])];
  const send = vi.fn(async (_payload: Payload, _key: string, _createdAt: string): Promise<SendOutcome<Result>> => {
    const next = outcomes.shift();
    if (!next) throw new Error('no scripted outcome');
    return next;
  });
  const timers: { fn: () => void; ms: number }[] = [];
  let n = 0;
  const store = options.store ?? new MemoryQueueStore<Payload, Result>();
  const queue = new OfflineQueue<Payload, Result>({
    store,
    send,
    isOnline: () => network.online,
    now: fixedNow,
    generateKey: () => `key-${++n}`,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => undefined,
  });
  return { queue, send, store, network, timers, outcomes };
}

const accepted = (id = 'srv-1'): SendOutcome<Result> => ({ kind: 'accepted', result: { id } });

describe('OfflineQueue', () => {
  it('persists an entry before enqueue resolves', async () => {
    const { queue, store } = setup();
    const entry = await queue.enqueue({ status: 'SAFE' });
    expect(store.rows.get(entry.key)?.lifecycle).toBe('QUEUED');
    expect(queue.getSnapshot().entries[0]?.key).toBe('key-1');
  });

  it('becomes ACCEPTED only after the sender reports acceptance', async () => {
    const { queue, store } = setup({ outcomes: [accepted()] });
    const { key } = await queue.enqueue({ status: 'SAFE' });
    expect(queue.getSnapshot().entries[0]?.lifecycle).toBe('QUEUED');
    await queue.flush();
    const entry = queue.getSnapshot().entries[0];
    expect(entry?.lifecycle).toBe('ACCEPTED');
    expect(entry?.result).toEqual({ id: 'srv-1' });
    expect(store.rows.get(key)?.lifecycle).toBe('ACCEPTED');
  });

  it('is SENDING while the request is in flight', async () => {
    let resolve: (o: SendOutcome<Result>) => void = () => {};
    const store = new MemoryQueueStore<Payload, Result>();
    const queue = new OfflineQueue<Payload, Result>({
      store,
      isOnline: () => true,
      send: () => new Promise((r) => (resolve = r)),
    });
    await queue.enqueue({ status: 'SAFE' });
    const flushing = queue.flush();
    await vi.waitFor(() => expect(queue.getSnapshot().entries[0]?.lifecycle).toBe('SENDING'));
    resolve(accepted());
    await flushing;
    expect(queue.getSnapshot().entries[0]?.lifecycle).toBe('ACCEPTED');
  });

  it('never calls the sender while offline and marks the entry OFFLINE', async () => {
    const { queue, send } = setup({ online: false });
    await queue.enqueue({ status: 'SAFE' });
    await queue.flush();
    expect(send).not.toHaveBeenCalled();
    expect(queue.getSnapshot().entries[0]).toMatchObject({ lifecycle: 'QUEUED', problem: 'OFFLINE', attempts: 0 });
  });

  it('sends queued entries after connectivity returns, reusing the same idempotency key', async () => {
    const { queue, send, network } = setup({ online: false, outcomes: [accepted()] });
    const { key } = await queue.enqueue({ status: 'SAFE' });
    await queue.flush();
    network.online = true;
    await queue.flush();
    expect(send).toHaveBeenCalledWith({ status: 'SAFE' }, key, '2026-10-10T09:00:00.000Z');
    expect(queue.getSnapshot().entries[0]?.lifecycle).toBe('ACCEPTED');
  });

  it('keeps a timed-out entry QUEUED, schedules a backoff retry, and resends with the same key', async () => {
    const { queue, send, timers } = setup({ outcomes: [{ kind: 'retryable', problem: 'TIMEOUT' }, accepted()] });
    const { key } = await queue.enqueue({ status: 'NEED_HELP' });
    await queue.flush();
    expect(queue.getSnapshot().entries[0]).toMatchObject({ lifecycle: 'QUEUED', problem: 'TIMEOUT', attempts: 1 });
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(5_000);

    timers[0]?.fn();
    await vi.waitFor(() => expect(queue.getSnapshot().entries[0]?.lifecycle).toBe('ACCEPTED'));
    expect(send.mock.calls.map((c) => c[1])).toEqual([key, key]);
  });

  it('does not schedule timed retries while offline', async () => {
    const { queue, timers } = setup({ online: false });
    await queue.enqueue({ status: 'SAFE' });
    await queue.flush();
    expect(timers).toHaveLength(0);
  });

  it('marks terminal refusals FAILED, does not auto-retry, and allows manual retry', async () => {
    const { queue, send } = setup({
      outcomes: [{ kind: 'failed', problem: 'PERMISSION_DENIED', detail: 'UNAUTHENTICATED' }, accepted()],
    });
    const { key } = await queue.enqueue({ status: 'SAFE' });
    await queue.flush();
    expect(queue.getSnapshot().entries[0]).toMatchObject({
      lifecycle: 'FAILED',
      problem: 'PERMISSION_DENIED',
      problemDetail: 'UNAUTHENTICATED',
    });
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1);

    await queue.retry(key);
    expect(queue.getSnapshot().entries[0]?.lifecycle).toBe('ACCEPTED');
    expect(send.mock.calls[1]?.[1]).toBe(key);
  });

  it('treats a throwing sender as an unknown outcome, not as accepted', async () => {
    const store = new MemoryQueueStore<Payload, Result>();
    const queue = new OfflineQueue<Payload, Result>({
      store,
      isOnline: () => true,
      send: async () => {
        throw new Error('boom');
      },
      setTimer: () => 0,
    });
    await queue.enqueue({ status: 'SAFE' });
    await queue.flush();
    expect(queue.getSnapshot().entries[0]).toMatchObject({ lifecycle: 'QUEUED', problem: 'SERVER_UNAVAILABLE' });
  });

  it('shares one flush across concurrent calls (no duplicate sends)', async () => {
    const { queue, send } = setup({ outcomes: [accepted()] });
    await queue.enqueue({ status: 'SAFE' });
    await Promise.all([queue.flush(), queue.flush(), queue.flush()]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends oldest first and stops the run after a retryable failure', async () => {
    const { queue, send } = setup({ outcomes: [{ kind: 'retryable', problem: 'SERVER_UNAVAILABLE' }] });
    await queue.enqueue({ status: 'first' });
    await queue.enqueue({ status: 'second' });
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual({ status: 'first' });
  });

  it('recovers an entry left SENDING by a reload as QUEUED and resends it with the same key', async () => {
    const store = new MemoryQueueStore<Payload, Result>();
    const stuck: QueueEntry<Payload, Result> = {
      key: 'persisted-key',
      payload: { status: 'NEED_HELP' },
      createdAt: '2026-10-10T08:59:00.000Z',
      lifecycle: 'SENDING',
      attempts: 1,
      lastAttemptAt: '2026-10-10T08:59:01.000Z',
      problem: null,
      problemDetail: null,
      result: null,
      acceptedAt: null,
    };
    await store.put(stuck);
    const { queue, send } = setup({ store, outcomes: [accepted()] });
    await queue.ready;
    expect(queue.getSnapshot().entries[0]?.lifecycle).toBe('QUEUED');
    expect(store.rows.get('persisted-key')?.lifecycle).toBe('QUEUED');
    await queue.flush();
    // Retries report when the user originally acted, not when the retry happened.
    expect(send).toHaveBeenCalledWith({ status: 'NEED_HELP' }, 'persisted-key', '2026-10-10T08:59:00.000Z');
  });

  it('reports storage failure instead of pretending the entry was saved', async () => {
    const store = new MemoryQueueStore<Payload, Result>();
    store.failWrites = true;
    const { queue } = setup({ store });
    await queue.enqueue({ status: 'SAFE' });
    expect(queue.getSnapshot().storageFailed).toBe(true);
    expect(queue.getSnapshot().entries).toHaveLength(1);
  });

  it('reports unreadable storage at startup', async () => {
    const store = new MemoryQueueStore<Payload, Result>();
    store.failReads = true;
    const { queue } = setup({ store });
    await queue.ready;
    expect(queue.getSnapshot()).toMatchObject({ ready: true, storageFailed: true, entries: [] });
  });
});
