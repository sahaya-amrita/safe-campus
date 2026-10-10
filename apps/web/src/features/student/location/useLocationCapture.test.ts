import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assessFix,
  GOOD_ACCURACY_M,
  MAX_WAIT_MS,
  toCapturedLocation,
  useLocationCapture,
  type LocationEnvironment,
} from './useLocationCapture';

type Success = (p: GeolocationPosition) => void;
type Failure = (e: GeolocationPositionError) => void;

/** A controllable Geolocation: tests push fixes or errors into the active watch. */
function fakeGeo() {
  let success: Success | null = null;
  let failure: Failure | null = null;
  let options: PositionOptions | undefined;
  const geo = {
    watchPosition: vi.fn((ok: Success, fail?: Failure | null, opts?: PositionOptions) => {
      success = ok;
      failure = fail ?? null;
      options = opts;
      return 7;
    }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
  return {
    geo: geo as unknown as Geolocation,
    clearWatch: geo.clearWatch,
    watchPosition: geo.watchPosition,
    options: () => options,
    fix: (accuracy: number, timestamp = Date.now(), lat = 10.9, lng = 76.9) =>
      act(() => success?.({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp } as GeolocationPosition)),
    fail: (code: number) =>
      act(() => failure?.({ code, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)),
  };
}

async function start(env: LocationEnvironment) {
  const hook = renderHook(() => useLocationCapture(env));
  await act(async () => {
    hook.result.current.request();
    await Promise.resolve();
  });
  return hook;
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => vi.useRealTimers());

describe('useLocationCapture', () => {
  it('does nothing until the student taps', () => {
    const g = fakeGeo();
    const { result } = renderHook(() => useLocationCapture({ geolocation: g.geo, isSecureContext: true }));
    expect(result.current.state).toEqual({ kind: 'idle' });
    expect(g.watchPosition).not.toHaveBeenCalled();
  });

  it('asks for high accuracy and refuses cached fixes', async () => {
    const g = fakeGeo();
    await start({ geolocation: g.geo, isSecureContext: true });
    expect(g.options()).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
  });

  it('permission granted: attaches as soon as the fix is good enough, then stops watching', async () => {
    const g = fakeGeo();
    const { result } = await start({ geolocation: g.geo, isSecureContext: true });
    g.fix(GOOD_ACCURACY_M - 5);
    expect(result.current.state).toMatchObject({ kind: 'attached', fix: { accuracyMetres: GOOD_ACCURACY_M - 5 } });
    expect(g.clearWatch).toHaveBeenCalledWith(7);
  });

  it('keeps improving and lets the student use the best fix so far', async () => {
    const g = fakeGeo();
    const { result } = await start({ geolocation: g.geo, isSecureContext: true });
    g.fix(400);
    g.fix(120);
    g.fix(250);
    expect(result.current.state).toMatchObject({ kind: 'locating', best: { accuracyMetres: 120 } });
    act(() => result.current.useBestNow());
    expect(result.current.state).toMatchObject({ kind: 'attached', fix: { accuracyMetres: 120 } });
  });

  it('permission denied → denied, with retry available', async () => {
    const g = fakeGeo();
    const { result } = await start({ geolocation: g.geo, isSecureContext: true });
    g.fail(1);
    expect(result.current.state).toEqual({ kind: 'denied' });
  });

  it('reports denied up front when the Permissions API already knows', async () => {
    const g = fakeGeo();
    const permissions = { query: vi.fn(async () => ({ state: 'denied' }) as PermissionStatus) };
    const { result } = await start({ geolocation: g.geo, isSecureContext: true, permissions });
    expect(result.current.state).toEqual({ kind: 'denied' });
    expect(g.watchPosition).not.toHaveBeenCalled();
  });

  it('timeout → timeout; position unavailable → unavailable', async () => {
    const a = fakeGeo();
    const one = await start({ geolocation: a.geo, isSecureContext: true });
    a.fail(3);
    expect(one.result.current.state).toEqual({ kind: 'timeout' });

    const b = fakeGeo();
    const two = await start({ geolocation: b.geo, isSecureContext: true });
    b.fail(2);
    expect(two.result.current.state).toEqual({ kind: 'unavailable' });
  });

  it('an error after a usable fix keeps that fix', async () => {
    const g = fakeGeo();
    const { result } = await start({ geolocation: g.geo, isSecureContext: true });
    g.fix(80);
    g.fail(3);
    expect(result.current.state).toMatchObject({ kind: 'attached', fix: { accuracyMetres: 80 } });
  });

  it('never spins forever: the watchdog ends an ignored permission prompt', async () => {
    const g = fakeGeo();
    const { result } = await start({ geolocation: g.geo, isSecureContext: true });
    expect(result.current.state.kind).toBe('locating');
    act(() => {
      vi.advanceTimersByTime(MAX_WAIT_MS);
    });
    expect(result.current.state).toEqual({ kind: 'timeout' });
    expect(g.clearWatch).toHaveBeenCalled();
  });

  it('explains insecure origins instead of calling them "denied"', async () => {
    const g = fakeGeo();
    const { result } = await start({ geolocation: g.geo, isSecureContext: false });
    expect(result.current.state).toEqual({ kind: 'insecure' });
    expect(g.watchPosition).not.toHaveBeenCalled();
  });

  it('reports unsupported browsers', async () => {
    const { result } = await start({ geolocation: undefined, isSecureContext: true });
    expect(result.current.state).toEqual({ kind: 'unsupported' });
  });

  it('retry starts a new attempt; remove returns to idle', async () => {
    const g = fakeGeo();
    const { result } = await start({ geolocation: g.geo, isSecureContext: true });
    g.fail(3);
    await act(async () => {
      result.current.request();
      await Promise.resolve();
    });
    expect(result.current.state.kind).toBe('locating');
    g.fix(10);
    act(() => result.current.clear());
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('stops watching when unmounted', async () => {
    const g = fakeGeo();
    const { unmount } = await start({ geolocation: g.geo, isSecureContext: true });
    unmount();
    expect(g.clearWatch).toHaveBeenCalledWith(7);
  });
});

describe('assessFix', () => {
  const now = new Date('2026-10-10T09:10:00.000Z');
  const fix = (accuracyMetres: number, capturedAt: string) => ({ latitude: 0, longitude: 0, accuracyMetres, capturedAt });

  it('flags stale positions (over 2 minutes old)', () => {
    expect(assessFix(fix(10, '2026-10-10T09:07:00.000Z'), now)).toBe('stale');
  });
  it('flags low accuracy (over 100 m)', () => {
    expect(assessFix(fix(150, '2026-10-10T09:09:30.000Z'), now)).toBe('low-accuracy');
  });
  it('accepts recent, accurate fixes', () => {
    expect(assessFix(fix(20, '2026-10-10T09:09:30.000Z'), now)).toBe('good');
  });
});

describe('toCapturedLocation', () => {
  it('uses the device timestamp and rounds accuracy', () => {
    expect(
      toCapturedLocation({ coords: { latitude: 1.5, longitude: 2.5, accuracy: 23.6 } as GeolocationCoordinates, timestamp: Date.UTC(2026, 9, 10, 9) }),
    ).toEqual({ latitude: 1.5, longitude: 2.5, accuracyMetres: 24, capturedAt: '2026-10-10T09:00:00.000Z' });
  });
});
