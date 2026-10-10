import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../responder/apiError';
import { MockResponderApi } from '../responder/mockApi';
import type { HazardReport } from './contracts';
import { HazardReviewQueue } from './HazardReviewQueue';

const NOW = new Date('2026-10-10T12:00:00Z');
const now = () => NOW;

async function card(id: string) {
  const list = await screen.findByRole('list', { name: /hazard reports/ });
  const item = within(list).getByText(id).closest('li');
  if (!item) throw new Error(`no card ${id}`);
  return item as HTMLElement;
}

describe('HazardReviewQueue', () => {
  it('shows pending reports as unverified with informational counts and no alert', async () => {
    render(<HazardReviewQueue api={new MockResponderApi({ now })} now={now} />);
    const c = await card('DEMO-HZ-001');
    expect(within(c).getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByText('Blocked pathway (demo): 3 unverified')).toBeInTheDocument();
    expect(screen.getByText(/never raise an official alert/)).toBeInTheDocument();
    // Repeated reports must not produce an alert region or alert wording.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/evacuat|official alert issued|red alert/i)).not.toBeInTheDocument();
  });

  it('requires an explicit decision before submitting', async () => {
    const user = userEvent.setup();
    const api = new MockResponderApi({ now });
    render(<HazardReviewQueue api={api} now={now} />);
    const c = await card('DEMO-HZ-001');
    for (const radio of within(c).getAllByRole('radio')) expect(radio).not.toBeChecked();
    await user.click(within(c).getByRole('button', { name: 'Submit review' }));
    expect(within(c).getByRole('alert')).toHaveTextContent('Choose a review decision.');
    expect(api.auditLog).toHaveLength(0);
  });

  it('records a verification only after the server confirms, attributed by the server', async () => {
    const user = userEvent.setup();
    const api = new MockResponderApi({
      now,
      session: { role: 'RESPONDER', actorId: 'demo-reviewer-7' },
    });
    render(<HazardReviewQueue api={api} now={now} />);
    const c = await card('DEMO-HZ-004');
    await user.click(within(c).getByRole('radio', { name: /Verify/ }));
    expect(within(c).getByText(/does not issue a campus alert/)).toBeInTheDocument();
    await user.type(within(c).getByLabelText(/Review note/), 'Checked in person (demo)');
    await user.click(within(c).getByRole('button', { name: 'Submit review' }));
    expect(
      await screen.findByText(
        /Review saved by the server: DEMO-HZ-004 is now Verified by reviewer \(reviewer demo-reviewer-7\)/,
      ),
    ).toBeInTheDocument();
    const updated = await card('DEMO-HZ-004');
    expect(within(updated).getByText(/not an official campus alert/)).toBeInTheDocument();
    expect(within(updated).getByText(/by demo-reviewer-7/)).toBeInTheDocument();
    expect(api.auditLog.map((a) => a.action)).toEqual(['HAZARD_REVIEWED_VERIFIED']);
  });

  it('leaves the report unchanged when the review fails', async () => {
    const user = userEvent.setup();
    const api = new MockResponderApi({ now });
    render(<HazardReviewQueue api={api} now={now} />);
    const c = await card('DEMO-HZ-001');
    await user.click(within(c).getByRole('radio', { name: /Reject/ }));
    api.failNext(new ApiRequestError(403, 'FORBIDDEN', 'no'));
    await user.click(within(c).getByRole('button', { name: 'Submit review' }));
    expect(await within(c).findByRole('alert')).toHaveTextContent(
      'Review not saved. Your account is not authorized for responder actions. The report is unchanged.',
    );
    expect(within(c).getByText('Pending review')).toBeInTheDocument();
  });

  it('requires a target ID for duplicates', async () => {
    const user = userEvent.setup();
    render(<HazardReviewQueue api={new MockResponderApi({ now })} now={now} />);
    const c = await card('DEMO-HZ-002');
    await user.click(within(c).getByRole('radio', { name: /Duplicate/ }));
    await user.click(within(c).getByRole('button', { name: 'Submit review' }));
    expect(within(c).getByRole('alert')).toHaveTextContent(
      'Enter the ID of the report this duplicates.',
    );
    await user.type(within(c).getByLabelText('Duplicate of report ID'), 'DEMO-HZ-001');
    await user.click(within(c).getByRole('button', { name: 'Submit review' }));
    expect(await screen.findByText(/DEMO-HZ-002 is now Duplicate/)).toBeInTheDocument();
  });

  it('filters by every hazard status with distinct labels', async () => {
    const user = userEvent.setup();
    const reports: HazardReport[] = (
      ['PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'DUPLICATE', 'RESOLVED'] as const
    ).map((status, i) => ({
      id: `H${i}`,
      status,
      category: 'c',
      description: 'd',
      createdAt: '2026-10-10T11:00:00Z',
    }));
    render(
      <HazardReviewQueue api={new MockResponderApi({ now, hazardReports: reports })} now={now} />,
    );
    const labels = ['Pending review', 'Verified by reviewer', 'Rejected', 'Duplicate', 'Resolved'];
    for (const [i, label] of labels.entries()) {
      await user.click(screen.getByRole('radio', { name: label }));
      const c = await card(`H${i}`);
      expect(c.querySelector('.sc-badge__label')).toHaveTextContent(label);
    }
    // Terminal states offer no review form.
    expect(screen.queryByRole('button', { name: 'Submit review' })).not.toBeInTheDocument();
  });

  it('shows access notice when the server denies the reviewer', async () => {
    render(
      <HazardReviewQueue
        api={new MockResponderApi({ now, session: { role: 'STUDENT', actorId: 's' } })}
        now={now}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Responder access required' }),
    ).toBeInTheDocument();
  });
});
