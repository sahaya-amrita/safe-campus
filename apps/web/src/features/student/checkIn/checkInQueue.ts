import { IndexedDbQueueStore, OfflineQueue, type QueueEntry, type QueueStore } from '../../../lib/offline';
import type { StudentApi } from '../api/studentApi';
import type { CheckIn, CheckInStatus, CreateCheckInRequest, DeliveryState } from '../contracts/provisional';

export type CheckInEntry = QueueEntry<CreateCheckInRequest, CheckIn>;
export type CheckInQueue = OfflineQueue<CreateCheckInRequest, CheckIn>;

export function createCheckInQueue(
  api: StudentApi,
  isOnline: () => boolean,
  store: QueueStore<CreateCheckInRequest, CheckIn> = new IndexedDbQueueStore(),
): CheckInQueue {
  return new OfflineQueue<CreateCheckInRequest, CheckIn>({
    store,
    isOnline,
    send: (payload, key) => api.createCheckIn(payload, key),
  });
}

/** Maps the queue's internal lifecycle onto the shared contract's delivery state. */
export function toDeliveryState(entry: CheckInEntry): DeliveryState {
  switch (entry.lifecycle) {
    case 'QUEUED':
      return 'QUEUED_OFFLINE';
    case 'SENDING':
      return 'PENDING';
    case 'ACCEPTED':
      return 'ACCEPTED';
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
  status: CheckInStatus,
  now: Date,
): CheckInEntry | undefined {
  const latest = entries[0];
  if (!latest || latest.payload.status !== status || latest.lifecycle === 'FAILED') return undefined;
  const age = now.getTime() - new Date(latest.createdAt).getTime();
  return age >= 0 && age < REPEAT_GUARD_MS ? latest : undefined;
}
