import type {
  HazardReport,
  HazardReviewApi,
  HazardReviewRequest,
  HazardStatus,
} from '../incidents/contracts';
import { parseHazardReport } from '../incidents/hazardReview';
import { ApiRequestError, isApiErrorBody } from './apiError';
import type { HelpRequest, HelpRequestStatus, Page, RollCallSnapshot } from './contracts';
import { parseHelpRequest } from './helpRequests';

export interface ResponderApi extends HazardReviewApi {
  /** MOCK adapters must be labelled as demo data in the UI. */
  readonly kind: 'MOCK' | 'HTTP';
  listHelpRequests(query: {
    status?: HelpRequestStatus;
    cursor?: string | null;
    limit?: number;
  }): Promise<Page<HelpRequest>>;
  acknowledgeHelpRequest(id: string, idempotencyKey: string): Promise<HelpRequest>;
  getRollCallSummary(): Promise<RollCallSnapshot>;
}

export const DEFAULT_PAGE_SIZE = 25;

export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parsePage<T>(body: unknown, parseItem: (v: unknown) => T): Page<T> {
  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray((body as { items?: unknown }).items)
  ) {
    throw new ApiRequestError(502, 'INVALID_RESPONSE', 'Server response was not a list page');
  }
  const raw = body as { items: unknown[]; nextCursor?: unknown };
  try {
    return {
      items: raw.items.map(parseItem),
      nextCursor: typeof raw.nextCursor === 'string' && raw.nextCursor ? raw.nextCursor : null,
    };
  } catch {
    throw new ApiRequestError(
      502,
      'INVALID_RESPONSE',
      'Server returned a record in an unexpected shape',
    );
  }
}

function parseOne<T>(body: unknown, parse: (v: unknown) => T): T {
  try {
    return parse(body);
  } catch {
    throw new ApiRequestError(
      502,
      'INVALID_RESPONSE',
      'Server returned a record in an unexpected shape',
    );
  }
}

export interface HttpResponderApiOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Adapter for the proposed /api/v1/responder endpoints. Authentication relies
 * on the browser session (cookies); this module never stores or attaches
 * tokens itself. All authorization is enforced by the server.
 */
export class HttpResponderApi implements ResponderApi {
  readonly kind = 'HTTP' as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpResponderApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        credentials: 'include',
        ...init,
        headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      });
    } catch {
      throw new ApiRequestError(0, 'NETWORK_ERROR', 'Network request failed');
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      if (isApiErrorBody(body)) {
        throw new ApiRequestError(
          response.status,
          body.error.code,
          body.error.message,
          body.error.requestId,
        );
      }
      throw new ApiRequestError(response.status, `HTTP_${response.status}`, 'Request failed');
    }
    return body;
  }

  private listQuery(query: { status?: string; cursor?: string | null; limit?: number }): string {
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.cursor) params.set('cursor', query.cursor);
    params.set('limit', String(query.limit ?? DEFAULT_PAGE_SIZE));
    return params.toString();
  }

  async listHelpRequests(query: {
    status?: HelpRequestStatus;
    cursor?: string | null;
    limit?: number;
  }) {
    const body = await this.request(`/api/v1/responder/help-requests?${this.listQuery(query)}`);
    return parsePage(body, parseHelpRequest);
  }

  async acknowledgeHelpRequest(id: string, idempotencyKey: string) {
    const body = await this.request(
      `/api/v1/responder/help-requests/${encodeURIComponent(id)}/acknowledge`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    );
    return parseOne(body, parseHelpRequest);
  }

  async listHazardReports(query: {
    status?: HazardStatus;
    cursor?: string | null;
    limit?: number;
  }) {
    const body = await this.request(`/api/v1/responder/hazard-reports?${this.listQuery(query)}`);
    return parsePage(body, parseHazardReport);
  }

  async reviewHazardReport(
    id: string,
    review: HazardReviewRequest,
    idempotencyKey: string,
  ): Promise<HazardReport> {
    const body = await this.request(
      `/api/v1/responder/hazard-reports/${encodeURIComponent(id)}/review`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(review),
      },
    );
    return parseOne(body, parseHazardReport);
  }

  getRollCallSummary(): Promise<RollCallSnapshot> {
    // No roll-call endpoint has been agreed in docs/api-contracts.md.
    return Promise.reject(
      new ApiRequestError(
        501,
        'NOT_AVAILABLE',
        'Roll-call endpoint not defined in the API contract',
      ),
    );
  }
}
