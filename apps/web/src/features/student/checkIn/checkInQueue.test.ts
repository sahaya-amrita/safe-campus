import { describe, expect, it } from 'vitest';
import { findAccidentalRepeat, REPEAT_GUARD_MS, toDeliveryState, type CheckInEntry } from './checkInQueue';

function entry(overrides: Partial<CheckInEntry> = {}): CheckInEntry {
  return {
    key: 'k1',
    payload: { status: 'SAFE' },
    createdAt: '2026-10-10T09:00:00.000Z',
    lifecycle: 'QUEUED',
    attempts: 0,
    lastAttemptAt: null,
    problem: null,
    problemDetail: null,
    result: null,
    acceptedAt: null,
    ...overrides,
  };
}

describe('toDeliveryState', () => {
  it.each([
    ['QUEUED', 'QUEUED_OFFLINE'],
    ['SENDING', 'PENDING'],
    ['ACCEPTED', 'ACCEPTED'],
    ['FAILED', 'FAILED'],
  ] as const)('%s → %s', (lifecycle, expected) => {
    expect(toDeliveryState(entry({ lifecycle }))).toBe(expected);
  });
});

describe('findAccidentalRepeat', () => {
  const created = new Date('2026-10-10T09:00:00.000Z');
  const at = (ms: number) => new Date(created.getTime() + ms);

  it('ignores a second tap of the same status within the guard window', () => {
    expect(findAccidentalRepeat([entry()], 'SAFE', at(1_000))?.key).toBe('k1');
  });

  it('allows the same status after the guard window', () => {
    expect(findAccidentalRepeat([entry()], 'SAFE', at(REPEAT_GUARD_MS))).toBeUndefined();
  });

  it('never blocks switching to a different status', () => {
    expect(findAccidentalRepeat([entry()], 'NEED_HELP', at(500))).toBeUndefined();
  });

  it('does not block resending after a failure', () => {
    expect(findAccidentalRepeat([entry({ lifecycle: 'FAILED' })], 'SAFE', at(500))).toBeUndefined();
  });
});
