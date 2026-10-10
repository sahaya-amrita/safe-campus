/**
 * Groq adapter (server-side only) using Groq's documented OpenAI-compatible
 * HTTP API, so no SDK dependency is added to the API package. The key and
 * model come from server env (GROQ_API_KEY, GROQ_MODEL); nothing here reaches
 * the browser. Uses structured outputs (json_schema, strict).
 *   POST https://api.groq.com/openai/v1/chat/completions
 *   GET  https://api.groq.com/openai/v1/models
 */
import { renderMessages } from './prompt.js';
import {
  MODEL_OUTPUT_JSON_SCHEMA,
  type AssistantProvider,
  type ProviderFailure,
  type ProviderInput,
  type ProviderResult,
} from './provider.js';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

export interface GroqProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

/** Maps Groq HTTP statuses to provider failures. */
export function groqFailure(status: number): ProviderFailure {
  if (status === 401 || status === 403) return 'PROVIDER_UNCONFIGURED';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 || status === 422) return 'INVALID_OUTPUT';
  return 'UNAVAILABLE';
}

export class GroqAssistantProvider implements AssistantProvider {
  readonly name = 'groq' as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: GroqProviderOptions) {
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs;
    this.baseUrl = (opts.baseUrl ?? GROQ_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async checkModel(): Promise<'ok' | 'not_listed' | 'error'> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return 'error';
      const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
      return Array.isArray(body.data) && body.data.some((m) => m.id === this.model)
        ? 'ok'
        : 'not_listed';
    } catch {
      return 'error';
    }
  }

  async generate(input: ProviderInput, signal: AbortSignal): Promise<ProviderResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]),
        body: JSON.stringify({
          model: this.model,
          messages: renderMessages(input),
          temperature: 0.2,
          max_completion_tokens: 900,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'tom_reply', strict: true, schema: MODEL_OUTPUT_JSON_SCHEMA },
          },
        }),
      });
    } catch {
      return { ok: false, reason: signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE' };
    }
    if (!res.ok) return { ok: false, reason: groqFailure(res.status) };
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: 'INVALID_OUTPUT' };
    }
    const choice = (
      body as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }> }
    ).choices?.[0];
    if (!choice) return { ok: false, reason: 'INVALID_OUTPUT' };
    if (choice.finish_reason === 'length') return { ok: false, reason: 'TRUNCATED' };
    const content = choice.message?.content;
    if (typeof content !== 'string' || !content) return { ok: false, reason: 'INVALID_OUTPUT' };
    try {
      return { ok: true, output: JSON.parse(content) as unknown };
    } catch {
      return { ok: false, reason: 'INVALID_OUTPUT' };
    }
  }
}
