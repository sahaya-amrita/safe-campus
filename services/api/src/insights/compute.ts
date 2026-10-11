import type {
  InsightForecastDay,
  InsightHotspot,
  InsightPrecaution,
  InsightTrend,
  InsightsResponse,
  InsightsView,
} from '@sahaya/contracts';
import { dayStart, type SyntheticCategory, type SyntheticEvent } from './synthetic.js';

/**
 * Transparent statistics over the synthetic history. Every number on the
 * Insights pages comes from these functions; the AI summary may only restate
 * them. Patterns are about places, times and categories, never people.
 */

const DAY_MS = 86_400_000;

export const CATEGORY_LABEL: Record<SyntheticCategory, string> = {
  MEDICAL: 'Medical',
  HAZARD: 'Hazards (wet floors, obstructions)',
  FIRE_SMOKE: 'Fire and smoke',
  PERSONAL_SAFETY: 'Personal safety',
  OTHER: 'Other',
};

/** Seeded DEMO guides each category points to (see demo/demoContent.ts). */
const GUIDE: Record<SyntheticCategory, { title: string; version: string }> = {
  MEDICAL: { title: 'DEMO: Medical help and first aid', version: 'demo-medical-1' },
  HAZARD: { title: 'DEMO: Flood and storms', version: 'demo-flood-1' },
  FIRE_SMOKE: { title: 'DEMO: Fire and smoke', version: 'demo-fire-1' },
  PERSONAL_SAFETY: { title: 'DEMO: Personal security', version: 'demo-security-1' },
  OTHER: { title: 'DEMO: Preparedness basics', version: 'demo-basics-1' },
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
export const hourRange = (start: number, length: number) => `${pad(start)}–${pad(start + length)}`;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Busiest consecutive `length`-hour window (wrapping midnight) of a 24-hour profile. */
export function busiestWindow(profile: readonly number[], length = 3): number {
  let best = 0;
  let bestSum = -1;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let k = 0; k < length; k++) sum += profile[(start + k) % 24]!;
    if (sum > bestSum) {
      bestSum = sum;
      best = start;
    }
  }
  return best;
}

const hourProfileOf = (events: readonly SyntheticEvent[]) => {
  const profile = Array.from({ length: 24 }, () => 0);
  for (const e of events) profile[e.at.getUTCHours()]! += 1;
  return profile;
};

/**
 * Next 7 days of help requests: the mean of the same weekday over the last 8
 * weeks, with a 90% range from a Poisson approximation (mean ± 1.645·√mean).
 */
export function forecastHelpRequests(
  events: readonly SyntheticEvent[],
  asOf: Date,
): InsightForecastDay[] {
  const end = dayStart(asOf).getTime();
  const perDay = new Map<number, number>();
  for (const e of events) {
    if (!e.helpRequest) continue;
    const day = dayStart(e.at).getTime();
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const day = end + i * DAY_MS;
    const samples = Array.from(
      { length: 8 },
      (_, w) => perDay.get(day - (w + 1) * 7 * DAY_MS) ?? 0,
    );
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const spread = 1.645 * Math.sqrt(mean);
    const date = new Date(day);
    return {
      date: date.toISOString().slice(0, 10),
      weekday: WEEKDAYS[date.getUTCDay()]!,
      expected: Math.round(mean * 10) / 10,
      low: Math.max(0, Math.floor(mean - spread)),
      high: Math.ceil(mean + spread),
    };
  });
}

/** Reports in the same place and category within 30 minutes of each other. */
export function duplicateClusters(events: readonly SyntheticEvent[]): number {
  let clusters = 0;
  const last = new Map<string, number>();
  for (const e of events) {
    const key = `${e.place}|${e.category}`;
    const prev = last.get(key);
    if (prev !== undefined && e.at.getTime() - prev <= 30 * 60_000) clusters += 1;
    last.set(key, e.at.getTime());
  }
  return clusters;
}

export const VIEWS_FOR_ROLES = (roles: readonly string[]): InsightsView[] => {
  const views: InsightsView[] = ['student'];
  if (roles.includes('RESPONDER') || roles.includes('ADMIN')) views.push('responder');
  if (roles.includes('INCIDENT_VERIFIER') || roles.includes('ADMIN')) views.push('verifier');
  if (roles.includes('ADMIN')) views.push('admin');
  return views;
};

export function computeInsights(
  events: readonly SyntheticEvent[],
  view: InsightsView,
  availableViews: InsightsView[],
  asOf: Date,
): InsightsResponse {
  const end = dayStart(asOf).getTime();
  const last30 = events.filter((e) => e.at.getTime() >= end - 30 * DAY_MS);
  const prev30 = events.filter(
    (e) => e.at.getTime() >= end - 60 * DAY_MS && e.at.getTime() < end - 30 * DAY_MS,
  );
  const categories = Object.keys(CATEGORY_LABEL) as SyntheticCategory[];

  const trends: InsightTrend[] = categories
    .map((category) => {
      const a = last30.filter((e) => e.category === category).length;
      const b = prev30.filter((e) => e.category === category).length;
      return {
        category,
        label: CATEGORY_LABEL[category],
        last30: a,
        previous30: b,
        changePercent: b === 0 ? null : Math.round(((a - b) / b) * 100),
      };
    })
    .sort((x, y) => y.last30 - x.last30);

  const profile = hourProfileOf(last30);
  const peak = busiestWindow(profile);

  const hotspots: InsightHotspot[] = categories
    .flatMap((category) => {
      const inCat = last30.filter((e) => e.category === category);
      const byPlace = new Map<string, SyntheticEvent[]>();
      for (const e of inCat) byPlace.set(e.place, [...(byPlace.get(e.place) ?? []), e]);
      return [...byPlace.entries()].map(([place, list]) => ({
        place,
        category,
        label: CATEGORY_LABEL[category],
        count: list.length,
        sharePercent: Math.round((list.length / inCat.length) * 100),
        busiestHours: hourRange(busiestWindow(hourProfileOf(list)), 3),
      }));
    })
    .filter((h) => h.count >= 3 && h.category !== 'OTHER')
    .sort((x, y) => y.count - x.count)
    .slice(0, 5);

  // One precaution per category that has a hotspot or a rise, pointing to its guide.
  const precautions: InsightPrecaution[] = [];
  for (const t of trends) {
    if (t.category === 'OTHER' || precautions.length >= 4) continue;
    const spot = hotspots.find((h) => h.category === t.category);
    const rising = t.changePercent !== null && t.changePercent >= 25;
    if (!spot && !rising) continue;
    const parts = [
      spot ? `most often ${spot.busiestHours} near ${spot.place}` : null,
      rising ? `up ${t.changePercent}% on the previous 30 days` : null,
    ].filter(Boolean);
    precautions.push({
      pattern: `${t.label} reports: ${parts.join(', ')} (synthetic data).`,
      guideTitle: GUIDE[t.category as SyntheticCategory].title,
      guideVersion: GUIDE[t.category as SyntheticCategory].version,
    });
  }

  const response: InsightsResponse = {
    view,
    availableViews,
    dataNote:
      'Synthetic DEMO data generated for this prototype: about 90 days of fictional events. Patterns and forecasts are illustrative only. They are not a risk assessment and never trigger alerts.',
    window: {
      from: new Date(end - 90 * DAY_MS).toISOString().slice(0, 10),
      to: new Date(end - DAY_MS).toISOString().slice(0, 10),
      days: 90,
    },
    totals: {
      reports: last30.length,
      helpRequests: last30.filter((e) => e.helpRequest).length,
    },
    trends,
    hourProfile: profile,
    busiestWindow: hourRange(peak, 3),
    hotspots,
    precautions,
    method: [
      'Counts compare the last 30 days with the 30 days before.',
      'Busiest hours: the 3-hour window with the most reports (campus time).',
      'Hotspots: places with at least 3 reports of one category in the last 30 days.',
      'Precautions point to a guide; they are not new advice.',
    ],
  };

  if (view === 'responder' || view === 'admin') {
    const acks = (list: SyntheticEvent[]) =>
      list.filter((e) => e.ackSeconds !== null).map((e) => e.ackSeconds!);
    response.forecast = {
      metric: 'help requests per day',
      method:
        'Average of the same weekday over the last 8 weeks; the range covers about 90% of days (Poisson approximation).',
      days: forecastHelpRequests(events, asOf),
    };
    response.acknowledgement = {
      medianLast30: median(acks(last30)),
      medianPrevious30: median(acks(prev30)),
      unit: 'seconds',
    };
    response.method.push(
      'Forecast: same-weekday average over 8 weeks, with a 90% range. Illustrative, not a staffing plan.',
    );
  }
  if (view === 'verifier' || view === 'admin') {
    const decided = last30.filter((e) => e.outcome !== 'REPORTED');
    response.verification = {
      verifiedPercent: decided.length
        ? Math.round(
            (decided.filter((e) => e.outcome === 'VERIFIED').length / decided.length) * 100,
          )
        : 0,
      dismissedPercent: decided.length
        ? Math.round(
            (decided.filter((e) => e.outcome === 'DISMISSED').length / decided.length) * 100,
          )
        : 0,
      likelyDuplicateClusters: duplicateClusters(last30),
      duplicateRule: 'Same place and category within 30 minutes.',
    };
    response.method.push('Verification shares are of reports with a recorded decision.');
  }
  return response;
}
