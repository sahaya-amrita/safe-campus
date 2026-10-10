import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { HelpRequestStatus } from '@sahaya/contracts';
import { toDeliveryStatus } from '../../features/student/checkIn/checkInQueue';
import { useLocationCapture } from '../../features/student/location/useLocationCapture';
import { AppIcon } from '../ui';
import { useStudent } from './core';

export const HOLD_MS = 1500;

type StepState = 'done' | 'current' | 'todo' | 'failed';

/** Ordered transmission steps. Only server data may mark the later ones done. */
export function sosSteps(
  delivery: 'LOCAL_ONLY' | 'QUEUED' | 'SENDING' | 'SERVER_RECEIVED' | 'ACKNOWLEDGED' | 'FAILED',
  serverStatus: HelpRequestStatus | null,
): { label: string; state: StepState }[] {
  const received = delivery === 'SERVER_RECEIVED' || delivery === 'ACKNOWLEDGED';
  const acked =
    serverStatus === 'ACKNOWLEDGED' || serverStatus === 'ASSIGNED' || serverStatus === 'RESOLVED';
  const assigned = serverStatus === 'ASSIGNED' || serverStatus === 'RESOLVED';
  return [
    { label: 'Saved on this device', state: 'done' },
    {
      label:
        delivery === 'LOCAL_ONLY'
          ? 'Waiting for a connection — not sent yet'
          : delivery === 'FAILED'
            ? 'Not delivered'
            : received
              ? 'Sent to server'
              : 'Sending to server',
      state: delivery === 'FAILED' ? 'failed' : received ? 'done' : 'current',
    },
    { label: 'Received by server', state: received ? 'done' : 'todo' },
    { label: 'Acknowledged by a responder', state: acked ? 'done' : received ? 'current' : 'todo' },
    { label: 'Responder assigned', state: assigned ? 'done' : acked ? 'current' : 'todo' },
  ];
}

/**
 * Dedicated emergency screen. SOS reuses the authenticated check-in queue
 * (HELP_REQUESTED → persistent help request); it never calls emergency
 * services. Activation needs a 1.5 s hold (pointer or Space/Enter) or an
 * explicit two-step confirmation, so it cannot be triggered by a stray tap.
 */
export function SosScreen({ onClose }: { onClose: () => void }) {
  const s = useStudent();
  const location = useLocationCapture(s.deps.locationEnv);
  const [progress, setProgress] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [sentKey, setSentKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const holdStart = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const firedRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => closeRef.current?.focus(), []);

  const canSend = Boolean(s.session) && s.checkIns.snapshot.ready && !s.checkIns.submitting;
  const fix =
    location.state.kind === 'attached'
      ? location.state.fix
      : location.state.kind === 'locating'
        ? location.state.best
        : null;

  const fire = useCallback(async () => {
    if (!canSend) return;
    setConfirming(false);
    setError(null);
    const key = await s.send({
      status: 'HELP_REQUESTED',
      note: 'SOS from the emergency screen',
      ...(location.state.kind === 'attached' ? { location: location.state.fix } : {}),
    });
    if (key) setSentKey(key);
    else setError('The request could not be saved on this device. Call 112.');
  }, [canSend, location.state, s]);

  const stopHold = useCallback(() => {
    holdStart.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (holdStart.current === null) return;
    const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1 && !firedRef.current) {
      firedRef.current = true;
      stopHold();
      void fire();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [fire, stopHold]);

  const startHold = () => {
    if (!canSend || holdStart.current !== null) return;
    firedRef.current = false;
    holdStart.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => stopHold(), [stopHold]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      startHold();
    }
  };
  const onKeyUp = (event: ReactKeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Enter') stopHold();
  };

  const entry = sentKey ? s.entries.find((e) => e.key === sentKey) : undefined;
  const helpId = entry?.result?.helpRequest?.id ?? null;
  const server = helpId ? s.myHelp?.data?.items.find((h) => h.id === helpId) : undefined;
  const { reload: reloadHelp } = s.myHelp ?? {};
  useEffect(() => {
    if (!helpId || !reloadHelp) return;
    const timer = setInterval(reloadHelp, 5000);
    return () => clearInterval(timer);
  }, [helpId, reloadHelp]);

  return (
    <div className="as-sos" role="dialog" aria-modal="true" aria-labelledby="as-sos-title">
      <div className="as-sos__top">
        <span className="as-row">
          <AppIcon name="alert" size={20} />
          <strong>EMERGENCY</strong>
        </span>
        <button
          ref={closeRef}
          type="button"
          className="as-sos__close"
          onClick={onClose}
          aria-label="Close emergency screen"
        >
          <AppIcon name="x" size={22} />
        </button>
      </div>

      <div className="as-sos__body">
        <h1 id="as-sos-title" className="as-sos__title">
          Emergency SOS
        </h1>
        <p className="as-sos__sub">
          If life is at risk, call 112 now. SOS sends an in-app help request to verified{' '}
          {s.mock ? 'MOCK' : s.user.mode} responders — it does not contact emergency services.
        </p>

        {!s.session ? (
          <div className="as-sos__panel" role="status">
            <strong>SOS can’t send a help request right now.</strong>
            <span className="as-sos__muted">
              No incident or drill is open for you in the app, and the server needs one to file the
              request. Use Call 112 below.
            </span>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="as-sos__button"
              style={{ ['--p' as string]: progress }}
              disabled={!canSend || Boolean(sentKey)}
              aria-describedby="as-sos-howto"
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              SOS
              <small>{sentKey ? 'Sent' : progress > 0 ? 'Keep holding…' : 'Hold 1.5 s'}</small>
            </button>
            <p id="as-sos-howto" className="as-sos__muted">
              Press and hold (or hold Space/Enter) to send a help request for:{' '}
              <strong>{s.session.name}</strong>.
            </p>
          </>
        )}

        <div className="as-sos__panel" aria-live="polite">
          <strong>
            <AppIcon name="pin" size={16} /> Location
          </strong>
          {fix ? (
            <span>
              Shared with your request · accuracy ±{Math.round(fix.accuracyMetres)} m
              {location.state.kind === 'locating' ? ' (improving…)' : ''}
            </span>
          ) : location.state.kind === 'denied' ? (
            <span className="as-sos__muted">
              Location permission is blocked. Describe where you are to responders if you can.
            </span>
          ) : location.state.kind === 'insecure' || location.state.kind === 'unsupported' ? (
            <span className="as-sos__muted">Location is not available in this browser.</span>
          ) : location.state.kind === 'timeout' || location.state.kind === 'unavailable' ? (
            <span className="as-sos__muted">Could not get a location fix.</span>
          ) : (
            <span className="as-sos__muted">
              Not shared. Your location is read only if you tap below.
            </span>
          )}
          {location.state.kind === 'locating' && location.state.best && (
            <button type="button" className="as-sos__alt" onClick={location.useBestNow}>
              Use this location now
            </button>
          )}
          {(location.state.kind === 'idle' ||
            location.state.kind === 'timeout' ||
            location.state.kind === 'unavailable') &&
            !sentKey && (
              <button type="button" className="as-sos__alt" onClick={location.request}>
                Share my location with the request
              </button>
            )}
        </div>

        {entry && (
          <div className="as-sos__panel" role="status" aria-live="polite">
            <strong>Help request status</strong>
            <ol className="as-sos__steps">
              {sosSteps(toDeliveryStatus(entry), server?.status ?? null).map((step) => (
                <li key={step.label} data-state={step.state}>
                  <AppIcon
                    name={step.state === 'done' ? 'check' : step.state === 'failed' ? 'x' : 'clock'}
                    size={16}
                  />
                  {step.label}
                </li>
              ))}
            </ol>
            {entry.lifecycle === 'FAILED' && (
              <span className="as-sos__muted">The server refused this request. Call 112.</span>
            )}
          </div>
        )}
        {error && (
          <p className="as-sos__panel" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="as-sos__actions">
        <a className="as-sos__call" href="tel:112">
          <AppIcon name="phone" size={22} /> Call 112 · National emergency
        </a>
        {s.session && !sentKey && !confirming && (
          <button
            type="button"
            className="as-sos__alt"
            disabled={!canSend}
            onClick={() => setConfirming(true)}
          >
            Send help request without holding
          </button>
        )}
        {confirming && (
          <div className="as-sos__panel" role="alertdialog" aria-labelledby="as-sos-confirm">
            <strong id="as-sos-confirm">Send a help request now?</strong>
            <div className="as-row">
              <button
                type="button"
                className="as-sos__call"
                style={{ flex: 1 }}
                onClick={() => void fire()}
              >
                Yes, send
              </button>
              <button
                type="button"
                className="as-sos__alt"
                style={{ flex: 1 }}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
