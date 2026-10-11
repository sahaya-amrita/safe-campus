import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FLUSH_EVENT, requestBackgroundSync, type QueueSnapshot } from '../../../lib/offline';
import type { CheckInDraft, CheckInReceipt, CheckInSession } from '../contracts/studentContract';
import { findAccidentalRepeat, type CheckInEntry, type CheckInQueue } from './checkInQueue';

export type SubmitResult = { kind: 'queued'; entry: CheckInEntry } | { kind: 'repeat-ignored'; entry: CheckInEntry };

/** What a screen supplies; the session is attached here at the moment of pressing the button. */
export type NewCheckIn = Omit<CheckInDraft, 'session'>;

export interface UseCheckIns {
  snapshot: QueueSnapshot<CheckInDraft, CheckInReceipt>;
  submit: (checkIn: NewCheckIn) => Promise<SubmitResult | null>;
  retry: (key: string) => void;
  /** True while a submission is being written to device storage. */
  submitting: boolean;
}

const systemNow = () => new Date();

/**
 * Connects the check-in queue to React. Sends on mount and whenever the
 * browser reports the connection is back (or the service worker's background
 * sync asks); never attempts while offline. Anything queued while offline also
 * requests a background sync, which only wakes the app: it never reports delivery.
 */
export function useCheckIns(queue: CheckInQueue, session: CheckInSession | null, now: () => Date = systemNow): UseCheckIns {
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const flush = () => void queue.flush();
    flush();
    window.addEventListener('online', flush);
    window.addEventListener(FLUSH_EVENT, flush);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener(FLUSH_EVENT, flush);
    };
  }, [queue]);

  const submit = useCallback(
    async (checkIn: NewCheckIn): Promise<SubmitResult | null> => {
      // Synchronous guard against double-clicks before React re-renders.
      if (submittingRef.current) return null;
      await queue.ready;
      const repeat = findAccidentalRepeat(queue.getSnapshot().entries, checkIn.status, now());
      if (repeat) return { kind: 'repeat-ignored', entry: repeat };
      submittingRef.current = true;
      setSubmitting(true);
      try {
        const entry = await queue.enqueue({ ...checkIn, session: sessionRef.current });
        if (typeof navigator !== 'undefined' && navigator.onLine === false) void requestBackgroundSync();
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
