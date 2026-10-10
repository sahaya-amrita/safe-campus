import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMap, createDemoMap, isMapDocument, DEMO_NOTICE } from './map-model.ts';

const now = Date.parse('2026-10-10T12:00:00Z');
const policy = { now, authorizedSourceIds: ['synthetic-diagram'] };
// Unit fixture ONLY. This must never be served as an operational campus map.
function approvedFixture() {
  const map = createDemoMap();
  map.source.kind = 'OPERATIONAL';
  map.source.approval = 'APPROVED';
  for (const feature of map.features) feature.provenance.approval = 'APPROVED';
  map.features.push({ id: 'route', label: 'Test-only line', kind: 'ROUTE', points: [[100, 100], [800, 800]],
    provenance: { ...map.features[0].provenance } });
  return map;
}

test('demo warning is explicit and routes stay disabled even with forged approval', () => {
  const map = approvedFixture(); map.source.kind = 'DEMO';
  const result = assessMap(map, policy);
  assert.equal(result.trust, 'DEMO');
  assert.equal(result.message, DEMO_NOTICE);
  assert.match(result.message, /NOT FOR NAVIGATION/);
  assert.equal(result.routeEnabled, false);
  assert.deepEqual(result.routes, []);
});
test('missing and malformed map payloads fail closed', () => {
  for (const value of [undefined, null]) assert.equal(assessMap(value, policy).trust, 'UNAVAILABLE');
  for (const value of [{}, [], { source: {} }, { ...approvedFixture(), features: 'bad' }]) {
    assert.equal(assessMap(value, policy).trust, 'INVALID');
    assert.equal(assessMap(value, policy).routeEnabled, false);
  }
});
test('authorization must come from trusted integration, not a payload approval flag', () => {
  const map = approvedFixture();
  assert.equal(assessMap(map, { now, authorizedSourceIds: [] }).trust, 'UNVERIFIED');
  map.source.approval = 'UNVERIFIED';
  assert.equal(assessMap(map, policy).routeEnabled, false);
});
test('expired and future source timestamps block all operational geometry', () => {
  for (const stamp of ['2026-10-10T12:00:00Z', '2026-01-02T00:00:00Z']) {
    const map = approvedFixture(); map.source.expiresAt = stamp;
    const result = assessMap(map, policy);
    assert.equal(result.trust, 'STALE'); assert.deepEqual(result.areas, []); assert.deepEqual(result.routes, []);
  }
  const future = approvedFixture(); future.source.updatedAt = '2027-01-01T00:00:00Z';
  assert.equal(assessMap(future, policy).trust, 'STALE');
  assert.equal(assessMap(approvedFixture(), { ...policy, now: NaN }).trust, 'INVALID');
});
test('only valid source, areas and routes enable route geometry', () => {
  const result = assessMap(approvedFixture(), policy);
  assert.equal(result.trust, 'VERIFIED'); assert.equal(result.routeEnabled, true);
  assert.equal(result.routes.length, 1); assert.equal(result.areas.length, 3);
});
test('each route requires current authorized provenance', () => {
  for (const mutation of [
    { approval: 'UNVERIFIED' }, { sourceId: 'unauthorized' }, { version: 'incompatible-grid-version' },
    { expiresAt: '2026-10-10T12:00:00Z' }, { updatedAt: '2027-01-01T00:00:00Z' },
  ]) {
    const map = approvedFixture(); Object.assign(map.features[3].provenance, mutation);
    const result = assessMap(map, policy);
    assert.equal(result.routeEnabled, false); assert.equal(result.withheld, 1);
  }
});
test('a route without approved campus areas cannot enable guidance', () => {
  const map = approvedFixture();
  for (const area of map.features.filter((item) => item.kind === 'AREA')) area.provenance.approval = 'UNVERIFIED';
  assert.equal(assessMap(map, policy).routeEnabled, false);
  map.features = [];
  assert.equal(assessMap(map, policy).routeEnabled, false);
});
test('boundary validation rejects corrupt geometry, dates, duplicate IDs and oversized input', () => {
  const cases = [
    (map) => { map.features[0].points[0] = [NaN, 10]; },
    (map) => { map.features[0].points[0] = [-1, 10]; },
    (map) => { map.features[0].points = [[1, 2]]; },
    (map) => { map.features[0].provenance.version = ''; },
    (map) => { map.source.updatedAt = '2026-02-30T00:00:00Z'; },
    (map) => { map.source.expiresAt = map.source.updatedAt; },
    (map) => { map.features[1].id = map.features[0].id; },
    (map) => { map.features = Array(501).fill(map.features[0]); },
  ];
  for (const mutate of cases) { const map = approvedFixture(); mutate(map); assert.equal(isMapDocument(map), false); }
});
test('validated snapshot is isolated from subsequent adapter mutation', () => {
  const map = approvedFixture(); const result = assessMap(map, policy);
  map.features[3].points[0][0] = 999;
  assert.equal(result.routes[0].points[0][0], 100);
});
