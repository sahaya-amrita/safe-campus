import type { RetryableProblem, TerminalProblem, RequestProblem } from './problems';

/**
 * Internal lifecycle of a queued submission. Features map this onto the
 * shared contract's delivery state; this module stays domain-agnostic.
 *
 *   QUEUED   — stored on this device, NOT sent (or outcome unknown).
 *   SENDING  — a request is in flight.
 *   ACCEPTED — the server answered with success. Nothing more is implied.
 *   FAILED   — the server refused; needs the user's attention.
 */
export type QueueLifecycle = 'QUEUED' | 'SENDING' | 'ACCEPTED' | 'FAILED';

export interface QueueEntry<P, R> {
  /** Idempotency key, generated once on this device and reused for every retry. */
  key: string;
  payload: P;
  /** When the user acted, per this device's clock. */
  createdAt: string;
  lifecycle: QueueLifecycle;
  attempts: number;
  lastAttemptAt: string | null;
  problem: RequestProblem | null;
  /** Server-supplied detail for terminal failures, shown only as secondary text. */
  problemDetail: string | null;
  result: R | null;
  acceptedAt: string | null;
}

export type SendOutcome<R> =
  | { kind: 'accepted'; result: R }
  | { kind: 'retryable'; problem: RetryableProblem; detail?: string }
  | { kind: 'failed'; problem: TerminalProblem; detail?: string };

export interface QueueStore<P, R> {
  loadAll(): Promise<QueueEntry<P, R>[]>;
  put(entry: QueueEntry<P, R>): Promise<void>;
}

export interface QueueSnapshot<P, R> {
  /** Newest first. */
  readonly entries: readonly QueueEntry<P, R>[];
  /** False until persisted entries have been loaded. */
  readonly ready: boolean;
  /** True when the latest write to device storage failed; entries may be lost on close. */
  readonly storageFailed: boolean;
}

export interface OfflineQueueOptions<P, R> {
  store: QueueStore<P, R>;
  /** `createdAt` is the entry's original creation time, so retries report when the user acted. */
  send: (payload: P, idempotencyKey: string, createdAt: string) => Promise<SendOutcome<R>>;
  isOnline: () => boolean;
  now?: () => Date;
  generateKey?: () => string;
  /** Backoff for TIMEOUT / SERVER_UNAVAILABLE while online. Offline items wait for reconnection instead. */
  retryDelaysMs?: readonly number[];
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;

/**
 * Persistent store-and-forward queue with idempotent retries.
 *
 * Guarantees relied on by the UI:
 * - An entry is written to device storage before `enqueue` resolves.
 * - An entry becomes ACCEPTED only after `send` reports a server success.
 * - No request is attempted while `isOnline()` is false.
 * - Concurrent `flush` calls share one run, so an entry is never in flight twice.
 * - An entry found SENDING at startup (app closed mid-request) is re-queued and
 *   resent with the same idempotency key.
 */
export class OfflineQueue<P, R> {
  private snapshot: QueueSnapshot<P, R> = { entries: [], ready: false, storageFailed: false };
  private readonly listeners = new Set<() => void>();
  private flushInFlight: Promise<void> | null = null;
  private retryTimer: unknown = null;
  private disposed = false;
  readonly ready: Promise<void>;

  private readonly now: () => Date;
  private readonly generateKey: () => string;
  private readonly retryDelaysMs: readonly number[];
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: OfflineQueueOptions<P, R>) {
    this.now = options.now ?? (() => new Date());
    this.generateKey = options.generateKey ?? (() => crypto.randomUUID());
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.ready = this.load();
  }

  getSnapshot = (): QueueSnapshot<P, R> => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Stores a new submission on the device. Call `flush()` to attempt delivery. */
  async enqueue(payload: P): Promise<QueueEntry<P, R>> {
    await this.ready;
    const entry: QueueEntry<P, R> = {
      key: this.generateKey(),
      payload,
      createdAt: this.now().toISOString(),
      lifecycle: 'QUEUED',
      attempts: 0,
      lastAttemptAt: null,
      problem: this.options.isOnline() ? null : 'OFFLINE',
      problemDetail: null,
      result: null,
      acceptedAt: null,
    };
    await this.write(entry);
    return entry;
  }

  /** Attempts every QUEUED entry, oldest first. */
  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.flushInFlight) {
      this.flushInFlight = this.ready
        .then(() => this.runFlush())
        .finally(() => {
          this.flushInFlight = null;
        });
    }
    return this.flushInFlight;
  }

  /** Moves a FAILED entry back to QUEUED (same idempotency key) and attempts it. */
  async retry(key: string): Promise<void> {
    await this.ready;
    const entry = this.find(key);
    if (!entry || entry.lifecycle !== 'FAILED') return;
    await this.write({ ...entry, lifecycle: 'QUEUED', problem: null, problemDetail: null });
    await this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelRetryTimer();
    this.listeners.clear();
  }

  private async runFlush(): Promise<void> {
    this.cancelRetryTimer();
    const queued = this.snapshot.entries.filter((e) => e.lifecycle === 'QUEUED').reverse();
    for (const entry of queued) {
      if (this.disposed) return;
      if (!this.options.isOnline()) {
        // Do not attempt while offline; just make the reason visible.
        if (entry.problem !== 'OFFLINE') await this.write({ ...entry, problem: 'OFFLINE', problemDetail: null });
        continue;
      }
      const sending: QueueEntry<P, R> = {
        ...entry,
        lifecycle: 'SENDING',
        attempts: entry.attempts + 1,
        lastAttemptAt: this.now().toISOString(),
      };
      await this.write(sending);

      let outcome: SendOutcome<R>;
      try {
        outcome = await this.options.send(entry.payload, entry.key, entry.createdAt);
      } catch (error) {
        // Adapters should not throw; if one does, the outcome is unknown, so keep it queued.
        outcome = {
          kind: 'retryable',
          problem: 'SERVER_UNAVAILABLE',
          detail: error instanceof Error ? error.message : undefined,
        };
      }

      if (outcome.kind === 'accepted') {
        await this.write({
          ...sending,
          lifecycle: 'ACCEPTED',
          result: outcome.result,
          acceptedAt: this.now().toISOString(),
          problem: null,
          problemDetail: null,
        });
      } else if (outcome.kind === 'failed') {
        await this.write({ ...sending, lifecycle: 'FAILED', problem: outcome.problem, problemDetail: outcome.detail ?? null });
      } else {
        await this.write({ ...sending, lifecycle: 'QUEUED', problem: outcome.problem, problemDetail: outcome.detail ?? null });
        // The path to the server is not working; keep order and stop this run.
        break;
      }
    }
    this.scheduleRetryIfNeeded();
  }

  private scheduleRetryIfNeeded(): void {
    if (this.disposed || !this.options.isOnline()) return;
    const waiting = this.snapshot.entries.filter(
      (e) => e.lifecycle === 'QUEUED' && (e.problem === 'TIMEOUT' || e.problem === 'SERVER_UNAVAILABLE'),
    );
    if (waiting.length === 0) return;
    const attempts = Math.max(...waiting.map((e) => e.attempts));
    const delay = this.retryDelaysMs[Math.min(attempts, this.retryDelaysMs.length) - 1] ?? this.retryDelaysMs[0] ?? 5_000;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  private cancelRetryTimer(): void {
    if (this.retryTimer !== null) {
      this.clearTimer(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async load(): Promise<void> {
    let loaded: QueueEntry<P, R>[] = [];
    let storageFailed = false;
    try {
      loaded = await this.options.store.loadAll();
    } catch {
      // Nothing could be read; start empty but tell the user storage is not working.
      storageFailed = true;
    }
    const recovered: QueueEntry<P, R>[] = loaded
      .map((e): QueueEntry<P, R> => (e.lifecycle === 'SENDING' ? { ...e, lifecycle: 'QUEUED', problem: null } : e))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    this.snapshot = { entries: recovered, ready: true, storageFailed };
    this.notify();
    for (const entry of recovered) {
      if (loaded.find((l) => l.key === entry.key)?.lifecycle === 'SENDING') await this.persist(entry);
    }
  }

  private find(key: string): QueueEntry<P, R> | undefined {
    return this.snapshot.entries.find((e) => e.key === key);
  }

  /** Persists first, then publishes, so the UI never shows a state the device has not stored. */
  private async write(entry: QueueEntry<P, R>): Promise<void> {
    const storageOk = await this.persist(entry);
    const exists = this.snapshot.entries.some((e) => e.key === entry.key);
    const entries = exists
      ? this.snapshot.entries.map((e) => (e.key === entry.key ? entry : e))
      : [entry, ...this.snapshot.entries];
    this.snapshot = { ...this.snapshot, entries, storageFailed: !storageOk };
    this.notify();
  }

  private async persist(entry: QueueEntry<P, R>): Promise<boolean> {
    try {
      await this.options.store.put(entry);
      return true;
    } catch {
      // Reported through snapshot.storageFailed; the entry is still kept in memory.
      return false;
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
