import { describe, expect, it } from 'vitest';
import type { Incident } from '../api/sahaya';
import { DEFAULT_FILTER, applyIncidentFilter, incidentTypes } from './incidentFilters';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const incident = (over: Partial<Incident>): Incident => ({
  id: 'id',
  type: 'SMOKE_OR_FIRE',
  description: 'Synthetic',
  priority: 'HIGH',
  verificationStatus: 'REPORTED',
  mode: 'DEMO',
  buildingId: 'b1',
  floorId: 'f1',
  zoneId: null,
  reporterId: 'r',
  serverReceivedAt: hoursAgo(1),
  createdAt: hoursAgo(1),
  level: 1,
  ...over,
});

const items = [
  incident({ id: 'a-fire-l1', serverReceivedAt: hoursAgo(30) }),
  incident({ id: 'b-fire-l2', level: 2, serverReceivedAt: hoursAgo(2), floorId: 'f4' }),
  incident({
    id: 'c-medical-l3',
    type: 'MEDICAL',
    level: 3,
    verificationStatus: 'VERIFIED',
    buildingId: 'b2',
  }),
  incident({ id: 'd-closed', verificationStatus: 'RESOLVED', level: null }),
  incident({
    id: 'e-dup',
    verificationStatus: 'DISMISSED',
    level: null,
    description: 'Duplicate of a-fire',
  }),
];
const ids = (f: Partial<typeof DEFAULT_FILTER>) =>
  applyIncidentFilter(items, { ...DEFAULT_FILTER, ...f }, NOW).map((i) => i.id);

describe('applyIncidentFilter', () => {
  it('shows open reports by default, highest level first', () => {
    expect(ids({})).toEqual(['c-medical-l3', 'b-fire-l2', 'a-fire-l1']);
  });

  it('filters by status, type, level, building and floor', () => {
    expect(ids({ status: 'ALL', sort: 'NEWEST' })).toHaveLength(5);
    expect(ids({ status: 'DISMISSED' })).toEqual(['e-dup']);
    expect(ids({ type: 'MEDICAL' })).toEqual(['c-medical-l3']);
    expect(ids({ level: '2' })).toEqual(['b-fire-l2']);
    expect(ids({ buildingId: 'b2' })).toEqual(['c-medical-l3']);
    // A fourth-floor report shows on that floor only, not for the whole building.
    expect(ids({ buildingId: 'b1', floorId: 'f4' })).toEqual(['b-fire-l2']);
  });

  it('limits by time window and sorts by time', () => {
    expect(ids({ window: '24H', sort: 'OLDEST' })).toEqual(['b-fire-l2', 'c-medical-l3']);
    expect(ids({ sort: 'NEWEST' })).toEqual(['c-medical-l3', 'b-fire-l2', 'a-fire-l1']);
  });

  it('searches id, type and description', () => {
    expect(ids({ text: 'medical' })).toEqual(['c-medical-l3']);
    expect(ids({ text: 'duplicate', status: 'ALL' })).toEqual(['e-dup']);
    expect(ids({ text: 'b-fire' })).toEqual(['b-fire-l2']);
  });

  it('lists distinct types', () => {
    expect(incidentTypes(items)).toEqual(['MEDICAL', 'SMOKE_OR_FIRE']);
  });
});
