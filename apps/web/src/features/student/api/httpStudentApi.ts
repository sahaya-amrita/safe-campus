import type { RequestProblem, SendOutcome } from '../../../lib/offline';
import {
  API_PATHS,
  isPackLanguage,
  toSosBody,
  toWireBody,
  type CheckInDraft,
  type CheckInReceipt,
  type CheckInSession,
  type OperatingMode,
  type StudentInstructionPack,
} from '../contracts/studentContract';
import {
  CLIENT_FAILURE,
  type PackListResult,
  type SessionResult,
  type StudentApi,
} from './studentApi';

export const REQUEST_TIMEOUT_MS = 10_000;

type HttpFailure = { problem: RequestProblem; detail?: string };

interface DrillRow {
  id: string;
  name: string;
  mode: OperatingMode;
  status: string;
}

interface InboxRow {
  incidentId?: string | null;
  incidentVerificationStatus?: string | null;
  title: string;
  mode: OperatingMode;
}

interface IncidentRow {
  id: string;
  type: string;
  mode: OperatingMode;
  verificationStatus: string;
}

const CLOSED_INCIDENT = new Set(['RESOLVED', 'DISMISSED']);

export interface HttpStudentApiAuth {
  /** Bearer token from the app session. Never stored by this adapter. */
  getAccessToken?: () => string | null;
  /** Session the student picked explicitly; used when it is still a candidate. */
  preferredSessionId?: () => string | null;
}

export type SessionListResult =
  { kind: 'ok'; sessions: CheckInSession[] } | { kind: 'error'; problem: RequestProblem };

/** HTTP adapter for Codex 1's API. The only file in the student feature that knows endpoint paths. */
export class HttpStudentApi implements StudentApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly isOnline: () => boolean = () => navigator.onLine,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
    private readonly auth: HttpStudentApiAuth = {},
  ) {}

  async submitCheckIn(
    draft: CheckInDraft,
    clientActionId: string,
    clientCreatedAt: string,
  ): Promise<SendOutcome<CheckInReceipt>> {
    // No drill or incident: a help request still goes out, as an SOS (Phase 3).
    if (!draft.session && draft.status === 'HELP_REQUESTED')
      return this.sendSos(draft, clientActionId, clientCreatedAt);
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
      return {
        kind: 'retryable',
        problem: 'SERVER_UNAVAILABLE',
        detail: 'Unreadable server reply',
      };
    }
    return { kind: 'accepted', result: body };
  }

  private async sendSos(
    draft: CheckInDraft,
    clientActionId: string,
    clientCreatedAt: string,
  ): Promise<SendOutcome<CheckInReceipt>> {
    const wire = toSosBody(draft, clientActionId, clientCreatedAt);
    if (!wire.ok) return { kind: 'failed', problem: 'REJECTED', detail: CLIENT_FAILURE.invalid };
    const response = await this.request(API_PATHS.sos, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientActionId },
      body: JSON.stringify(wire.body),
    });
    if ('problem' in response) return toOutcome(response);
    const body = await readJson(response);
    if (!isReceipt(body)) {
      return {
        kind: 'retryable',
        problem: 'SERVER_UNAVAILABLE',
        detail: 'Unreadable server reply',
      };
    }
    return { kind: 'accepted', result: body };
  }

  async getActiveSession(): Promise<SessionResult> {
    if (!this.auth.getAccessToken) return this.activeDrillSession();
    const listed = await this.listSessions();
    if (listed.kind === 'error') return listed;
    const preferred = this.auth.preferredSessionId?.();
    const session = listed.sessions.find((s) => s.id === preferred) ?? listed.sessions[0];
    return session ? { kind: 'found', session } : { kind: 'none' };
  }

  /**
   * Events a signed-in student can check in to, most relevant first: incidents
   * from alerts targeted to them, open incidents they reported, then active
   * drills. The server decides which incidents a student can see.
   */
  async listSessions(): Promise<SessionListResult> {
    const [inbox, incidents, drills] = await Promise.all([
      this.request(API_PATHS.alertInbox, { method: 'GET' }),
      this.request(`${API_PATHS.incidents}?limit=25`, { method: 'GET' }),
      this.request(API_PATHS.drills, { method: 'GET' }),
    ]);
    if ('problem' in drills) return { kind: 'error', problem: drills.problem };
    const sessions: CheckInSession[] = [];
    const seen = new Set<string>();
    const add = (session: CheckInSession) => {
      if (seen.has(session.id)) return;
      seen.add(session.id);
      sessions.push(session);
    };
    if (!('problem' in inbox)) {
      const body = (await readJson(inbox)) as { items?: InboxRow[] } | null;
      for (const row of body?.items ?? []) {
        if (!row.incidentId || CLOSED_INCIDENT.has(row.incidentVerificationStatus ?? '')) continue;
        add({ kind: 'incident', id: row.incidentId, name: row.title, mode: row.mode });
      }
    }
    if (!('problem' in incidents)) {
      const body = (await readJson(incidents)) as { items?: IncidentRow[] } | null;
      for (const row of body?.items ?? []) {
        if (CLOSED_INCIDENT.has(row.verificationStatus)) continue;
        add({
          kind: 'incident',
          id: row.id,
          name: `${row.type} (reported by you)`,
          mode: row.mode,
        });
      }
    }
    const drillBody = (await readJson(drills)) as { items?: DrillRow[] } | null;
    for (const d of drillBody?.items ?? []) {
      if (d.status === 'ACTIVE') add({ kind: 'drill', id: d.id, name: d.name, mode: d.mode });
    }
    return { kind: 'ok', sessions };
  }

  private async activeDrillSession(): Promise<SessionResult> {
    const response = await this.request(API_PATHS.drills, { method: 'GET' });
    if ('problem' in response) return { kind: 'error', problem: response.problem };
    const body = (await readJson(response)) as { items?: DrillRow[] } | null;
    const active = body?.items?.find((d) => d.status === 'ACTIVE');
    return active
      ? {
          kind: 'found',
          session: { kind: 'drill', id: active.id, name: active.name, mode: active.mode },
        }
      : { kind: 'none' };
  }

  async listInstructionPacks(language: string): Promise<PackListResult> {
    // The API only accepts languages in the contract; others fall back to English in the UI.
    if (!isPackLanguage(language)) return { kind: 'ok', packs: [] };
    const response = await this.request(
      `${API_PATHS.instructionPacks}?language=${encodeURIComponent(language)}`,
      {
        method: 'GET',
      },
    );
    if ('problem' in response) return { kind: 'error', problem: response.problem };
    const body = (await readJson(response)) as { items?: StudentInstructionPack[] } | null;
    if (!body || !Array.isArray(body.items))
      return { kind: 'error', problem: 'SERVER_UNAVAILABLE' };
    return { kind: 'ok', packs: body.items };
  }

  private async request(path: string, init: RequestInit): Promise<Response | HttpFailure> {
    if (!this.isOnline()) return { problem: 'OFFLINE' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      const token = this.auth.getAccessToken?.();
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.headers as Record<string, string> | undefined),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return { problem: 'TIMEOUT' };
      return { problem: this.isOnline() ? 'SERVER_UNAVAILABLE' : 'OFFLINE' };
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) return response;

    const detail = await readErrorCode(response);
    if (response.status === 401 || response.status === 403)
      return { problem: 'PERMISSION_DENIED', detail };
    if (response.status === 408 || response.status === 504) return { problem: 'TIMEOUT', detail };
    if (response.status === 429 || response.status >= 500)
      return { problem: 'SERVER_UNAVAILABLE', detail };
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
