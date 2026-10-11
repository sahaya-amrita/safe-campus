import { useEffect, useState } from 'react';
import type { AttachmentView, LocationView } from '@sahaya/contracts';
import { Sheet } from '../../design-system';
import { useApi, useSession } from '../auth/session';
import { AppIcon, formatWhen } from '../ui';

const STALE_MS = 2 * 60_000;

/**
 * Where the reporter said they were. GPS shows accuracy and age, and a low
 * accuracy or old fix is flagged. Coordinates are reported as given; they are
 * never presented as a verified position.
 */
export function LocationLine({
  location,
  reportedAt,
}: {
  location: LocationView | null | undefined;
  reportedAt?: string;
}) {
  if (!location || location.method === 'NONE')
    return <p className="as-muted as-small">No location shared.</p>;
  const parts: string[] = [];
  if (location.method === 'GPS' && location.latitude !== null && location.longitude !== null) {
    parts.push(`Device location ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`);
    if (location.accuracyM !== null) parts.push(`±${Math.round(location.accuracyM)} m`);
    if (location.capturedAt) parts.push(`captured ${formatWhen(location.capturedAt)}`);
  }
  if (location.landmark) parts.push(`Landmark: “${location.landmark}”`);
  const lowAccuracy = location.method === 'GPS' && (location.accuracyM ?? 0) > 100;
  const stale =
    location.method === 'GPS' &&
    location.capturedAt &&
    reportedAt &&
    new Date(reportedAt).getTime() - new Date(location.capturedAt).getTime() > STALE_MS;
  const mapHref =
    location.method === 'GPS' && location.latitude !== null && location.longitude !== null
      ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=19/${location.latitude}/${location.longitude}`
      : null;
  return (
    <p className="as-small">
      <AppIcon name="pin" size={14} /> {parts.join(' · ')}
      {lowAccuracy && <strong> · low accuracy</strong>}
      {stale && <strong> · captured well before the report</strong>}
      {mapHref && (
        <>
          {' '}
          ·{' '}
          <a href={mapHref} target="_blank" rel="noreferrer noopener">
            Open map
          </a>
        </>
      )}
      <span className="as-muted"> (reported by the student, not verified)</span>
    </p>
  );
}

/**
 * Photos attached to a report. Each one is fetched with the session token;
 * the server checks access and records every staff view in the audit log.
 */
export function PhotoStrip({
  attachments,
}: {
  attachments: readonly AttachmentView[] | undefined;
}) {
  if (!attachments || attachments.length === 0) return null;
  return <LoadedPhotoStrip attachments={attachments} />;
}

function LoadedPhotoStrip({ attachments }: { attachments: readonly AttachmentView[] }) {
  const api = useApi();
  const { getToken } = useSession();
  /** Object URL per photo, or null when it could not be loaded. */
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [open, setOpen] = useState<string | null>(null);
  const ids = attachments.map((a) => a.id).join(',');

  useEffect(() => {
    if (!ids) return;
    let active = true;
    const created: string[] = [];
    void Promise.all(
      ids.split(',').map(async (id) => {
        try {
          const url = await api.photoBlobUrl(id, getToken());
          created.push(url);
          if (active) setUrls((u) => ({ ...u, [id]: url }));
        } catch {
          if (active) setUrls((u) => ({ ...u, [id]: null }));
        }
      }),
    );
    return () => {
      active = false;
      created.forEach((url) => URL.revokeObjectURL?.(url));
    };
  }, [api, getToken, ids]);

  return (
    <>
      <div className="as-photos" aria-label={`${attachments.length} photo(s) from the reporter`}>
        {attachments.map((a, index) => {
          const url = urls[a.id];
          return (
            <button
              key={a.id}
              type="button"
              className="as-photos__item"
              disabled={!url}
              onClick={() => setOpen(a.id)}
              aria-label={`Open photo ${index + 1}`}
            >
              {url ? <img src={url} alt="" /> : url === null ? 'Not available' : 'Loading…'}
            </button>
          );
        })}
      </div>
      <Sheet open={open !== null} title="Photo from the reporter" onClose={() => setOpen(null)}>
        {open && urls[open] && (
          <img className="as-photo-full" src={urls[open]} alt="Photo attached by the reporter" />
        )}
        <p className="as-small as-muted">
          Viewing is recorded in the audit log. Photos are unverified evidence.
        </p>
      </Sheet>
    </>
  );
}
