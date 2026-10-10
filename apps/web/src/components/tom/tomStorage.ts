/**
 * Session-only preferences. Stores only which tips were dismissed and whether
 * Tom is minimised; no behavioural analytics. All access is guarded because
 * storage can be unavailable (private mode, blocked site data).
 */
export interface TomStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Earlier builds used "safe-campus.tom.hidden", which removed Tom with no way
// back in that tab. That key is deliberately ignored now.
const MINIMISED_KEY = "safe-campus.tom.minimised";
const DISMISSED_KEY = "safe-campus.tom.dismissedTips";

export function defaultStore(): TomStore | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function readMinimised(store: TomStore | null): boolean {
  try {
    return store?.getItem(MINIMISED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMinimised(store: TomStore | null, minimised: boolean): void {
  try {
    if (minimised) store?.setItem(MINIMISED_KEY, "1");
    else store?.removeItem(MINIMISED_KEY);
  } catch {
    /* ignore */
  }
}

export function readDismissed(store: TomStore | null): Set<string> {
  try {
    const raw = store?.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeDismissed(store: TomStore | null, ids: Set<string>): void {
  try {
    if (ids.size === 0) store?.removeItem(DISMISSED_KEY);
    else store?.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** For the shell's settings screen: restore Tom's full launcher and all tips. */
export function clearTomSessionPreferences(store: TomStore | null = defaultStore()): void {
  writeMinimised(store, false);
  writeDismissed(store, new Set());
}
