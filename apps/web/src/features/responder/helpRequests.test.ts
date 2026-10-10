import { describe, expect, it } from 'vitest';
import { HELP_REQUEST_STATUSES } from './contracts';
import {
  canAcknowledge,
  canTransition,
  HELP_REQUEST_STATUS_PRESENTATION,
  isTerminal,
  parseHelpRequest,
  sortForTriage,
} from './helpRequests';
import { rollCallCompleteness } from './rollCall';

const base = {
  id: 'x',
  createdAt: '2026-10-10T10:00:00Z',
  lastUpdatedAt: '2026-10-10T10:00:00Z',
  priority: null,
};

describe('help request transitions', () => {
  it('only allows acknowledgement from OPEN', () => {
    for (const s of HELP_REQUEST_STATUSES) expect(canAcknowledge({ status: s })).toBe(s === 'OPEN');
  });

  it('forbids leaving terminal states and skipping backwards', () => {
    expect(isTerminal('RESOLVED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(canTransition('RESOLVED', 'OPEN')).toBe(false);
    expect(canTransition('ACKNOWLEDGED', 'OPEN')).toBe(false);
    expect(canTransition('OPEN', 'RESOLVED')).toBe(false);
    expect(canTransition('OPEN', 'ACKNOWLEDGED')).toBe(true);
  });

  it('gives every status a distinct label, icon and tone', () => {
    const p = Object.values(HELP_REQUEST_STATUS_PRESENTATION);
    expect(new Set(p.map((x) => x.label)).size).toBe(p.length);
    expect(new Set(p.map((x) => x.icon)).size).toBe(p.length);
    expect(new Set(p.map((x) => x.tone)).size).toBe(p.length);
  });

  it('sorts oldest first', () => {
    const out = sortForTriage([
      { ...base, id: 'new', status: 'OPEN', createdAt: '2026-10-10T10:05:00Z' },
      { ...base, id: 'old', status: 'OPEN', createdAt: '2026-10-10T10:01:00Z' },
    ]);
    expect(out.map((r) => r.id)).toEqual(['old', 'new']);
  });
});

describe('parseHelpRequest (boundary validation)', () => {
  it('accepts a valid record', () => {
    expect(parseHelpRequest({ ...base, status: 'OPEN' }).status).toBe('OPEN');
  });
  it.each([
    [{ ...base, status: 'COMING' }],
    [{ ...base, status: 'OPEN', createdAt: 'not a date' }],
    [{ ...base, status: 'OPEN', id: '' }],
    [{ ...base, status: 'OPEN', acknowledgedBy: 7 }],
    [null],
  ])('rejects %j', (value) => {
    expect(() => parseHelpRequest(value)).toThrow(TypeError);
  });
});

describe('roll-call completeness', () => {
  const snap = {
    scopeLabel: 'Group',
    asOf: base.createdAt,
    isDemo: true,
    safeCount: 5,
    needHelpCount: 1,
  };
  it('is unknown without an expected count', () => {
    expect(rollCallCompleteness({ ...snap, scopeKind: 'PARTIAL', expectedCount: null }).kind).toBe(
      'UNKNOWN_EXPECTED',
    );
  });
  it('is unknown when scope is unknown, even if counts reconcile', () => {
    expect(rollCallCompleteness({ ...snap, scopeKind: 'UNKNOWN', expectedCount: 6 }).kind).toBe(
      'UNKNOWN_EXPECTED',
    );
  });
  it('reports missing count when incomplete', () => {
    expect(rollCallCompleteness({ ...snap, scopeKind: 'PARTIAL', expectedCount: 10 })).toEqual({
      kind: 'INCOMPLETE',
      responded: 6,
      expected: 10,
      missing: 4,
    });
  });
  it('only claims completeness for the stated scope', () => {
    expect(rollCallCompleteness({ ...snap, scopeKind: 'PARTIAL', expectedCount: 6 }).kind).toBe(
      'ALL_RESPONDED_IN_SCOPE',
    );
  });
});
