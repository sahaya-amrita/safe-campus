import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AssistantContentView } from '@sahaya/contracts';
import { ApiError } from '../api/client';
import type { SahayaApi } from '../api/sahaya';
import { TomContentPage } from '../admin/TomContentPage';
import { DrillReviewPanel } from './drillReview';

describe('DrillReviewPanel', () => {
  it('lets a drill manager write the review with follow-up actions', async () => {
    let saved: unknown = null;
    const api = {
      drillReview: vi.fn(async () => {
        if (!saved) throw new ApiError('NOT_FOUND', 404, 'NOT_FOUND', 'none');
        return {
          drillId: 'd1',
          ...(saved as object),
          updatedBy: 'u1',
          updatedByName: 'Manager',
          updatedAt: '2026-10-11T10:00:00.000Z',
        };
      }),
      saveDrillReview: vi.fn(async (_id: string, body: unknown) => {
        saved = body;
        return body;
      }),
    } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<DrillReviewPanel api={api} drillId="d1" canEdit />);
    await user.click(await screen.findByRole('button', { name: 'Write the review' }));
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write a short summary');

    await user.type(screen.getByLabelText('What happened (summary)'), 'Evacuated in 6 minutes');
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    await user.type(screen.getByLabelText('Action 1'), 'Fix stairwell signage');
    await user.type(screen.getByLabelText('Owner'), 'Estates');
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(api.saveDrillReview).toHaveBeenCalledWith('d1', {
      summary: 'Evacuated in 6 minutes',
      wentWell: '',
      toImprove: '',
      actions: [
        expect.objectContaining({
          text: 'Fix stairwell signage',
          owner: 'Estates',
          status: 'OPEN',
        }),
      ],
    });
    expect(await screen.findByText(/After-action review · 1 open action/)).toBeInTheDocument();
  });

  it('is read-only for staff who cannot edit', async () => {
    const api = {
      drillReview: vi.fn(async () => {
        throw new ApiError('NOT_FOUND', 404, 'NOT_FOUND', 'none');
      }),
    } as unknown as SahayaApi;
    render(<DrillReviewPanel api={api} drillId="d1" canEdit={false} />);
    expect(await screen.findByText('No after-action review yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('TomContentPage', () => {
  it('approves one help text with a note', async () => {
    const item: AssistantContentView = {
      id: 'screen.overview',
      kind: 'SCREEN_GUIDE',
      title: 'Overview (control room)',
      body: 'The responder home screen.',
      audience: ['RESPONDER'],
      version: '2',
      contentHash: 'abc',
      state: 'DRAFT',
      reviewedBy: null,
      reviewedAt: null,
      validUntil: null,
      notes: null,
    };
    const reviewAssistantContent = vi.fn(async () => ({ docId: item.id, decision: 'APPROVED' }));
    const api = {
      assistantContent: vi.fn(async () => ({ items: [item] })),
      reviewAssistantContent,
    } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<TomContentPage api={api} />);
    expect(await screen.findByText('0 of 1 help texts approved')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve this text' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Review note'), 'Matches the live screen');
    await user.click(within(dialog).getByRole('button', { name: 'Save review' }));
    expect(reviewAssistantContent).toHaveBeenCalledWith('screen.overview', {
      decision: 'APPROVED',
      notes: 'Matches the live screen',
    });
  });
});
