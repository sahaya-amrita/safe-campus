import { describe, expect, it } from 'vitest';
import type { HelpRequest, Incident } from '../api/sahaya';
import { ackState, formatDuration, sortHazardQueue, sortHelpQueue } from './controlRoomModel';

const T0 = Date.parse('2026-10-11T10:00:00.000Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

const help = (over: Partial<HelpRequest>): HelpRequest => ({
  id: 'h',
  studentId: 's',
  incidentId: 'i',
  drillId: null,
  zoneId: null,
  status: 'OPEN',
  priority: null,
  details: null,
  assignedResponderId: null,
  acknowledgedAt: null,
  assignedAt: null,
  resolvedAt: null,
  cancelledAt: null,
  createdAt: at(0),
  updatedAt: at(0),
  ...over,
});

describe('ackState', () => {
  it('moves from on time to overdue to escalate while unacknowledged', () => {
    expect(ackState(help({}), T0 + 60_000)).toEqual({
      kind: 'WAITING',
      seconds: 60,
      stage: 'ON_TIME',
    });
    expect(ackState(help({}), T0 + 150_000)).toMatchObject({ stage: 'OVERDUE' });
    expect(ackState(help({}), T0 + 301_000)).toMatchObject({ stage: 'ESCALATE' });
  });

  it('reports how long acknowledgement took and whether it was late', () => {
    expect(
      ackState(help({ status: 'ACKNOWLEDGED', acknowledgedAt: at(45) }), T0 + 999_000),
    ).toEqual({ kind: 'ACKNOWLEDGED', seconds: 45, late: false });
    expect(ackState(help({ status: 'ASSIGNED', acknowledgedAt: at(200) }), T0)).toMatchObject({
      late: true,
    });
    expect(ackState(help({ status: 'RESOLVED' }), T0)).toEqual({ kind: 'CLOSED' });
  });
});

it('formats durations for timers', () => {
  expect(formatDuration(5)).toBe('0:05');
  expect(formatDuration(725)).toBe('12:05');
  expect(formatDuration(3900)).toBe('1 h 05 m');
});

it('puts unacknowledged, longest-waiting help requests first and drops closed ones', () => {
  const items = [
    help({ id: 'ack-old', createdAt: at(0), acknowledgedAt: at(10), status: 'ACKNOWLEDGED' }),
    help({ id: 'new', createdAt: at(100) }),
    help({ id: 'old', createdAt: at(10) }),
    help({ id: 'done', status: 'RESOLVED' }),
  ];
  expect(sortHelpQueue(items, T0 + 200_000).map((h) => h.id)).toEqual(['old', 'new', 'ack-old']);
});

it('orders hazards by level, then age, and hides closed ones', () => {
  const incident = (id: string, level: Incident['level'], createdAt: string) =>
    ({ id, level, createdAt }) as Incident;
  const items = [
    incident('l1-old', 1, at(0)),
    incident('l2', 2, at(50)),
    incident('closed', null, at(0)),
    incident('l3', 3, at(90)),
    incident('l1-new', 1, at(60)),
  ];
  expect(sortHazardQueue(items).map((i) => i.id)).toEqual(['l3', 'l2', 'l1-old', 'l1-new']);
});
