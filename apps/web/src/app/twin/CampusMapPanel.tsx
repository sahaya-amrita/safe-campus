import { lazy, Suspense, useMemo, useState } from 'react';
import type { HazardVerificationStatus } from '@sahaya/contracts';
import type { Building, SahayaApi } from '../api/sahaya';
import { Card, EmptyState, ErrorNotice, Loading, Pill, useAsync, VerificationPill } from '../ui';
import type { TwinIncident } from './CampusTwin';

const CampusTwin = lazy(() => import('./CampusTwin').then((m) => ({ default: m.CampusTwin })));

export interface MapIncident {
  id: string;
  type: string;
  verificationStatus: HazardVerificationStatus;
  buildingId: string | null;
  zoneId: string | null;
}

/** Places incidents on the OSM footprint linked to their (synthetic) building, if any. */
export function toTwinIncidents(incidents: readonly MapIncident[], buildings: readonly Building[]) {
  const featureFor = new Map(buildings.map((b) => [b.id, b.metadata?.mapFeatureId ?? null]));
  const placed: TwinIncident[] = [];
  let unplaced = 0;
  for (const incident of incidents) {
    if (incident.verificationStatus === 'RESOLVED' || incident.verificationStatus === 'DISMISSED')
      continue;
    const feature = incident.buildingId ? featureFor.get(incident.buildingId) : null;
    if (feature) {
      placed.push({
        id: incident.id,
        buildingFeatureId: feature,
        category: incident.type,
        status: incident.verificationStatus,
      });
    } else {
      unplaced += 1;
    }
  }
  return { placed, unplaced };
}

/**
 * Map tab content shared by students and responders: approval state from
 * GET /maps, building/floor explorer, incident overlay and the 3D twin.
 */
export function CampusMapPanel({
  api,
  incidents,
}: {
  api: SahayaApi;
  incidents: readonly MapIncident[];
}) {
  const buildings = useAsync(() => api.buildings(), [api]);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(false);
  const list = useMemo(() => buildings.data?.items ?? [], [buildings.data]);
  const activeBuilding = buildingId ?? list[0]?.id ?? null;
  const detail = useAsync(activeBuilding ? () => api.buildingMap(activeBuilding) : null, [
    api,
    activeBuilding,
  ]);
  const twin = useMemo(() => toTwinIncidents(incidents, list), [incidents, list]);
  const floor = detail.data?.floors.find((f) => f.id === floorId) ?? detail.data?.floors[0];
  const open = incidents.filter(
    (i) => i.verificationStatus !== 'RESOLVED' && i.verificationStatus !== 'DISMISSED',
  );

  return (
    <div className="as-stack">
      <div className="as-notice as-notice--warn" role="note">
        <strong>DEMO MAP — NOT FOR NAVIGATION.</strong> No institution-approved building geometry,
        evacuation routes, exits, safe zones or assembly points are configured. Follow alarms, staff
        and official instructions.
      </div>

      <Card title="Buildings & floors" icon="layers" labelledBy="as-map-buildings">
        {buildings.loading && !buildings.data && <Loading />}
        {Boolean(buildings.error) && (
          <ErrorNotice error={buildings.error} onRetry={buildings.reload} />
        )}
        {buildings.data && list.length === 0 && (
          <EmptyState title="No buildings are configured on the server." />
        )}
        {list.length > 0 && (
          <>
            <label className="as-field">
              Building
              <select
                className="as-select"
                value={activeBuilding ?? ''}
                onChange={(e) => {
                  setBuildingId(e.target.value);
                  setFloorId(null);
                }}
              >
                {list.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            {detail.loading && !detail.data && <Loading />}
            {Boolean(detail.error) && <ErrorNotice error={detail.error} onRetry={detail.reload} />}
            {detail.data && (
              <>
                <div className="as-row">
                  <Pill tone={detail.data.geometryApproved ? 'ok' : 'warn'}>
                    {detail.data.geometryApproved ? 'Geometry approved' : 'Geometry NOT approved'}
                  </Pill>
                  <Pill tone="neutral">
                    Route guidance:{' '}
                    {detail.data.operationalRoutingAllowed ? 'available' : 'disabled'}
                  </Pill>
                  {detail.data.metadata?.synthetic && (
                    <Pill tone="info">Synthetic DEMO building</Pill>
                  )}
                </div>
                {detail.data.warning && <p className="as-muted">{detail.data.warning}</p>}
                {detail.data.floors.length > 0 && (
                  <div className="as-seg" role="group" aria-label="Floor">
                    {detail.data.floors.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={floor?.id === f.id}
                        onClick={() => setFloorId(f.id)}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
                {floor && (
                  <ul className="as-list" aria-label={`Zones on ${floor.name}`}>
                    {floor.zones.map((z) => {
                      const here = open.filter((i) => i.zoneId === z.id);
                      return (
                        <li key={z.id} className="as-item">
                          <div className="as-row as-row--between">
                            <span className="as-item__title">
                              {z.name} <span className="as-muted">({z.zoneCode})</span>
                            </span>
                            {here.length > 0 ? (
                              <Pill tone="danger">
                                {here.length} open incident{here.length === 1 ? '' : 's'}
                              </Pill>
                            ) : (
                              <Pill tone="neutral">No incident recorded</Pill>
                            )}
                          </div>
                          <span className="as-muted as-small">
                            Safe-zone status: not designated (no approved data). “No incident
                            recorded” does not mean the area is safe.
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </Card>

      <Card title="Incident overlay" icon="alert" labelledBy="as-map-incidents">
        {open.length === 0 ? (
          <EmptyState title="No open incidents visible to you.">
            <p>This only reflects what the server shares with your account.</p>
          </EmptyState>
        ) : (
          <ul className="as-list">
            {open.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className={`as-item as-item--button${selectedIncident === i.id ? ' as-item--active' : ''}`}
                  onClick={() => {
                    setSelectedIncident(i.id);
                    setShow3d(true);
                  }}
                >
                  <span className="as-row as-row--between">
                    <span className="as-item__title">{i.type}</span>
                    <VerificationPill status={i.verificationStatus} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {twin.unplaced > 0 && (
          <p className="as-muted as-small">
            {twin.unplaced} incident(s) have no mapped building and are not drawn.
          </p>
        )}
        <p className="as-muted as-small">
          Circles are illustrative placements on mapped footprints, not validated hazard boundaries.
        </p>
      </Card>

      <Card
        title="3D campus digital twin"
        icon="map"
        labelledBy="as-map-twin"
        action={
          <button
            type="button"
            className="as-btn as-btn--ghost as-btn--sm"
            onClick={() => setShow3d((v) => !v)}
            aria-expanded={show3d}
          >
            {show3d ? 'Hide 3D' : 'Open 3D view'}
          </button>
        }
      >
        <p className="as-muted">
          OpenStreetMap footprints of the Ettimadai campus, stylised and unverified. Loads about 1
          MB of 3D code on first open.
        </p>
        {show3d && (
          <Suspense fallback={<Loading label="Loading 3D module…" />}>
            <CampusTwin incidents={twin.placed} selectedId={selectedIncident} />
          </Suspense>
        )}
      </Card>
    </div>
  );
}
