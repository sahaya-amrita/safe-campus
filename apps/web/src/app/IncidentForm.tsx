import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createReportSchema, type IncidentPriority } from '@sahaya/contracts';
import { newIdempotencyKey } from './api/client';
import type { CreatedIncident, SahayaApi } from './api/sahaya';
import { AppIcon, ErrorNotice, Loading, Pill, VerificationPill, formatWhen, useAsync } from './ui';

export const INCIDENT_TYPES = [
  'SMOKE_OR_FIRE',
  'MEDICAL',
  'STRUCTURAL',
  'FLOODING',
  'ELECTRICAL',
  'SECURITY',
  'ACCESS_OBSTRUCTION',
  'OTHER',
] as const;

const PRIORITIES: { value: IncidentPriority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

function label(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Staff form for a responder-initiated SIMULATED incident (POST /incidents).
 * Students use student/ReportForm.tsx. The same idempotency key is reused for
 * retries of one submission.
 */
export function IncidentForm({
  api,
  online,
  variant,
  onDone,
}: {
  api: SahayaApi;
  online: boolean;
  variant: 'student' | 'simulated';
  onDone?: (created: CreatedIncident) => void;
}) {
  const [type, setType] = useState<string>(variant === 'simulated' ? 'SMOKE_OR_FIRE' : 'OTHER');
  const [priority, setPriority] = useState<IncidentPriority>('MEDIUM');
  const [description, setDescription] = useState(
    variant === 'simulated'
      ? 'SIMULATED responder-initiated incident for a DEMO exercise. No sensor or alarm is connected.'
      : '',
  );
  const [buildingId, setBuildingId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'done'; created: CreatedIncident }
    | { kind: 'error'; error: unknown }
  >({
    kind: 'idle',
  });
  const key = useRef(newIdempotencyKey());
  const buildings = useAsync(() => api.buildings(), [api]);
  const map = useAsync(buildingId ? () => api.buildingMap(buildingId) : null, [api, buildingId]);
  const floors = useMemo(() => map.data?.floors ?? [], [map.data]);
  const zones = useMemo(() => floors.find((f) => f.id === floorId)?.zones ?? [], [floors, floorId]);

  const input = {
    type,
    description: description.trim(),
    priority,
    ...(buildingId ? { buildingId } : {}),
    ...(floorId ? { floorId } : {}),
    ...(zoneId ? { zoneId } : {}),
    evidence: [],
  };
  const valid = createReportSchema.safeParse(input);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid.success) return;
    setState({ kind: 'sending' });
    try {
      const created = await api.createIncident(valid.data, key.current);
      setState({ kind: 'done', created });
      onDone?.(created);
    } catch (error) {
      setState({ kind: 'error', error });
    }
  };

  if (state.kind === 'done') {
    const c = state.created;
    return (
      <div className="as-stack" role="status">
        <p className="as-notice as-notice--ok">
          <strong>Received by the server</strong> at {formatWhen(c.serverReceivedAt)}. It is{' '}
          <strong>not verified</strong> until an authorised reviewer checks it.
        </p>
        <div className="as-row">
          <VerificationPill status={c.verificationStatus} />
          <Pill tone="neutral">Priority {c.priority}</Pill>
        </div>
        {c.dispatch ? (
          <p className="as-muted">
            A <strong>simulated</strong> responder dispatch was created for this priority. No real
            emergency service was contacted.
          </p>
        ) : (
          <p className="as-muted">No simulated dispatch is created for low/medium priority.</p>
        )}
        <button
          type="button"
          className="as-btn as-btn--ghost"
          onClick={() => {
            key.current = newIdempotencyKey();
            setState({ kind: 'idle' });
            setDescription(variant === 'simulated' ? description : '');
          }}
        >
          {variant === 'simulated' ? 'Create another simulated incident' : 'Report something else'}
        </button>
      </div>
    );
  }

  return (
    <form className="as-form" onSubmit={(e) => void submit(e)}>
      {variant === 'simulated' && (
        <p className="as-notice as-notice--warn">
          <strong>SIMULATED incident.</strong> Started by staff without a student report. It is
          recorded as REPORTED and must still be verified. No fire alarm, sensor or emergency
          service is connected.
        </p>
      )}
      <label className="as-field">
        What is happening?
        <select className="as-select" value={type} onChange={(e) => setType(e.target.value)}>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {label(t)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="as-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>How urgent?</legend>
        <div className="as-seg">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={priority === p.value}
              onClick={() => setPriority(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <small>High and critical create a simulated responder dispatch.</small>
      </fieldset>
      <label className="as-field">
        Building
        {buildings.loading && !buildings.data ? (
          <Loading />
        ) : (
          <select
            className="as-select"
            value={buildingId}
            onChange={(e) => {
              setBuildingId(e.target.value);
              setFloorId('');
              setZoneId('');
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
      {floors.length > 0 && (
        <div className="as-grid2">
          <label className="as-field">
            Floor
            <select
              className="as-select"
              value={floorId}
              onChange={(e) => {
                setFloorId(e.target.value);
                setZoneId('');
              }}
            >
              <option value="">Not sure</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="as-field">
            Zone
            <select
              className="as-select"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              disabled={!zones.length}
            >
              <option value="">Not sure</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="as-field">
        Description
        <textarea
          className="as-textarea"
          value={description}
          maxLength={2000}
          required
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What you see, where, and whether anyone needs help."
        />
        <small>Photo upload is not available yet; describe what you see instead.</small>
      </label>
      {state.kind === 'error' && <ErrorNotice error={state.error} />}
      {!online && (
        <p className="as-notice as-notice--warn">
          You are offline. Reports are not queued; nothing will be sent until you are online.
        </p>
      )}
      <button
        type="submit"
        className="as-btn as-btn--block"
        disabled={!valid.success || !online || state.kind === 'sending'}
      >
        <AppIcon name="report" size={18} />
        {state.kind === 'sending'
          ? 'Sending…'
          : variant === 'simulated'
            ? 'Create simulated incident'
            : 'Send report'}
      </button>
      {state.kind === 'error' && (
        <p className="as-muted as-small">
          Retrying sends the same request; the server will not create a duplicate.
        </p>
      )}
    </form>
  );
}
