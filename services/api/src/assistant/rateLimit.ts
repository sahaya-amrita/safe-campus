/**
 * Fixed-window limiters (in-memory, per process). One instance is fine for the
 * demo deployment; use a shared store (Postgres/Redis) before scaling out.
 */
export class WindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns 0 if allowed (and counts it), else seconds until the window resets. */
  take(key: string): number {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      return 0;
    }
    if (w.count >= this.limit) return Math.max(1, Math.ceil((w.start + this.windowMs - t) / 1000));
    w.count += 1;
    return 0;
  }
}

/** Per-user limits (→ HTTP 429) plus a shared provider budget (→ deterministic fallback). */
export class AssistantLimits {
  private readonly userMinute: WindowLimiter;
  private readonly userDay: WindowLimiter;
  private readonly providerMinute: WindowLimiter;
  private readonly providerDay: WindowLimiter;

  constructor(
    opts: {
      userPerMinute: number;
      userPerDay: number;
      providerPerMinute: number;
      providerPerDay: number;
    },
    now: () => number = Date.now,
  ) {
    this.userMinute = new WindowLimiter(opts.userPerMinute, 60_000, now);
    this.userDay = new WindowLimiter(opts.userPerDay, 86_400_000, now);
    this.providerMinute = new WindowLimiter(opts.providerPerMinute, 60_000, now);
    this.providerDay = new WindowLimiter(opts.providerPerDay, 86_400_000, now);
  }

  user(userId: string): number {
    return this.userMinute.take(userId) || this.userDay.take(userId);
  }

  /** Keeps all users together under the provider's organisation-wide quota. */
  provider(): boolean {
    return this.providerMinute.take('provider') === 0 && this.providerDay.take('provider') === 0;
  }
}
