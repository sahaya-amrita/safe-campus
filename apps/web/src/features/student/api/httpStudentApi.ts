import type { RequestProblem, SendOutcome } from '../../../lib/offline';
import {
  API_PATHS,
  type ApiErrorBody,
  type CheckIn,
  type CreateCheckInRequest,
  type InstructionPackListResponse,
} from '../contracts/provisional';
import type { PackListResult, StudentApi } from './studentApi';

export const REQUEST_TIMEOUT_MS = 10_000;

type HttpFailure = { problem: RequestProblem; detail?: string };

/** HTTP adapter. The only file in the student feature that knows endpoint paths. */
export class HttpStudentApi implements StudentApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly isOnline: () => boolean = () => navigator.onLine,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

  async createCheckIn(request: CreateCheckInRequest, idempotencyKey: string): Promise<SendOutcome<CheckIn>> {
    const response = await this.request(API_PATHS.checkIns, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(request),
    });
    if ('problem' in response) return toOutcome(response);

    const body = await readJson(response);
    if (!isCheckIn(body)) {
      // A 2xx we cannot read does not confirm what was stored; retry (idempotent).
      return { kind: 'retryable', problem: 'SERVER_UNAVAILABLE', detail: 'Unreadable server reply' };
    }
    return { kind: 'accepted', result: body };
  }

  async listInstructionPacks(language: string): Promise<PackListResult> {
    const response = await this.request(`${API_PATHS.instructionPacks}?language=${encodeURIComponent(language)}`, {
      method: 'GET',
    });
    if ('problem' in response) return { kind: 'error', problem: response.problem };
    const body = (await readJson(response)) as Partial<InstructionPackListResponse> | null;
    if (!body || !Array.isArray(body.items)) return { kind: 'error', problem: 'SERVER_UNAVAILABLE' };
    return { kind: 'ok', packs: body.items };
  }

  private async request(path: string, init: RequestInit): Promise<Response | HttpFailure> {
    if (!this.isOnline()) return { problem: 'OFFLINE' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { problem: 'TIMEOUT' };
      return { problem: this.isOnline() ? 'SERVER_UNAVAILABLE' : 'OFFLINE' };
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) return response;

    const detail = await readErrorMessage(response);
    if (response.status === 401 || response.status === 403) return { problem: 'PERMISSION_DENIED', detail };
    if (response.status === 408 || response.status === 504) return { problem: 'TIMEOUT', detail };
    if (response.status === 429 || response.status >= 500) return { problem: 'SERVER_UNAVAILABLE', detail };
    return { problem: 'REJECTED', detail };
  }
}

function toOutcome(failure: HttpFailure): SendOutcome<never> {
  switch (failure.problem) {
    case 'PERMISSION_DENIED':
    case 'REJECTED':
      return { kind: 'failed', problem: failure.problem, detail: failure.detail };
    default:
      return { kind: 'retryable', problem: failure.problem, detail: failure.detail };
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // Treated by callers as an unreadable reply.
    return null;
  }
}

async function readErrorMessage(response: Response): Promise<string | undefined> {
  const body = (await readJson(response)) as Partial<ApiErrorBody> | null;
  const code = body?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

function isCheckIn(value: unknown): value is CheckIn {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && (v.status === 'SAFE' || v.status === 'NEED_HELP') && typeof v.createdAt === 'string';
}
