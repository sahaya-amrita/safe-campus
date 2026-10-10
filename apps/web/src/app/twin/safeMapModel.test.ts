import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCampusData } from '../../features/maps/campus-model.ts';
import type { Building } from '../api/sahaya';
import { buildRiskAreas, isActiveAlert, type MapIncident } from './safeMapModel';

const data = parseCampusData(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/demo-map/campus-data.json'), 'utf8')),
);
const building = (id: string, mapFeatureId?: string): Building => ({
  id,
  name: id,
  mode: 'DEMO',
  geometryVersion: null,
  geometryApproved: false,
  metadata: mapFeatureId ? { synthetic: true, mapFeatureId } : null,
});
const buildings = [
  building('b-lib', 'way/380702790'),
  building('b-hostel', 'way/380702791'),
  building('b-none'),
];
const incident = (over: Partial<MapIncident>): MapIncident => ({
  id: 'i1',
  type: 'SMOKE_OR_FIRE',
  verificationStatus: 'REPORTED',
  buildingId: 'b-lib',
  zoneId: null,
  ...over,
});

describe('buildRiskAreas', () => {
  it('places open incidents on their linked footprint and labels verification honestly', () => {
    const { risks } = buildRiskAreas(
      data,
      buildings,
      [
        incident({}),
        incident({ id: 'i2', verificationStatus: 'VERIFIED', buildingId: 'b-hostel' }),
      ],
      [],
      [],
    );
    expect(risks.map((r) => [r.kind, r.label])).toEqual([
      ['REPORTED_INCIDENT', 'Unverified incident: smoke or fire'],
      ['VERIFIED_INCIDENT', 'Verified incident: smoke or fire'],
    ]);
    expect(risks.every((r) => r.radius >= 30)).toBe(true);
  });

  it('skips resolved or dismissed incidents and counts unplaceable records', () => {
    const { risks, unplaced } = buildRiskAreas(
      data,
      buildings,
      [
        incident({ verificationStatus: 'RESOLVED' }),
        incident({ id: 'i2', verificationStatus: 'DISMISSED' }),
        incident({ id: 'i3', buildingId: 'b-none' }),
        incident({ id: 'i4', buildingId: null }),
      ],
      [{ id: 'a1', title: 'Nowhere', buildingIds: ['b-none'] }],
      [],
    );
    expect(risks).toEqual([]);
    expect(unplaced).toBe(3);
  });

  it('draws a wider area for alerts than for the incident itself', () => {
    const { risks } = buildRiskAreas(
      data,
      buildings,
      [incident({})],
      [{ id: 'a1', title: 'Smoke near library', buildingIds: ['b-lib', 'b-lib'] }],
      [],
    );
    const alert = risks.filter((r) => r.kind === 'ALERT_AREA');
    expect(alert).toHaveLength(1);
    expect(alert[0]!.radius).toBeGreaterThan(risks[0]!.radius);
    expect(alert[0]!.label).toBe('Alert: Smoke near library');
  });

  it('adds local practice hazards on any building footprint only', () => {
    const { risks } = buildRiskAreas(data, buildings, [], [], ['way/380925364', 'way/128964693']);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      kind: 'WHAT_IF',
      label: 'Practice hazard (this device only)',
    });
  });
});

describe('isActiveAlert', () => {
  it('treats only authorised or queued alerts as in force', () => {
    expect(
      ['DRAFT', 'AUTHORIZED', 'QUEUED', 'CANCELLED', 'ALL_CLEAR'].filter(isActiveAlert),
    ).toEqual(['AUTHORIZED', 'QUEUED']);
  });
});
