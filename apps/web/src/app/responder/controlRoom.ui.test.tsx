import { render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Drill, HelpRequest, Incident, Me, SahayaApi } from '../api/sahaya';
import { DrillBanner } from '../DrillBanner';
import { ControlRoom } from './ControlRoom';
import { DrillsView } from './drillControl';
import { useKeyForBody } from './shared';

const me = (roles: Me['roles']): Me => ({
  id: 'u1',
  email: 'x@example.invalid',
  displayName: 'Demo',
  language: 'en',
  roles,
  mode: 'DEMO',
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const help = (over: Partial<HelpRequest>): HelpRequest => ({
  id: 'h1',
  studentId: 's1',
  incidentId: 'i1',
  drillId: null,
  zoneId: 'z1',
  status: 'OPEN',
  priority: null,
  details: 'Synthetic request',
  assignedResponderId: null,
  acknowledgedAt: null,
  assignedAt: null,
  resolvedAt: null,
  cancelledAt: null,
  createdAt: minutesAgo(1),
  updatedAt: minutesAgo(1),
  ...over,
});

const incident = (over: Partial<Incident>): Incident => ({
  id: 'i1',
  type: 'SMOKE_OR_FIRE',
  description: 'Synthetic',
  priority: 'HIGH',
  verificationStatus: 'REPORTED',
  mode: 'DEMO',
  buildingId: null,
  floorId: null,
  zoneId: null,
  reporterId: 'r1',
  serverReceivedAt: minutesAgo(3),
  createdAt: minutesAgo(3),
  level: 1,
  reportCount: 1,
  independentReporters: 1,
  relatedIncidentIds: [],
  ...over,
});

const drill = (over: Partial<Drill>): Drill => ({
  id: 'd1',
  name: 'Block B smoke drill',
  buildingId: 'b1',
  scenarioRef: 'demo-smoke-corridor',
  mode: 'DRILL',
  status: 'ACTIVE',
  createdAt: minutesAgo(10),
  ...over,
});

function fakeApi(over: Record<string, unknown>): SahayaApi {
  return {
    listIncidents: vi.fn(async () => ({ items: [] })),
    listHelpRequests: vi.fn(async () => ({ items: [] })),
    drills: vi.fn(async () => ({ items: [] })),
    buildings: vi.fn(async () => ({ items: [] })),
    rollCall: vi.fn(async () => ({
      scope: { kind: 'drill', id: 'd1', zoneCount: 0 },
      counts: { SAFE: 0, NEEDS_HELP: 0, NO_RESPONSE: 0 },
      items: [],
      note: '',
    })),
    checkinSummary: vi.fn(async () => ({
      incidentId: 'i1',
      counts: { CONFIRMED_SAFE: 4, HELP_REQUESTED: 1, UNCONFIRMED: 7 },
      note: '',
    })),
    ...over,
  } as unknown as SahayaApi;
}

describe('ControlRoom', () => {
  it('orders the hazard queue by level and lets a verifier confirm with a reason', async () => {
    const reviewIncident = vi.fn<SahayaApi['reviewIncident']>(async () => ({
      toStatus: 'VERIFIED',
    }));
    const api = fakeApi({
      listIncidents: vi.fn(async () => ({
        items: [
          incident({ id: 'a', type: 'BLOCKED_EXIT', level: 1 }),
          incident({
            id: 'b',
            level: 2,
            reportCount: 3,
            independentReporters: 3,
            relatedIncidentIds: ['c0ffee00-0000-0000-0000-000000000000'],
          }),
        ],
      })),
      reviewIncident,
    });
    render(<ControlRoom api={api} user={me(['INCIDENT_VERIFIER'])} />);

    const queue = (await screen.findByRole('heading', { name: 'Hazard queue' })).closest(
      'section',
    )!;
    const items = await within(queue).findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('L2');
    expect(items[0]).toHaveTextContent('3 reports · 3 people');
    expect(items[0]).toHaveTextContent('multiple independent reports');
    expect(items[1]).toHaveTextContent('L1');

    await userEvent.click(within(items[0]!).getByRole('button', { name: 'Duplicate' }));
    expect(within(items[0]!).getByRole('textbox')).toHaveValue('Duplicate of incident c0ffee00.');
    await userEvent.click(within(items[0]!).getByRole('button', { name: 'Confirm' }));
    await userEvent.click(within(items[0]!).getByRole('button', { name: 'Record: Confirm' }));
    await waitFor(() => expect(reviewIncident).toHaveBeenCalledTimes(1));
    const [id, input] = reviewIncident.mock.calls[0]!;
    expect(id).toBe('b');
    expect(input.status).toBe('VERIFIED');
  });

  it('shows waiting timers and the escalation prompt, and responders cannot review', async () => {
    const api = fakeApi({
      listHelpRequests: vi.fn(async () => ({
        items: [help({ id: 'late', createdAt: minutesAgo(6) }), help({ id: 'fresh' })],
      })),
      listIncidents: vi.fn(async () => ({ items: [incident({})] })),
    });
    render(<ControlRoom api={api} user={me(['RESPONDER'])} />);
    expect(
      await screen.findByText(/Escalate to the Security Officer control post/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Waiting \d+:\d\d$/)).toHaveLength(2);
    expect(await screen.findByText('Unconfirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });
});

describe('drill control', () => {
  it('needs two taps to stop all drills and shows the result', async () => {
    const stopAllDrills = vi.fn(async () => ({ stopped: 1, drillIds: ['d1'] }));
    const api = fakeApi({
      drills: vi.fn(async () => ({ items: [drill({})] })),
      drillPreflight: vi.fn(async () => ({
        verifiedIncidentsOpen: 0,
        activeDrills: 1,
        canStart: true,
      })),
      buildings: vi.fn(async () => ({ items: [] })),
      drillMetrics: vi.fn(async () => ({
        drillId: 'd1',
        checkins: { participants: 3, confirmed_safe: 2, help_requested: 1 },
        training: { completions: 0, average_score: 0 },
        assumptionsAreSynthetic: true,
      })),
      stopAllDrills,
    });
    render(<DrillsView api={api} user={me(['RESPONDER'])} />);
    await userEvent.click(await screen.findByRole('button', { name: 'STOP DRILL' }));
    expect(stopAllDrills).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm: STOP ALL DRILLS' }));
    expect(await screen.findByText('Stopped 1 drill.')).toBeInTheDocument();
    // Responders can stop but not plan or start drills.
    expect(screen.queryByRole('heading', { name: 'Plan a drill' })).toBeNull();
  });

  it('blocks starts while a verified incident is open', async () => {
    const api = fakeApi({
      drills: vi.fn(async () => ({ items: [drill({ status: 'DRAFT' })] })),
      drillPreflight: vi.fn(async () => ({
        verifiedIncidentsOpen: 1,
        activeDrills: 0,
        canStart: false,
      })),
      buildings: vi.fn(async () => ({ items: [] })),
    });
    render(<DrillsView api={api} user={me(['DRILL_MANAGER'])} />);
    expect(
      await screen.findByText(/1 verified incident\(s\) open: drills are blocked/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start drill' })).toBeDisabled();
  });

  it('shows the striped DRILL banner only while a drill is active', async () => {
    const api = fakeApi({ drills: vi.fn(async () => ({ items: [drill({})] })) });
    const { unmount } = render(<DrillBanner api={api} />);
    expect(await screen.findByText('DRILL – NOT A REAL EMERGENCY')).toBeInTheDocument();
    unmount();
    const idle = fakeApi({
      drills: vi.fn(async () => ({ items: [drill({ status: 'COMPLETED' })] })),
    });
    render(<DrillBanner api={idle} />);
    await waitFor(() => expect(idle.drills).toHaveBeenCalled());
    expect(screen.queryByText('DRILL – NOT A REAL EMERGENCY')).toBeNull();
  });
});

it('reuses an idempotency key for a retry and makes a new one when the body changes', () => {
  const { result } = renderHook(() => useKeyForBody());
  const a = result.current({ reason: 'Fallen tree' });
  expect(result.current({ reason: 'Fallen tree' })).toBe(a);
  const b = result.current({ reason: 'Fallen tree on path' });
  expect(b).not.toBe(a);
  expect(result.current({ reason: 'Fallen tree on path' })).toBe(b);
});
