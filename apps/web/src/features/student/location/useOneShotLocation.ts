import { useCallback, useEffect, useRef, useState } from 'react';
import { LOCATION_REFERENCE_SCHEME } from '../contracts/provisional';

export type LocationState =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'attached'; reference: string; accuracyMetres: number }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'unsupported' };

const GEOLOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 };

/** 4 decimal places ≈ 11 m: enough to find someone, without storing more precision than needed. */
const COORDINATE_DECIMALS = 4;

export function toLocationReference(coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>): {
  reference: string;
  accuracyMetres: number;
} {
  const accuracyMetres = Math.max(1, Math.round(coords.accuracy));
  const lat = coords.latitude.toFixed(COORDINATE_DECIMALS);
  const lng = coords.longitude.toFixed(COORDINATE_DECIMALS);
  return { reference: `${LOCATION_REFERENCE_SCHEME}${lat},${lng};u=${accuracyMetres}`, accuracyMetres };
}

/**
 * Optional, one-time location capture for a help request. Location is only
 * requested when the student taps the button, is never watched continuously,
 * and every failure leaves the request sendable without it.
 */
export function useOneShotLocation(geolocation: Geolocation | undefined = globalThis.navigator?.geolocation) {
  const [state, setState] = useState<LocationState>({ kind: 'idle' });
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  const request = useCallback(() => {
    if (!geolocation) {
      setState({ kind: 'unsupported' });
      return;
    }
    setState({ kind: 'locating' });
    geolocation.getCurrentPosition(
      (position) => {
        if (active.current) setState({ kind: 'attached', ...toLocationReference(position.coords) });
      },
      (error) => {
        if (!active.current) return;
        setState(error.code === error.PERMISSION_DENIED ? { kind: 'denied' } : { kind: 'unavailable' });
      },
      GEOLOCATION_OPTIONS,
    );
  }, [geolocation]);

  const clear = useCallback(() => setState({ kind: 'idle' }), []);

  return { state, request, clear };
}
