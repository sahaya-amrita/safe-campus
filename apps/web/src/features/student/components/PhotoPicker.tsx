import { useRef } from 'react';
import { CriticalText } from '../../../i18n/CriticalText';
import { useI18n, type Messages } from '../../../i18n';
import { ACCEPTED_TYPES, MAX_PHOTOS, type PhotoRejection } from '../attachments/photoPolicy';
import type { PhotoItem } from '../attachments/useAttachments';
import { Icon } from './Icon';

function rejectionText(reason: PhotoRejection, t: Messages): string {
  switch (reason) {
    case 'TOO_MANY':
      return t.photoErrTooMany(MAX_PHOTOS);
    case 'UNSUPPORTED_TYPE':
      return t.photoErrType;
    case 'TOO_LARGE':
      return t.photoErrTooLarge;
    case 'UNREADABLE':
      return t.photoErrUnreadable;
    case 'STORAGE_FULL':
      return t.photoErrStorageFull;
    case 'STORAGE_FAILED':
      return t.photoErrStorageFailed;
  }
}

interface Props {
  photos: PhotoItem[];
  busy: boolean;
  lastError: PhotoRejection | null;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
}

/**
 * Optional photos. "Take photo" asks for the rear camera where the browser
 * supports `capture`; "Choose photos" opens the library. Photos stay on the
 * device — there is no upload contract yet — and the UI says so.
 */
export function PhotoPicker({ photos, busy, lastError, onAdd, onRemove, onReplace }: Props) {
  const { t } = useI18n();
  const replaceTarget = useRef<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const full = photos.length >= MAX_PHOTOS;
  const accept = ACCEPTED_TYPES.join(',');

  const take = (input: HTMLInputElement) => {
    const files = [...(input.files ?? [])];
    input.value = '';
    return files;
  };

  return (
    <div className="sc-photos" data-testid="photo-picker">
      <CriticalText k="photosLocalOnly" className="sc-callout sc-callout--info" leading={<Icon name="info" size={18} />} />

      <div className="sc-row">
        <label className={`sc-btn sc-btn--outline sc-file ${full || busy ? 'is-disabled' : ''}`}>
          <Icon name="camera" size={20} />
          {t.photosTake}
          <input
            type="file"
            accept={accept}
            capture="environment"
            disabled={full || busy}
            onChange={(e) => onAdd(take(e.currentTarget))}
            data-testid="photo-camera-input"
          />
        </label>
        <label className={`sc-btn sc-btn--outline sc-file ${full || busy ? 'is-disabled' : ''}`}>
          <Icon name="image" size={20} />
          {t.photosChoose}
          <input
            type="file"
            accept={accept}
            multiple
            disabled={full || busy}
            onChange={(e) => onAdd(take(e.currentTarget))}
            data-testid="photo-library-input"
          />
        </label>
      </div>

      <p className="sc-meta-line" aria-live="polite">
        {busy ? t.photosPreparing : t.photosCount(photos.length, MAX_PHOTOS)}
      </p>
      {lastError && (
        <p className="sc-callout sc-callout--warn" role="alert">
          {rejectionText(lastError, t)}
        </p>
      )}

      {photos.length > 0 && (
        <ul className="sc-thumbs">
          {photos.map((photo, index) => (
            <li key={photo.id} className="sc-thumb">
              {photo.previewUrl ? <img src={photo.previewUrl} alt={t.photoAlt(index + 1)} /> : <span className="sc-thumb-empty">{t.photoAlt(index + 1)}</span>}
              <div className="sc-thumb-actions">
                <button type="button" className="sc-icon-btn" aria-label={t.photosReplace(index + 1)} onClick={() => {
                  replaceTarget.current = photo.id;
                  replaceInput.current?.click();
                }}>
                  <Icon name="retry" size={18} />
                </button>
                <button type="button" className="sc-icon-btn" aria-label={t.photosRemove(index + 1)} onClick={() => onRemove(photo.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={replaceInput}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const [file] = take(e.currentTarget);
          if (file && replaceTarget.current) onReplace(replaceTarget.current, file);
          replaceTarget.current = null;
        }}
        data-testid="photo-replace-input"
      />
    </div>
  );
}
