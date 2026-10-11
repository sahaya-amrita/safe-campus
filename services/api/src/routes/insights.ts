import { Router } from 'express';
import { insightsViewSchema, type InsightsView } from '@sahaya/contracts';
import { loadAssistantConfig } from '../assistant/config.js';
import type { Config } from '../config.js';
import { ApiError } from '../errors.js';
import { VIEWS_FOR_ROLES, computeInsights } from '../insights/compute.js';
import {
  SummaryCache,
  buildSummary,
  groqSummarizer,
  type InsightsSummarizer,
} from '../insights/summary.js';
import { syntheticHistory } from '../insights/synthetic.js';

/**
 * /api/v1/insights (every signed-in user). Statistics over a separate
 * synthetic history; each role sees the views it may open. Available only
 * while the server runs in DEMO mode, since the data is synthetic.
 */
export function insightsRouter(
  config: Config,
  options: { summarizer?: InsightsSummarizer | null; now?: () => Date } = {},
) {
  const router = Router();
  const now = options.now ?? (() => new Date());
  const summarizer =
    options.summarizer !== undefined ? options.summarizer : groqSummarizer(loadAssistantConfig());
  const cache = new SummaryCache();

  const resolve = (roles: readonly string[], requested: unknown) => {
    if (config.OPERATING_MODE !== 'DEMO' && config.OPERATING_MODE !== 'TEST')
      throw new ApiError(
        404,
        'NOT_AVAILABLE',
        'Insights use synthetic data and run in DEMO mode only',
      );
    const available = VIEWS_FOR_ROLES(roles);
    const parsed = insightsViewSchema.safeParse(requested);
    const view: InsightsView = parsed.success ? parsed.data : available[available.length - 1]!;
    if (!available.includes(view))
      throw new ApiError(403, 'FORBIDDEN', 'Your roles do not include this insights view');
    const asOf = now();
    return {
      view,
      available,
      asOf,
      insights: computeInsights(syntheticHistory(asOf), view, available, asOf),
    };
  };

  router.get('/', (request, response) => {
    response.json(resolve(request.auth!.roles, request.query.view).insights);
  });

  router.get('/summary', async (request, response) => {
    const { view, asOf, insights } = resolve(request.auth!.roles, request.query.view);
    const key = `${view}|${asOf.toISOString().slice(0, 10)}`;
    const cached = cache.get(key);
    if (cached) {
      response.json(cached);
      return;
    }
    const summary = await buildSummary(insights, summarizer, asOf);
    cache.set(key, summary);
    response.json(summary);
  });

  return router;
}
