/** Builds the assistant from config. Called once by createApp. */
import type { Config } from '../config.js';
import { loadAssistantConfig, type AssistantConfig } from './config.js';
import type { DatabasePool } from '../db.js';
import type { Logger } from 'pino';
import { APP_KNOWLEDGE } from './content.js';
import { GroqAssistantProvider } from './groqProvider.js';
import { loadPublishedPackDocs } from './instructionPacks.js';
import { MockAssistantProvider } from './mockProvider.js';
import type { AssistantProvider } from './provider.js';
import { AssistantLimits } from './rateLimit.js';
import {
  assistantHealthRouter,
  assistantRouter,
  parseErrorHandler,
  type AssistantHealth,
} from './router.js';
import { AssistantService } from './service.js';

export interface AssistantOptions {
  config?: AssistantConfig;
  /** Tests only: inject a provider instead of building one from config. */
  provider?: AssistantProvider | null;
}

export function createAssistant(
  pool: DatabasePool,
  core: Config,
  logger: Logger,
  options: AssistantOptions = {},
) {
  const config = options.config ?? loadAssistantConfig();
  let provider: AssistantProvider | null = null;
  if (options.provider !== undefined) {
    provider = options.provider;
  } else if (config.ASSISTANT_PROVIDER === 'groq' && config.GROQ_API_KEY && config.GROQ_MODEL) {
    provider = new GroqAssistantProvider({
      apiKey: config.GROQ_API_KEY,
      model: config.GROQ_MODEL,
      timeoutMs: config.ASSISTANT_TIMEOUT_MS,
    });
  } else if (config.ASSISTANT_PROVIDER === 'mock') {
    provider = new MockAssistantProvider();
  }

  const health: AssistantHealth = {
    status: provider ? 'ready' : 'disabled',
    provider: provider?.name ?? 'disabled',
    model: provider?.model ?? null,
    modelCheck: provider?.checkModel ? 'unchecked' : 'ok',
  };
  if (!provider) health.modelCheck = 'unchecked';

  // Verify the configured model against the provider's live list (never in tests).
  const modelCheck =
    provider?.checkModel && (core.NODE_ENV !== 'test' || options.provider !== undefined)
      ? provider.checkModel().then((result) => {
          health.modelCheck = result;
          if (result !== 'ok') {
            health.status = 'degraded';
            logger.error(
              { assistant: { provider: provider.name, model: provider.model, modelCheck: result } },
              'assistant model check failed',
            );
          } else {
            logger.info(
              { assistant: { provider: provider.name, model: provider.model } },
              'assistant model verified',
            );
          }
        })
      : Promise.resolve();

  const limits = new AssistantLimits({
    userPerMinute: config.ASSISTANT_RATE_LIMIT_PER_MINUTE,
    userPerDay: config.ASSISTANT_RATE_LIMIT_PER_DAY,
    providerPerMinute: config.ASSISTANT_PROVIDER_MAX_PER_MINUTE,
    providerPerDay: config.ASSISTANT_PROVIDER_MAX_PER_DAY,
  });

  const service = new AssistantService({
    provider,
    timeoutMs: config.ASSISTANT_TIMEOUT_MS,
    allowDraftContent: config.ASSISTANT_ALLOW_DRAFT_CONTENT && core.OPERATING_MODE === 'DEMO',
    takeProviderBudget: () => limits.provider(),
    knowledge: async (locale) => {
      try {
        return [...APP_KNOWLEDGE, ...(await loadPublishedPackDocs(pool, locale))];
      } catch (error) {
        logger.warn({ err: error }, 'assistant could not load instruction packs');
        return APP_KNOWLEDGE;
      }
    },
    // Reasons and timings only. Question text is never logged.
    onEvent: (event) => logger.info({ assistant: event }, 'assistant event'),
  });

  return {
    router: assistantRouter(service, limits),
    healthRouter: assistantHealthRouter(() => ({ ...health })),
    parseErrorHandler,
    /** Resolves once the startup model check (if any) has finished. */
    ready: modelCheck,
  };
}
