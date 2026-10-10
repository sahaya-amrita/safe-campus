import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALES, type Language } from '../../i18n';
import { en } from '../../i18n/en';
import {
  MemoryPackCacheStore,
  MemoryQueueStore,
  MemoryRecordStore,
  type SendOutcome,
} from '../../lib/offline';
import { MockStudentApi } from './api/mockStudentApi';
import type { ImageProcessor } from './attachments/imageProcessor';
import type { StoredPhoto } from './attachments/useAttachments';
import { createCheckInQueue } from './checkIn/checkInQueue';
import {
  NO_DETAILS_TEXT,
  type CheckInDraft,
  type CheckInReceipt,
  type CheckInSession,
  type StudentInstructionPack,
} from './contracts/studentContract';
import type { LocationEnvironment } from './location/useLocationCapture';
import { StudentApp, type StudentDeps } from './StudentApp';

const network = { online: true };

beforeEach(() => {
  network.online = true;
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => network.online,
  });
});
afterEach(() => localStorage.clear());

function goOnline() {
  network.online = true;
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

const processor: ImageProcessor = {
  prepare: async () => ({
    bytes: new Uint8Array([9, 9, 9]).buffer,
    mediaType: 'image/jpeg',
    width: 1600,
    height: 1200,
    sha256: null,
  }),
};

const geoAt = (accuracy: number): LocationEnvironment => ({
  isSecureContext: true,
  geolocation: {
    watchPosition: (ok: PositionCallback) => {
      ok({
        coords: { latitude: 10.90371, longitude: 76.89999, accuracy },
        timestamp: Date.now(),
      } as GeolocationPosition);
      return 1;
    },
    clearWatch: () => undefined,
    getCurrentPosition: () => undefined,
  } as unknown as Geolocation,
});

const geoDenied: LocationEnvironment = {
  isSecureContext: true,
  geolocation: {
    watchPosition: (_ok: PositionCallback, fail?: PositionErrorCallback | null) => {
      fail?.({
        code: 1,
        message: '',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
      return 1;
    },
    clearWatch: () => undefined,
    getCurrentPosition: () => undefined,
  } as unknown as Geolocation,
};

function setup(
  options: {
    scripted?: SendOutcome<CheckInReceipt>[];
    language?: Language;
    session?: CheckInSession | null;
    locationEnv?: LocationEnvironment;
    queueStore?: MemoryQueueStore<CheckInDraft, CheckInReceipt>;
    packStore?: MemoryPackCacheStore<StudentInstructionPack>;
    photoStore?: MemoryRecordStore<StoredPhoto>;
  } = {},
) {
  const api = new MockStudentApi({
    isOnline: () => network.online,
    scriptedCheckInOutcomes: options.scripted,
    ...(options.session !== undefined ? { session: options.session } : {}),
  });
  const queueStore = options.queueStore ?? new MemoryQueueStore<CheckInDraft, CheckInReceipt>();
  const photoStore = options.photoStore ?? new MemoryRecordStore<StoredPhoto>();
  const persistStorage = vi.fn(async () => 'granted' as const);
  const deps: StudentDeps = {
    api,
    queue: createCheckInQueue(api, () => network.online, queueStore),
    packStore: options.packStore ?? new MemoryPackCacheStore<StudentInstructionPack>(),
    photoStore,
    imageProcessor: processor,
    headroom: async () => ({ availableBytes: null }),
    makePreviewUrl: (p) => `blob:${p.id}`,
    now: () => new Date(),
    usingMockApi: true,
    locationEnv: options.locationEnv ?? geoAt(15),
    initialLanguage: options.language ?? 'en',
    persistStorage,
  };
  const user = userEvent.setup();
  const view = render(<StudentApp deps={deps} />);
  return { user, api, deps, queueStore, photoStore, persistStorage, ...view };
}

const latest = () => screen.getByTestId('submission');
const stepStatuses = () =>
  within(latest())
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-step-status'));
const safeButton = () => screen.findByRole('button', { name: /I'm Safe/ });
const helpButton = () => screen.findByRole('button', { name: /I Need Help/ });
const openTab = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(
    within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name }),
  );
const jpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], 'scene.jpg', { type: 'image/jpeg' });

describe('Check-in and delivery states', () => {
  it('online: SERVER_RECEIVED, contract body sent, responder step untracked', async () => {
    const { user, api } = setup();
    await user.click(await safeButton());
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'SERVER_RECEIVED'));
    expect(latest()).toHaveTextContent('Received by the server');
    expect(latest()).toHaveTextContent('This does not mean a responder has seen it.');
    expect(stepStatuses()).toEqual(['done', 'done', 'done', 'untracked']);
    expect(api.sentBodies[0]).toMatchObject({
      status: 'CONFIRMED_SAFE',
      drillId: expect.any(String),
      clientActionId: expect.any(String),
    });
  });

  it('offline: LOCAL_ONLY, "not sent", and no server call', async () => {
    network.online = false;
    const { user, api } = setup();
    await user.click(await safeButton());
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'LOCAL_ONLY'));
    expect(latest()).toHaveTextContent('Not sent — saved on this phone');
    expect(latest()).toHaveTextContent('sent automatically when you are back online');
    expect(latest()).not.toHaveTextContent(/received by the server|stored your check-in/i);
    expect(stepStatuses()).toEqual(['done', 'paused', 'todo', 'untracked']);
    expect(screen.getByTestId('net-indicator')).toHaveAccessibleName(en.connectionOffline);
    expect(api.checkInCalls).toBe(0);
    // Not delivered: a direct call is offered next to the status.
    expect(within(latest()).getByRole('link', { name: 'Call 112' })).toHaveAttribute(
      'href',
      'tel:112',
    );
  });

  it('reconnect: the queued check-in is sent once and shown received only after the server replies', async () => {
    network.online = false;
    const { user, api } = setup();
    await user.click(await safeButton());
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'LOCAL_ONLY'));
    goOnline();
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'SERVER_RECEIVED'));
    expect(api.checkInCalls).toBe(1);
    expect(api.storedCount).toBe(1);
    // Once the server has it, the undelivered fallback disappears.
    expect(within(latest()).queryByRole('link', { name: 'Call 112' })).toBeNull();
  });

  it('app reload: a saved check-in is still "not sent", then sent once online', async () => {
    network.online = false;
    const queueStore = new MemoryQueueStore<CheckInDraft, CheckInReceipt>();
    const first = setup({ queueStore });
    await first.user.click(await safeButton());
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'LOCAL_ONLY'));
    first.unmount();

    const second = setup({ queueStore });
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'LOCAL_ONLY'));
    goOnline();
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'SERVER_RECEIVED'));
    expect(second.api.storedCount).toBe(1);
  });

  it('timeout: QUEUED "waiting to retry"; sync status says the server is not responding', async () => {
    const { user } = setup({ scripted: [{ kind: 'retryable', problem: 'TIMEOUT' }] });
    await user.click(await safeButton());
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'QUEUED'));
    expect(latest()).toHaveTextContent('Not sent — waiting to retry');
    expect(latest()).toHaveTextContent('did not respond in time');
    await openTab(user, 'Activity');
    expect(screen.getByTestId('sync-status')).toHaveTextContent('server is not responding');
    expect(screen.getByTestId('sync-status')).toHaveTextContent('1 check-in waiting to send');
  });

  it('permission denied: FAILED with the 112 fallback; Retry resends with the same key', async () => {
    const { user, api } = setup({
      scripted: [{ kind: 'failed', problem: 'PERMISSION_DENIED', detail: 'FORBIDDEN' }],
    });
    await user.click(await safeButton());
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'FAILED'));
    expect(latest()).toHaveTextContent('not allowed to send this. It was not delivered.');
    expect(latest()).toHaveTextContent('Call 112');
    await user.click(within(latest()).getByRole('button', { name: 'Try sending again' }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'SERVER_RECEIVED'));
    expect(api.checkInCalls).toBe(2);
    expect(api.storedCount).toBe(1);
  });

  it('no active drill or incident: says so up front, and a check-in fails honestly', async () => {
    const { user } = setup({ session: null });
    expect(await screen.findByText(/No active drill or incident right now/)).toBeInTheDocument();
    await user.click(await safeButton());
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'FAILED'));
    expect(latest()).toHaveTextContent(
      'No active drill or incident was known when you pressed this',
    );
  });

  it('shows which drill check-ins are attached to', async () => {
    setup();
    expect(await screen.findByTestId('session-bar')).toHaveTextContent(
      'Checking in for: Demonstration drill (not a real event)',
    );
  });

  it('ignores an accidental double tap of the same button', async () => {
    const { user, api } = setup();
    await user.click(await safeButton());
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'SERVER_RECEIVED'));
    await user.click(await safeButton());
    expect(await screen.findByText(/Already recorded at/)).toBeInTheDocument();
    expect(api.checkInCalls).toBe(1);
  });

  it('asks the browser for persistent storage once, after the first check-in is saved', async () => {
    const { user, persistStorage } = setup();
    expect(persistStorage).not.toHaveBeenCalled();
    await user.click(await safeButton());
    await waitFor(() => expect(persistStorage).toHaveBeenCalledTimes(1));
    await user.click(await helpButton());
    await user.click(screen.getByRole('button', { name: 'Send help request' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(persistStorage).toHaveBeenCalledTimes(1);
  });
});

describe('Help request', () => {
  it('opens a focused sheet that can be sent immediately with no details', async () => {
    const { user, api } = setup();
    await user.click(await helpButton());
    const dialog = screen.getByRole('dialog', { name: 'Request help' });
    expect(screen.getByRole('heading', { name: 'Request help' })).toHaveFocus();
    expect(
      within(dialog).getByText(/cannot guarantee anyone will see your request/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Call 112/ })).toHaveAttribute(
      'href',
      'tel:112',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Send help request' }));
    await waitFor(() => expect(latest()).toHaveAttribute('data-state', 'SERVER_RECEIVED'));
    expect(api.sentBodies[0]).toMatchObject({
      status: 'HELP_REQUESTED',
      helpDetails: NO_DETAILS_TEXT,
    });
    expect(latest()).toHaveTextContent('Your help request is open on the server');
    expect(latest()).toHaveTextContent('no responder has confirmed seeing it');
  });

  it('sends the note, landmark and an accurate GPS fix in helpDetails', async () => {
    const { user, api } = setup({ locationEnv: geoAt(12) });
    await user.click(await helpButton());
    await user.type(screen.getByLabelText('What is happening? (optional)'), 'Twisted ankle');
    await user.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByText('Location attached')).toBeInTheDocument();
    expect(screen.getByText(/Accurate to about 12 m/)).toHaveTextContent(/Captured at/);
    await user.type(screen.getByLabelText('Building, floor or landmark'), 'Library steps');
    await user.click(screen.getByRole('button', { name: 'Send help request' }));
    await waitFor(() => expect(api.sentBodies).toHaveLength(1));
    const details = (api.sentBodies[0] as { helpDetails: string }).helpDetails;
    expect(details).toContain('Twisted ankle');
    expect(details).toContain('Location described by student: Library steps');
    expect(details).toMatch(/Device location \(±12 m, captured .+\): 10\.90371, 76\.89999/);
  });

  it('warns about a low-accuracy fix but still lets the student send', async () => {
    const { user } = setup({ locationEnv: geoAt(180) });
    await user.click(await helpButton());
    await user.click(screen.getByRole('button', { name: 'Use my current location' }));
    await user.click(await screen.findByRole('button', { name: 'Use this location' }));
    expect(screen.getByText(/Accuracy is low \(about 180 m\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send help request' })).toBeEnabled();
  });

  it('GPS denied: explains, offers retry, and the request still sends without location', async () => {
    const { user, api } = setup({ locationEnv: geoDenied });
    await user.click(await helpButton());
    await user.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByText(/Location is turned off for this site/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get location again' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send help request' }));
    await waitFor(() => expect(api.sentBodies).toHaveLength(1));
    expect((api.sentBodies[0] as { helpDetails: string }).helpDetails).not.toContain(
      'Device location',
    );
  });

  it('insecure page: explains https instead of claiming permission was denied', async () => {
    const { user } = setup({
      locationEnv: { isSecureContext: false, geolocation: geoAt(5).geolocation },
    });
    await user.click(await helpButton());
    await user.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByText(/This page is not secure \(https\)/)).toBeInTheDocument();
  });

  it('photos stay on the phone, are never sent, and can be deleted afterwards', async () => {
    const { user, api, photoStore } = setup();
    await user.click(await helpButton());
    expect(screen.getByText(/Photos stay on this phone/)).toBeInTheDocument();
    await user.upload(screen.getByTestId('photo-library-input'), jpeg());
    expect(await screen.findByRole('img', { name: 'Photo 1' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^blob:/),
    );
    expect(screen.getByText('1 of 3 photos')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send help request' }));
    await waitFor(() =>
      expect(latest()).toHaveTextContent('1 photo kept on this phone only — not sent'),
    );
    expect(JSON.stringify(api.sentBodies[0])).not.toMatch(/photo|attachment|image/i);
    expect([...photoStore.rows.values()][0]?.checkInKey).toEqual(expect.any(String));

    await user.click(
      within(latest()).getByRole('button', { name: 'Delete photos from this phone' }),
    );
    await waitFor(() => expect(latest()).not.toHaveTextContent('photo kept on this phone'));
    expect(photoStore.rows.size).toBe(0);
  });

  it('closing the sheet discards photos picked in it; Escape closes', async () => {
    const { user, photoStore } = setup();
    await user.click(await helpButton());
    await user.upload(screen.getByTestId('photo-library-input'), jpeg());
    await screen.findByRole('img', { name: 'Photo 1' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(photoStore.rows.size).toBe(0));

    await user.click(await helpButton());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rejects a non-image file with a clear message', async () => {
    const { user } = setup();
    await user.click(await helpButton());
    const fake = new File([new TextEncoder().encode('%PDF-1.7')], 'scan.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByTestId('photo-library-input'), fake);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only JPEG, PNG or WebP photos can be added.',
    );
  });
});

describe('Navigation, sync status and accessibility', () => {
  it('tab bar switches screens and marks the current one', async () => {
    const { user } = setup();
    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await openTab(user, 'Guides');
    expect(within(nav).getByRole('button', { name: 'Guides' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByTestId('instruction-packs')).toBeInTheDocument();
    await openTab(user, 'Activity');
    expect(screen.getByTestId('sync-status')).toBeInTheDocument();
  });

  it('sync status is honest about offline readiness when no service worker controls the page', async () => {
    const { user } = setup();
    await openTab(user, 'Activity');
    expect(screen.getByTestId('offline-ready')).toHaveTextContent('Not yet saved for offline use');
    expect(
      screen.getByText('Nothing from this phone has reached the server yet.'),
    ).toBeInTheDocument();
  });

  it('keyboard: Enter on "I\'m Safe" sends and focus moves to the result', async () => {
    const { user } = setup();
    (await safeButton()).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(latest()).toHaveFocus());
  });

  it('lists earlier check-ins with their own delivery state', async () => {
    network.online = false;
    const { user } = setup();
    await user.click(await safeButton());
    await user.click(await helpButton());
    await user.click(screen.getByRole('button', { name: 'Send help request' }));
    await openTab(user, 'Activity');
    const item = await screen.findByTestId('activity-item');
    expect(item).toHaveAttribute('data-state', 'LOCAL_ONLY');
    expect(item).toHaveTextContent("I'm Safe");
  });
});

describe('Languages', () => {
  it.each(LOCALES.map((l) => [l.code, l] as const))(
    '%s: primary flow in its own script',
    async (code, locale) => {
      const { container, user } = setup({ language: code });
      expect(
        await screen.findByRole('button', {
          name: new RegExp(escape(locale.messages.checkInSafe)),
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: new RegExp(escape(locale.messages.checkInNeedHelp)) }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        locale.messages.checkInHeading,
      );
      const root = container.querySelector('.sc-student');
      expect(root).toHaveAttribute('lang', code);
      expect(root).toHaveAttribute('data-script', locale.script);
      if (code === 'en') {
        expect(screen.queryByTestId('english-source')).not.toBeInTheDocument();
      } else {
        expect(screen.getAllByTestId('english-source')[0]).toHaveTextContent(en.prototypeBody);
        await user.click(
          within(screen.getByRole('navigation')).getByRole('button', {
            name: locale.messages.navActivity,
          }),
        );
        expect(screen.getByTestId('draft-notice')).toHaveTextContent(locale.messages.draftNotice);
      }
    },
  );

  it('language menu lists six languages with draft badges, switches and remembers', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Language: English' }));
    const group = screen.getByRole('group', { name: 'Language' });
    expect(within(group).getAllByRole('button')).toHaveLength(6);
    expect(within(group).getAllByText('Draft translation')).toHaveLength(5);
    await user.click(within(group).getByRole('button', { name: /తెలుగు/ }));
    expect(localStorage.getItem('safe-campus.student.language')).toBe('te');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'మీరు ఇప్పుడు ఎలా ఉన్నారు?',
    );
  });

  it('language menu closes on Escape and returns focus', async () => {
    const { user } = setup();
    const trigger = await screen.findByRole('button', { name: 'Language: English' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });
});

describe('Instructions (Guides)', () => {
  it('labels demo packs as samples with version, language and dates', async () => {
    const { user } = setup();
    await openTab(user, 'Guides');
    const pack = await screen.findByTestId('pack');
    expect(pack).toHaveTextContent('Sample — not official campus instructions');
    expect(pack).not.toHaveTextContent(/Approved by/);
    expect(pack).toHaveTextContent('Version 0.0.1-demo');
    expect(pack).toHaveTextContent('Language: English');
    expect(pack).toHaveTextContent(/Saved on this phone/);
  });

  it('falls back explicitly to English for languages the API does not provide', async () => {
    const { user } = setup({ language: 'kn' });
    await user.click(
      within(await screen.findByRole('navigation')).getByRole('button', { name: 'ಮಾರ್ಗದರ್ಶಿಗಳು' }),
    );
    expect(await screen.findByTestId('packs-fallback')).toHaveTextContent('ಕನ್ನಡ');
    expect(await screen.findByTestId('pack')).toHaveTextContent('About this sample');
  });

  it('shows the cached copy while offline', async () => {
    const packStore = new MemoryPackCacheStore<StudentInstructionPack>();
    const first = setup({ packStore });
    await openTab(first.user, 'Guides');
    await screen.findByTestId('pack');
    first.unmount();

    network.online = false;
    const second = setup({ packStore });
    await openTab(second.user, 'Guides');
    expect(
      await screen.findByText('Offline. Showing the copy saved on this phone.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pack')).toHaveTextContent('Sample');
  });

  it('marks an expired published pack and directs the student to campus staff', async () => {
    network.online = false;
    const packStore = new MemoryPackCacheStore<StudentInstructionPack>();
    await packStore.replaceGroup('en', [
      {
        group: 'en',
        fetchedAt: '2026-01-01T00:00:00Z',
        pack: {
          id: 'old',
          version: '1',
          language: 'en',
          title: 'Fire',
          content: { sections: [{ heading: 'Old', body: 'Old content' }] },
          contentHash: 'a'.repeat(64),
          sourceLabel: 'Campus Security Office',
          approvalState: 'PUBLISHED',
          publishedAt: '2025-12-01T00:00:00Z',
          expiresAt: '2026-02-01T00:00:00Z',
        },
      },
    ]);
    const { user } = setup({ packStore });
    await openTab(user, 'Guides');
    const pack = await screen.findByTestId('pack');
    expect(pack).toHaveTextContent('Approved by Campus Security Office');
    expect(within(pack).getByRole('alert')).toHaveTextContent('Expired');
  });
});

describe('Brand and always-visible safety information', () => {
  it('shows the Amrita Sahaya brand, prototype warning and 112 with its limits', async () => {
    const { user } = setup();
    expect(await screen.findByLabelText('Amrita Sahaya')).toBeInTheDocument();
    expect(screen.getByText('Prepared Together. Protected Together.')).toBeInTheDocument();
    expect(screen.getByText(/campus security does not monitor this app/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Call 112/ })).toHaveAttribute('href', 'tel:112');
    expect(screen.getByText(/national emergency number/)).toHaveTextContent('Not a campus number');
    expect(screen.getByText(/needs mobile network coverage/)).toBeInTheDocument();
    await openTab(user, 'Guides');
    expect(screen.getByText(/has not provided approved contact numbers yet/)).toBeInTheDocument();
    await openTab(user, 'Activity');
    expect(screen.getByText(/Demo server/)).toBeInTheDocument();
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
