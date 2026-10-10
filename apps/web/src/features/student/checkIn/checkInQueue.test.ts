import { describe, expect, it } from 'vitest';
import { findAccidentalRepeat, REPEAT_GUARD_MS, toDeliveryStatus, type CheckInEntry } from './checkInQueue';

function entry(overrides: Partial<CheckInEntry> = {}): CheckInEntry {
  return {
    key: 'k1',
    payload: { status: 'CONFIRMED_SAFE', session: null },
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

describe('toDeliveryStatus (shared MessageDeliveryStatus)', () => {
  it.each([
    [{ lifecycle: 'QUEUED', problem: 'OFFLINE' }, 'LOCAL_ONLY'],
    [{ lifecycle: 'QUEUED', problem: null }, 'QUEUED'],
    [{ lifecycle: 'QUEUED', problem: 'TIMEOUT' }, 'QUEUED'],
    [{ lifecycle: 'QUEUED', problem: 'SERVER_UNAVAILABLE' }, 'QUEUED'],
    [{ lifecycle: 'SENDING' }, 'SENDING'],
    [{ lifecycle: 'ACCEPTED' }, 'SERVER_RECEIVED'],
    [{ lifecycle: 'FAILED', problem: 'REJECTED' }, 'FAILED'],
  ] as const)('%o → %s', (overrides, expected) => {
    expect(toDeliveryStatus(entry(overrides as Partial<CheckInEntry>))).toBe(expected);
  });

  it('never produces ACKNOWLEDGED (the API gives students no acknowledgement field)', () => {
    for (const lifecycle of ['QUEUED', 'SENDING', 'ACCEPTED', 'FAILED'] as const) {
      expect(toDeliveryStatus(entry({ lifecycle }))).not.toBe('ACKNOWLEDGED');
    }
  });
});

describe('findAccidentalRepeat', () => {
  const created = new Date('2026-10-10T09:00:00.000Z');
  const at = (ms: number) => new Date(created.getTime() + ms);

  it('ignores a second tap of the same status within the guard window', () => {
    expect(findAccidentalRepeat([entry()], 'CONFIRMED_SAFE', at(1_000))?.key).toBe('k1');
  });
  it('allows the same status after the guard window', () => {
    expect(findAccidentalRepeat([entry()], 'CONFIRMED_SAFE', at(REPEAT_GUARD_MS))).toBeUndefined();
  });
  it('never blocks switching to a different status', () => {
    expect(findAccidentalRepeat([entry()], 'HELP_REQUESTED', at(500))).toBeUndefined();
  });
  it('does not block resending after a failure', () => {
    expect(findAccidentalRepeat([entry({ lifecycle: 'FAILED' })], 'CONFIRMED_SAFE', at(500))).toBeUndefined();
  });
});
