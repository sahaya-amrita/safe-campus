import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryPackCacheStore, MemoryQueueStore, type SendOutcome } from '../../lib/offline';
import { MockStudentApi } from './api/mockStudentApi';
import { createCheckInQueue } from './checkIn/checkInQueue';
import type { CheckIn, CreateCheckInRequest, InstructionPackWithContent } from './contracts/provisional';
import { StudentApp, type StudentDeps } from './StudentApp';

const network = { online: true };

beforeEach(() => {
  network.online = true;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => network.online });
});
afterEach(() => localStorage.clear());

function goOnline() {
  network.online = true;
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

function setup(
  options: {
    scripted?: SendOutcome<CheckIn>[];
    language?: 'en' | 'ta';
    geolocation?: Geolocation;
    queueStore?: MemoryQueueStore<CreateCheckInRequest, CheckIn>;
    packStore?: MemoryPackCacheStore<InstructionPackWithContent>;
    api?: MockStudentApi;
  } = {},
) {
  const api =
    options.api ?? new MockStudentApi({ isOnline: () => network.online, scriptedCheckInOutcomes: options.scripted });
  const queueStore = options.queueStore ?? new MemoryQueueStore<CreateCheckInRequest, CheckIn>();
  const packStore = options.packStore ?? new MemoryPackCacheStore<InstructionPackWithContent>();
  const deps: StudentDeps = {
    api,
    queue: createCheckInQueue(api, () => network.online, queueStore),
    packStore,
    now: () => new Date(),
    usingMockApi: true,
    geolocation: options.geolocation,
    initialLanguage: options.language ?? 'en',
  };
  const user = userEvent.setup();
  const view = render(<StudentApp deps={deps} />);
  return { user, api, deps, queueStore, packStore, ...view };
}

const latest = () => screen.getByTestId('submission');

describe('Student check-in flow', () => {
  it('online success: shows ACCEPTED and says it is not a responder acknowledgement', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: /I'm Safe/ }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'ACCEPTED'));
    expect(latest()).toHaveTextContent('ACCEPTED BY SERVER');
    expect(latest()).toHaveTextContent('This does NOT mean a responder has seen it.');
    expect(latest()).not.toHaveTextContent(/acknowledged|delivered|seen by/i);
  });

  it('offline: queues on the phone, shows NOT SENT, and never calls the server', async () => {
    network.online = false;
    const { user, api } = setup();
    expect(await screen.findByTestId('connection-status')).toHaveTextContent('Offline');
    await user.click(screen.getByRole('button', { name: /I'm Safe/ }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'QUEUED_OFFLINE'));
    expect(latest()).toHaveTextContent('NOT SENT — QUEUED ON THIS PHONE');
    expect(latest()).toHaveTextContent('sent automatically when you are back online');
    expect(latest()).not.toHaveTextContent(/accepted/i);
    expect(api.checkInCalls).toBe(0);
  });

  it('restored connectivity: sends the queued check-in once and updates only after the server replies', async () => {
    network.online = false;
    const { user, api } = setup();
    await user.click(await screen.findByRole('button', { name: /I'm Safe/ }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'QUEUED_OFFLINE'));

    goOnline();
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'ACCEPTED'));
    expect(api.checkInCalls).toBe(1);
    expect(api.storedCount).toBe(1);
    expect(screen.getByTestId('connection-status')).toHaveTextContent('Online');
  });

  it('survives an app reload: a queued check-in is still shown as NOT SENT, then sent once online', async () => {
    network.online = false;
    const queueStore = new MemoryQueueStore<CreateCheckInRequest, CheckIn>();
    const first = setup({ queueStore });
    await first.user.click(await screen.findByRole('button', { name: /I'm Safe/ }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'QUEUED_OFFLINE'));
    first.unmount();

    const second = setup({ queueStore });
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'QUEUED_OFFLINE'));
    goOnline();
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'ACCEPTED'));
    expect(second.api.storedCount).toBe(1);
  });

  it('API timeout: shows NOT CONFIRMED and a server-not-responding connection state', async () => {
    const { user } = setup({ scripted: [{ kind: 'retryable', problem: 'TIMEOUT' }] });
    await user.click(await screen.findByRole('button', { name: /I'm Safe/ }));
    await waitFor(() => expect(latest()).toHaveTextContent('did not respond in time'));
    expect(latest()).toHaveAttribute('data-state', 'QUEUED_OFFLINE');
    expect(latest()).toHaveTextContent('NOT confirmed');
    expect(screen.getByTestId('connection-status')).toHaveTextContent('server is not responding');
  });

  it('permission denied: shows FAILED with fallback, and Retry sends again with the same key', async () => {
    const { user, api } = setup({ scripted: [{ kind: 'failed', problem: 'PERMISSION_DENIED', detail: 'FORBIDDEN' }] });
    await user.click(await screen.findByRole('button', { name: /I'm Safe/ }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'FAILED'));
    expect(latest()).toHaveTextContent('not allowed to send this. It was NOT delivered.');
    expect(latest()).toHaveTextContent('Call 112');

    await user.click(within(latest()).getByRole('button', { name: 'Try sending again' }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'ACCEPTED'));
    expect(api.checkInCalls).toBe(2);
    expect(api.storedCount).toBe(1);
  });

  it('rejected submission: shows FAILED without claiming delivery', async () => {
    const { user } = setup({ scripted: [{ kind: 'failed', problem: 'REJECTED', detail: 'VALIDATION_FAILED' }] });
    await user.click(await screen.findByRole('button', { name: /I'm Safe/ }));
    await waitFor(() => expect(latest()).toHaveTextContent('The server refused this check-in. It was NOT delivered.'));
  });

  it('ignores an accidental repeated tap of the same button', async () => {
    const { user, api } = setup();
    const safe = await screen.findByRole('button', { name: /I'm Safe/ });
    await user.click(safe);
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'ACCEPTED'));
    await user.click(screen.getByRole('button', { name: /I'm Safe/ }));
    expect(await screen.findByText(/Already recorded at/)).toBeInTheDocument();
    expect(api.checkInCalls).toBe(1);
  });

  it('help request: sends with a note, and works when location permission is denied', async () => {
    const denied: Geolocation = {
      getCurrentPosition: (_ok, fail) =>
        fail?.({ code: 1, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError),
      watchPosition: () => 0,
      clearWatch: () => undefined,
    };
    const { user } = setup({ geolocation: denied });
    await user.click(await screen.findByRole('button', { name: /I Need Help/ }));
    expect(screen.getByText(/cannot guarantee anyone will see your request/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add my current location (optional)' }));
    expect(screen.getByText(/Location permission denied/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('What is happening? (optional)'), 'Ankle injury, ground floor stairs');
    await user.click(screen.getByRole('button', { name: 'Send help request' }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'ACCEPTED'));
    expect(latest()).toHaveTextContent('I Need Help');
    expect(latest()).toHaveTextContent('Ankle injury, ground floor stairs');
  });

  it('help request switches status even right after an "I\'m Safe" check-in', async () => {
    const { user, api } = setup();
    await user.click(await screen.findByRole('button', { name: /I'm Safe/ }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'ACCEPTED'));
    await user.click(screen.getByRole('button', { name: /I Need Help/ }));
    await user.click(screen.getByRole('button', { name: 'Send help request' }));
    await waitFor(() => expect(api.checkInCalls).toBe(2));
  });

  it('is fully keyboard operable and moves focus to the result', async () => {
    const { user } = setup();
    const safe = await screen.findByRole('button', { name: /I'm Safe/ });
    safe.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(latest()).toHaveFocus());

    const help = screen.getByRole('button', { name: /I Need Help/ });
    help.focus();
    await user.keyboard(' ');
    expect(screen.getByRole('heading', { name: 'Request help' })).toHaveFocus();
  });
});

describe('Language', () => {
  it('renders the primary flow in Tamil with an unreviewed-translation notice and lang attribute', async () => {
    const { user, container } = setup({ language: 'ta' });
    expect(await screen.findByRole('button', { name: /நான் பாதுகாப்பாக இருக்கிறேன்/ })).toBeInTheDocument();
    expect(screen.getByText(/மொழிபெயர்ப்பு வரைவு/)).toBeInTheDocument();
    expect(container.querySelector('.sc-student')).toHaveAttribute('lang', 'ta');

    await user.click(screen.getByRole('button', { name: /நான் பாதுகாப்பாக இருக்கிறேன்/ }));
    await waitFor(() => expect(latest()).toHaveTextContent('சேவையகம் ஏற்றுக்கொண்டது'));
    expect(latest()).toHaveTextContent('மீட்புப் பணியாளர் இதைப் பார்த்துவிட்டார் என்பதல்ல');
  });

  it('switches language with the toggle and remembers it', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'தமிழ்' }));
    expect(screen.getByRole('button', { name: 'தமிழ்' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('safe-campus.student.language')).toBe('ta');
  });
});

describe('Instruction packs', () => {
  it('labels demo packs as samples and shows version, language and dates', async () => {
    setup();
    const pack = await screen.findByTestId('pack');
    expect(pack).toHaveTextContent('SAMPLE — NOT OFFICIAL CAMPUS INSTRUCTIONS');
    expect(pack).not.toHaveTextContent(/Approved ·/);
    expect(pack).toHaveTextContent('Version 0.0.1-demo');
    expect(pack).toHaveTextContent('Language: en');
    expect(pack).toHaveTextContent(/Expires/);
    expect(pack).toHaveTextContent(/Saved on this phone/);
  });

  it('shows the cached copy while offline', async () => {
    const packStore = new MemoryPackCacheStore<InstructionPackWithContent>();
    const first = setup({ packStore });
    await screen.findByTestId('pack');
    first.unmount();

    network.online = false;
    setup({ packStore });
    expect(await screen.findByText('Offline — showing the copy saved on this phone.')).toBeInTheDocument();
    expect(screen.getByTestId('pack')).toHaveTextContent('SAMPLE');
  });

  it('shows a safe fallback when nothing is cached and the device is offline', async () => {
    network.online = false;
    setup();
    expect(await screen.findByText(/No approved instructions are saved on this phone yet/)).toBeInTheDocument();
  });

  it('marks an expired cached pack and directs the student to campus staff', async () => {
    network.online = false;
    const packStore = new MemoryPackCacheStore<InstructionPackWithContent>();
    await packStore.replaceGroup('en', [
      {
        group: 'en',
        fetchedAt: '2026-01-01T00:00:00Z',
        pack: {
          id: 'old',
          version: '1',
          language: 'en',
          publishedAt: '2025-12-01T00:00:00Z',
          expiresAt: '2026-02-01T00:00:00Z',
          contentHash: 'h',
          sourceLabel: 'Campus Security Office',
          approvalState: 'APPROVED',
          sections: [{ heading: 'Old', body: 'Old content' }],
        },
      },
    ]);
    setup({ packStore });
    const pack = await screen.findByTestId('pack');
    expect(pack).toHaveTextContent('Approved · Campus Security Office');
    expect(within(pack).getByRole('alert')).toHaveTextContent('EXPIRED');
  });
});

describe('Always-visible safety information', () => {
  it('shows prototype status, 112 and that campus contacts are not configured', async () => {
    setup();
    expect(await screen.findByRole('link', { name: 'Emergency? Call 112' })).toHaveAttribute('href', 'tel:112');
    expect(screen.getByText(/Not monitored by campus security/)).toBeInTheDocument();
    expect(screen.getByText('Campus emergency contacts have not been provided yet.')).toBeInTheDocument();
    expect(screen.getByText(/Demo server/)).toBeInTheDocument();
  });
});
