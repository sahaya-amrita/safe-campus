import assert from 'node:assert/strict';
import test from 'node:test';
import { createDrillTimeline } from './timeline.ts';
import { mockDrillScenarioSource } from './mock-adapter.ts';

test('playback includes exact boundaries and clamps beyond the end', async () => {
  const frameAt = createDrillTimeline(await mockDrillScenarioSource.load());
  assert.deepEqual(frameAt(0).reached.map((event) => event.id), ['start']);
  assert.equal(frameAt(29_999).reached.length, 1);
  const middle = frameAt(30_000);
  assert.equal(middle.progress, 0.5);
  assert.equal(middle.playbackComplete, false);
  assert.deepEqual(middle.upcoming.map((event) => event.id), ['end']);
  assert.equal(frameAt(60_000).playbackComplete, true);
  assert.deepEqual(frameAt(90_000), frameAt(60_000));
  assert.equal(frameAt(60_000).upcoming.length, 0);
  assert.equal(frameAt(60_000).dataSource, 'SYNTHETIC');
});

test('seeking backwards is deterministic and does not replay side effects', async () => {
  const frameAt = createDrillTimeline(await mockDrillScenarioSource.load());
  const initial = frameAt(0);
  frameAt(60_000);
  assert.deepEqual(frameAt(0), initial);
});

test('input and output mutation cannot change subsequent frames', async () => {
  const scenario = await mockDrillScenarioSource.load();
  const frameAt = createDrillTimeline(scenario);
  const initial = frameAt(0);
  scenario.id = 'changed';
  scenario.durationMs = 1;
  scenario.milestones[0].label = 'changed';
  scenario.milestones.push({ id: 'extra', atMs: 0, label: 'Extra' });
  assert.throws(() => { initial.reached[0].label = 'changed'; }, TypeError);
  assert.throws(() => { initial.upcoming.pop(); }, TypeError);
  assert.deepEqual(frameAt(0), initial);
});

test('sorts milestones and preserves input ordering for simultaneous milestones', () => {
  const frameAt = createDrillTimeline({
    id: 'ordering', dataSource: 'SYNTHETIC', durationMs: 10,
    milestones: [
      { id: 'later', atMs: 9, label: 'Later' },
      { id: 'first', atMs: 0, label: 'First' },
      { id: 'second', atMs: 0, label: 'Second' },
    ],
  });
  assert.deepEqual(frameAt(10).reached.map((event) => event.id), ['first', 'second', 'later']);
});

test('rejects invalid scenarios before playback', async () => {
  const valid = await mockDrillScenarioSource.load();
  for (const durationMs of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createDrillTimeline({ ...valid, durationMs }), RangeError);
  }
  assert.throws(() => createDrillTimeline({ ...valid, dataSource: 'APPROVED' }), TypeError);
  assert.throws(() => createDrillTimeline({ ...valid, id: ' ' }), TypeError);
  assert.throws(() => createDrillTimeline({ ...valid, milestones: [valid.milestones[0], valid.milestones[0]] }), /Duplicate/);
  for (const milestone of [
    { id: '', atMs: 0, label: 'Example' },
    { id: 'example', atMs: 0, label: '' },
    { id: 'example', atMs: -1, label: 'Example' },
    { id: 'example', atMs: 60_001, label: 'Example' },
  ]) {
    assert.throws(() => createDrillTimeline({ ...valid, milestones: [milestone] }));
  }
});

test('rejects invalid elapsed times and allows an empty timeline', () => {
  const frameAt = createDrillTimeline({ id: 'empty', dataSource: 'SYNTHETIC', durationMs: 10, milestones: [] });
  for (const elapsed of [-1, NaN, Infinity, 0.1, Number.MAX_SAFE_INTEGER + 1, '0']) {
    assert.throws(() => frameAt(elapsed), RangeError);
  }
  assert.equal(frameAt(0).progress, 0);
  assert.equal(frameAt(10).progress, 1);
  assert.deepEqual(frameAt(10).reached, []);
});

test('mock adapter returns independent fixtures', async () => {
  const first = await mockDrillScenarioSource.load();
  first.milestones.pop();
  assert.equal((await mockDrillScenarioSource.load()).milestones.length, 3);
});
