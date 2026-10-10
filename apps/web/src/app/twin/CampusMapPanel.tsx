import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  featureName,
  parseCampusData,
  projectCoordinate,
  type CampusData,
} from '../../features/maps/campus-model.ts';
import {
  buildWalkGraph,
  featureCentre,
  findSafeRoute,
  formatWalk,
  openGrounds,
  unprojectPoint,
  type Point,
  type SafeDestination,
} from '../../features/maps/safe-route.ts';
import { useKeyForBody } from '../responder/shared';
import type { SahayaApi } from '../api/sahaya';
import { Card, EmptyState, ErrorNotice, Loading, Pill, useAsync, VerificationPill } from '../ui';
import { SafeMap2D } from './SafeMap2D';
import { buildRiskAreas, RISK_STYLE, type MapAlert, type MapIncident } from './safeMapModel';

export type { MapAlert, MapIncident } from './safeMapModel';

const SafeMap3D = lazy(() => import('./SafeMap3D'));

let campusRequest: Promise<CampusData> | null = null;
/** The OSM snapshot is static; fetch and validate it once per page load. */
function loadCampus(): Promise<CampusData> {
  campusRequest ??= fetch(`${import.meta.env.BASE_URL}demo-map/campus-data.json`)
    .then((r) => {
      if (!r.ok) throw new Error('Campus map data is unavailable.');
      return r.json() as Promise<unknown>;
    })
    .then(parseCampusData)
    .catch((error: unknown) => {
      campusRequest = null;
      throw error;
    });
  return campusRequest;
}

type Goal = 'SAFETY' | 'DIRECTIONS';
type TapAction = 'START' | 'DESTINATION' | 'PRACTICE' | 'BLOCK';
type Start =
  { kind: 'BUILDING'; featureId: string } | { kind: 'GPS'; point: Point; accuracy: number };

/**
 * Campus map shared by students and responders. Its job is to answer "where is
 * the risk, and how do I keep away from it?": risk areas from open incidents
 * and active alerts, and the fastest walking route that avoids them. All
 * geometry is community-mapped DEMO data, so every route is labelled as a
 * demonstration and never as an approved evacuation route.
 */
export function CampusMapPanel({
  api,
  incidents,
  alerts,
  canMarkBlocked = false,
}: {
  api: SahayaApi;
  incidents: readonly MapIncident[];
  alerts: readonly MapAlert[];
  /** Responders/admins can mark areas impassable; everyone's routes avoid them. */
  canMarkBlocked?: boolean;
}) {
  const campus = useAsync(() => loadCampus(), []);
  const buildings = useAsync(() => api.buildings(), [api]);
  const blocks = useAsync(() => api.routeBlocks(), [api], 20_000);
  const [pendingBlock, setPendingBlock] = useState<Point | null>(null);
  const [goal, setGoal] = useState<Goal>('SAFETY');
  const [start, setStart] = useState<Start | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [practice, setPractice] = useState<string[]>([]);
  const [tap, setTap] = useState<TapAction>('START');
  const [view, setView] = useState<'2D' | '3D'>('2D');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const data = campus.data ?? null;
  const graph = useMemo(() => (data ? buildWalkGraph(data) : null), [data]);
  const grounds = useMemo(() => (data ? openGrounds(data) : []), [data]);
  const named = useMemo(
    () =>
      data
        ? data.features
            .filter((f) => f.kind === 'building' && f.tags.name)
            .sort((a, b) => featureName(a).localeCompare(featureName(b)))
        : [],
    [data],
  );
  const { risks, unplaced } = useMemo(
    () =>
      data
        ? buildRiskAreas(
            data,
            buildings.data?.items ?? [],
            incidents,
            alerts,
            practice,
            blocks.data?.items ?? [],
          )
        : { risks: [], unplaced: 0 },
    [data, buildings.data, incidents, alerts, practice, blocks.data],
  );

  const startPoint = useMemo<Point | null>(() => {
    if (!data || !start) return null;
    if (start.kind === 'GPS') return start.point;
    const f = data.features.find((x) => x.id === start.featureId);
    return f ? featureCentre(f, data) : null;
  }, [data, start]);

  const destinations = useMemo<SafeDestination[]>(() => {
    if (goal === 'SAFETY') return grounds;
    const f = data && target ? data.features.find((x) => x.id === target) : null;
    return f && data
      ? [{ id: f.id, label: featureName(f), centre: featureCentre(f, data), areaM2: 0 }]
      : [];
  }, [goal, grounds, data, target]);

  const result = useMemo(
    () =>
      graph && startPoint && destinations.length
        ? findSafeRoute(graph, startPoint, risks, destinations)
        : null,
    [graph, startPoint, destinations, risks],
  );
  const route = result?.status === 'ROUTE' ? result : null;

  // A new goal keeps the start; a stale "destination" tap mode would confuse.
  useEffect(() => {
    if (goal === 'SAFETY' && tap === 'DESTINATION') setTap('START');
  }, [goal, tap]);

  const onPick = (featureId: string | null, point?: Point) => {
    if (tap === 'BLOCK') {
      const f = featureId ? data?.features.find((x) => x.id === featureId) : null;
      const at = point ?? (f && data ? featureCentre(f, data) : null);
      if (at) setPendingBlock(at);
      return;
    }
    const f = featureId ? data?.features.find((x) => x.id === featureId) : null;
    if (!featureId || !f || f.kind !== 'building') return;
    if (tap === 'PRACTICE')
      setPractice((p) =>
        p.includes(featureId) ? p.filter((x) => x !== featureId) : [...p, featureId],
      );
    else if (tap === 'DESTINATION') setTarget(featureId);
    else setStart({ kind: 'BUILDING', featureId });
  };

  const locate = () => {
    if (!data) return;
    if (!('geolocation' in navigator)) {
      setGpsError('Location is not available in this browser. Choose a building instead.');
      return;
    }
    setLocating(true);
    setGpsError(null);
    // One reading, used on this device only; it is never sent to the server.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const [w, s, e, n] = data.bounds;
        const { longitude: lon, latitude: lat, accuracy } = pos.coords;
        const margin = 0.003;
        if (lon < w - margin || lon > e + margin || lat < s - margin || lat > n + margin) {
          setGpsError('You appear to be outside the mapped campus. Choose a building instead.');
          return;
        }
        setStart({ kind: 'GPS', point: projectCoordinate([lon, lat], data.bounds), accuracy });
      },
      () => {
        setLocating(false);
        setGpsError('Could not get your location. Choose a building instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const highlight = [
    ...(start?.kind === 'BUILDING' ? [start.featureId] : []),
    ...(goal === 'DIRECTIONS' && target ? [target] : []),
  ];
  const pickHint =
    tap === 'BLOCK'
      ? 'Tap the blocked spot: a path, gate or building.'
      : tap === 'PRACTICE'
        ? 'Tap a building to add or remove a practice hazard.'
        : tap === 'DESTINATION'
          ? 'Tap a building to go there.'
          : 'Tap a building to start from it.';

  return (
    <div className="as-stack">
      <p className="as-notice as-notice--warn" role="note">
        <strong>DEMO map — not for live navigation.</strong> Paths are community-mapped and routes
        are suggestions that avoid known risk areas, not approved evacuation routes. Follow alarms,
        staff and official instructions first.
      </p>

      <Card title="Safe route" icon="map" labelledBy="as-map-route">
        {campus.loading && !data && <Loading label="Loading campus map…" />}
        {Boolean(campus.error) && <ErrorNotice error={campus.error} onRetry={campus.reload} />}
        {data && graph && (
          <div className="as-saferoute">
            <div className="as-seg" role="group" aria-label="What do you need?">
              <button
                type="button"
                aria-pressed={goal === 'SAFETY'}
                onClick={() => setGoal('SAFETY')}
              >
                Get to open ground
              </button>
              <button
                type="button"
                aria-pressed={goal === 'DIRECTIONS'}
                onClick={() => setGoal('DIRECTIONS')}
              >
                Directions
              </button>
            </div>

            <div className="as-saferoute__fields">
              <label className="as-field">
                From
                <select
                  className="as-select"
                  value={start?.kind === 'BUILDING' ? start.featureId : start ? 'gps' : ''}
                  onChange={(e) =>
                    e.target.value &&
                    e.target.value !== 'gps' &&
                    setStart({ kind: 'BUILDING', featureId: e.target.value })
                  }
                >
                  <option value="">Choose where you are…</option>
                  {start?.kind === 'GPS' && (
                    <option value="gps">My location (±{Math.round(start.accuracy)} m)</option>
                  )}
                  {start?.kind === 'BUILDING' && !named.some((f) => f.id === start.featureId) && (
                    <option value={start.featureId}>Selected on map</option>
                  )}
                  {named.map((f) => (
                    <option key={f.id} value={f.id}>
                      {featureName(f)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="as-btn as-btn--ghost"
                onClick={locate}
                disabled={locating}
              >
                {locating ? 'Locating…' : 'Use my location'}
              </button>
              {goal === 'DIRECTIONS' && (
                <label className="as-field">
                  To
                  <select
                    className="as-select"
                    value={target ?? ''}
                    onChange={(e) => setTarget(e.target.value || null)}
                  >
                    <option value="">Choose a building…</option>
                    {target && !named.some((f) => f.id === target) && (
                      <option value={target}>Selected on map</option>
                    )}
                    {named.map((f) => (
                      <option key={f.id} value={f.id}>
                        {featureName(f)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {gpsError && (
              <p className="as-small as-muted" role="status">
                {gpsError}
              </p>
            )}
            {start?.kind === 'GPS' && (
              <p className="as-small as-muted">
                Your location stays on this phone. It is not sent to anyone.
              </p>
            )}

            <div className="as-row as-row--between as-saferoute__bar">
              <div className="as-seg as-seg--sm" role="group" aria-label="Tapping the map sets">
                <button
                  type="button"
                  aria-pressed={tap === 'START'}
                  onClick={() => setTap('START')}
                >
                  Tap: start
                </button>
                {goal === 'DIRECTIONS' && (
                  <button
                    type="button"
                    aria-pressed={tap === 'DESTINATION'}
                    onClick={() => setTap('DESTINATION')}
                  >
                    Tap: destination
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={tap === 'PRACTICE'}
                  onClick={() => setTap('PRACTICE')}
                >
                  Tap: practice hazard
                </button>
                {canMarkBlocked && (
                  <button
                    type="button"
                    aria-pressed={tap === 'BLOCK'}
                    onClick={() => setTap('BLOCK')}
                  >
                    Tap: mark blocked
                  </button>
                )}
              </div>
              <div className="as-seg as-seg--sm" role="group" aria-label="Map view">
                <button type="button" aria-pressed={view === '2D'} onClick={() => setView('2D')}>
                  2D
                </button>
                <button type="button" aria-pressed={view === '3D'} onClick={() => setView('3D')}>
                  3D
                </button>
              </div>
            </div>

            {view === '2D' ? (
              <SafeMap2D
                data={data}
                risks={risks}
                route={route?.path ?? null}
                start={startPoint}
                destination={route?.destination ?? null}
                grounds={goal === 'SAFETY' ? grounds : []}
                highlight={highlight}
                onPick={onPick}
                pickHint={pickHint}
              />
            ) : (
              <Suspense fallback={<Loading label="Loading 3D view…" />}>
                <SafeMap3D
                  data={data}
                  risks={risks}
                  route={route?.path ?? null}
                  start={startPoint}
                  destination={route?.destination ?? null}
                  highlight={highlight[0] ?? null}
                  onPick={onPick}
                />
              </Suspense>
            )}

            {pendingBlock && data && (
              <BlockForm
                api={api}
                point={pendingBlock}
                bounds={data.bounds}
                onCancel={() => setPendingBlock(null)}
                onSaved={() => {
                  setPendingBlock(null);
                  blocks.reload();
                }}
              />
            )}

            <ul className="as-saferoute__legend" aria-label="Map legend">
              <li>
                <i className="as-key as-key--route" /> Suggested route
              </li>
              {goal === 'SAFETY' && (
                <li>
                  <i className="as-key as-key--ground" /> Open ground (not a designated assembly
                  point)
                </li>
              )}
              {(Object.keys(RISK_STYLE) as (keyof typeof RISK_STYLE)[]).map((k) => (
                <li key={k}>
                  <i
                    className={`as-key as-key--risk${k === 'VERIFIED_INCIDENT' ? '' : ' as-key--dashed'}`}
                    style={{ color: RISK_STYLE[k].colour }}
                  />{' '}
                  {RISK_STYLE[k].label}
                </li>
              ))}
            </ul>

            <RouteSummary
              hasStart={Boolean(startPoint)}
              needsTarget={goal === 'DIRECTIONS' && !target}
              result={result}
              goal={goal}
              riskCount={risks.length}
            />
          </div>
        )}
      </Card>

      <Card title={`Risk areas (${risks.length})`} icon="alert" labelledBy="as-map-risks">
        {risks.length === 0 ? (
          <EmptyState title="No risk areas are shown to you right now.">
            <p>
              This only reflects what the server shares with your account. It does not mean an area
              is safe.
            </p>
          </EmptyState>
        ) : (
          <ul className="as-list">
            {risks.map((r) => (
              <li key={r.id} className="as-item">
                <span className="as-row as-row--between">
                  <span className="as-item__title">{r.label}</span>
                  <Pill
                    tone={
                      r.kind === 'VERIFIED_INCIDENT' || r.kind === 'BLOCKED'
                        ? 'danger'
                        : r.kind === 'WHAT_IF'
                          ? 'neutral'
                          : 'warn'
                    }
                  >
                    {RISK_STYLE[r.kind].label}
                  </Pill>
                </span>
                {r.kind === 'BLOCKED' && canMarkBlocked && (
                  <ClearBlock
                    api={api}
                    id={r.id.replace(/^block:/, '')}
                    onCleared={blocks.reload}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {practice.length > 0 && (
          <button
            type="button"
            className="as-btn as-btn--ghost as-btn--sm"
            onClick={() => setPractice([])}
          >
            Clear practice hazards
          </button>
        )}
        {unplaced > 0 && (
          <p className="as-muted as-small">
            {unplaced} incident(s) or alert(s) have no mapped building and are not drawn.
          </p>
        )}
        <p className="as-muted as-small">
          Areas are drawn around the mapped building linked to each record. They are illustrative,
          not measured hazard boundaries.
        </p>
      </Card>

      <ServerBuildings api={api} incidents={incidents} buildings={buildings} />
    </div>
  );
}

function RouteSummary({
  hasStart,
  needsTarget,
  result,
  goal,
  riskCount,
}: {
  hasStart: boolean;
  needsTarget: boolean;
  result: ReturnType<typeof findSafeRoute> | null;
  goal: Goal;
  riskCount: number;
}) {
  if (!hasStart)
    return (
      <p className="as-muted">
        Choose where you are, use your location, or tap a building on the map.
      </p>
    );
  if (needsTarget) return <p className="as-muted">Choose a building to go to.</p>;
  if (!result) return null;
  if (result.status === 'NO_ROUTE')
    return (
      <div className="as-notice as-notice--danger" role="alert">
        <strong>
          {result.reason === 'NO_PATH_NETWORK'
            ? 'No mapped paths are available.'
            : goal === 'DIRECTIONS'
              ? 'That building is inside or beside a risk area, or cannot be reached without passing through one.'
              : 'No route avoids every risk area.'}
        </strong>{' '}
        Move away from the hazard, follow staff instructions, and call security or{' '}
        <a href="tel:112">112</a> if anyone is in danger.
      </div>
    );
  return (
    <section className="as-routecard" aria-live="polite" aria-label="Suggested route">
      <header className="as-routecard__head">
        <div>
          <p className="as-routecard__kicker">
            {goal === 'SAFETY' ? 'Nearest open ground' : 'Directions'}
          </p>
          <h3 className="as-routecard__title">{result.destination.label}</h3>
        </div>
        <div className="as-routecard__eta">
          <strong>{Math.round(result.distanceM)} m</strong>
          <span>{formatWalk(result.walkSeconds)}</span>
        </div>
      </header>
      <div className="as-row">
        <Pill tone="warn">DEMO route · not approved</Pill>
        {riskCount > 0 && (
          <Pill tone="ok">
            Avoids {riskCount} risk area{riskCount === 1 ? '' : 's'}
          </Pill>
        )}
        {result.nearRisk && <Pill tone="warn">Passes near a risk area</Pill>}
      </div>
      {result.startsInRisk && (
        <p className="as-notice as-notice--danger" role="alert">
          You are inside a risk area. Leave by the nearest safe exit first and follow staff.
        </p>
      )}
      <ol className="as-routecard__steps">
        {result.steps.map((s, i) => (
          <li key={i}>
            <span>{s.instruction}</span>
            {s.distanceM > 0 && <span className="as-muted">{s.distanceM} m</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Server-side building/zone records (synthetic DEMO data) for staff reference. */
function ServerBuildings({
  api,
  incidents,
  buildings,
}: {
  api: SahayaApi;
  incidents: readonly MapIncident[];
  buildings: ReturnType<typeof useAsync<Awaited<ReturnType<SahayaApi['buildings']>>>>;
}) {
  const [open, setOpen] = useState(false);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const list = buildings.data?.items ?? [];
  const active = buildingId ?? list[0]?.id ?? null;
  const detail = useAsync(open && active ? () => api.buildingMap(active) : null, [
    api,
    active,
    open,
  ]);
  const live = incidents.filter(
    (i) => i.verificationStatus !== 'RESOLVED' && i.verificationStatus !== 'DISMISSED',
  );
  return (
    <details className="as-card as-details" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Building records and incidents ({live.length} open)</summary>
      {buildings.loading && !buildings.data && <Loading />}
      {Boolean(buildings.error) && (
        <ErrorNotice error={buildings.error} onRetry={buildings.reload} />
      )}
      {list.length > 0 && (
        <label className="as-field">
          Building
          <select
            className="as-select"
            value={active ?? ''}
            onChange={(e) => setBuildingId(e.target.value)}
          >
            {list.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {detail.data && (
        <div className="as-row">
          <Pill tone={detail.data.geometryApproved ? 'ok' : 'warn'}>
            {detail.data.geometryApproved ? 'Geometry approved' : 'Geometry NOT approved'}
          </Pill>
          {detail.data.metadata?.synthetic && <Pill tone="info">Synthetic DEMO building</Pill>}
          <span className="as-muted as-small">
            {detail.data.floors.reduce((n, f) => n + f.zones.length, 0)} zone(s)
          </span>
        </div>
      )}
      {live.length > 0 && (
        <ul className="as-list">
          {live.map((i) => (
            <li key={i.id} className="as-item">
              <span className="as-row as-row--between">
                <span className="as-item__title">{i.type}</span>
                <VerificationPill status={i.verificationStatus} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Responder form: record a blocked area at the tapped point (audited on the server). */
function BlockForm({
  api,
  point,
  bounds,
  onCancel,
  onSaved,
}: {
  api: SahayaApi;
  point: Point;
  bounds: CampusData['bounds'];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [radius, setRadius] = useState(20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const keyFor = useKeyForBody();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const [longitude, latitude] = unprojectPoint(point, bounds);
    const input = { longitude, latitude, radiusM: radius, reason: reason.trim() };
    setSaving(true);
    setError(null);
    api
      .createRouteBlock(input, keyFor(input))
      .then(onSaved, setError)
      .finally(() => setSaving(false));
  };
  return (
    <form className="as-form as-blockform" onSubmit={submit} aria-label="Mark blocked area">
      <p className="as-small">
        <strong>Mark this spot as blocked.</strong> Everyone's routes will avoid it until a
        responder clears it. The action is recorded in the audit log.
      </p>
      <label className="as-field">
        What is blocked?
        <input
          className="as-input"
          required
          minLength={3}
          maxLength={200}
          value={reason}
          placeholder="e.g. Fallen tree across path"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="as-seg as-seg--sm" role="group" aria-label="Blocked area size">
        {[10, 20, 40, 80].map((m) => (
          <button key={m} type="button" aria-pressed={radius === m} onClick={() => setRadius(m)}>
            {m} m
          </button>
        ))}
      </div>
      {Boolean(error) && <ErrorNotice error={error} />}
      <div className="as-row">
        <button type="submit" className="as-btn" disabled={saving || reason.trim().length < 3}>
          {saving ? 'Saving…' : 'Mark blocked'}
        </button>
        <button type="button" className="as-btn as-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ClearBlock({ api, id, onCleared }: { api: SahayaApi; id: string; onCleared: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <button
        type="button"
        className="as-btn as-btn--ghost as-btn--sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          api
            .clearRouteBlock(id)
            .then(onCleared, setError)
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'Clearing…' : 'Clear block'}
      </button>
      {Boolean(error) && <ErrorNotice error={error} />}
    </>
  );
}
