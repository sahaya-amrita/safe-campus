/**
 * LIVE provider smoke test (manual). Sends ONE real request through the real
 * AssistantService and Groq adapter, then prints provenance and the answer.
 * Never prints the key. Exits 1 unless the answer genuinely came from the model.
 *
 *   ASSISTANT_PROVIDER=groq GROQ_API_KEY=… GROQ_MODEL=… pnpm --filter @sahaya/api assistant:smoke
 */
import 'dotenv/config';
import { loadAssistantConfig } from './config.js';
import { APP_KNOWLEDGE } from './content.js';
import { GroqAssistantProvider } from './groqProvider.js';
import { AssistantService } from './service.js';

const config = loadAssistantConfig();
if (config.ASSISTANT_PROVIDER !== 'groq' || !config.GROQ_API_KEY || !config.GROQ_MODEL) {
  process.stderr.write(
    'Set ASSISTANT_PROVIDER=groq, GROQ_API_KEY and GROQ_MODEL (server env only).\n',
  );
  process.exit(2);
}
const provider = new GroqAssistantProvider({
  apiKey: config.GROQ_API_KEY,
  model: config.GROQ_MODEL,
  timeoutMs: config.ASSISTANT_TIMEOUT_MS,
});

const modelCheck = await provider.checkModel();
process.stdout.write(`model check for ${config.GROQ_MODEL}: ${modelCheck}\n`);

const events: unknown[] = [];
const service = new AssistantService({
  provider,
  knowledge: () => Promise.resolve(APP_KNOWLEDGE),
  timeoutMs: config.ASSISTANT_TIMEOUT_MS,
  allowDraftContent: true,
  takeProviderBudget: () => true,
  onEvent: (e) => events.push(e),
});
const question =
  process.argv.slice(2).join(' ') ||
  'My teammate keeps asking what the difference is between acknowledged and assigned. How would you put it?';
const res = await service.interpret(
  { question, context: { screen: 'responder.help-requests', locale: 'en' }, history: [] },
  { userId: 'smoke-test', roles: ['RESPONDER'] },
);
process.stdout.write(
  JSON.stringify(
    {
      question,
      type: res.type,
      origin: res.origin,
      references: res.references.map((r) => r.id),
      action: res.action,
      events,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(`\nanswer:\n${res.answer}\n`);
process.exit(res.origin.source === 'AI' && res.origin.provider === 'groq' ? 0 : 1);
