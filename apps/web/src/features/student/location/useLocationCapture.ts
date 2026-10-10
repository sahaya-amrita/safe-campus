import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapturedLocation } from '../contracts/studentContract';

/**
 * Location capture for a help request.
 *
 * Root causes this design addresses (see student README "Location"):
 * 1. Insecure origins (e.g. http://<LAN-IP> during phone testing) make the
 *    browser reject geolocation instantly; that used to be shown as
 *    "permission denied". It is now detected and explained up front.
 * 2. After any failure there was no way to try again. Every terminal state
 *    now offers Retry.
 * 3. The Geolocation `timeout` does not count time spent on the permission
 *    prompt, so an ignored prompt could spin forever. A watchdog bounds it.
 * 4. Low-accuracy mode and a 60 s cache produced coarse or stale fixes.
 *    We now ask for high accuracy, refuse cached fixes, keep the best fix
 *    seen, and label stale or coarse results.
 */

export const GOOD_ACCURACY_M = 30;
export const LOW_ACCURACY_M = 100;
export const STALE_AFTER_MS = 2 * 60 * 1000;
export const MAX_WAIT_MS = 25_000;

export type LocationQuality = 'good' | 'low-accuracy' | 'stale';

export type LocationState =
  | { kind: 'idle' }
  | { kind: 'insecure' }
  | { kind: 'unsupported' }
  | { kind: 'locating'; best: CapturedLocation | null }
  | { kind: 'attached'; fix: CapturedLocation }
  | { kind: 'denied' }
  | { kind: 'timeout' }
  | { kind: 'unavailable' };

export function assessFix(fix: CapturedLocation, now: Date): LocationQuality {
  if (now.getTime() - Date.parse(fix.capturedAt) > STALE_AFTER_MS) return 'stale';
  if (fix.accuracyMetres > LOW_ACCURACY_M) return 'low-accuracy';
  return 'good';
}

export function toCapturedLocation(position: Pick<GeolocationPosition, 'coords' | 'timestamp'>): CapturedLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMetres: Math.max(1, Math.round(position.coords.accuracy)),
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

export interface LocationEnvironment {
  geolocation?: Geolocation;
  /** `false` on insecure origins. Undefined (some test environments) is treated as secure. */
  isSecureContext?: boolean;
  permissions?: Pick<Permissions, 'query'>;
}

function defaultEnvironment(): LocationEnvironment {
  const nav = globalThis.navigator;
  return {
    geolocation: nav?.geolocation,
    isSecureContext: globalThis.isSecureContext,
    permissions: nav?.permissions,
  };
}

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 };

export function useLocationCapture(environment?: LocationEnvironment) {
  const env = environment ?? defaultEnvironment();
  const [state, setState] = useState<LocationState>({ kind: 'idle' });
  const watchId = useRef<number | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const best = useRef<CapturedLocation | null>(null);
  const mounted = useRef(true);

  const stop = useCallback(() => {
    if (watchId.current !== null) env.geolocation?.clearWatch(watchId.current);
    if (watchdog.current !== null) clearTimeout(watchdog.current);
    watchId.current = null;
    watchdog.current = null;
  }, [env.geolocation]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, [stop]);

  const finish = useCallback(
    (next: LocationState) => {
      stop();
      if (mounted.current) setState(next);
    },
    [stop],
  );

  const request = useCallback(async () => {
    stop();
    best.current = null;
    if (env.isSecureContext === false) return finish({ kind: 'insecure' });
    if (!env.geolocation) return finish({ kind: 'unsupported' });

    // If the browser already knows permission is denied, say so without waiting.
    try {
      const status = await env.permissions?.query({ name: 'geolocation' });
      if (status?.state === 'denied') return finish({ kind: 'denied' });
    } catch {
      // Permissions API missing or unsupported for geolocation (older Safari): just ask.
    }

    setState({ kind: 'locating', best: null });
    watchdog.current = setTimeout(() => {
      finish(best.current ? { kind: 'attached', fix: best.current } : { kind: 'timeout' });
    }, MAX_WAIT_MS);

    watchId.current = env.geolocation.watchPosition(
      (position) => {
        const fix = toCapturedLocation(position);
        if (!best.current || fix.accuracyMetres < best.current.accuracyMetres) best.current = fix;
        if (best.current.accuracyMetres <= GOOD_ACCURACY_M) finish({ kind: 'attached', fix: best.current });
        else if (mounted.current) setState({ kind: 'locating', best: best.current });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) return finish({ kind: 'denied' });
        if (best.current) return finish({ kind: 'attached', fix: best.current });
        finish(error.code === error.TIMEOUT ? { kind: 'timeout' } : { kind: 'unavailable' });
      },
      WATCH_OPTIONS,
    );
  }, [env.geolocation, env.isSecureContext, env.permissions, finish, stop]);

  /** Stop improving and use the best fix so far. */
  const useBestNow = useCallback(() => {
    if (best.current) finish({ kind: 'attached', fix: best.current });
  }, [finish]);

  const clear = useCallback(() => {
    best.current = null;
    finish({ kind: 'idle' });
  }, [finish]);

  return { state, request: () => void request(), useBestNow, clear };
}
