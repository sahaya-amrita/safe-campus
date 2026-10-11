import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SafePointView } from '@sahaya/contracts';
import { ApiError } from '../api/client';
import type { Me, SahayaApi } from '../api/sahaya';
import { MapDataPage, SafePointsPage } from './NavigationAdmin';

const me: Me = {
  id: 'admin-a',
  email: 'a@test.invalid',
  displayName: 'Admin A',
  language: 'en',
  roles: ['ADMIN'],
  mode: 'DEMO',
};

const point: SafePointView = {
  id: 'p1',
  name: 'Assembly point C',
  kind: 'ASSEMBLY_POINT',
  latitude: 10.9,
  longitude: 76.9,
  buildingId: null,
  notes: null,
  status: 'PROPOSED',
  proposedBy: 'admin-a',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-10-11T09:00:00.000Z',
};

describe('SafePointsPage', () => {
  it('explains the two-person rule when the proposer tries to approve', async () => {
    const api = {
      safePoints: vi.fn(async () => ({ items: [point] })),
      reviewSafePoint: vi.fn(async () => {
        throw new ApiError('CONFLICT', 409, 'SAME_PERSON', 'second admin');
      }),
    } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<SafePointsPage api={api} user={me} />);
    expect(await screen.findByText(/proposed by you/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('Reason (kept in the audit log)'),
      'Checked on site',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A second administrator must approve it.',
    );
  });

  it('proposes a point only with coordinates and a reason', async () => {
    const proposeSafePoint = vi.fn(async () => point);
    const api = {
      safePoints: vi.fn(async () => ({ items: [] })),
      proposeSafePoint,
    } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<SafePointsPage api={api} user={me} />);
    await user.type(await screen.findByLabelText('Name'), 'Assembly point C');
    await user.click(screen.getByRole('button', { name: 'Propose safe point' }));
    expect(screen.getByRole('alert')).toHaveTextContent('latitude and longitude');
    await user.type(screen.getByLabelText('Latitude'), '10.9001');
    await user.type(screen.getByLabelText('Longitude'), '76.9002');
    await user.type(screen.getByLabelText('Reason / source'), 'Estates office plan');
    await user.click(screen.getByRole('button', { name: 'Propose safe point' }));
    expect(proposeSafePoint).toHaveBeenCalledWith({
      name: 'Assembly point C',
      kind: 'ASSEMBLY_POINT',
      latitude: 10.9001,
      longitude: 76.9002,
      reason: 'Estates office plan',
    });
    expect(
      await screen.findByText(/A second administrator must approve it before it is used/),
    ).toBeInTheDocument();
  });
});

describe('MapDataPage', () => {
  it('rejects invalid JSON and shows the server’s graph problems', async () => {
    const api = {
      routeGraphs: vi.fn(async () => ({ items: [] })),
      uploadRouteGraph: vi.fn(async () => {
        throw new ApiError('INVALID', 400, 'INVALID_GRAPH', 'problems', undefined, {
          problems: ['Edge 0 refers to a missing node'],
        });
      }),
    } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<MapDataPage api={api} user={me} />);
    const box = await screen.findByLabelText('Route graph (JSON)');
    await user.type(box, 'not json');
    await user.type(screen.getByLabelText('Reason (kept in the audit log)'), 'Estates survey');
    await user.click(screen.getByRole('button', { name: 'Upload as draft' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This is not valid JSON.');
    await user.clear(box);
    await user.click(box);
    await user.paste('{"version":"v1","source":"Survey","nodes":[],"edges":[]}');
    await user.click(screen.getByRole('button', { name: 'Upload as draft' }));
    expect(await screen.findByText('Edge 0 refers to a missing node')).toBeInTheDocument();
  });
});
