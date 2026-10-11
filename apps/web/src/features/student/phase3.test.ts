import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryQueueStore, MemoryRecordStore } from '../../lib/offline';
import { HttpStudentApi } from './api/httpStudentApi';
import type { SessionResult, StudentApi } from './api/studentApi';
import { CLIENT_FAILURE } from './api/studentApi';
import {
  photoUploadStatus,
  sendPhotosForHelpRequest,
  type PhotoUploader,
} from './attachments/photoUploads';
import type { StoredPhoto } from './attachments/useAttachments';
import { createCheckInQueue } from './checkIn/checkInQueue';
import type { CheckInDraft, CheckInReceipt } from './contracts/studentContract';

const key = '0b6f4a3e-2c1d-4e5f-8a9b-0c1d2e3f4a5b';
const createdAt = '2026-10-10T09:00:00.000Z';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const helpReceipt: CheckInReceipt = {
  id: 'c1',
  status: 'HELP_REQUESTED',
  deliveryStatus: 'SERVER_RECEIVED',
  serverReceivedAt: '2026-10-10T09:00:01Z',
  clientActionId: key,
  helpRequest: { id: 'h1', status: 'OPEN' },
};

describe('help without a drill or incident (SOS)', () => {
  it('sends a help request with no session to /api/v1/sos with structured location', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(helpReceipt, 201));
    const api = new HttpStudentApi('https://api.example.test', fetchImpl, () => true, 50);
    const draft: CheckInDraft = {
      status: 'HELP_REQUESTED',
      session: null,
      note: 'Locked out at night',
      landmark: 'Hostel gate',
    };
    const outcome = await api.submitCheckIn(draft, key, createdAt);
    expect(outcome).toEqual({ kind: 'accepted', result: helpReceipt });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/v1/sos');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe(key);
    expect(JSON.parse(init?.body as string)).toEqual({
      clientActionId: key,
      clientCreatedAt: createdAt,
      details: 'Locked out at night',
      category: 'OTHER',
      location: { method: 'MANUAL', landmark: 'Hostel gate' },
    });
  });

  function fakeApi(lookup: SessionResult) {
    const submitted: CheckInDraft[] = [];
    const api: StudentApi = {
      submitCheckIn: async (draft) => {
        submitted.push(draft);
        return { kind: 'accepted', result: helpReceipt };
      },
      getActiveSession: async () => lookup,
      listInstructionPacks: async () => ({ kind: 'ok', packs: [] }),
    };
    return { api, submitted };
  }

  it('queued help with no session goes out as SOS when the server has no open event', async () => {
    const { api, submitted } = fakeApi({ kind: 'none' });
    const queue = createCheckInQueue(api, () => true, new MemoryQueueStore());
    const entry = await queue.enqueue({ status: 'HELP_REQUESTED', session: null });
    await queue.flush();
    const sent = queue.getSnapshot().entries.find((e) => e.key === entry.key)!;
    expect(sent.lifecycle).toBe('ACCEPTED');
    expect(submitted[0]).toMatchObject({ status: 'HELP_REQUESTED', session: null });
  });

  it('an "I am safe" check-in with no open event still fails honestly', async () => {
    const { api, submitted } = fakeApi({ kind: 'none' });
    const queue = createCheckInQueue(api, () => true, new MemoryQueueStore());
    const entry = await queue.enqueue({ status: 'CONFIRMED_SAFE', session: null });
    await queue.flush();
    const sent = queue.getSnapshot().entries.find((e) => e.key === entry.key)!;
    expect(sent.lifecycle).toBe('FAILED');
    expect(sent.problemDetail).toBe(CLIENT_FAILURE.noSession);
    expect(submitted).toHaveLength(0);
  });
});

describe('sending photos after the help request is received', () => {
  const photo = (id: string): StoredPhoto => ({
    id,
    bytes: new Uint8Array([0xff, 0xd8, 0xff, id.charCodeAt(0)]).buffer,
    mediaType: 'image/jpeg',
    width: 10,
    height: 10,
    sizeBytes: 4,
    sha256: null,
    createdAt,
    checkInKey: 'entry-1',
  });

  it('uploads each photo once, links them, and resumes after a failure', async () => {
    const store = new MemoryRecordStore<StoredPhoto>();
    await store.put(photo('a'));
    await store.put(photo('b'));
    let failB = true;
    const uploads: string[] = [];
    const links: string[][] = [];
    const uploader: PhotoUploader = {
      upload: async (bytes) => {
        const tag = String.fromCharCode(new Uint8Array(bytes)[3]!);
        if (tag === 'b' && failB) throw new Error('network');
        uploads.push(tag);
        return { id: `server-${tag}` };
      },
      link: async (_help, ids) => {
        links.push(ids);
      },
    };

    const first = await sendPhotosForHelpRequest(store, uploader, 'entry-1', 'h1');
    expect(first).toEqual({ total: 2, sent: 1, failed: 1 });
    expect(links).toEqual([['server-a']]);

    failB = false;
    const second = await sendPhotosForHelpRequest(store, uploader, 'entry-1', 'h1');
    expect(second).toEqual({ total: 2, sent: 2, failed: 0 });
    expect(uploads).toEqual(['a', 'b']); // "a" was not uploaded twice
    expect(links).toEqual([['server-a'], ['server-b']]);
  });

  it('marks photos failed when linking is refused, without losing the uploads', async () => {
    const store = new MemoryRecordStore<StoredPhoto>();
    await store.put(photo('c'));
    const uploader: PhotoUploader = {
      upload: async () => ({ id: 'server-c' }),
      link: async () => {
        throw new Error('403');
      },
    };
    const status = await sendPhotosForHelpRequest(store, uploader, 'entry-1', 'h1');
    expect(status).toEqual({ total: 1, sent: 0, failed: 1 });
    const [stored] = await store.getAll();
    expect(stored).toMatchObject({ serverId: 'server-c', uploadState: 'FAILED' });
    expect(photoUploadStatus([])).toEqual({ total: 0, sent: 0, failed: 0 });
  });
});
