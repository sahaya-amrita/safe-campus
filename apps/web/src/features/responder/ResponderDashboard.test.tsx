import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './apiError';
import type { HelpRequest } from './contracts';
import { MockResponderApi } from './mockApi';
import { ResponderDashboard } from './ResponderDashboard';

const NOW = new Date('2026-10-10T12:00:00Z');
const now = () => NOW;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ResponderDashboard', () => {
  it('labels mock data as demo', async () => {
    render(<ResponderDashboard api={new MockResponderApi({ now })} now={now} />);
    expect(screen.getByText(/DEMO MODE — synthetic records only/)).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Open help requests' });
  });

  it('renders each queue state distinctly when filtering', async () => {
    const user = userEvent.setup();
    render(<ResponderDashboard api={new MockResponderApi({ now })} now={now} />);
    const expectations: Array<[string, string, string]> = [
      ['Open', 'OPEN', 'urgent'],
      ['Acknowledged', 'ACKNOWLEDGED', 'progress'],
      ['Assigned', 'ASSIGNED', 'assigned'],
      ['Resolved', 'RESOLVED', 'done'],
      ['Cancelled', 'CANCELLED', 'neutral'],
    ];
    for (const [label, status, tone] of expectations) {
      await user.click(screen.getByRole('radio', { name: label }));
      const list = await screen.findByRole('list', { name: `${label} help requests` });
      const rows = within(list).getAllByRole('listitem');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row).toHaveAttribute('data-status', status);
        expect(row.querySelector(`[data-status-tone="${tone}"]`)).toHaveTextContent(label);
      }
    }
  });

  it('shows an access notice, not data, when the server denies access', async () => {
    const api = new MockResponderApi({
      now,
      session: { role: 'STUDENT', actorId: 'demo-student' },
    });
    render(<ResponderDashboard api={api} now={now} />);
    expect(
      await screen.findByRole('heading', { name: 'Responder access required' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not authorized for responder actions/)).toBeInTheDocument();
    expect(screen.queryByText('DEMO-HR-001')).not.toBeInTheDocument();
  });

  it('shows unauthenticated state on 401', async () => {
    const api = new MockResponderApi({ now, session: { role: null, actorId: 'x' } });
    render(<ResponderDashboard api={api} now={now} />);
    expect(await screen.findByText(/not signed in as an authorized responder/)).toBeInTheDocument();
  });

  it('shows a retryable error on server failure', async () => {
    const user = userEvent.setup();
    const api = new MockResponderApi({ now });
    api.failNext(new ApiRequestError(500, 'INTERNAL', 'boom'));
    render(<ResponderDashboard api={api} now={now} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load help requests');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('DEMO-HR-001')).toBeInTheDocument();
  });
});

describe('help request acknowledgement', () => {
  it('shows pending state and only updates from the server response', async () => {
    const user = userEvent.setup();
    const api = new MockResponderApi({ now });
    const gate = deferred<void>();
    const original = api.acknowledgeHelpRequest.bind(api);
    const keys: string[] = [];
    api.acknowledgeHelpRequest = async (id, key) => {
      keys.push(key);
      await gate.promise;
      return original(id, key);
    };
    render(<ResponderDashboard api={api} now={now} />);
    await user.click(await screen.findByRole('button', { name: 'Open help request DEMO-HR-001' }));
    await user.click(screen.getByRole('button', { name: 'Acknowledge request' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'waiting for server confirmation. Not yet acknowledged.',
    );
    expect(screen.getByRole('button', { name: 'Acknowledge request' })).toBeDisabled();
    // Still OPEN while the server has not answered.
    expect(screen.getByText('Not acknowledged')).toBeInTheDocument();

    gate.resolve();
    expect(await screen.findByText(/Acknowledgement recorded by the server/)).toBeInTheDocument();
    expect(screen.getByText(/by demo-responder-1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge request' })).not.toBeInTheDocument();
    expect(keys).toHaveLength(1);
  });

  it('keeps the request OPEN on failure and reuses the idempotency key on retry', async () => {
    const user = userEvent.setup();
    const api = new MockResponderApi({ now });
    const keys: string[] = [];
    const original = api.acknowledgeHelpRequest.bind(api);
    let fail = true;
    api.acknowledgeHelpRequest = async (id, key) => {
      keys.push(key);
      if (fail) {
        fail = false;
        throw new ApiRequestError(0, 'NETWORK_ERROR', 'offline');
      }
      return original(id, key);
    };
    render(<ResponderDashboard api={api} now={now} />);
    await user.click(await screen.findByRole('button', { name: 'Open help request DEMO-HR-001' }));
    await user.click(screen.getByRole('button', { name: 'Acknowledge request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not acknowledged. Could not reach the server',
    );
    expect(screen.getByText('Not acknowledged')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry acknowledgement' }));
    expect(await screen.findByText(/Acknowledgement recorded by the server/)).toBeInTheDocument();
    expect(keys[0]).toBe(keys[1]);
  });

  it('shows authorization failure when acknowledging without permission', async () => {
    const user = userEvent.setup();
    const api = new MockResponderApi({ now });
    render(<ResponderDashboard api={api} now={now} />);
    await user.click(await screen.findByRole('button', { name: 'Open help request DEMO-HR-001' }));
    api.setSession({ role: 'VOLUNTEER', actorId: 'demo-volunteer' });
    await user.click(screen.getByRole('button', { name: 'Acknowledge request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'not authorized for responder actions',
    );
  });

  it('offers no acknowledge action for non-OPEN requests', async () => {
    const user = userEvent.setup();
    const req: HelpRequest = {
      id: 'R1',
      status: 'RESOLVED',
      priority: null,
      createdAt: '2026-10-10T11:00:00Z',
      lastUpdatedAt: '2026-10-10T11:30:00Z',
    };
    render(
      <ResponderDashboard api={new MockResponderApi({ now, helpRequests: [req] })} now={now} />,
    );
    await user.click(screen.getByRole('radio', { name: 'Resolved' }));
    await user.click(await screen.findByRole('button', { name: 'Open help request R1' }));
    expect(screen.queryByRole('button', { name: /Acknowledge/ })).not.toBeInTheDocument();
  });

  it('is keyboard operable', async () => {
    const user = userEvent.setup();
    render(<ResponderDashboard api={new MockResponderApi({ now })} now={now} />);
    const open = await screen.findByRole('button', { name: 'Open help request DEMO-HR-001' });
    open.focus();
    await user.keyboard('{Enter}');
    const heading = screen.getByRole('heading', { name: 'Help request DEMO-HR-001' });
    await waitFor(() => expect(heading).toHaveFocus());
    // The next control after the focused heading is the primary action.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Acknowledge request' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/Acknowledgement recorded by the server/)).toBeInTheDocument();
  });
});

describe('roll-call summary', () => {
  it('never claims campus-wide completion for partial demo data', async () => {
    const user = userEvent.setup();
    render(<ResponderDashboard api={new MockResponderApi({ now })} now={now} />);
    await user.click(screen.getByRole('button', { name: 'Roll-call summary' }));
    expect(await screen.findByText(/not a campus-wide roll call/)).toBeInTheDocument();
    expect(
      screen.getByText(/33 of 40 expected have responded in this scope. 7 not yet accounted for/),
    ).toBeInTheDocument();
    expect(screen.getByText(/DEMO DATA/)).toBeInTheDocument();
  });

  it('shows unavailable instead of estimates when there is no data source', async () => {
    const user = userEvent.setup();
    render(<ResponderDashboard api={new MockResponderApi({ now, rollCall: null })} now={now} />);
    await user.click(screen.getByRole('button', { name: 'Roll-call summary' }));
    expect(await screen.findByText(/Roll-call data is not available/)).toBeInTheDocument();
  });
});

describe('workspace layout', () => {
  it("shows header counts from the server's first page, and refreshes after an acknowledgement", async () => {
    const user = userEvent.setup();
    render(<ResponderDashboard api={new MockResponderApi({ now })} now={now} />);
    const summary = screen.getByRole('group', { name: 'Queue summary' });
    await waitFor(() =>
      expect(within(summary).getByText('Open help requests').nextElementSibling).toHaveTextContent(
        '2',
      ),
    );
    expect(
      within(summary).getByText('Hazards pending review').nextElementSibling,
    ).toHaveTextContent('4');
    await user.click(await screen.findByRole('button', { name: 'Open help request DEMO-HR-001' }));
    await user.click(screen.getByRole('button', { name: 'Acknowledge request' }));
    await waitFor(() =>
      expect(within(summary).getByText('Open help requests').nextElementSibling).toHaveTextContent(
        '1',
      ),
    );
  });

  it("shows 'No access' in the header instead of counts when the server denies access", async () => {
    render(
      <ResponderDashboard
        api={new MockResponderApi({ now, session: { role: 'STUDENT', actorId: 's' } })}
        now={now}
      />,
    );
    await waitFor(() => expect(screen.getAllByText('No access')).toHaveLength(2));
  });

  it('marks the current section in the navigation', async () => {
    const user = userEvent.setup();
    render(<ResponderDashboard api={new MockResponderApi({ now })} now={now} />);
    const nav = screen.getByRole('navigation', { name: 'Responder sections' });
    expect(within(nav).getByRole('button', { name: 'Help requests' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(within(nav).getByRole('button', { name: 'Hazard review' }));
    expect(within(nav).getByRole('button', { name: 'Hazard review' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'Help requests' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Hazard review' })).toBeInTheDocument();
  });

  it('shows a designed empty state when a status has no records', async () => {
    const user = userEvent.setup();
    render(<ResponderDashboard api={new MockResponderApi({ now, helpRequests: [] })} now={now} />);
    expect(await screen.findByText('Nothing open right now')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Assigned' }));
    expect(await screen.findByText('Nothing assigned right now')).toBeInTheDocument();
  });
});
