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

// ---------------------------------------------------------------------------
// Long-lived per-viewer preferences (localStorage). Only two flags: whether
// the first-visit welcome was seen, and whether the ? shortcut is off.
// ---------------------------------------------------------------------------

const ONBOARDED_KEY = "safe-campus.tom.onboarded";
const SHORTCUT_OFF_KEY = "safe-campus.tom.shortcut-off";

export function defaultPersistentStore(): TomStore | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readFlag(store: TomStore | null, key: string): boolean {
  try {
    return store?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(store: TomStore | null, key: string, on: boolean): void {
  try {
    if (on) store?.setItem(key, "1");
    else store?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const readOnboarded = (s: TomStore | null) => readFlag(s, ONBOARDED_KEY);
export const writeOnboarded = (s: TomStore | null) => writeFlag(s, ONBOARDED_KEY, true);
export const readShortcutOff = (s: TomStore | null) => readFlag(s, SHORTCUT_OFF_KEY);
export const writeShortcutOff = (s: TomStore | null, off: boolean) => writeFlag(s, SHORTCUT_OFF_KEY, off);
