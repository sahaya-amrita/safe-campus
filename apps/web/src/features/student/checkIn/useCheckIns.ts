import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { QueueSnapshot } from '../../../lib/offline';
import type { CheckIn, CreateCheckInRequest } from '../contracts/provisional';
import { findAccidentalRepeat, type CheckInEntry, type CheckInQueue } from './checkInQueue';

export type SubmitResult = { kind: 'queued'; entry: CheckInEntry } | { kind: 'repeat-ignored'; entry: CheckInEntry };

export interface UseCheckIns {
  snapshot: QueueSnapshot<CreateCheckInRequest, CheckIn>;
  submit: (request: CreateCheckInRequest) => Promise<SubmitResult | null>;
  retry: (key: string) => void;
  /** True while a submission is being written to device storage. */
  submitting: boolean;
}

const systemNow = () => new Date();

/**
 * Connects the check-in queue to React. Sends on mount and whenever the
 * browser reports the connection is back; never attempts while offline.
 */
export function useCheckIns(queue: CheckInQueue, now: () => Date = systemNow): UseCheckIns {
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const flush = () => void queue.flush();
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [queue]);

  const submit = useCallback(
    async (request: CreateCheckInRequest): Promise<SubmitResult | null> => {
      // Synchronous guard against double-clicks before React re-renders.
      if (submittingRef.current) return null;
      await queue.ready;
      const repeat = findAccidentalRepeat(queue.getSnapshot().entries, request.status, now());
      if (repeat) return { kind: 'repeat-ignored', entry: repeat };
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const entry = await queue.enqueue(request);
        void queue.flush();
        return { kind: 'queued', entry };
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [queue, now],
  );

  const retry = useCallback((key: string) => void queue.retry(key), [queue]);

  return { snapshot, submit, retry, submitting };
}
