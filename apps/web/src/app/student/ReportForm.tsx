import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createReportSchema,
  MAX_ATTACHMENTS_PER_REPORT,
  type IncidentPriority,
  type ReportCategory,
  type ReportKind,
} from '@sahaya/contracts';
import { Button, FormError, PermissionNotice, StatusBanner, TextField } from '../../design-system';
import type { ImageProcessor } from '../../features/student/attachments/imageProcessor';
import { CanvasImageProcessor } from '../../features/student/attachments/imageProcessor';
import { precheckPhoto } from '../../features/student/attachments/photoPolicy';
import { toWireLocation } from '../../features/student/contracts/studentContract';
import {
  useLocationCapture,
  type LocationEnvironment,
} from '../../features/student/location/useLocationCapture';
import { newIdempotencyKey, describeProblem } from '../api/client';
import type { CreatedIncident, SahayaApi } from '../api/sahaya';
import { AppIcon, Loading, Pill, VerificationPill, formatWhen, useAsync } from '../ui';

const CATEGORIES: { value: ReportCategory; label: string; hint: string }[] = [
  { value: 'FIRE_SMOKE', label: 'Fire or smoke', hint: 'Flames, smoke or a burning smell' },
  { value: 'MEDICAL', label: 'Medical', hint: 'Someone is hurt or unwell' },
  {
    value: 'PERSONAL_SAFETY',
    label: 'Personal safety',
    hint: 'Threat, harassment or someone at risk',
  },
  { value: 'HAZARD', label: 'Hazard', hint: 'Exposed wires, spills, damage, blocked exits' },
  { value: 'OTHER', label: 'Something else', hint: 'Anything that does not fit above' },
];

/**
 * Priority comes from the answers, so students never have to judge urgency
 * levels: a concern is LOW, an emergency HIGH, and fire or medical
 * emergencies CRITICAL.
 */
export function priorityFor(kind: ReportKind, category: ReportCategory): IncidentPriority {
  if (kind === 'CONCERN') return 'LOW';
  return category === 'FIRE_SMOKE' || category === 'MEDICAL' ? 'CRITICAL' : 'HIGH';
}

interface Photo {
  id: string;
  name: string;
  bytes: ArrayBuffer;
  mediaType: 'image/jpeg';
  previewUrl: string;
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending'; step: string }
  | { kind: 'done'; created: CreatedIncident; photosSent: number; photosTried: number }
  | { kind: 'error'; message: string };

/**
 * Student report (report contract v2): emergency or concern, category,
 * building and floor (floor first for fire), optional location and up to
 * three photos. Photos are re-encoded on the phone (dropping EXIF), uploaded,
 * then attached; if a photo fails, the report is still sent and says so.
 * Reports are not queued offline: nothing is sent until the student is online.
 */
export function ReportForm({
  api,
  online,
  onDone,
  processor = defaultProcessor,
  locationEnv,
}: {
  api: SahayaApi;
  online: boolean;
  onDone?: (created: CreatedIncident) => void;
  processor?: ImageProcessor;
  locationEnv?: LocationEnvironment;
}) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [landmark, setLandmark] = useState('');
  const [askLocation, setAskLocation] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [state, setState] = useState<SendState>({ kind: 'idle' });
  const key = useRef(newIdempotencyKey());
  const location = useLocationCapture(locationEnv);

  const buildings = useAsync(() => api.buildings(), [api]);
  const map = useAsync(buildingId ? () => api.buildingMap(buildingId) : null, [api, buildingId]);
  const floors = useMemo(() => map.data?.floors ?? [], [map.data]);
  const fireFirst = category === 'FIRE_SMOKE';

  const fix = location.state.kind === 'attached' ? location.state.fix : null;
  const wireLocation = toWireLocation({
    ...(fix ? { location: fix } : {}),
    ...(landmark.trim() ? { landmark } : {}),
  });
  const input =
    kind && category
      ? {
          type: CATEGORIES.find((c) => c.value === category)!.label,
          description: description.trim(),
          priority: priorityFor(kind, category),
          category,
          kind,
          ...(buildingId ? { buildingId } : {}),
          ...(floorId ? { floorId } : {}),
          ...(wireLocation ? { location: wireLocation } : {}),
          attachmentIds: [],
        }
      : null;
  const valid = input ? createReportSchema.safeParse(input) : null;
  const missing = !kind
    ? 'Say whether anyone is in danger right now.'
    : !category
      ? 'Choose what kind of problem it is.'
      : description.trim().length < 3
        ? 'Describe what you see (at least 3 characters).'
        : buildingId && !floorId
          ? 'Choose the floor for this building.'
          : null;

  const addPhotos = async (files: File[]) => {
    setPhotoError(null);
    let current = photos.length;
    const added: Photo[] = [];
    for (const file of files) {
      const check = await precheckPhoto(file, current);
      if (!check.ok) {
        setPhotoError(
          check.reason === 'TOO_MANY'
            ? `You can add up to ${MAX_ATTACHMENTS_PER_REPORT} photos.`
            : check.reason === 'TOO_LARGE'
              ? 'That photo is too large.'
              : 'Only JPEG, PNG or WebP photos can be added.',
        );
        continue;
      }
      try {
        const prepared = await processor.prepare(file);
        added.push({
          id: newIdempotencyKey(),
          name: file.name,
          bytes: prepared.bytes,
          mediaType: prepared.mediaType,
          previewUrl:
            typeof URL.createObjectURL === 'function'
              ? URL.createObjectURL(new Blob([prepared.bytes], { type: prepared.mediaType }))
              : '',
        });
        current++;
      } catch {
        setPhotoError('That photo could not be read. Try another one.');
      }
    }
    setPhotos((existing) => [...existing, ...added].slice(0, MAX_ATTACHMENTS_PER_REPORT));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid?.success) return;
    const ids: string[] = [];
    for (const [index, photo] of photos.entries()) {
      setState({ kind: 'sending', step: `Sending photo ${index + 1} of ${photos.length}…` });
      try {
        ids.push((await api.uploadPhoto(photo.bytes, photo.mediaType)).id);
      } catch {
        // The report still goes out; the result says how many photos made it.
      }
    }
    setState({ kind: 'sending', step: 'Sending report…' });
    try {
      const created = await api.createIncident({ ...valid.data, attachmentIds: ids }, key.current);
      setState({ kind: 'done', created, photosSent: ids.length, photosTried: photos.length });
      onDone?.(created);
    } catch (error) {
      setState({ kind: 'error', message: describeProblem(error) });
    }
  };

  if (state.kind === 'done') {
    const c = state.created;
    return (
      <div className="as-stack" role="status">
        <StatusBanner tone="ok" title="Received by the server">
          At {formatWhen(c.serverReceivedAt)}. It is <strong>not verified</strong> until an
          authorised reviewer checks it, and it is not sent to anyone as an alert.
        </StatusBanner>
        <div className="as-row">
          <VerificationPill status={c.verificationStatus} />
          <Pill tone="neutral">{kind === 'CONCERN' ? 'Concern' : 'Emergency'}</Pill>
        </div>
        {state.photosTried > 0 && (
          <p
            className={
              state.photosSent === state.photosTried ? 'as-muted' : 'as-notice as-notice--warn'
            }
          >
            {state.photosSent === state.photosTried
              ? `${state.photosSent} photo(s) attached.`
              : `${state.photosSent} of ${state.photosTried} photos attached. The others could not be sent.`}
          </p>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            key.current = newIdempotencyKey();
            setState({ kind: 'idle' });
            setDescription('');
            setPhotos([]);
            setKind(null);
            setCategory(null);
          }}
        >
          Report something else
        </Button>
      </div>
    );
  }

  const buildingAndFloor = (
    <div className="as-grid2">
      <label className="ds-field">
        <span className="ds-field__label">Building</span>
        {buildings.loading && !buildings.data ? (
          <Loading />
        ) : (
          <select
            className="ds-input"
            value={buildingId}
            onChange={(e) => {
              setBuildingId(e.target.value);
              setFloorId('');
            }}
          >
            <option value="">Not sure / outdoors</option>
            {buildings.data?.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </label>
      {buildingId && (
        <label className="ds-field">
          <span className="ds-field__label">Floor (required)</span>
          <select className="ds-input" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
            <option value="">Choose a floor</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  return (
    <form className="as-form as-report" onSubmit={(e) => void submit(e)} noValidate>
      <fieldset className="as-report__group">
        <legend>Is anyone in danger right now?</legend>
        <div className="as-seg">
          <button
            type="button"
            aria-pressed={kind === 'EMERGENCY'}
            onClick={() => setKind('EMERGENCY')}
          >
            Yes, it is urgent
          </button>
          <button
            type="button"
            aria-pressed={kind === 'CONCERN'}
            onClick={() => setKind('CONCERN')}
          >
            No, it can wait
          </button>
        </div>
        {kind === 'EMERGENCY' && (
          <StatusBanner tone="danger" title="Call 112 first if life is at risk">
            This report is not an emergency call. <a href="tel:112">Call 112</a>
          </StatusBanner>
        )}
      </fieldset>

      <fieldset className="as-report__group">
        <legend>What kind of problem?</legend>
        <div className="as-report__chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className="as-report__chip"
              aria-pressed={category === c.value}
              onClick={() => setCategory(c.value)}
            >
              <strong>{c.label}</strong>
              <small>{c.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      {fireFirst && (
        <fieldset className="as-report__group">
          <legend>Where is the fire or smoke?</legend>
          <p className="as-small as-muted">
            Building and floor first: fires are handled floor by floor.
          </p>
          {buildingAndFloor}
        </fieldset>
      )}

      <label className="ds-field">
        <span className="ds-field__label">What do you see?</span>
        <textarea
          className="ds-input as-report__text"
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is happening, and whether anyone needs help."
        />
      </label>

      {!fireFirst && (
        <fieldset className="as-report__group">
          <legend>Where? (optional)</legend>
          {buildingAndFloor}
        </fieldset>
      )}

      <fieldset className="as-report__group">
        <legend>Your location (optional)</legend>
        <TextField
          label="Landmark"
          hint="For example: near the library entrance."
          value={landmark}
          maxLength={200}
          onChange={(e) => setLandmark(e.target.value)}
        />
        {fix ? (
          <p className="as-small">
            <AppIcon name="pin" size={14} /> Device location added · accuracy ±
            {Math.round(fix.accuracyMetres)} m{' '}
            <button type="button" className="as-linkbtn" onClick={location.clear}>
              Remove
            </button>
          </p>
        ) : location.state.kind === 'locating' ? (
          <p className="as-small" role="status">
            Getting your location…
          </p>
        ) : askLocation || location.state.kind !== 'idle' ? (
          <PermissionNotice
            kind="location"
            state={
              location.state.kind === 'denied'
                ? 'denied'
                : location.state.kind === 'insecure'
                  ? 'insecure'
                  : location.state.kind === 'unsupported'
                    ? 'unsupported'
                    : 'prompt'
            }
            purpose="Adds where you are to this report, so reviewers can find the place."
            fallback="You can type a landmark instead."
            continueLabel={
              location.state.kind === 'timeout' || location.state.kind === 'unavailable'
                ? 'Try again'
                : 'Use my location'
            }
            onContinue={location.request}
          />
        ) : (
          <Button variant="ghost" size="sm" icon="pin" onClick={() => setAskLocation(true)}>
            Add my device location
          </Button>
        )}
      </fieldset>

      <fieldset className="as-report__group">
        <legend>Photos (optional, up to {MAX_ATTACHMENTS_PER_REPORT})</legend>
        <p className="as-small as-muted">
          Photos are re-saved on your phone first, which removes hidden location data.
        </p>
        {photos.length > 0 && (
          <ul className="as-report__photos">
            {photos.map((p) => (
              <li key={p.id}>
                {p.previewUrl && <img src={p.previewUrl} alt="" />}
                <span>{p.name}</span>
                <button
                  type="button"
                  className="as-linkbtn"
                  onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_ATTACHMENTS_PER_REPORT && (
          <label className="ds-btn ds-btn--secondary ds-btn--sm as-report__add">
            <AppIcon name="camera" size={18} /> Add photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="as-sr-only"
              data-testid="report-photo-input"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                void addPhotos(files);
              }}
            />
          </label>
        )}
        <FormError>{photoError}</FormError>
      </fieldset>

      {!online && (
        <StatusBanner tone="warn" title="You are offline">
          Reports are not saved for later. Nothing is sent until you are online.
        </StatusBanner>
      )}
      {state.kind === 'error' && <FormError>{state.message}</FormError>}
      {missing && state.kind === 'idle' && <p className="as-small as-muted">{missing}</p>}
      <Button
        type="submit"
        block
        variant={kind === 'EMERGENCY' ? 'danger' : 'primary'}
        disabled={!valid?.success || !online}
        loading={state.kind === 'sending'}
        loadingLabel={state.kind === 'sending' ? state.step : undefined}
      >
        Send report
      </Button>
      {state.kind === 'error' && (
        <p className="as-muted as-small">
          Sending again repeats the same report; the server will not create a duplicate.
        </p>
      )}
    </form>
  );
}

const defaultProcessor: ImageProcessor = {
  prepare: (file) => new CanvasImageProcessor().prepare(file),
};
