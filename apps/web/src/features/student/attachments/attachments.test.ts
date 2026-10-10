import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRecordStore, OfflineStorageError } from '../../../lib/offline';
import type { ImageProcessor, PreparedImage } from './imageProcessor';
import { fitWithin, MAX_INPUT_BYTES, MAX_PHOTOS, precheckPhoto, sniffImageType } from './photoPolicy';
import { deletePhotosForCheckIn, photosForCheckIn, useAttachments, type StoredPhoto } from './useAttachments';

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)));

function file(bytes: number[], name = 'photo.jpg', type = 'image/jpeg', size?: number): File {
  const f = new File([new Uint8Array(bytes)], name, { type });
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
}

const okProcessor: ImageProcessor = {
  prepare: vi.fn(
    async (): Promise<PreparedImage> => ({ bytes: new Uint8Array([1, 2, 3]).buffer, mediaType: 'image/jpeg', width: 1600, height: 1200, sha256: 'ab'.repeat(32) }),
  ),
};

function setup(overrides: { store?: MemoryRecordStore<StoredPhoto>; processor?: ImageProcessor; free?: number | null } = {}) {
  let n = 0;
  const store = overrides.store ?? new MemoryRecordStore<StoredPhoto>();
  const hook = renderHook(() =>
    useAttachments({
      store,
      processor: overrides.processor ?? okProcessor,
      headroom: async () => ({ availableBytes: overrides.free === undefined ? null : overrides.free }),
      makePreviewUrl: (p) => `blob:${p.id}`,
      revokePreviewUrl: () => undefined,
      newId: () => `p${++n}`,
      now: () => new Date('2026-10-10T09:00:00.000Z'),
    }),
  );
  return { ...hook, store };
}

describe('photo policy', () => {
  it('identifies JPEG, PNG and WebP by their bytes, not their name', () => {
    expect(sniffImageType(new Uint8Array(JPEG))).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array(PNG))).toBe('image/png');
    expect(sniffImageType(new Uint8Array(WEBP))).toBe('image/webp');
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
  });

  it('rejects disguised files, oversized files and a fourth photo', async () => {
    expect(await precheckPhoto(file([0x25, 0x50, 0x44, 0x46], 'scan.jpg'), 0)).toEqual({ ok: false, reason: 'UNSUPPORTED_TYPE' });
    expect(await precheckPhoto(file(JPEG, 'big.jpg', 'image/jpeg', MAX_INPUT_BYTES + 1), 0)).toEqual({ ok: false, reason: 'TOO_LARGE' });
    expect(await precheckPhoto(file(JPEG), MAX_PHOTOS)).toEqual({ ok: false, reason: 'TOO_MANY' });
    expect(await precheckPhoto(file(PNG, 'a.png', 'image/png'), 2)).toEqual({ ok: true, type: 'image/png' });
  });

  it('scales down to fit 1600 px without enlarging small photos', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('useAttachments', () => {
  it('stores valid photos privately on the device and shows previews', async () => {
    const { result, store } = setup();
    await act(() => result.current.add([file(JPEG), file(PNG, 'b.png', 'image/png')]));
    expect(result.current.photos.map((p) => p.previewUrl)).toEqual(['blob:p1', 'blob:p2']);
    expect([...store.rows.values()].every((r) => r.checkInKey === null && r.mediaType === 'image/jpeg')).toBe(true);
  });

  it('rejects an invalid format and keeps the valid ones', async () => {
    const { result } = setup();
    await act(() => result.current.add([file([0x00, 0x01, 0x02], 'x.webp', 'image/webp'), file(JPEG)]));
    expect(result.current.photos).toHaveLength(1);
    expect(result.current.lastError).toBe('UNSUPPORTED_TYPE');
  });

  it('stops at three photos', async () => {
    const { result } = setup();
    await act(() => result.current.add([file(JPEG), file(JPEG), file(JPEG), file(JPEG)]));
    expect(result.current.photos).toHaveLength(3);
    expect(result.current.lastError).toBe('TOO_MANY');
  });

  it('reports a file that cannot be decoded as a photo', async () => {
    const { result } = setup({ processor: { prepare: async () => Promise.reject(new Error('decode')) } });
    await act(() => result.current.add([file(JPEG)]));
    expect(result.current.photos).toHaveLength(0);
    expect(result.current.lastError).toBe('UNREADABLE');
  });

  it('reports a full device before writing, and a quota error while writing', async () => {
    const full = setup({ free: 2 });
    await act(() => full.result.current.add([file(JPEG)]));
    expect(full.result.current.lastError).toBe('STORAGE_FULL');

    const store = new MemoryRecordStore<StoredPhoto>();
    store.put = async () => {
      throw new OfflineStorageError('write failed', { cause: new DOMException('quota', 'QuotaExceededError') });
    };
    const quota = setup({ store });
    await act(() => quota.result.current.add([file(JPEG)]));
    expect(quota.result.current.lastError).toBe('STORAGE_FULL');
  });

  it('reports other storage failures', async () => {
    const store = new MemoryRecordStore<StoredPhoto>();
    store.failWrites = true;
    const { result } = setup({ store });
    await act(() => result.current.add([file(JPEG)]));
    expect(result.current.lastError).toBe('STORAGE_FAILED');
  });

  it('removes and replaces photos', async () => {
    const { result, store } = setup();
    await act(() => result.current.add([file(JPEG), file(JPEG)]));
    await act(() => result.current.remove('p1'));
    expect(result.current.photos.map((p) => p.id)).toEqual(['p2']);
    expect(store.rows.has('p1')).toBe(false);

    await act(() => result.current.replace('p2', file(PNG, 'c.png', 'image/png')));
    expect(result.current.photos.map((p) => p.id)).toEqual(['p3']);
    expect([...store.rows.keys()]).toEqual(['p3']);
  });

  it('a failed replacement keeps the original photo', async () => {
    const { result } = setup();
    await act(() => result.current.add([file(JPEG)]));
    await act(() => result.current.replace('p1', file([0x00], 'bad.jpg')));
    expect(result.current.photos.map((p) => p.id)).toEqual(['p1']);
  });

  it('restores unsent photos after a refresh', async () => {
    const store = new MemoryRecordStore<StoredPhoto>();
    const first = setup({ store });
    await act(() => first.result.current.add([file(JPEG)]));
    first.unmount();

    const second = setup({ store });
    await waitFor(() => expect(second.result.current.photos).toHaveLength(1));
  });

  it('links photos to the sent request and lets the student delete them later', async () => {
    const { result, store } = setup();
    await act(() => result.current.add([file(JPEG), file(JPEG)]));
    await act(() => result.current.linkTo('check-in-1'));
    expect(result.current.photos).toHaveLength(0);
    expect((await photosForCheckIn(store, 'check-in-1')).map((p) => p.id)).toEqual(['p1', 'p2']);

    await deletePhotosForCheckIn(store, 'check-in-1');
    expect(store.rows.size).toBe(0);
  });

  it('discard deletes unsent photos from the device', async () => {
    const { result, store } = setup();
    await act(() => result.current.add([file(JPEG)]));
    await act(() => result.current.discard());
    expect(store.rows.size).toBe(0);
  });
});
