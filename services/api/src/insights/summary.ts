import type { InsightsResponse, InsightsSummary } from '@sahaya/contracts';
import type { AssistantConfig } from '../assistant/config.js';
import { GROQ_BASE_URL } from '../assistant/groqProvider.js';

/**
 * Plain-language summary of the Insights statistics.
 *
 * The AI may only restate the computed facts. Its text is checked: every
 * number must appear in the facts, it must say the data is synthetic, and it
 * must stay short. Anything else is rejected and the app writes the summary
 * from a template instead (also when AI is off or fails). Only aggregate,
 * synthetic statistics are sent to the model: no names, accounts or records.
 */

export interface InsightsSummarizer {
  readonly model: string;
  summarize(facts: SummaryFacts, signal: AbortSignal): Promise<string | null>;
}

/** The subset of the statistics given to the model. */
export interface SummaryFacts {
  audience: string;
  window: InsightsResponse['window'];
  totals: InsightsResponse['totals'];
  busiestWindow: string;
  trends: { label: string; last30: number; previous30: number; changePercent: number | null }[];
  hotspots: { place: string; label: string; count: number; busiestHours: string }[];
  forecast?: { weekday: string; expected: number; low: number; high: number }[];
  acknowledgement?: InsightsResponse['acknowledgement'];
  verification?: InsightsResponse['verification'];
}

const AUDIENCE: Record<InsightsResponse['view'], string> = {
  student: 'a student (what to be aware of on campus)',
  responder: 'a campus responder (workload and where reports come from)',
  verifier: 'an incident verifier (report patterns and outcomes)',
  admin: 'a safety administrator (overall picture)',
};

export function summaryFacts(insights: InsightsResponse): SummaryFacts {
  return {
    audience: AUDIENCE[insights.view],
    window: insights.window,
    totals: insights.totals,
    busiestWindow: insights.busiestWindow,
    trends: insights.trends.map(({ label, last30, previous30, changePercent }) => ({
      label,
      last30,
      previous30,
      changePercent,
    })),
    hotspots: insights.hotspots.map(({ place, label, count, busiestHours }) => ({
      place,
      label,
      count,
      busiestHours,
    })),
    ...(insights.forecast
      ? {
          forecast: insights.forecast.days.map(({ weekday, expected, low, high }) => ({
            weekday,
            expected,
            low,
            high,
          })),
        }
      : {}),
    ...(insights.acknowledgement ? { acknowledgement: insights.acknowledgement } : {}),
    ...(insights.verification ? { verification: insights.verification } : {}),
  };
}

const numbersIn = (text: string) =>
  (text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n));

/** Why a model summary is unacceptable, or null when it passes. */
export function checkSummary(text: string, facts: SummaryFacts): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 40) return 'too short';
  if (trimmed.length > 900) return 'too long';
  if (!/synthetic/i.test(trimmed)) return 'does not say the data is synthetic';
  if (/\bguarantee|\bno risk\b|\bcompletely safe\b/i.test(trimmed)) return 'overstates certainty';
  const allowed = new Set(numbersIn(JSON.stringify(facts)));
  const unknown = numbersIn(trimmed).filter((n) => !allowed.has(n));
  if (unknown.length > 0) return `numbers not in the facts: ${unknown.slice(0, 3).join(', ')}`;
  return null;
}

/** The app's own summary, used when AI is off, fails or is rejected. */
export function templateSummary(insights: InsightsResponse): string {
  const top = insights.trends[0];
  const rising = insights.trends.find((t) => t.changePercent !== null && t.changePercent >= 25);
  const spot = insights.hotspots[0];
  const parts = [
    `In the last 30 days of synthetic data there were ${insights.totals.reports} reports and ${insights.totals.helpRequests} help requests, most often ${insights.busiestWindow}.`,
    top ? `${top.label} was the most common category (${top.last30}).` : '',
    rising ? `${rising.label} rose ${rising.changePercent}% on the previous 30 days.` : '',
    spot
      ? `The busiest place was ${spot.place} for ${spot.label.toLowerCase()} (${spot.count}).`
      : '',
  ];
  if (insights.forecast) {
    const days = insights.forecast.days;
    const busiest = [...days].sort((a, b) => b.expected - a.expected)[0]!;
    parts.push(
      `The illustrative forecast peaks on ${busiest.weekday} at about ${busiest.expected} help requests (range ${busiest.low}–${busiest.high}).`,
    );
  }
  if (insights.verification)
    parts.push(
      `${insights.verification.verifiedPercent}% of decided reports were verified, and there were ${insights.verification.likelyDuplicateClusters} possible duplicate clusters.`,
    );
  return parts.filter(Boolean).join(' ');
}

const SYSTEM = `You summarise synthetic campus-safety statistics for a prototype app.
Rules:
- Use only the facts in the JSON you are given. Do not add numbers, causes, places, people or advice that are not in the facts.
- Say clearly that the data is synthetic and the patterns are illustrative.
- Never describe or guess about any individual person.
- Never tell the reader they are safe or that something will happen; forecasts are ranges, not certainties.
- Write at most 4 short sentences in plain English for the stated audience.
Return JSON: {"summary": "..."}.`;

export function groqSummarizer(
  config: AssistantConfig,
  fetchImpl: typeof fetch = fetch,
): InsightsSummarizer | null {
  if (config.ASSISTANT_PROVIDER !== 'groq' || !config.GROQ_API_KEY || !config.GROQ_MODEL)
    return null;
  const model = config.GROQ_MODEL;
  const key = config.GROQ_API_KEY;
  return {
    model,
    async summarize(facts, signal) {
      try {
        const res = await fetchImpl(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: AbortSignal.any([signal, AbortSignal.timeout(config.ASSISTANT_TIMEOUT_MS)]),
          body: JSON.stringify({
            model,
            temperature: 0.1,
            // gpt-oss models spend part of the budget on reasoning; 400 cut the JSON off.
            max_completion_tokens: 1500,
            reasoning_effort: 'low',
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: JSON.stringify(facts) },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'insights_summary',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['summary'],
                  properties: { summary: { type: 'string' } },
                },
              },
            },
          }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = body.choices?.[0]?.message?.content;
        if (!content) return null;
        const parsed = JSON.parse(content) as { summary?: unknown };
        return typeof parsed.summary === 'string' ? parsed.summary : null;
      } catch {
        return null;
      }
    },
  };
}

/** One summary per view per day, so the shared AI quota is barely used. */
export class SummaryCache {
  private readonly entries = new Map<string, InsightsSummary>();
  get(key: string) {
    return this.entries.get(key);
  }
  set(key: string, value: InsightsSummary) {
    if (this.entries.size > 50) this.entries.clear();
    this.entries.set(key, value);
  }
}

export async function buildSummary(
  insights: InsightsResponse,
  summarizer: InsightsSummarizer | null,
  now: Date,
): Promise<InsightsSummary> {
  const base = { view: insights.view, generatedAt: now.toISOString() };
  if (!summarizer)
    return {
      ...base,
      source: 'APP',
      model: null,
      text: templateSummary(insights),
      fallbackReason: 'AI summaries are off on this server.',
    };
  const facts = summaryFacts(insights);
  const text = await summarizer.summarize(facts, AbortSignal.timeout(15_000));
  const problem = text === null ? 'the AI service did not answer' : checkSummary(text, facts);
  if (problem || text === null)
    return {
      ...base,
      source: 'APP',
      model: null,
      text: templateSummary(insights),
      fallbackReason: `AI summary not used: ${problem}.`,
    };
  return {
    ...base,
    source: 'AI',
    model: summarizer.model,
    text: text.trim(),
    fallbackReason: null,
  };
}
