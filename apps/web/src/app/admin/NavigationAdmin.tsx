import { useState } from 'react';
import type { RouteGraphView, SafePointView } from '@sahaya/contracts';
import type { Me, SahayaApi } from '../api/sahaya';
import { ApiError } from '../api/client';
import { describeAuthError } from '../auth/AuthScreens';
import {
  Button,
  EmptyState,
  ErrorState,
  FormError,
  Pill,
  Sheet,
  Skeleton,
  StatusBanner,
  Surface,
  TextField,
} from '../../design-system';
import { formatWhen, useAsync, type Tone } from '../ui';

const STATUS_TONE: Record<string, Tone> = {
  PROPOSED: 'warn',
  DRAFT: 'warn',
  APPROVED: 'ok',
  RETIRED: 'neutral',
};

const TWO_PERSON =
  'Two-person rule: whoever proposed or uploaded something cannot approve it. Nothing is used for routes until a second administrator approves it.';

type Review =
  | { kind: 'point'; item: SafePointView; decision: 'APPROVE' | 'RETIRE' }
  | { kind: 'graph'; item: RouteGraphView; decision: 'APPROVE' | 'RETIRE' };

function ReviewSheet({
  api,
  review,
  onClose,
  onDone,
}: {
  api: SahayaApi;
  review: Review;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = review.kind === 'point' ? review.item.name : `route data ${review.item.version}`;
  const save = async () => {
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters. It is kept in the audit log.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (review.kind === 'point')
        await api.reviewSafePoint(review.item.id, review.decision, reason.trim());
      else await api.reviewRouteGraph(review.item.id, review.decision, reason.trim());
      onDone(`${review.decision === 'APPROVE' ? 'Approved' : 'Retired'} ${label}.`);
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.code === 'SAME_PERSON'
          ? 'You proposed or uploaded this. A second administrator must approve it.'
          : describeAuthError(reason),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      title={`${review.decision === 'APPROVE' ? 'Approve' : 'Retire'} ${label}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={review.decision === 'APPROVE' ? 'primary' : 'danger'}
            loading={busy}
            onClick={() => void save()}
          >
            {review.decision === 'APPROVE' ? 'Approve' : 'Retire'}
          </Button>
        </>
      }
    >
      <div className="as-stack">
        {review.decision === 'APPROVE' && (
          <p>
            Approve only what you have checked on site or against an institutional source. Approved
            data is used to guide people in an emergency.
          </p>
        )}
        <TextField
          label="Reason (kept in the audit log)"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError>{error}</FormError>
      </div>
    </Sheet>
  );
}

/** Safe-point approvals (ADMIN). */
export function SafePointsPage({ api, user }: { api: SahayaApi; user: Me }) {
  const points = useAsync(() => api.safePoints(), [api]);
  const [review, setReview] = useState<Review | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    kind: 'ASSEMBLY_POINT',
    lat: '',
    lng: '',
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propose = async () => {
    const latitude = Number(form.lat);
    const longitude = Number(form.lng);
    if (
      form.name.trim().length < 2 ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !form.lat ||
      !form.lng
    ) {
      setError('Enter a name and the latitude and longitude of the point.');
      return;
    }
    if (form.reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters (for example, the source you used).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.proposeSafePoint({
        name: form.name.trim(),
        kind: form.kind as SafePointView['kind'],
        latitude,
        longitude,
        reason: form.reason.trim(),
      });
      setForm({ name: '', kind: 'ASSEMBLY_POINT', lat: '', lng: '', reason: '' });
      setDone('Proposed. A second administrator must approve it before it is used.');
      points.reload();
    } catch (reason) {
      setError(describeAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="as-stack">
      <StatusBanner tone="info" title="The app never invents safe destinations">
        {TWO_PERSON}
      </StatusBanner>
      {done && <StatusBanner tone="ok">{done}</StatusBanner>}
      <Surface
        title="Propose a safe point"
        description="Assembly points, shelters and exits confirmed by the institution."
      >
        <div className="as-admin-filters">
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <label className="ds-field">
            <span className="ds-field__label">Kind</span>
            <select
              className="ds-input"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="ASSEMBLY_POINT">Assembly point</option>
              <option value="SHELTER">Shelter</option>
              <option value="EXIT">Exit</option>
            </select>
          </label>
          <TextField
            label="Latitude"
            inputMode="decimal"
            value={form.lat}
            onChange={(e) => setForm({ ...form, lat: e.target.value })}
          />
          <TextField
            label="Longitude"
            inputMode="decimal"
            value={form.lng}
            onChange={(e) => setForm({ ...form, lng: e.target.value })}
          />
          <TextField
            label="Reason / source"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <FormError>{error}</FormError>
        <Button loading={busy} onClick={() => void propose()}>
          Propose safe point
        </Button>
      </Surface>
      <Surface title="Safe points">
        {points.loading && !points.data ? (
          <Skeleton lines={3} label="safe points" />
        ) : points.error && !points.data ? (
          <ErrorState
            title="Could not load safe points"
            message={describeAuthError(points.error)}
            onRetry={points.reload}
          />
        ) : points.data && points.data.items.length === 0 ? (
          <EmptyState icon="pin" title="No safe points yet" />
        ) : (
          <ul className="as-user-list">
            {points.data?.items.map((p) => (
              <li key={p.id} className="as-user">
                <div className="as-user__head">
                  <div>
                    <p className="as-user__name">{p.name}</p>
                    <p className="as-small as-muted">
                      {p.kind.replace(/_/g, ' ').toLowerCase()} · {p.latitude.toFixed(5)},{' '}
                      {p.longitude.toFixed(5)}
                      {p.proposedBy === user.id ? ' · proposed by you' : ''}
                    </p>
                  </div>
                  <Pill tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status.toLowerCase()}</Pill>
                </div>
                {p.reviewedAt && (
                  <p className="as-small as-muted">Reviewed {formatWhen(p.reviewedAt)}</p>
                )}
                <div className="as-row">
                  {p.status === 'PROPOSED' && (
                    <Button
                      size="sm"
                      onClick={() => setReview({ kind: 'point', item: p, decision: 'APPROVE' })}
                    >
                      Approve
                    </Button>
                  )}
                  {p.status !== 'RETIRED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReview({ kind: 'point', item: p, decision: 'RETIRE' })}
                    >
                      Retire
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Surface>
      {review && (
        <ReviewSheet
          api={api}
          review={review}
          onClose={() => setReview(null)}
          onDone={(message) => {
            setReview(null);
            setDone(message);
            points.reload();
          }}
        />
      )}
    </div>
  );
}

const EXAMPLE = `{
  "version": "2026-10-survey-1",
  "source": "Site survey by campus estates office",
  "nodes": [{ "id": "gate", "lat": 10.9001, "lng": 76.9002, "label": "Main gate" }, { "id": "lawn", "lat": 10.9010, "lng": 76.9011 }, { "id": "ab1-stair-1", "lat": 10.9012, "lng": 76.9013, "floor": 1 }, { "id": "ab1-stair-0", "lat": 10.9012, "lng": 76.9013, "floor": 0 }],
  "edges": [{ "from": "gate", "to": "lawn", "accessible": true }, { "from": "lawn", "to": "ab1-stair-0" }, { "from": "ab1-stair-1", "to": "ab1-stair-0", "kind": "STAIRS" }]
}`;

/** Campus map data (ADMIN): upload and approve route graphs. */
export function MapDataPage({ api, user }: { api: SahayaApi; user: Me }) {
  const graphs = useAsync(() => api.routeGraphs(), [api]);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);

  const upload = async () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('This is not valid JSON.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.uploadRouteGraph({ ...(parsed as object), reason: reason.trim() });
      setDone(
        `Uploaded route data ${created.version} as a draft. A second administrator must approve it.`,
      );
      setText('');
      setReason('');
      graphs.reload();
    } catch (reason) {
      const problems =
        reason instanceof ApiError &&
        Array.isArray((reason.details as { problems?: string[] } | undefined)?.problems)
          ? (reason.details as { problems: string[] }).problems.join('; ')
          : null;
      setError(problems ?? describeAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="as-stack">
      <StatusBanner tone="info" title="Routes use approved data only">
        {TWO_PERSON} With no approved route data, students and responders see “Navigation
        unavailable”. Community-mapped (OpenStreetMap) paths are never used for routes.
      </StatusBanner>
      {done && <StatusBanner tone="ok">{done}</StatusBanner>}
      <Surface
        title="Upload route data"
        description="A walking network: points (nodes) and the paths that join them (edges). Indoors, give each node a floor (ground = 0) and mark edges between floors as STAIRS, RAMP or LIFT. Lifts are kept on record but never used for evacuation routes."
      >
        <label className="ds-field">
          <span className="ds-field__label">Route graph (JSON)</span>
          <textarea
            className="ds-input as-graph-input"
            value={text}
            placeholder={EXAMPLE}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
        </label>
        <TextField
          label="Reason (kept in the audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError>{error}</FormError>
        <Button loading={busy} onClick={() => void upload()}>
          Upload as draft
        </Button>
      </Surface>
      <Surface title="Route data versions">
        {graphs.loading && !graphs.data ? (
          <Skeleton lines={3} label="route data" />
        ) : graphs.error && !graphs.data ? (
          <ErrorState
            title="Could not load route data"
            message={describeAuthError(graphs.error)}
            onRetry={graphs.reload}
          />
        ) : graphs.data && graphs.data.items.length === 0 ? (
          <EmptyState icon="map" title="No route data uploaded" />
        ) : (
          <ul className="as-user-list">
            {graphs.data?.items.map((g) => (
              <li key={g.id} className="as-user">
                <div className="as-user__head">
                  <div>
                    <p className="as-user__name">Version {g.version}</p>
                    <p className="as-small as-muted">
                      {g.source} · {g.nodeCount} points, {g.edgeCount} paths
                      {g.uploadedBy === user.id ? ' · uploaded by you' : ''}
                    </p>
                  </div>
                  <Pill tone={STATUS_TONE[g.status] ?? 'neutral'}>{g.status.toLowerCase()}</Pill>
                </div>
                <p className="as-small as-muted">
                  Uploaded {formatWhen(g.createdAt)}
                  {g.approvedAt ? ` · approved ${formatWhen(g.approvedAt)}` : ''}
                </p>
                <div className="as-row">
                  {g.status === 'DRAFT' && (
                    <Button
                      size="sm"
                      onClick={() => setReview({ kind: 'graph', item: g, decision: 'APPROVE' })}
                    >
                      Approve
                    </Button>
                  )}
                  {g.status !== 'RETIRED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReview({ kind: 'graph', item: g, decision: 'RETIRE' })}
                    >
                      Retire
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Surface>
      {review && (
        <ReviewSheet
          api={api}
          review={review}
          onClose={() => setReview(null)}
          onDone={(message) => {
            setReview(null);
            setDone(message);
            graphs.reload();
          }}
        />
      )}
    </div>
  );
}
