import {
  IndexedDbQueueStore,
  isRetryable,
  OfflineQueue,
  type QueueEntry,
  type QueueStore,
  type SendOutcome,
} from '../../../lib/offline';
import { CLIENT_FAILURE, type StudentApi } from '../api/studentApi';
import {
  upgradeStoredDraft,
  type CheckInDraft,
  type CheckInReceipt,
  type MessageDeliveryStatus,
  type SubmittableStatus,
} from '../contracts/studentContract';

export type CheckInEntry = QueueEntry<CheckInDraft, CheckInReceipt>;
export type CheckInQueue = OfflineQueue<CheckInDraft, CheckInReceipt>;

/** Upgrades drafts saved by earlier builds as they are read, so no queued check-in is lost. */
class UpgradingStore implements QueueStore<CheckInDraft, CheckInReceipt> {
  constructor(private readonly inner: QueueStore<CheckInDraft, CheckInReceipt>) {}
  async loadAll(): Promise<CheckInEntry[]> {
    return (await this.inner.loadAll()).map((entry) => ({
      ...entry,
      payload: upgradeStoredDraft(entry.payload),
    }));
  }
  put(entry: CheckInEntry): Promise<void> {
    return this.inner.put(entry);
  }
}

export function createCheckInQueue(
  api: StudentApi,
  isOnline: () => boolean,
  store: QueueStore<CheckInDraft, CheckInReceipt> = new IndexedDbQueueStore(),
): CheckInQueue {
  return new OfflineQueue<CheckInDraft, CheckInReceipt>({
    store: new UpgradingStore(store),
    isOnline,
    send: (draft, key, createdAt) => sendWithSession(api, draft, key, createdAt),
  });
}

/**
 * A check-in made while the app had never learned the active drill/incident
 * (e.g. first opened offline) has no session. Rather than fail it forever,
 * ask the server at send time: attach the active one if there is one. If
 * there is none, a help request still goes out as an SOS (Phase 3); an
 * "I'm safe" fails honestly. If the server cannot be reached, keep waiting.
 */
async function sendWithSession(
  api: StudentApi,
  draft: CheckInDraft,
  key: string,
  createdAt: string,
): Promise<SendOutcome<CheckInReceipt>> {
  if (draft.session) return api.submitCheckIn(draft, key, createdAt);
  const lookup = await api.getActiveSession();
  if (lookup.kind === 'found')
    return api.submitCheckIn({ ...draft, session: lookup.session }, key, createdAt);
  if (lookup.kind === 'none')
    return draft.status === 'HELP_REQUESTED'
      ? api.submitCheckIn(draft, key, createdAt)
      : { kind: 'failed', problem: 'REJECTED', detail: CLIENT_FAILURE.noSession };
  return isRetryable(lookup.problem)
    ? { kind: 'retryable', problem: lookup.problem }
    : { kind: 'failed', problem: lookup.problem };
}

/**
 * Maps the queue's lifecycle onto the shared `MessageDeliveryStatus`.
 * - Saved while offline → LOCAL_ONLY (AGENT_HANDOFF: "store offline operations as LOCAL_ONLY").
 * - Waiting to send or retry while online → QUEUED.
 * - ACKNOWLEDGED is never produced here: the API gives students no acknowledgement field yet.
 */
export function toDeliveryStatus(entry: CheckInEntry): MessageDeliveryStatus {
  switch (entry.lifecycle) {
    case 'QUEUED':
      return entry.problem === 'OFFLINE' ? 'LOCAL_ONLY' : 'QUEUED';
    case 'SENDING':
      return 'SENDING';
    case 'ACCEPTED':
      return 'SERVER_RECEIVED';
    case 'FAILED':
      return 'FAILED';
  }
}

/** Window in which a second tap of the same button is treated as accidental. */
export const REPEAT_GUARD_MS = 5_000;

/**
 * Returns the recent entry if submitting `status` now would most likely be an
 * accidental double tap. A different status (e.g. Safe → Need Help) is never blocked.
 */
export function findAccidentalRepeat(
  entries: readonly CheckInEntry[],
  status: SubmittableStatus,
  now: Date,
): CheckInEntry | undefined {
  const latest = entries[0];
  if (!latest || latest.payload.status !== status || latest.lifecycle === 'FAILED')
    return undefined;
  const age = now.getTime() - new Date(latest.createdAt).getTime();
  return age >= 0 && age < REPEAT_GUARD_MS ? latest : undefined;
}
