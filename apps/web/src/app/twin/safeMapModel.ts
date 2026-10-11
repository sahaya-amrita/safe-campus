import type { HazardVerificationStatus } from '@sahaya/contracts';
import {
  projectCoordinate,
  type CampusData,
  type CampusFeature,
} from '../../features/maps/campus-model.ts';
import { featureCentre, projectFeature, type RiskArea } from '../../features/maps/safe-route.ts';
import type { Building, RouteBlock } from '../api/sahaya';

export interface MapIncident {
  id: string;
  type: string;
  verificationStatus: HazardVerificationStatus;
  buildingId: string | null;
  zoneId: string | null;
}

/** An alert that is currently in force, with the server buildings it covers. */
export interface MapAlert {
  id: string;
  title: string;
  buildingIds: readonly string[];
}

const ACTIVE_ALERT = new Set(['AUTHORIZED', 'QUEUED']);
export const isActiveAlert = (status: string) => ACTIVE_ALERT.has(status);

/** Footprint "radius": furthest vertex from the centre, in metres. */
function footprintRadius(feature: CampusFeature, data: CampusData): number {
  const c = featureCentre(feature, data);
  return Math.max(
    ...projectFeature(feature, data).map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])),
  );
}

/**
 * Risk areas for routing and display. Placement is illustrative: each one is
 * drawn around the mapped footprint linked to a (synthetic) server building.
 * - Open incidents: VERIFIED ones are "verified", the rest "reported" (still avoided).
 * - Active alerts: a wider precautionary area around every targeted building.
 * - What-if areas: local practice only, never sent anywhere.
 */
export function buildRiskAreas(
  data: CampusData,
  buildings: readonly Building[],
  incidents: readonly MapIncident[],
  alerts: readonly MapAlert[],
  whatIf: readonly string[],
  blocks: readonly RouteBlock[] = [],
): { risks: RiskArea[]; unplaced: number } {
  const features = new Map(data.features.map((f) => [f.id, f]));
  const featureOf = new Map(buildings.map((b) => [b.id, b.metadata?.mapFeatureId ?? null]));
  const risks: RiskArea[] = [];
  let unplaced = 0;
  const around = (featureId: string | null | undefined, margin: number) => {
    const f = featureId ? features.get(featureId) : undefined;
    if (!f || f.kind !== 'building') return null;
    return {
      centre: featureCentre(f, data),
      radius: Math.max(30, footprintRadius(f, data) + margin),
    };
  };

  for (const i of incidents) {
    if (i.verificationStatus === 'RESOLVED' || i.verificationStatus === 'DISMISSED') continue;
    const area = around(i.buildingId ? featureOf.get(i.buildingId) : null, 15);
    if (!area) {
      unplaced++;
      continue;
    }
    const verified = i.verificationStatus === 'VERIFIED';
    risks.push({
      id: `incident:${i.id}`,
      kind: verified ? 'VERIFIED_INCIDENT' : 'REPORTED_INCIDENT',
      label: `${verified ? 'Verified' : 'Unverified'} incident: ${i.type.toLowerCase().replace(/_/g, ' ')}`,
      ...area,
    });
  }
  for (const a of alerts) {
    let placed = false;
    for (const buildingId of new Set(a.buildingIds)) {
      const area = around(featureOf.get(buildingId), 45);
      if (!area) continue;
      placed = true;
      risks.push({
        id: `alert:${a.id}:${buildingId}`,
        kind: 'ALERT_AREA',
        label: `Alert: ${a.title}`,
        ...area,
      });
    }
    if (!placed) unplaced++;
  }
  for (const b of blocks) {
    if (b.clearedAt) continue;
    risks.push({
      id: `block:${b.id}`,
      kind: 'BLOCKED',
      label: `Blocked by responder: ${b.reason}`,
      centre: projectCoordinate([b.longitude, b.latitude], data.bounds),
      radius: b.radiusM,
    });
  }
  for (const featureId of whatIf) {
    const area = around(featureId, 15);
    if (area)
      risks.push({
        id: `whatif:${featureId}`,
        kind: 'WHAT_IF',
        label: 'Practice hazard (this device only)',
        ...area,
      });
  }
  return { risks, unplaced };
}

export const RISK_STYLE: Record<RiskArea['kind'], { label: string; colour: string }> = {
  VERIFIED_INCIDENT: { label: 'Verified incident', colour: '#b42318' },
  REPORTED_INCIDENT: { label: 'Unverified report', colour: '#d9730d' },
  ALERT_AREA: { label: 'Alert area', colour: '#b7791f' },
  BLOCKED: { label: 'Blocked (responder)', colour: '#3b3b3b' },
  WHAT_IF: { label: 'Practice hazard (local)', colour: '#7a3fa0' },
};
