import { useMemo } from 'react';
import { CampusMapPanel, type MapAlert, type MapIncident } from '../twin/CampusMapPanel';
import { isActiveAlert } from '../twin/safeMapModel';
import { EmptyState } from '../ui';
import { useStudent } from './core';

export function MapScreen() {
  const s = useStudent();
  const incidents = useMemo<MapIncident[]>(() => {
    const own = s.incidents?.data?.items ?? [];
    return own.map((i) => ({
      id: i.id,
      type: i.type,
      verificationStatus: i.verificationStatus,
      buildingId: i.buildingId,
      zoneId: i.zoneId,
    }));
  }, [s.incidents?.data]);
  const alerts = useMemo<MapAlert[]>(
    () =>
      (s.inbox?.data?.items ?? [])
        .filter((a) => isActiveAlert(a.alertStatus))
        .map((a) => ({
          id: a.id,
          title: a.title,
          buildingIds: [
            ...(a.areaBuildingIds ?? []),
            ...(a.incidentBuildingId ? [a.incidentBuildingId] : []),
          ],
        })),
    [s.inbox?.data],
  );

  return (
    <>
      <h1 className="as-screen-title">Campus map</h1>
      {s.api ? (
        <CampusMapPanel api={s.api} incidents={incidents} alerts={alerts} />
      ) : (
        <EmptyState icon="map" title="The map needs a signed-in API session." />
      )}
      <p className="as-muted as-small">
        Risk areas come from incidents you reported and alerts sent to you. Details are in the
        Alerts tab.
      </p>
    </>
  );
}
