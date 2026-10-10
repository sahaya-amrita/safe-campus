import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, applyEvent, createEvent, createMemoryDrillStore, isDrillEvent, newDrill, summarize } from './drill-model.ts';
const date = new Date('2026-10-10T12:00:00Z');

test('complete Prepare → Respond → Reflect → Improve with local receipts and debrief', async () => {
  let state = newDrill('test-session'); const store = createMemoryDrillStore();
  for (const step of STEPS) {
    const event = createEvent(state, step.correctChoice, date);
    assert.equal(event.phase, step.phase); assert.equal(event.mode, 'DEMO');
    assert.deepEqual(await store.append(event), { eventId: event.id, storage: 'LOCAL_ONLY' });
    state = applyEvent(state, event);
  }
  assert.deepEqual(state.events.map((item) => item.phase), ['Prepare', 'Respond', 'Reflect', 'Improve']);
  assert.equal(summarize(state).score, 4); assert.equal(summarize(state).completed, true);
  assert.match(summarize(state).meaning, /not a measure/);
  assert.throws(() => createEvent(state, 'provenance', date));
});
test('incorrect choices are recorded honestly and lower the review score', () => {
  let state = newDrill('review');
  for (const step of STEPS) {
    state = applyEvent(state, createEvent(state, step.choices.find((choice) => choice.id !== step.correctChoice).id, date));
  }
  assert.equal(summarize(state).score, 0); assert.equal(summarize(state).completed, true);
});
test('store rejects live modes, extra dispatch fields, malformed dates and invalid choices', async () => {
  const event = createEvent(newDrill('isolation'), 'boundary', date);
  for (const mutation of [{ mode: 'LIVE' }, { mode: 'DRILL' }, { recipient: 'someone' },
    { createdAt: 'yesterday' }, { choiceId: 'dispatch' }, { id: 'spoof' }, { phase: 'Unknown' }]) {
    const value = { ...event, ...mutation };
    assert.equal(isDrillEvent(value), false);
    await assert.rejects(createMemoryDrillStore().append(value));
  }
});
test('duplicate saves are idempotent; conflicting retries are rejected', async () => {
  const store = createMemoryDrillStore(); const event = createEvent(newDrill('retry'), 'boundary', date);
  const original = await store.append(event);
  assert.deepEqual(await store.append({ ...event }), original);
  await assert.rejects(store.append({ ...event, choiceId: 'assume' }), /Conflicting/);
});
test('out-of-order and cross-session transitions are rejected', async () => {
  const state = newDrill('sequence'); const first = createEvent(state, 'boundary', date);
  const second = createEvent(applyEvent(state, first), 'review', date);
  assert.throws(() => applyEvent(state, second));
  await assert.rejects(createMemoryDrillStore().append(second));
  assert.throws(() => applyEvent(newDrill('another'), first));
  assert.throws(() => createEvent(state, 'missing', date));
  assert.throws(() => newDrill(' '));
});
test('store and reducer snapshot events, with no state shared between store instances', async () => {
  const state = newDrill('snapshot'); const event = createEvent(state, 'boundary', date);
  const store = createMemoryDrillStore(); await store.append(event);
  const updated = applyEvent(state, event); event.choiceId = 'assume';
  assert.equal(updated.events[0].choiceId, 'boundary'); assert.equal(state.events.length, 0);
  await assert.rejects(store.append(event), /Conflicting/);
  await assert.doesNotReject(createMemoryDrillStore().append(event));
});
