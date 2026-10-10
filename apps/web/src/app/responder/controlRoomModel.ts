import type { HelpRequest, Incident } from '../api/sahaya';

/**
 * Acknowledgement timers T1/T2 (blueprint §8.5). These are DEMO placeholders:
 * the real values must come from the ERT and the Security Officer.
 */
export const ACK_TARGET_SECONDS = 120;
export const ESCALATE_AFTER_SECONDS = 300;

export type AckState =
  | { kind: 'WAITING'; seconds: number; stage: 'ON_TIME' | 'OVERDUE' | 'ESCALATE' }
  | { kind: 'ACKNOWLEDGED'; seconds: number; late: boolean }
  | { kind: 'CLOSED' };

const secondsBetween = (from: string, to: number) =>
  Math.max(0, Math.floor((to - Date.parse(from)) / 1000));

/** How long a help request has waited, or how long acknowledgement took. */
export function ackState(h: HelpRequest, now: number): AckState {
  if (h.status === 'RESOLVED' || h.status === 'CANCELLED') return { kind: 'CLOSED' };
  if (h.acknowledgedAt) {
    const seconds = secondsBetween(h.createdAt, Date.parse(h.acknowledgedAt));
    return { kind: 'ACKNOWLEDGED', seconds, late: seconds > ACK_TARGET_SECONDS };
  }
  const seconds = secondsBetween(h.createdAt, now);
  return {
    kind: 'WAITING',
    seconds,
    stage:
      seconds >= ESCALATE_AFTER_SECONDS
        ? 'ESCALATE'
        : seconds >= ACK_TARGET_SECONDS
          ? 'OVERDUE'
          : 'ON_TIME',
  };
}

/** "0:45", "12:03", "1 h 05 m". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h} h ${String(m).padStart(2, '0')} m`;
  }
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Active requests, unacknowledged first and longest-waiting first. */
export function sortHelpQueue(items: readonly HelpRequest[], now: number): HelpRequest[] {
  return items
    .filter((h) => h.status !== 'RESOLVED' && h.status !== 'CANCELLED')
    .sort((a, b) => {
      const aWaiting = a.acknowledgedAt ? 1 : 0;
      const bWaiting = b.acknowledgedAt ? 1 : 0;
      if (aWaiting !== bWaiting) return aWaiting - bWaiting;
      return secondsBetween(b.createdAt, now) - secondsBetween(a.createdAt, now);
    });
}

export const LEVEL_TEXT: Record<1 | 2 | 3, { short: string; text: string }> = {
  1: { short: 'L1', text: 'Unverified report – under review' },
  2: { short: 'L2', text: 'Suspected – multiple independent reports – verification in progress' },
  3: { short: 'L3', text: 'Verified incident' },
};

/** Open hazards, highest level first, then oldest first (needs attention longest). */
export function sortHazardQueue(items: readonly Incident[]): Incident[] {
  return items
    .filter((i) => i.level !== null && i.level !== undefined)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.createdAt.localeCompare(b.createdAt));
}
