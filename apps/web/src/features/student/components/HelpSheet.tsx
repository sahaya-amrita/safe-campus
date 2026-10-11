import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CriticalText } from '../../../i18n/CriticalText';
import { useI18n } from '../../../i18n';
import { useAttachments, type AttachmentDeps } from '../attachments/useAttachments';
import type { NewCheckIn } from '../checkIn/useCheckIns';
import { LANDMARK_MAX_LENGTH, NOTE_MAX_LENGTH } from '../contracts/studentContract';
import { useLocationCapture, type LocationEnvironment } from '../location/useLocationCapture';
import { Icon } from './Icon';
import { LocationPicker } from './LocationPicker';
import { PhotoPicker } from './PhotoPicker';

interface Props {
  /** Resolves with the queued entry's key, or null if nothing was queued. */
  onSend: (checkIn: NewCheckIn) => Promise<string | null>;
  onClose: () => void;
  sending: boolean;
  attachmentDeps: AttachmentDeps;
  /** Photos are uploaded after the request is received (signed in to the API). */
  photosUploadable?: boolean;
  locationEnv?: LocationEnvironment;
  now: () => Date;
}

/**
 * Full-screen help request. The send button is pinned at the bottom so a
 * request can go out immediately; every field above it is optional.
 */
export function HelpSheet({
  onSend,
  onClose,
  sending,
  attachmentDeps,
  photosUploadable = false,
  locationEnv,
  now,
}: Props) {
  const { t } = useI18n();
  const id = useId();
  const [note, setNote] = useState('');
  const [landmark, setLandmark] = useState('');
  const location = useLocationCapture(locationEnv);
  const attachments = useAttachments(attachmentDeps);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);

  const close = () => {
    // Closing without sending removes photos picked in this sheet from the device.
    void attachments.discard();
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const key = await onSend({
      status: 'HELP_REQUESTED',
      ...(note.trim() ? { note: note.trim().slice(0, NOTE_MAX_LENGTH) } : {}),
      ...(landmark.trim() ? { landmark: landmark.trim().slice(0, LANDMARK_MAX_LENGTH) } : {}),
      ...(location.state.kind === 'attached' ? { location: location.state.fix } : {}),
      ...(attachments.ids.length ? { attachmentIds: attachments.ids } : {}),
    });
    if (key) await attachments.linkTo(key);
  };

  return (
    <div className="sc-sheet-backdrop">
      <form
        className="sc-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={(e) => void submit(e)}
        data-testid="help-sheet"
      >
        <header className="sc-sheet-head">
          <span className="sc-help-disc">
            <Icon name="hand" size={20} />
          </span>
          <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="sc-sheet-title">
            {t.helpHeading}
          </h2>
          <button type="button" className="sc-icon-btn" aria-label={t.helpClose} onClick={close}>
            <Icon name="x" size={22} />
          </button>
        </header>

        <div className="sc-sheet-body">
          <CriticalText
            k="helpCallFirst"
            className="sc-help-warning"
            leading={<Icon name="phone" size={18} />}
          />
          <a className="sc-call sc-call--compact" href="tel:112">
            <Icon name="phone" size={18} />
            {t.emergencyCall}
          </a>

          <div className="sc-field">
            <label htmlFor={`${id}-note`} className="sc-label">
              {t.helpNoteLabel}
            </label>
            <textarea
              id={`${id}-note`}
              className="sc-textarea"
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={`${id}-count`}
            />
            <p id={`${id}-count`} className="sc-meta-line">
              {t.helpNoteCount(note.length, NOTE_MAX_LENGTH)}
            </p>
          </div>

          <section className="sc-field" aria-labelledby={`${id}-where`}>
            <h3 id={`${id}-where`} className="sc-label">
              {t.helpWhereHeading}
            </h3>
            <LocationPicker
              state={location.state}
              onRequest={location.request}
              onUseNow={location.useBestNow}
              onClear={location.clear}
              now={now}
            />
            <label htmlFor={`${id}-landmark`} className="sc-sublabel">
              {t.landmarkLabel}
            </label>
            <input
              id={`${id}-landmark`}
              className="sc-input"
              value={landmark}
              maxLength={LANDMARK_MAX_LENGTH}
              autoComplete="off"
              onChange={(e) => setLandmark(e.target.value)}
              aria-describedby={`${id}-landmark-hint`}
            />
            <p id={`${id}-landmark-hint`} className="sc-meta-line">
              {t.landmarkHint}
            </p>
          </section>

          <section className="sc-field" aria-labelledby={`${id}-photos`}>
            <h3 id={`${id}-photos`} className="sc-label">
              {t.helpPhotosHeading}
            </h3>
            <PhotoPicker
              photos={attachments.photos}
              busy={attachments.busy}
              lastError={attachments.lastError}
              onAdd={(files) => void attachments.add(files)}
              onRemove={(photoId) => void attachments.remove(photoId)}
              onReplace={(photoId, file) => void attachments.replace(photoId, file)}
              uploadsEnabled={photosUploadable}
            />
          </section>
        </div>

        <footer className="sc-sheet-foot">
          <button
            type="submit"
            className="sc-btn sc-btn--help sc-btn--block sc-btn--large"
            disabled={sending}
          >
            {t.helpSend}
          </button>
        </footer>
      </form>
    </div>
  );
}
