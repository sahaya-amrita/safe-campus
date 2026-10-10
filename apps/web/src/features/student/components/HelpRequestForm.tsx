import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../../../i18n';
import { NOTE_MAX_LENGTH, type CreateCheckInRequest } from '../contracts/provisional';
import { useOneShotLocation } from '../location/useOneShotLocation';

interface Props {
  onSubmit: (request: CreateCheckInRequest) => void;
  onCancel: () => void;
  disabled: boolean;
  geolocation?: Geolocation;
}

/**
 * Optional details for a help request. The send button comes first so the
 * student can send immediately; note and location never block sending.
 */
export function HelpRequestForm({ onSubmit, onCancel, disabled, geolocation }: Props) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const location = useOneShotLocation(geolocation);
  const noteId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = note.trim().slice(0, NOTE_MAX_LENGTH);
    onSubmit({
      status: 'NEED_HELP',
      ...(trimmed ? { note: trimmed } : {}),
      ...(location.state.kind === 'attached' ? { locationReference: location.state.reference } : {}),
    });
  };

  return (
    <form className="sc-help-form" onSubmit={submit} aria-labelledby={`${noteId}-heading`}>
      <h3 id={`${noteId}-heading`} ref={headingRef} tabIndex={-1} className="sc-card-heading">
        {t.helpHeading}
      </h3>
      <p className="sc-warning">{t.helpCallFirst}</p>
      <div className="sc-row">
        <button type="submit" className="sc-button sc-button--help" disabled={disabled}>
          {t.helpSend}
        </button>
        <button type="button" className="sc-button sc-button--secondary" onClick={onCancel}>
          {t.helpCancel}
        </button>
      </div>

      <label htmlFor={noteId} className="sc-label">
        {t.helpNoteLabel}
      </label>
      <textarea
        id={noteId}
        className="sc-textarea"
        value={note}
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
        aria-describedby={`${noteId}-count`}
      />
      <p id={`${noteId}-count`} className="sc-small">
        {t.helpNoteCount(note.length, NOTE_MAX_LENGTH)}
      </p>

      <div className="sc-location" aria-live="polite">
        {location.state.kind === 'idle' && (
          <button type="button" className="sc-button sc-button--secondary" onClick={location.request}>
            {t.locationAdd}
          </button>
        )}
        {location.state.kind === 'locating' && <p>{t.locationLocating}</p>}
        {location.state.kind === 'attached' && (
          <>
            <p>{t.locationAttached(location.state.accuracyMetres)}</p>
            <button type="button" className="sc-button sc-button--secondary" onClick={location.clear}>
              {t.locationRemove}
            </button>
          </>
        )}
        {location.state.kind === 'denied' && <p className="sc-notice">{t.locationDenied}</p>}
        {location.state.kind === 'unavailable' && <p className="sc-notice">{t.locationUnavailable}</p>}
        {location.state.kind === 'unsupported' && <p className="sc-notice">{t.locationUnsupported}</p>}
      </div>
    </form>
  );
}
