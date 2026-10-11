import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OfflineStorageError,
  storageHeadroom,
  type RecordStore,
  type StorageHeadroom,
} from '../../../lib/offline';
import type { ImageProcessor } from './imageProcessor';
import { MAX_PHOTOS, precheckPhoto, type PhotoRejection } from './photoPolicy';

/**
 * A photo kept privately on this device (IndexedDB). There is no upload
 * contract yet (Codex 1), so photos are never transmitted. `checkInKey` is
 * null while the student is still composing; set when the request is sent.
 */
export interface StoredPhoto {
  id: string;
  bytes: ArrayBuffer;
  mediaType: 'image/jpeg';
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string | null;
  createdAt: string;
  checkInKey: string | null;
  /** Server attachment id once uploaded (Phase 3). */
  serverId?: string;
  /** UPLOADED: on the server, not yet linked. LINKED: part of the help request. */
  uploadState?: 'UPLOADED' | 'LINKED' | 'FAILED';
}

export interface PhotoItem {
  id: string;
  previewUrl: string;
  sizeBytes: number;
}

export interface AttachmentDeps {
  store: RecordStore<StoredPhoto>;
  processor: ImageProcessor;
  headroom?: () => Promise<StorageHeadroom>;
  makePreviewUrl?: (photo: StoredPhoto) => string;
  revokePreviewUrl?: (url: string) => void;
  newId?: () => string;
  now?: () => Date;
}

const defaultPreview = (photo: StoredPhoto) =>
  typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(new Blob([photo.bytes], { type: photo.mediaType }))
    : '';
const defaultRevoke = (url: string) => {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
};

function isQuotaError(error: unknown): boolean {
  const cause =
    error instanceof OfflineStorageError
      ? (error.cause as { name?: string } | undefined)
      : (error as { name?: string });
  return (
    cause?.name === 'QuotaExceededError' || (error instanceof Error && /quota/i.test(error.message))
  );
}

/** Photos linked to a sent check-in, and removal of them. */
export async function photosForCheckIn(
  store: RecordStore<StoredPhoto>,
  key: string,
): Promise<StoredPhoto[]> {
  return (await store.getAll()).filter((p) => p.checkInKey === key);
}
export async function deletePhotosForCheckIn(
  store: RecordStore<StoredPhoto>,
  key: string,
): Promise<void> {
  for (const photo of await photosForCheckIn(store, key)) await store.delete(photo.id);
}

/** Photo selection for the help sheet. Never blocks sending the request itself. */
export function useAttachments(deps: AttachmentDeps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<PhotoRejection | null>(null);
  const urls = useRef(new Map<string, string>());
  const preview = deps.makePreviewUrl ?? defaultPreview;
  const revoke = deps.revokePreviewUrl ?? defaultRevoke;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date());
  const headroom = deps.headroom ?? (() => storageHeadroom());

  const toItem = useCallback(
    (photo: StoredPhoto): PhotoItem => {
      const url = preview(photo);
      urls.current.set(photo.id, url);
      return { id: photo.id, previewUrl: url, sizeBytes: photo.sizeBytes };
    },
    [preview],
  );

  // Restore photos picked before a refresh or app restart (not yet sent).
  useEffect(() => {
    let cancelled = false;
    void deps.store
      .getAll()
      .then((all) => {
        if (cancelled) return;
        const unsent = all
          .filter((p) => p.checkInKey === null)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        setPhotos(unsent.slice(0, MAX_PHOTOS).map(toItem));
      })
      .catch(() => {
        if (!cancelled) setLastError('STORAGE_FAILED');
      });
    const current = urls.current;
    return () => {
      cancelled = true;
      current.forEach((url) => revoke(url));
      current.clear();
    };
    // Only on mount: the store and helpers are stable for the sheet's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addOne = useCallback(
    async (file: File, countSoFar: number): Promise<PhotoItem | PhotoRejection> => {
      const check = await precheckPhoto(file, countSoFar);
      if (!check.ok) return check.reason;
      let prepared;
      try {
        prepared = await deps.processor.prepare(file);
      } catch {
        return 'UNREADABLE';
      }
      const room = await headroom();
      if (room.availableBytes !== null && room.availableBytes < prepared.bytes.byteLength * 2)
        return 'STORAGE_FULL';
      const record: StoredPhoto = {
        id: newId(),
        bytes: prepared.bytes,
        mediaType: prepared.mediaType,
        width: prepared.width,
        height: prepared.height,
        sizeBytes: prepared.bytes.byteLength,
        sha256: prepared.sha256,
        createdAt: now().toISOString(),
        checkInKey: null,
      };
      try {
        await deps.store.put(record);
      } catch (error) {
        return isQuotaError(error) ? 'STORAGE_FULL' : 'STORAGE_FAILED';
      }
      return toItem(record);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deps.processor, deps.store, toItem],
  );

  const add = useCallback(
    async (files: Iterable<File>) => {
      setBusy(true);
      setLastError(null);
      let count = photos.length;
      const added: PhotoItem[] = [];
      for (const file of files) {
        const result = await addOne(file, count);
        if (typeof result === 'string') {
          setLastError(result);
          if (result === 'TOO_MANY') break;
          continue;
        }
        added.push(result);
        count++;
      }
      setPhotos((current) => [...current, ...added]);
      setBusy(false);
    },
    [addOne, photos.length],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deps.store.delete(id);
      } catch {
        setLastError('STORAGE_FAILED');
        return;
      }
      const url = urls.current.get(id);
      if (url) revoke(url);
      urls.current.delete(id);
      setPhotos((current) => current.filter((p) => p.id !== id));
    },
    [deps.store, revoke],
  );

  /** Replaces one photo: the new one is stored first, so a failure leaves the old one in place. */
  const replace = useCallback(
    async (id: string, file: File) => {
      setBusy(true);
      setLastError(null);
      const result = await addOne(file, photos.length - 1);
      if (typeof result === 'string') setLastError(result);
      else {
        await remove(id);
        setPhotos((current) => [...current.filter((p) => p.id !== id), result]);
      }
      setBusy(false);
    },
    [addOne, photos.length, remove],
  );

  /** Called after the request is queued: ties the photos to it and clears the sheet. */
  const linkTo = useCallback(
    async (checkInKey: string) => {
      const all = await deps.store.getAll().catch(() => [] as StoredPhoto[]);
      const ids = new Set(photos.map((p) => p.id));
      for (const record of all)
        if (ids.has(record.id))
          await deps.store.put({ ...record, checkInKey }).catch(() => undefined);
      urls.current.forEach((url) => revoke(url));
      urls.current.clear();
      setPhotos([]);
    },
    [deps.store, photos, revoke],
  );

  /** Cancel: unsent photos are deleted from the device. */
  const discard = useCallback(async () => {
    for (const photo of photos) await remove(photo.id);
  }, [photos, remove]);

  return {
    photos,
    busy,
    lastError,
    add,
    remove,
    replace,
    linkTo,
    discard,
    ids: photos.map((p) => p.id),
  };
}
