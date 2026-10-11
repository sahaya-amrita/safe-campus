import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsView, SettingsView } from '@sahaya/contracts';
import type { HelpRequest, SahayaApi } from '../api/sahaya';
import { ackState } from '../responder/controlRoomModel';
import { AnalyticsPage, SettingsPage } from './OpsPages';

const defaults: SettingsView = {
  values: {
    ackTargetSeconds: 120,
    escalateAfterSeconds: 300,
    maxMatchedResponders: 3,
    unattachedPhotoHours: 24,
  },
  meta: {
    ackTargetSeconds: null,
    escalateAfterSeconds: null,
    maxMatchedResponders: null,
    unattachedPhotoHours: null,
  },
};

describe('SettingsPage', () => {
  it('saves only changed values, and only with a source and a reason', async () => {
    const updateSettings = vi.fn(async () => defaults);
    const api = { settings: vi.fn(async () => defaults), updateSettings } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<SettingsPage api={api} />);
    const field = await screen.findByLabelText('Acknowledge help requests within (seconds)');
    expect(field).toHaveAccessibleDescription(/DEMO default/);
    await user.clear(field);
    await user.type(field, '90');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Say where the values come from');
    await user.type(screen.getByLabelText('Source of these values'), 'ERT memo');
    await user.type(screen.getByLabelText('Reason (kept in the audit log)'), 'Agreed timers');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(updateSettings).toHaveBeenCalledWith({
      values: { ackTargetSeconds: 90 },
      source: 'ERT memo',
      reason: 'Agreed timers',
    });
  });
});

describe('AnalyticsPage', () => {
  it('shows descriptive counts with the data note', async () => {
    const view: AnalyticsView = {
      window: { from: '2026-09-11T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z', days: 30 },
      dataNote:
        'All data here is synthetic DEMO data. These are descriptive counts only; no prediction is made.',
      reports: {
        total: 3,
        byCategory: { MEDICAL: 2, HAZARD: 1 },
        byKind: { SOS: 2, CONCERN: 1 },
        byVerification: { REPORTED: 3 },
      },
      helpRequests: {
        total: 2,
        bySource: { SOS: 2 },
        byStatus: { OPEN: 1, ACKNOWLEDGED: 1 },
        acknowledged: 1,
        medianAckSeconds: 45,
        p90AckSeconds: 45,
        overAckTarget: 1,
        ackTargetSeconds: 120,
      },
      drills: [{ name: 'Fire drill A', participants: 3, safe: 2, needHelp: 1 }],
      photos: { uploaded: 2, attached: 1 },
    };
    const analytics = vi.fn(async () => view);
    const api = { analytics } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<AnalyticsPage api={api} />);
    expect(await screen.findByText(/no prediction is made/)).toBeInTheDocument();
    expect(screen.getByText('Reports (3)')).toBeInTheDocument();
    expect(screen.getAllByText('45 s', { selector: 'strong' })).toHaveLength(2);
    expect(screen.getByText('Fire drill A')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(analytics).toHaveBeenLastCalledWith(7);
  });
});

describe('control-room timers from settings', () => {
  it('uses the configured targets', () => {
    const t0 = Date.parse('2026-10-11T09:00:00Z');
    const h = {
      status: 'OPEN',
      createdAt: '2026-10-11T09:00:00Z',
      acknowledgedAt: null,
    } as unknown as HelpRequest;
    expect(ackState(h, t0 + 100_000)).toMatchObject({ stage: 'ON_TIME' });
    expect(
      ackState(h, t0 + 100_000, { ackTargetSeconds: 60, escalateAfterSeconds: 90 }),
    ).toMatchObject({
      stage: 'ESCALATE',
    });
  });
});
