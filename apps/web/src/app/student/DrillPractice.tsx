import { useEffect, useRef, useState } from 'react';
import { newIdempotencyKey } from '../api/client';
import type { SahayaApi } from '../api/sahaya';
import { AppIcon, ErrorNotice, Loading } from '../ui';

interface Completed {
  sessionId: string;
  score: number;
  total: number;
  answers: Record<string, string>;
}

/**
 * React host for the existing digital drill (features/drills). The drill keeps
 * its LOCAL_ONLY page-memory store; when a run completes, the student may
 * choose to save the score to their training record (POST /training/results).
 */
export function DrillPractice({ api, onSaved }: { api: SahayaApi | null; onSaved: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [save, setSave] = useState<
    { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; error: unknown }
  >({ kind: 'idle' });
  const keyRef = useRef(newIdempotencyKey());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    Promise.all([
      import('../../features/drills/drill-model.ts'),
      import('../../features/drills/drill-view.ts'),
      import('../../features/maps/maps-drills.css'),
    ])
      .then(([model, view]) => {
        if (cancelled) return;
        const inner = model.createMemoryDrillStore();
        const sessions = new Map<string, Parameters<typeof model.applyEvent>[1][]>();
        dispose = view.mountDrillSimulator(host, {
          async append(event) {
            const receipt = await inner.append(event);
            const events = [
              ...(sessions.get(event.sessionId) ?? []).filter((e) => e.id !== event.id),
              event,
            ];
            sessions.set(event.sessionId, events);
            const summary = model.summarize({ sessionId: event.sessionId, events });
            if (summary.completed) {
              keyRef.current = newIdempotencyKey();
              setSave({ kind: 'idle' });
              setCompleted({
                sessionId: event.sessionId,
                score: summary.score,
                total: summary.total,
                answers: Object.fromEntries(events.map((e) => [e.phase, e.choiceId])),
              });
            }
            return receipt;
          },
        });
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  const saveResult = async () => {
    if (!api || !completed) return;
    setSave({ kind: 'saving' });
    try {
      await api.saveTraining(
        {
          scenarioRef: 'coordination-screen-review-v1',
          scenarioVersion: '1',
          score: Math.round((completed.score / completed.total) * 100),
          answers: completed.answers,
        },
        keyRef.current,
      );
      setSave({ kind: 'saved' });
      onSaved();
    } catch (error) {
      setSave({ kind: 'error', error });
    }
  };

  return (
    <div className="as-stack">
      {status === 'loading' && <Loading label="Loading drill…" />}
      {status === 'failed' && <p className="as-error">The drill could not load.</p>}
      <div ref={hostRef} />
      {completed && (
        <div className="as-notice as-notice--ok" role="status">
          <p>
            Drill complete: {completed.score}/{completed.total}. This is an interface-literacy
            score, not a measure of emergency readiness.
          </p>
          {api ? (
            save.kind === 'saved' ? (
              <p>
                <AppIcon name="check" size={16} /> Saved to your training record on the server.
              </p>
            ) : (
              <button
                type="button"
                className="as-btn as-btn--sm"
                disabled={save.kind === 'saving'}
                onClick={() => void saveResult()}
              >
                {save.kind === 'saving' ? 'Saving…' : 'Save to my training record'}
              </button>
            )
          ) : (
            <p className="as-small">Not saved: training records need a signed-in API session.</p>
          )}
          {save.kind === 'error' && <ErrorNotice error={save.error} />}
        </div>
      )}
    </div>
  );
}
