import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResponderView } from '@sahaya/contracts';
import { SubmissionCard } from '../../features/student/components/SubmissionCard';
import type { CheckInEntry } from '../../features/student/checkIn/checkInQueue';
import { ApiError } from '../api/client';
import type { Me, SahayaApi } from '../api/sahaya';
import { RosterPage } from '../admin/RosterPage';
import { DutyControl, RollCallCard } from './operations';

const profile = (over: Partial<ResponderView> = {}): ResponderView => ({
  id: 'r1',
  userId: 'u1',
  displayName: 'Synthetic Responder',
  email: 'r@test.invalid',
  approvedRole: 'First aider',
  qualifications: [],
  zoneId: 'z1',
  zoneName: 'Zone A',
  availability: 'AVAILABLE',
  verified: true,
  verifiedAt: '2026-10-11T08:00:00.000Z',
  dutyChangedAt: null,
  mode: 'DEMO',
  ...over,
});

describe('DutyControl', () => {
  it('shows the current duty status and changes it through the API', async () => {
    let current = profile();
    const setDuty = vi.fn(async (availability: ResponderView['availability']) => {
      current = { ...current, availability };
      return current;
    });
    const api = { myResponderProfile: vi.fn(async () => current), setDuty } as unknown as SahayaApi;
    render(<DutyControl api={api} />);
    const group = await screen.findByRole('group', { name: 'Your duty status' });
    expect(within(group).getByRole('button', { name: 'On duty' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(within(group).getByRole('button', { name: 'Off duty' }));
    expect(setDuty).toHaveBeenCalledWith('OFF_DUTY');
    await waitFor(() =>
      expect(within(group).getByRole('button', { name: 'Off duty' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });

  it('says plainly when the responder is unverified or not on the roster', async () => {
    const unverified = {
      myResponderProfile: vi.fn(async () => profile({ verified: false })),
    } as unknown as SahayaApi;
    const { unmount } = render(<DutyControl api={unverified} />);
    expect(await screen.findByText('Not verified · not matched')).toBeInTheDocument();
    unmount();

    const missing = {
      myResponderProfile: vi.fn(async () => {
        throw new ApiError('NOT_FOUND', 404, 'NO_RESPONDER_PROFILE', 'none');
      }),
    } as unknown as SahayaApi;
    render(<DutyControl api={missing} />);
    expect(await screen.findByText('Not on the responder roster')).toBeInTheDocument();
  });
});

describe('RollCallCard', () => {
  it('lists people needing help first and never treats no response as harm', async () => {
    const api = {
      rollCall: vi.fn(async () => ({
        scope: { kind: 'drill', id: 'd1', zoneCount: 1 },
        counts: { SAFE: 1, NEEDS_HELP: 1, NO_RESPONSE: 1 },
        items: [
          {
            studentId: 's2',
            displayName: 'Bala',
            status: 'NEEDS_HELP',
            lastCheckInAt: '2026-10-11T09:00:00.000Z',
            helpRequestId: 'h1',
            helpRequestStatus: 'OPEN',
          },
          {
            studentId: 's3',
            displayName: 'Chitra',
            status: 'NO_RESPONSE',
            lastCheckInAt: null,
            helpRequestId: null,
            helpRequestStatus: null,
          },
          {
            studentId: 's1',
            displayName: 'Anu',
            status: 'SAFE',
            lastCheckInAt: '2026-10-11T09:01:00.000Z',
            helpRequestId: null,
            helpRequestStatus: null,
          },
        ],
        note: 'NO_RESPONSE means no server-received check-in yet. It does not mean someone is hurt or absent.',
      })),
    } as unknown as SahayaApi;
    render(<RollCallCard api={api} kind="drills" id="d1" />);
    const rows = await screen.findAllByRole('row');
    expect(rows.slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual([
      'Bala',
      'Chitra',
      'Anu',
    ]);
    expect(screen.getByText('1 need help')).toBeInTheDocument();
    expect(screen.getByText(/does not mean someone is hurt/)).toBeInTheDocument();
  });

  it('explains when roll call is outside the responder’s zone', async () => {
    const api = {
      rollCall: vi.fn(async () => {
        throw new ApiError('FORBIDDEN', 403, 'FORBIDDEN', 'zone');
      }),
    } as unknown as SahayaApi;
    render(<RollCallCard api={api} kind="incidents" id="i1" />);
    expect(
      await screen.findByText('Roll call is limited to your assigned zone.'),
    ).toBeInTheDocument();
  });
});

describe('RosterPage', () => {
  it('verifies a responder only with a reason', async () => {
    const admin: Me = {
      id: 'admin',
      email: 'a@test.invalid',
      displayName: 'Admin',
      language: 'en',
      roles: ['ADMIN'],
      mode: 'DEMO',
    };
    const verifyResponder = vi.fn(async () => profile({ verified: true }));
    const api = {
      adminResponders: vi.fn(async () => ({
        items: [profile({ verified: false, availability: 'OFF_DUTY' })],
        zones: [{ id: 'z1', name: 'Zone A', code: 'A' }],
      })),
      verifyResponder,
    } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<RosterPage api={api} user={admin} />);
    await user.click(await screen.findByRole('button', { name: 'Verify' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give a reason');
    expect(verifyResponder).not.toHaveBeenCalled();
    await user.type(
      within(dialog).getByLabelText('Reason (kept in the audit log)'),
      'Certificate checked',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(verifyResponder).toHaveBeenCalledWith('r1', true, 'Certificate checked');
    expect(
      await screen.findByText('Verified. They are matched once they go on duty.'),
    ).toBeInTheDocument();
  });
});

describe('student latest check-in card', () => {
  const entry: CheckInEntry = {
    key: 'k1',
    payload: { status: 'HELP_REQUESTED', session: null },
    createdAt: '2026-10-11T09:00:00.000Z',
    lifecycle: 'ACCEPTED',
    attempts: 1,
    lastAttemptAt: '2026-10-11T09:00:00.000Z',
    problem: null,
    problemDetail: null,
    result: {
      id: 'c1',
      status: 'HELP_REQUESTED',
      deliveryStatus: 'SERVER_RECEIVED',
      serverReceivedAt: '2026-10-11T09:00:01.000Z',
      clientActionId: 'k1',
      helpRequest: { id: 'h1', status: 'OPEN' },
    },
    acceptedAt: '2026-10-11T09:00:01.000Z',
  };
  const card = (serverHelpStatus: string | null) => (
    <SubmissionCard
      entry={entry}
      onRetry={() => undefined}
      photoCount={0}
      onDeletePhotos={() => undefined}
      serverHelpStatus={serverHelpStatus}
    />
  );

  it('marks "seen by a responder" only when the server reports it', () => {
    const { rerender } = render(card('OPEN'));
    expect(screen.getByTestId('submission')).toHaveAttribute('data-state', 'SERVER_RECEIVED');
    rerender(card('ACKNOWLEDGED'));
    expect(screen.getByTestId('submission')).toHaveAttribute('data-state', 'ACKNOWLEDGED');
    expect(screen.getByText('Acknowledged by a responder')).toBeInTheDocument();
    rerender(card(null));
    expect(screen.getByTestId('submission')).toHaveAttribute('data-state', 'SERVER_RECEIVED');
  });
});
