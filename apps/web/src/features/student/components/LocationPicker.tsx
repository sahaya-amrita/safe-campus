import { useI18n } from '../../../i18n';
import { assessFix, type LocationState } from '../location/useLocationCapture';
import { Icon } from './Icon';

interface Props {
  state: LocationState;
  onRequest: () => void;
  onUseNow: () => void;
  onClear: () => void;
  now: () => Date;
}

/**
 * Optional "Use my current location". Every failure explains itself and
 * offers Retry; the request can always be sent without a location.
 */
export function LocationPicker({ state, onRequest, onUseNow, onClear, now }: Props) {
  const { t, formatTime } = useI18n();

  const retry = (
    <button type="button" className="sc-btn sc-btn--ghost sc-btn--small" onClick={onRequest}>
      <Icon name="retry" size={16} />
      {t.locationRetry}
    </button>
  );
  const failure = (message: string, canRetry = true) => (
    <div className="sc-callout sc-callout--warn sc-loc-fail" role="status">
      <Icon name="info" size={18} />
      <div className="sc-stack">
        <span>{message}</span>
        {canRetry && retry}
      </div>
    </div>
  );

  return (
    <div className="sc-loc" aria-live="polite" data-testid="location-picker" data-location-state={state.kind}>
      {state.kind === 'idle' && (
        <>
          <button type="button" className="sc-btn sc-btn--outline sc-btn--block" onClick={onRequest}>
            <Icon name="locate" size={20} />
            {t.locationUse}
          </button>
          <p className="sc-meta-line">{t.locationHint}</p>
        </>
      )}

      {state.kind === 'locating' && (
        <div className="sc-loc-busy" role="status">
          <span className="sc-spinner" aria-hidden="true" />
          <div className="sc-stack">
            <span className="sc-emph">{t.locationLocating}</span>
            {state.best && <span className="sc-meta-line">{t.locationImproving(state.best.accuracyMetres)}</span>}
            <div className="sc-row">
              {state.best && (
                <button type="button" className="sc-btn sc-btn--teal sc-btn--small" onClick={onUseNow}>
                  {t.locationUseNow}
                </button>
              )}
              <button type="button" className="sc-btn sc-btn--ghost sc-btn--small" onClick={onClear}>
                {t.locationCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.kind === 'attached' && (
        <div className="sc-loc-ok">
          <p className="sc-loc-title">
            <Icon name="pin" size={18} /> {t.locationAttachedTitle}
          </p>
          <p className="sc-meta-line">
            {t.locationAccuracy(state.fix.accuracyMetres)} · {t.locationCapturedAt(formatTime(state.fix.capturedAt))}
          </p>
          {assessFix(state.fix, now()) === 'low-accuracy' && (
            <p className="sc-callout sc-callout--warn">{t.locationLowAccuracy(state.fix.accuracyMetres)}</p>
          )}
          {assessFix(state.fix, now()) === 'stale' && <p className="sc-callout sc-callout--warn">{t.locationStale}</p>}
          <div className="sc-row">
            {retry}
            <button type="button" className="sc-btn sc-btn--ghost sc-btn--small" onClick={onClear}>
              <Icon name="x" size={16} />
              {t.locationRemove}
            </button>
          </div>
        </div>
      )}

      {state.kind === 'insecure' && failure(t.locationInsecure, false)}
      {state.kind === 'unsupported' && failure(t.locationUnsupported, false)}
      {state.kind === 'denied' && failure(t.locationDenied)}
      {state.kind === 'timeout' && failure(t.locationTimeout)}
      {state.kind === 'unavailable' && failure(t.locationUnavailable)}
    </div>
  );
}
