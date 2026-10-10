/**
 * MOCK ADAPTER — DEMO ONLY. Used when VITE_API_BASE_URL is not set.
 * Everything stays in this browser tab's memory; nothing reaches campus
 * security or any responder. It implements the same `StudentApi` interface
 * as the HTTP adapter, so it can be removed without touching components.
 */
import type { SendOutcome } from '../../../lib/offline';
import {
  DEMO_SAMPLE_APPROVAL_STATE,
  type CheckIn,
  type CreateCheckInRequest,
  type InstructionPackWithContent,
} from '../contracts/provisional';
import type { PackListResult, StudentApi } from './studentApi';

export interface MockStudentApiOptions {
  isOnline?: () => boolean;
  now?: () => Date;
  latencyMs?: number;
  /** Test hook: forces outcomes for the next N check-in calls (consumed in order). */
  scriptedCheckInOutcomes?: SendOutcome<CheckIn>[];
}

export class MockStudentApi implements StudentApi {
  private readonly checkIns = new Map<string, CheckIn>();
  private readonly isOnline: () => boolean;
  private readonly now: () => Date;
  private readonly latencyMs: number;
  readonly scripted: SendOutcome<CheckIn>[];
  checkInCalls = 0;

  constructor(options: MockStudentApiOptions = {}) {
    this.isOnline = options.isOnline ?? (() => navigator.onLine);
    this.now = options.now ?? (() => new Date());
    this.latencyMs = options.latencyMs ?? 0;
    this.scripted = options.scriptedCheckInOutcomes ?? [];
  }

  async createCheckIn(request: CreateCheckInRequest, idempotencyKey: string): Promise<SendOutcome<CheckIn>> {
    this.checkInCalls++;
    await this.delay();
    const scripted = this.scripted.shift();
    if (scripted) return scripted;
    if (!this.isOnline()) return { kind: 'retryable', problem: 'OFFLINE' };

    // Idempotent: a replay with the same key returns the original record.
    const existing = this.checkIns.get(idempotencyKey);
    if (existing) return { kind: 'accepted', result: existing };
    const timestamp = this.now().toISOString();
    const record: CheckIn = {
      id: `mock-${this.checkIns.size + 1}`,
      status: request.status,
      createdAt: timestamp,
      updatedAt: timestamp,
      deliveryState: 'ACCEPTED',
      ...(request.note ? { note: request.note } : {}),
      ...(request.locationReference ? { locationReference: request.locationReference } : {}),
    };
    this.checkIns.set(idempotencyKey, record);
    return { kind: 'accepted', result: record };
  }

  async listInstructionPacks(language: string): Promise<PackListResult> {
    await this.delay();
    if (!this.isOnline()) return { kind: 'error', problem: 'OFFLINE' };
    return { kind: 'ok', packs: DEMO_SAMPLE_PACKS.filter((p) => p.language === language) };
  }

  /** Number of distinct check-ins stored, for idempotency assertions. */
  get storedCount(): number {
    return this.checkIns.size;
  }

  private delay(): Promise<void> {
    return this.latencyMs > 0 ? new Promise((resolve) => setTimeout(resolve, this.latencyMs)) : Promise.resolve();
  }
}

/**
 * DEMO SAMPLE PACKS. They deliberately contain NO emergency guidance, routes,
 * exits, assembly points or contacts — only a description of what an approved
 * pack would contain. `approvalState` is DEMO_SAMPLE, so they are never labelled official.
 */
export const DEMO_SAMPLE_PACKS: readonly InstructionPackWithContent[] = [
  {
    id: 'demo-sample-en',
    version: '0.0.1-demo',
    language: 'en',
    publishedAt: '2026-10-10T00:00:00.000Z',
    expiresAt: '2027-04-10T00:00:00.000Z',
    contentHash: 'demo-sample-en',
    sourceLabel: 'Prototype sample — not issued by campus authorities',
    approvalState: DEMO_SAMPLE_APPROVAL_STATE,
    sections: [
      {
        heading: 'About this sample',
        body: 'This card shows where campus-approved safety instructions will appear once the institution provides them.',
      },
      {
        heading: 'Until approved instructions exist',
        body: 'Follow directions from campus security staff and your warden. In an emergency, call 112.',
      },
    ],
  },
  {
    id: 'demo-sample-ta',
    version: '0.0.1-demo',
    language: 'ta',
    publishedAt: '2026-10-10T00:00:00.000Z',
    expiresAt: '2027-04-10T00:00:00.000Z',
    contentHash: 'demo-sample-ta',
    sourceLabel: 'மாதிரி உள்ளடக்கம் — வளாக அதிகாரிகளால் வெளியிடப்படவில்லை',
    approvalState: DEMO_SAMPLE_APPROVAL_STATE,
    sections: [
      {
        heading: 'இந்த மாதிரி பற்றி',
        body: 'நிறுவனம் அங்கீகரித்த பாதுகாப்பு வழிமுறைகள் வழங்கப்பட்டவுடன் அவை இங்கே தோன்றும்.',
      },
      {
        heading: 'அங்கீகரிக்கப்பட்ட வழிமுறைகள் வரும் வரை',
        body: 'வளாகப் பாதுகாப்புப் பணியாளர்கள் மற்றும் உங்கள் விடுதிக் காப்பாளரின் அறிவுறுத்தல்களைப் பின்பற்றுங்கள். அவசரநிலையில் 112-ஐ அழைக்கவும்.',
      },
    ],
  },
];
