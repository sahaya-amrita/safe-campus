/**
 * MOCK ADAPTER — DEMO ONLY. Used when VITE_API_BASE_URL is not set.
 * Everything stays in this browser tab's memory; nothing reaches campus
 * security or any responder. It implements the same `StudentApi` interface
 * as the HTTP adapter and validates bodies with the same shared zod schema.
 */
import type { SendOutcome } from '../../../lib/offline';
import {
  isPackLanguage,
  toWireBody,
  type CheckInDraft,
  type CheckInReceipt,
  type CheckInSession,
  type StudentInstructionPack,
} from '../contracts/studentContract';
import { CLIENT_FAILURE, type PackListResult, type SessionResult, type StudentApi } from './studentApi';

/** A clearly-labelled demonstration drill so check-ins have the context the contract requires. */
export const DEMO_SESSION: CheckInSession = {
  kind: 'drill',
  id: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  name: 'Demonstration drill (not a real event)',
  mode: 'DEMO',
};

export interface MockStudentApiOptions {
  isOnline?: () => boolean;
  now?: () => Date;
  latencyMs?: number;
  /** `null` simulates "no active drill or incident". */
  session?: CheckInSession | null;
  /** Test hook: forces outcomes for the next N check-in calls (consumed in order). */
  scriptedCheckInOutcomes?: SendOutcome<CheckInReceipt>[];
}

export class MockStudentApi implements StudentApi {
  private readonly receipts = new Map<string, CheckInReceipt>();
  private readonly isOnline: () => boolean;
  private readonly now: () => Date;
  private readonly latencyMs: number;
  private readonly session: CheckInSession | null;
  readonly scripted: SendOutcome<CheckInReceipt>[];
  checkInCalls = 0;
  /** Bodies that passed contract validation, for assertions. */
  readonly sentBodies: unknown[] = [];

  constructor(options: MockStudentApiOptions = {}) {
    this.isOnline = options.isOnline ?? (() => navigator.onLine);
    this.now = options.now ?? (() => new Date());
    this.latencyMs = options.latencyMs ?? 0;
    this.session = options.session === undefined ? DEMO_SESSION : options.session;
    this.scripted = options.scriptedCheckInOutcomes ?? [];
  }

  async submitCheckIn(draft: CheckInDraft, clientActionId: string, clientCreatedAt: string): Promise<SendOutcome<CheckInReceipt>> {
    this.checkInCalls++;
    await this.delay();
    const scripted = this.scripted.shift();
    if (scripted) return scripted;
    if (!this.isOnline()) return { kind: 'retryable', problem: 'OFFLINE' };

    const wire = toWireBody(draft, clientActionId, clientCreatedAt);
    if (!wire.ok) {
      return {
        kind: 'failed',
        problem: 'REJECTED',
        detail: wire.reason === 'NO_SESSION' ? CLIENT_FAILURE.noSession : CLIENT_FAILURE.invalid,
      };
    }
    this.sentBodies.push(wire.body);
    // Idempotent: a replay with the same key returns the original receipt.
    const existing = this.receipts.get(clientActionId);
    if (existing) return { kind: 'accepted', result: existing };
    const receipt: CheckInReceipt = {
      id: `mock-${this.receipts.size + 1}`,
      status: wire.body.status,
      deliveryStatus: 'SERVER_RECEIVED',
      serverReceivedAt: this.now().toISOString(),
      clientActionId,
      helpRequest: wire.body.status === 'HELP_REQUESTED' ? { id: `mock-help-${this.receipts.size + 1}`, status: 'OPEN' } : null,
    };
    this.receipts.set(clientActionId, receipt);
    return { kind: 'accepted', result: receipt };
  }

  async getActiveSession(): Promise<SessionResult> {
    await this.delay();
    if (!this.isOnline()) return { kind: 'error', problem: 'OFFLINE' };
    return this.session ? { kind: 'found', session: this.session } : { kind: 'none' };
  }

  async listInstructionPacks(language: string): Promise<PackListResult> {
    await this.delay();
    if (!this.isOnline()) return { kind: 'error', problem: 'OFFLINE' };
    if (!isPackLanguage(language)) return { kind: 'ok', packs: [] };
    return { kind: 'ok', packs: DEMO_SAMPLE_PACKS.filter((p) => p.language === language) };
  }

  /** Number of distinct check-ins stored, for idempotency assertions. */
  get storedCount(): number {
    return this.receipts.size;
  }

  private delay(): Promise<void> {
    return this.latencyMs > 0 ? new Promise((resolve) => setTimeout(resolve, this.latencyMs)) : Promise.resolve();
  }
}

/**
 * DEMO SAMPLE PACKS. They deliberately contain NO emergency guidance, routes,
 * exits, assembly points or contacts — only a description of what an approved
 * pack would contain. `demoSample` makes the UI label them as samples; their
 * approval state is DRAFT, so they could never be shown as official.
 */
export const DEMO_SAMPLE_PACKS: readonly StudentInstructionPack[] = [
  {
    id: 'demo-sample-en',
    version: '0.0.1-demo',
    language: 'en',
    title: 'About safety instructions',
    content: {
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
    contentHash: '0'.repeat(64),
    sourceLabel: 'Prototype sample — not issued by campus authorities',
    approvalState: 'DRAFT',
    publishedAt: '2026-10-10T00:00:00.000Z',
    expiresAt: '2027-04-10T00:00:00.000Z',
    demoSample: true,
  },
  {
    id: 'demo-sample-ta',
    version: '0.0.1-demo',
    language: 'ta',
    title: 'பாதுகாப்பு வழிமுறைகள் பற்றி',
    content: {
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
    contentHash: '0'.repeat(64),
    sourceLabel: 'மாதிரி உள்ளடக்கம் — வளாக அதிகாரிகளால் வெளியிடப்படவில்லை',
    approvalState: 'DRAFT',
    publishedAt: '2026-10-10T00:00:00.000Z',
    expiresAt: '2027-04-10T00:00:00.000Z',
    demoSample: true,
  },
];
