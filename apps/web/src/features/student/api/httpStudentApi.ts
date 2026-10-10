import type { RequestProblem, SendOutcome } from '../../../lib/offline';
import {
  API_PATHS,
  isPackLanguage,
  toWireBody,
  type CheckInDraft,
  type CheckInReceipt,
  type OperatingMode,
  type StudentInstructionPack,
} from '../contracts/studentContract';
import { CLIENT_FAILURE, type PackListResult, type SessionResult, type StudentApi } from './studentApi';

export const REQUEST_TIMEOUT_MS = 10_000;

type HttpFailure = { problem: RequestProblem; detail?: string };

interface DrillRow {
  id: string;
  name: string;
  mode: OperatingMode;
  status: string;
}

/** HTTP adapter for Codex 1's API. The only file in the student feature that knows endpoint paths. */
export class HttpStudentApi implements StudentApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly isOnline: () => boolean = () => navigator.onLine,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

  async submitCheckIn(draft: CheckInDraft, clientActionId: string, clientCreatedAt: string): Promise<SendOutcome<CheckInReceipt>> {
    const wire = toWireBody(draft, clientActionId, clientCreatedAt);
    if (!wire.ok) {
      return {
        kind: 'failed',
        problem: 'REJECTED',
        detail: wire.reason === 'NO_SESSION' ? CLIENT_FAILURE.noSession : CLIENT_FAILURE.invalid,
      };
    }
    const response = await this.request(API_PATHS.checkins, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientActionId },
      body: JSON.stringify(wire.body),
    });
    if ('problem' in response) return toOutcome(response);

    const body = await readJson(response);
    if (!isReceipt(body)) {
      // A 2xx we cannot read does not confirm what was stored; retry (idempotent).
      return { kind: 'retryable', problem: 'SERVER_UNAVAILABLE', detail: 'Unreadable server reply' };
    }
    return { kind: 'accepted', result: body };
  }

  async getActiveSession(): Promise<SessionResult> {
    const response = await this.request(API_PATHS.drills, { method: 'GET' });
    if ('problem' in response) return { kind: 'error', problem: response.problem };
    const body = (await readJson(response)) as { items?: DrillRow[] } | null;
    const active = body?.items?.find((d) => d.status === 'ACTIVE');
    return active
      ? { kind: 'found', session: { kind: 'drill', id: active.id, name: active.name, mode: active.mode } }
      : { kind: 'none' };
  }

  async listInstructionPacks(language: string): Promise<PackListResult> {
    // The API only accepts languages in the contract; others fall back to English in the UI.
    if (!isPackLanguage(language)) return { kind: 'ok', packs: [] };
    const response = await this.request(`${API_PATHS.instructionPacks}?language=${encodeURIComponent(language)}`, {
      method: 'GET',
    });
    if ('problem' in response) return { kind: 'error', problem: response.problem };
    const body = (await readJson(response)) as { items?: StudentInstructionPack[] } | null;
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

    const detail = await readErrorCode(response);
    if (response.status === 401 || response.status === 403) return { problem: 'PERMISSION_DENIED', detail };
    if (response.status === 408 || response.status === 504) return { problem: 'TIMEOUT', detail };
    if (response.status === 429 || response.status >= 500) return { problem: 'SERVER_UNAVAILABLE', detail };
    // 400 validation, 404 incident/drill not found, 409 idempotency-key reuse with a different body.
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

async function readErrorCode(response: Response): Promise<string | undefined> {
  const body = (await readJson(response)) as { error?: { code?: unknown } } | null;
  const code = body?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

function isReceipt(value: unknown): value is CheckInReceipt {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (v.status === 'CONFIRMED_SAFE' || v.status === 'HELP_REQUESTED') &&
    v.deliveryStatus === 'SERVER_RECEIVED' &&
    typeof v.serverReceivedAt === 'string'
  );
}
