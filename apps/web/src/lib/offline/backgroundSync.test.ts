import { describe, expect, it, vi } from 'vitest';
import {
  FLUSH_EVENT,
  SYNC_TAG,
  listenForNoticeOpen,
  listenForServiceWorkerFlush,
  requestBackgroundSync,
} from './backgroundSync';

describe('background sync', () => {
  it('registers the outbox tag where the browser supports it', async () => {
    const register = vi.fn(async () => undefined);
    const ok = await requestBackgroundSync({
      ready: Promise.resolve({ sync: { register } } as unknown as ServiceWorkerRegistration),
    });
    expect(ok).toBe(true);
    expect(register).toHaveBeenCalledWith(SYNC_TAG);
  });

  it('reports unsupported browsers and failures without throwing', async () => {
    expect(await requestBackgroundSync(undefined)).toBe(false);
    expect(
      await requestBackgroundSync({
        ready: Promise.resolve({} as ServiceWorkerRegistration),
      }),
    ).toBe(false);
    expect(
      await requestBackgroundSync({
        ready: Promise.resolve({
          sync: { register: () => Promise.reject(new Error('denied')) },
        } as unknown as ServiceWorkerRegistration),
      }),
    ).toBe(false);
  });

  it('turns the worker message into a flush event, and ignores other messages', () => {
    const container = new EventTarget();
    const target = new EventTarget();
    const flushed = vi.fn();
    target.addEventListener(FLUSH_EVENT, flushed);
    const stop = listenForServiceWorkerFlush(
      container as unknown as ServiceWorkerContainer,
      target,
    );
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'other' } }));
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'sahaya-flush' } }));
    expect(flushed).toHaveBeenCalledTimes(1);
    stop();
    container.dispatchEvent(new MessageEvent('message', { data: { type: 'sahaya-flush' } }));
    expect(flushed).toHaveBeenCalledTimes(1);
  });

  it('follows only in-app routes from a tapped notice', () => {
    const container = new EventTarget();
    const go = vi.fn();
    listenForNoticeOpen(container as unknown as ServiceWorkerContainer, go);
    container.dispatchEvent(
      new MessageEvent('message', { data: { type: 'sahaya-open', url: '/#/responder/help' } }),
    );
    for (const url of ['https://evil.example/', '/#/x?y=<script>', 'javascript:alert(1)'])
      container.dispatchEvent(new MessageEvent('message', { data: { type: 'sahaya-open', url } }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('/responder/help');
  });
});
