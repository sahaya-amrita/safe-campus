import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SahayaApi } from '../api/sahaya';
import { LocationLine } from '../responder/reportContext';
import { ReportForm, priorityFor } from './ReportForm';

const BUILDING = '50000000-0000-4000-8000-000000000001';
const FLOOR = '50000000-0000-4000-8000-000000000002';

function fakeApi(options: { failUpload?: boolean } = {}) {
  const created: unknown[] = [];
  const api = {
    buildings: vi.fn(async () => ({ items: [{ id: BUILDING, name: 'DEMO Building Alpha' }] })),
    buildingMap: vi.fn(async () => ({
      floors: [{ id: FLOOR, name: 'Ground floor', zones: [] }],
    })),
    uploadPhoto: vi.fn(async () => {
      if (options.failUpload) throw new Error('offline');
      return { id: '60000000-0000-4000-8000-000000000001' };
    }),
    createIncident: vi.fn(async (input: unknown) => {
      created.push(input);
      return {
        id: 'i1',
        verificationStatus: 'REPORTED',
        priority: 'CRITICAL',
        deliveryStatus: 'SERVER_RECEIVED',
        serverReceivedAt: '2026-10-11T10:00:00.000Z',
        dispatch: null,
      };
    }),
  };
  return { api: api as unknown as SahayaApi, raw: api, created };
}

const processor = {
  prepare: vi.fn(async () => ({
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 1]).buffer,
    mediaType: 'image/jpeg' as const,
    width: 10,
    height: 10,
    sha256: null,
  })),
};

const jpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], 'smoke.jpg', { type: 'image/jpeg' });

describe('ReportForm', () => {
  it('derives priority from the answers, never from a student guess', () => {
    expect(priorityFor('CONCERN', 'FIRE_SMOKE')).toBe('LOW');
    expect(priorityFor('EMERGENCY', 'FIRE_SMOKE')).toBe('CRITICAL');
    expect(priorityFor('EMERGENCY', 'MEDICAL')).toBe('CRITICAL');
    expect(priorityFor('EMERGENCY', 'HAZARD')).toBe('HIGH');
  });

  it('asks for the floor first for fire, uploads photos and sends report v2', async () => {
    const { api, raw, created } = fakeApi();
    const user = userEvent.setup();
    render(<ReportForm api={api} online processor={processor} />);

    await user.click(screen.getByRole('button', { name: 'Yes, it is urgent' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Call 112 first if life is at risk');
    await user.click(screen.getByRole('button', { name: /Fire or smoke/ }));
    expect(screen.getByRole('group', { name: 'Where is the fire or smoke?' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('What do you see?'), 'Smoke from the lab vent');
    await user.selectOptions(await screen.findByLabelText('Building'), BUILDING);
    // A named building needs its floor before the report can be sent.
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled();
    await user.selectOptions(await screen.findByLabelText('Floor (required)'), FLOOR);

    await user.upload(screen.getByTestId('report-photo-input'), jpeg());
    expect(await screen.findByText('smoke.jpg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Received by the server')).toBeInTheDocument();
    expect(screen.getByText('1 photo(s) attached.')).toBeInTheDocument();
    expect(raw.uploadPhoto).toHaveBeenCalledTimes(1);
    expect(created[0]).toMatchObject({
      category: 'FIRE_SMOKE',
      kind: 'EMERGENCY',
      priority: 'CRITICAL',
      buildingId: BUILDING,
      floorId: FLOOR,
      attachmentIds: ['60000000-0000-4000-8000-000000000001'],
    });
    expect(screen.getByText(/not sent to anyone as an alert/)).toBeInTheDocument();
  });

  it('still sends the report when a photo cannot be uploaded, and says so', async () => {
    const { api, created } = fakeApi({ failUpload: true });
    const user = userEvent.setup();
    render(<ReportForm api={api} online processor={processor} />);
    await user.click(screen.getByRole('button', { name: 'No, it can wait' }));
    await user.click(screen.getByRole('button', { name: /Hazard/ }));
    await user.type(screen.getByLabelText('What do you see?'), 'Loose floor tile');
    await user.type(screen.getByLabelText('Landmark'), 'Canteen entrance');
    await user.upload(screen.getByTestId('report-photo-input'), jpeg());
    await screen.findByText('smoke.jpg');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(
      await screen.findByText('0 of 1 photos attached. The others could not be sent.'),
    ).toBeInTheDocument();
    expect(created[0]).toMatchObject({
      kind: 'CONCERN',
      priority: 'LOW',
      attachmentIds: [],
      location: { method: 'MANUAL', landmark: 'Canteen entrance' },
    });
  });

  it('explains location before asking, and sends nothing while offline', async () => {
    const { api, raw } = fakeApi();
    const user = userEvent.setup();
    render(<ReportForm api={api} online={false} processor={processor} />);
    await user.click(screen.getByRole('button', { name: 'Add my device location' }));
    expect(screen.getByRole('note')).toHaveTextContent('Location access');
    expect(screen.getByRole('note')).toHaveTextContent('You can type a landmark instead.');
    expect(screen.getByText('You are offline')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled());
    expect(raw.createIncident).not.toHaveBeenCalled();
  });
});

describe('LocationLine', () => {
  it('shows accuracy and age, flags low accuracy, and never calls it verified', () => {
    render(
      <LocationLine
        location={{
          method: 'GPS',
          latitude: 10.90271,
          longitude: 76.90063,
          accuracyM: 240,
          capturedAt: '2026-10-11T10:00:00.000Z',
          landmark: 'Library',
        }}
        reportedAt="2026-10-11T10:10:00.000Z"
      />,
    );
    const line = screen.getByText(/Device location 10\.90271, 76\.90063/);
    expect(line).toHaveTextContent('±240 m');
    expect(line).toHaveTextContent('low accuracy');
    expect(line).toHaveTextContent('captured well before the report');
    expect(line).toHaveTextContent('reported by the student, not verified');
  });
});
