/**
 * Synthetic history for the Insights pages (DEMO only).
 *
 * A seeded generator produces about 90 days of fictional reports, help
 * requests and verification outcomes with plausible campus patterns. It is
 * generated in memory on request and never written to the live tables, so
 * queues, counters and the admin dashboard are unaffected. The same date
 * always produces the same history.
 *
 * Built-in patterns (so the statistics have something to find):
 * - medical reports peak 10:00–16:00 in academic buildings, rising in the
 *   last two weeks (exam season);
 * - hazard reports (wet floors) double in the last three weeks (rainy spell)
 *   near the hostel and Academic Block 1;
 * - smoke reports cluster around the canteen at lunch and dinner;
 * - personal-safety reports are late evening near the hostel;
 * - fewer academic-building reports at weekends.
 */

export type SyntheticCategory = 'MEDICAL' | 'HAZARD' | 'FIRE_SMOKE' | 'PERSONAL_SAFETY' | 'OTHER';
export type SyntheticOutcome = 'REPORTED' | 'CORROBORATED' | 'VERIFIED' | 'DISMISSED';

export interface SyntheticEvent {
  at: Date;
  category: SyntheticCategory;
  place: string;
  helpRequest: boolean;
  /** Seconds until a responder acknowledged; null when there was no help request. */
  ackSeconds: number | null;
  outcome: SyntheticOutcome;
}

export const PLACES = {
  alpha: 'DEMO Building Alpha',
  beta: 'DEMO Building Beta (Academic Block 1)',
  gamma: 'DEMO Building Gamma (Library)',
  delta: 'DEMO Hostel Delta',
  epsilon: 'DEMO Building Epsilon (Canteen)',
} as const;
type PlaceKey = keyof typeof PLACES;

interface Pattern {
  category: SyntheticCategory;
  perDay: number;
  /** Relative weight for each hour 0–23. */
  hours: number[];
  places: Partial<Record<PlaceKey, number>>;
  helpChance: number;
  /** Multiplier for a day `daysAgo` before the end of the window. */
  season?: (daysAgo: number) => number;
  weekendFactor: number;
  outcomes: Record<SyntheticOutcome, number>;
}

const hours = (peaks: [number, number, number][], base = 0.15): number[] =>
  Array.from({ length: 24 }, (_, h) =>
    peaks.reduce((w, [from, to, weight]) => (h >= from && h < to ? w + weight : w), base),
  );

const PATTERNS: Pattern[] = [
  {
    category: 'MEDICAL',
    perDay: 2.1,
    hours: hours([
      [10, 16, 3],
      [8, 10, 1],
    ]),
    places: { alpha: 3, beta: 3, gamma: 2, delta: 1, epsilon: 1 },
    helpChance: 0.65,
    season: (d) => (d < 14 ? 1.5 : 1),
    weekendFactor: 0.5,
    outcomes: { REPORTED: 0.15, CORROBORATED: 0.25, VERIFIED: 0.5, DISMISSED: 0.1 },
  },
  {
    category: 'HAZARD',
    perDay: 1.4,
    hours: hours([
      [7, 11, 2],
      [16, 19, 2],
    ]),
    places: { beta: 3, delta: 3, alpha: 1, gamma: 1, epsilon: 1 },
    helpChance: 0.1,
    season: (d) => (d < 21 ? 2.1 : 1),
    weekendFactor: 0.8,
    outcomes: { REPORTED: 0.2, CORROBORATED: 0.35, VERIFIED: 0.3, DISMISSED: 0.15 },
  },
  {
    category: 'FIRE_SMOKE',
    perDay: 0.5,
    hours: hours(
      [
        [11, 14, 3],
        [18, 21, 3],
      ],
      0.05,
    ),
    places: { epsilon: 6, delta: 1, alpha: 1 },
    helpChance: 0.3,
    weekendFactor: 1,
    outcomes: { REPORTED: 0.1, CORROBORATED: 0.2, VERIFIED: 0.25, DISMISSED: 0.45 },
  },
  {
    category: 'PERSONAL_SAFETY',
    perDay: 0.6,
    hours: hours(
      [
        [20, 24, 4],
        [0, 1, 2],
      ],
      0.05,
    ),
    places: { delta: 4, gamma: 1, epsilon: 1 },
    helpChance: 0.55,
    weekendFactor: 1.3,
    outcomes: { REPORTED: 0.25, CORROBORATED: 0.3, VERIFIED: 0.3, DISMISSED: 0.15 },
  },
  {
    category: 'OTHER',
    perDay: 0.9,
    hours: hours([[9, 18, 1]]),
    places: { alpha: 1, beta: 1, gamma: 1, delta: 1, epsilon: 1 },
    helpChance: 0.15,
    weekendFactor: 0.8,
    outcomes: { REPORTED: 0.3, CORROBORATED: 0.2, VERIFIED: 0.2, DISMISSED: 0.3 },
  },
];

/** Small, fast, seedable PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(mean: number, r: () => number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= r();
  } while (p > limit);
  return k - 1;
}

function pick<K extends string>(weights: Partial<Record<K, number>>, r: () => number): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [key, w] of entries) {
    x -= w;
    if (x <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}

const DAY_MS = 86_400_000;

/** Start of the UTC day for `date`. */
export const dayStart = (date: Date) => new Date(Math.floor(date.getTime() / DAY_MS) * DAY_MS);

/**
 * Events for the `days` full days before `asOf` (UTC). Deterministic for a
 * given `asOf` day: each day's events come from a seed derived from the date.
 */
export function syntheticHistory(asOf: Date, days = 90): SyntheticEvent[] {
  const end = dayStart(asOf);
  const events: SyntheticEvent[] = [];
  for (let daysAgo = days; daysAgo >= 1; daysAgo--) {
    const day = new Date(end.getTime() - daysAgo * DAY_MS);
    const r = rng(Math.floor(day.getTime() / DAY_MS) * 7919 + 17);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    for (const p of PATTERNS) {
      const mean = p.perDay * (p.season?.(daysAgo) ?? 1) * (weekend ? p.weekendFactor : 1);
      const n = poisson(mean, r);
      for (let i = 0; i < n; i++) {
        const hour = Number(pick(Object.fromEntries(p.hours.map((w, h) => [String(h), w])), r));
        const minute = Math.floor(r() * 60);
        const help = r() < p.helpChance;
        // Acknowledgement time: log-normal around ~100 s, slowly improving over the window.
        const median = 80 + daysAgo * 0.6;
        const ack = help ? Math.round(median * Math.exp((r() + r() + r() - 1.5) * 0.9)) : null;
        events.push({
          at: new Date(day.getTime() + hour * 3_600_000 + minute * 60_000),
          category: p.category,
          place: PLACES[pick(p.places, r)],
          helpRequest: help,
          ackSeconds: ack,
          outcome: pick(p.outcomes, r),
        });
      }
    }
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
