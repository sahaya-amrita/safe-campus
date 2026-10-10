import { useMemo } from 'react';
import { CampusMapPanel, type MapIncident } from '../twin/CampusMapPanel';
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

  return (
    <>
      <h1 className="as-screen-title">Campus map</h1>
      {s.api ? (
        <CampusMapPanel api={s.api} incidents={incidents} />
      ) : (
        <EmptyState icon="map" title="The map needs a signed-in API session." />
      )}
      <p className="as-muted as-small">
        Students see incidents they reported. Alerts about other incidents appear in the Alerts tab.
      </p>
    </>
  );
}
