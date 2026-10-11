import { lazy, Suspense, useMemo, useState, type FormEvent } from 'react';
import {
  featureName,
  parseCampusData,
  projectCoordinate,
  type CampusData,
} from '../../features/maps/campus-model.ts';
import {
  featureCentre,
  formatWalk,
  unprojectPoint,
  type Point,
  type SafeDestination,
} from '../../features/maps/safe-route.ts';
import type { FloorChangeView, RouteResponse } from '@sahaya/contracts';
import { ApiError } from '../api/client';
import { StatusBanner } from '../../design-system';
import { useKeyForBody } from '../responder/shared';
import type { SahayaApi } from '../api/sahaya';
import { Card, EmptyState, ErrorNotice, Loading, Pill, useAsync, VerificationPill } from '../ui';
import { useTourTarget } from '../../components/tom';
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

type TapAction = 'START' | 'PRACTICE' | 'BLOCK';
type Start =
  { kind: 'BUILDING'; featureId: string } | { kind: 'GPS'; point: Point; accuracy: number };

/**
 * Campus map shared by students and responders: risk areas from open
 * incidents and active alerts, and responder-marked blocked spots.
 *
 * Routes (Phase 5) come only from the server, computed over an APPROVED route
 * graph to an APPROVED safe point (two-person approval), avoiding blocked
 * spots. With no approved data the map says "Navigation unavailable" and draws
 * no route: community-mapped paths are never used for guidance.
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
  const mapTarget = useTourTarget('map.panel');
  const campus = useAsync(() => loadCampus(), []);
  const buildings = useAsync(() => api.buildings(), [api]);
  const blocks = useAsync(() => api.routeBlocks(), [api], 20_000);
  const [pendingBlock, setPendingBlock] = useState<Point | null>(null);
  const [start, setStart] = useState<Start | null>(null);
  const [safePointId, setSafePointId] = useState<string | null>(null);
  const [stepFree, setStepFree] = useState(false);
  /** Floor the person is on; null when outdoors or not chosen. */
  const [floor, setFloor] = useState<number | null>(null);
  const nav = useAsync(() => api.navigationStatus(), [api], 60_000);
  const [practice, setPractice] = useState<string[]>([]);
  const [tap, setTap] = useState<TapAction>('START');
  const [view, setView] = useState<'2D' | '3D'>('2D');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const data = campus.data ?? null;
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

  const available = nav.data?.available === true;
  const safePoint = nav.data?.safePoints.find((p) => p.id === safePointId) ?? null;
  const startLngLat = data && startPoint ? unprojectPoint(startPoint, data.bounds) : null;
  const routeQuery = useAsync<RouteResponse>(
    available && startLngLat && safePointId
      ? () =>
          api.navigationRoute({
            fromLat: startLngLat[1],
            fromLng: startLngLat[0],
            safePointId,
            accessible: stepFree,
            fromFloor: floor,
          })
      : null,
    [api, available, startLngLat?.[0], startLngLat?.[1], safePointId, stepFree, floor, blocks.data],
  );
  const route = routeQuery.data && available && startLngLat && safePointId ? routeQuery.data : null;
  const routePath = useMemo<Point[] | null>(
    () =>
      route && data ? route.path.map((p) => projectCoordinate([p.lng, p.lat], data.bounds)) : null,
    [route, data],
  );
  const destination = useMemo<SafeDestination | null>(
    () =>
      safePoint && data
        ? {
            id: safePoint.id,
            label: safePoint.name,
            centre: projectCoordinate([safePoint.longitude, safePoint.latitude], data.bounds),
            areaM2: 0,
          }
        : null,
    [safePoint, data],
  );

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

  const highlight = start?.kind === 'BUILDING' ? [start.featureId] : [];
  const pickHint =
    tap === 'BLOCK'
      ? 'Tap the blocked spot: a path, gate or building.'
      : tap === 'PRACTICE'
        ? 'Tap a building to add or remove a practice hazard.'
        : 'Tap a building to start from it.';

  return (
    <div className="as-stack">
      <p className="as-notice as-notice--warn" role="note">
        <strong>DEMO map and practice routes.</strong> Paths are community-mapped and not verified;
        practice points are not official assembly points. Follow alarms, staff and official
        instructions first.
      </p>

      <div ref={mapTarget}>
        <Card title="Route to a safe point" icon="map" labelledBy="as-map-route">
          {campus.loading && !data && <Loading label="Loading campus map…" />}
          {Boolean(campus.error) && <ErrorNotice error={campus.error} onRetry={campus.reload} />}
          {data && (
            <div className="as-saferoute">
              {nav.data && !available && (
                <StatusBanner tone="warn" title="Navigation unavailable">
                  {nav.data.reason ? `Reason: ${nav.data.reason} ` : ''}No route is drawn without
                  approved route data. Follow alarms, staff and signs. The map still shows risk
                  areas and blocked spots.
                </StatusBanner>
              )}
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
                {available && (
                  <label className="as-field">
                    To an approved safe point
                    <select
                      className="as-select"
                      value={safePointId ?? ''}
                      onChange={(e) => setSafePointId(e.target.value || null)}
                    >
                      <option value="">Choose a safe point…</option>
                      {nav.data?.safePoints.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.kind.replace(/_/g, ' ').toLowerCase()})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {available && (
                  <label className="as-field">
                    Which floor are you on?
                    <select
                      className="as-select"
                      value={floor === null ? '' : String(floor)}
                      onChange={(e) =>
                        setFloor(e.target.value === '' ? null : Number(e.target.value))
                      }
                    >
                      <option value="">Outdoors, or not in a building</option>
                      {FLOOR_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {floorName(f, true)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {available && (
                  <label className="as-check">
                    <input
                      type="checkbox"
                      checked={stepFree}
                      onChange={(e) => setStepFree(e.target.checked)}
                    />
                    Step-free route only
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
                  route={routePath}
                  start={startPoint}
                  destination={destination}
                  grounds={[]}
                  highlight={highlight}
                  onPick={onPick}
                  pickHint={pickHint}
                />
              ) : (
                <Suspense fallback={<Loading label="Loading 3D view…" />}>
                  <SafeMap3D
                    data={data}
                    risks={risks}
                    route={routePath}
                    start={startPoint}
                    destination={destination}
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
                  <i className="as-key as-key--route" />{' '}
                  {route?.practice ? 'DEMO practice route' : 'Approved route'}
                </li>
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

              {available && (
                <RouteSummary
                  hasStart={Boolean(startPoint)}
                  hasTarget={Boolean(safePointId)}
                  loading={routeQuery.loading}
                  error={routeQuery.error}
                  route={route}
                  stepFree={stepFree}
                />
              )}
            </div>
          )}
        </Card>
      </div>

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

const FLOOR_OPTIONS = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Plain floor name: "ground floor", "floor 2", "basement level 1". */
export function floorName(floor: number, capital = false): string {
  const name =
    floor === 0 ? 'ground floor' : floor < 0 ? `basement level ${-floor}` : `floor ${floor}`;
  return capital ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

/**
 * Turns the server's floor changes into plain steps, merging consecutive
 * flights in the same direction ("Take the stairs down from floor 3 to the
 * ground floor"). Lifts never appear: the server never routes through them.
 */
export function describeFloorChanges(changes: readonly FloorChangeView[]): string[] {
  const place = (f: number) => (f === 0 ? 'the ground floor' : floorName(f));
  const merged: FloorChangeView[] = [];
  for (const c of changes) {
    const last = merged[merged.length - 1];
    const sameWay =
      last &&
      last.via === c.via &&
      last.to === c.from &&
      Math.sign(last.to - last.from) === Math.sign(c.to - c.from);
    if (last && sameWay) merged[merged.length - 1] = { ...last, to: c.to };
    else merged.push({ ...c });
  }
  return merged.map((c) => {
    const way = c.to < c.from ? 'down' : 'up';
    const via = c.via === 'RAMP' ? 'ramp' : 'stairs';
    return `Take the ${via} ${way} from ${place(c.from)} to ${place(c.to)}.`;
  });
}

function RouteSummary({
  hasStart,
  hasTarget,
  loading,
  error,
  route,
  stepFree = false,
}: {
  hasStart: boolean;
  hasTarget: boolean;
  loading: boolean;
  error: unknown;
  route: RouteResponse | null;
  stepFree?: boolean;
}) {
  if (!hasStart)
    return (
      <p className="as-muted">
        Choose where you are, use your location, or tap a building on the map.
      </p>
    );
  if (!hasTarget) return <p className="as-muted">Choose an approved safe point.</p>;
  if (loading && !route) return <Loading label="Finding the approved route…" />;
  if (error && !route) {
    const code = error instanceof ApiError ? error.code : '';
    return (
      <div className="as-notice as-notice--danger" role="alert">
        <strong>
          {code === 'NO_ROUTE' && stepFree
            ? 'No step-free approved route is available. Lifts are not used in an evacuation: use Help now so responders know where you are.'
            : code === 'NO_ROUTE'
              ? 'No approved route avoids the blocked areas.'
              : code === 'START_OFF_NETWORK'
                ? 'You are too far from any approved route on this floor.'
                : code === 'NAVIGATION_UNAVAILABLE'
                  ? 'Navigation is unavailable for this safe point.'
                  : 'The route could not be loaded.'}
        </strong>{' '}
        Follow staff and signs, and call security or <a href="tel:112">112</a> if anyone is in
        danger.
      </div>
    );
  }
  if (!route) return null;
  return (
    <section className="as-routecard" aria-live="polite" aria-label="Approved route">
      <header className="as-routecard__head">
        <div>
          <p className="as-routecard__kicker">
            {route.practice
              ? 'practice point'
              : route.safePoint.kind.replace(/_/g, ' ').toLowerCase()}
          </p>
          <h3 className="as-routecard__title">{route.safePoint.name}</h3>
        </div>
        <div className="as-routecard__eta">
          <strong>{route.distanceM} m</strong>
          <span>{formatWalk(route.walkSeconds)}</span>
        </div>
      </header>
      <div className="as-row">
        {route.practice ? (
          <Pill tone="warn">DEMO practice route · not verified</Pill>
        ) : (
          <Pill tone="ok">Approved route data · version {route.graphVersion}</Pill>
        )}
        {route.blocksAvoided > 0 && (
          <Pill tone="info">
            Avoids {route.blocksAvoided} blocked spot{route.blocksAvoided === 1 ? '' : 's'}
          </Pill>
        )}
      </div>
      {route.floorChanges.length > 0 && (
        <ol className="as-routecard__steps" aria-label="Floor changes">
          {describeFloorChanges(route.floorChanges).map((step, i) => (
            <li key={i}>{step}</li>
          ))}
          <li>Do not use lifts.</li>
        </ol>
      )}
      <p className="as-small as-muted">{route.note}</p>
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
