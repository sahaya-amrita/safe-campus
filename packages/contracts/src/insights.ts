import { z } from 'zod';

/*
 * Insights (synthetic data). Statistics are computed transparently from a
 * separate, generated DEMO history that never enters live queues. Patterns
 * are about places, times and categories, never about individual people.
 * Nothing here is an alert, a risk assessment or an instruction to act.
 */

export const insightsViewSchema = z.enum(['student', 'responder', 'verifier', 'admin']);
export type InsightsView = z.infer<typeof insightsViewSchema>;

export interface InsightTrend {
  category: string;
  label: string;
  last30: number;
  previous30: number;
  /** Rounded percent change; null when the previous period had none. */
  changePercent: number | null;
}

export interface InsightHotspot {
  place: string;
  category: string;
  label: string;
  count: number;
  /** Share of that category's reports in the window, rounded percent. */
  sharePercent: number;
  busiestHours: string;
}

export interface InsightForecastDay {
  date: string;
  weekday: string;
  expected: number;
  low: number;
  high: number;
}

export interface InsightPrecaution {
  /** Pattern from the synthetic data, stated plainly. */
  pattern: string;
  /** Guide the precaution points to (titles of seeded DEMO guides). */
  guideTitle: string;
  guideVersion: string;
}

export interface InsightsResponse {
  view: InsightsView;
  /** Views this user may open. */
  availableViews: InsightsView[];
  dataNote: string;
  window: { from: string; to: string; days: number };
  totals: { reports: number; helpRequests: number };
  trends: InsightTrend[];
  hourProfile: number[];
  busiestWindow: string;
  hotspots: InsightHotspot[];
  precautions: InsightPrecaution[];
  /** Responder and admin views. */
  forecast?: {
    metric: 'help requests per day';
    method: string;
    days: InsightForecastDay[];
  };
  /** Responder and admin views. */
  acknowledgement?: { medianLast30: number; medianPrevious30: number; unit: 'seconds' };
  /** Verifier and admin views. */
  verification?: {
    verifiedPercent: number;
    dismissedPercent: number;
    likelyDuplicateClusters: number;
    duplicateRule: string;
  };
  method: string[];
}

export interface InsightsSummary {
  view: InsightsView;
  /** AI: written by the model and checked against the facts. APP: written by the app. */
  source: 'AI' | 'APP';
  model: string | null;
  text: string;
  /** Why the app wrote it instead (AI off, failed, or rejected by the check). */
  fallbackReason: string | null;
  generatedAt: string;
}
