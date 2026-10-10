import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { toLocationReference, useOneShotLocation } from './useOneShotLocation';

function fakeGeolocation(respond: (success: PositionCallback, error: PositionErrorCallback) => void): Geolocation {
  return {
    getCurrentPosition: (success, error) => respond(success, error ?? (() => undefined)),
    watchPosition: () => {
      throw new Error('continuous tracking must not be used');
    },
    clearWatch: () => undefined,
  };
}

const positionError = (code: number): GeolocationPositionError =>
  ({ code, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;

describe('toLocationReference', () => {
  it('builds a geo: URI rounded to 4 decimals with uncertainty in metres', () => {
    expect(toLocationReference({ latitude: 10.903712345, longitude: 76.89999, accuracy: 23.6 })).toEqual({
      reference: 'geo:10.9037,76.9000;u=24',
      accuracyMetres: 24,
    });
  });
});

describe('useOneShotLocation', () => {
  it('starts idle and does not request location until asked', () => {
    let calls = 0;
    const geo = fakeGeolocation(() => calls++);
    const { result } = renderHook(() => useOneShotLocation(geo));
    expect(result.current.state).toEqual({ kind: 'idle' });
    expect(calls).toBe(0);
  });

  it('attaches a location once requested', () => {
    const geo = fakeGeolocation((ok) =>
      ok({ coords: { latitude: 1, longitude: 2, accuracy: 10 } } as GeolocationPosition),
    );
    const { result } = renderHook(() => useOneShotLocation(geo));
    act(() => result.current.request());
    expect(result.current.state).toMatchObject({ kind: 'attached', reference: 'geo:1.0000,2.0000;u=10' });
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'unavailable'],
  ])('maps error code %i to %s', (code, kind) => {
    const geo = fakeGeolocation((_ok, fail) => fail(positionError(code)));
    const { result } = renderHook(() => useOneShotLocation(geo));
    act(() => result.current.request());
    expect(result.current.state.kind).toBe(kind);
  });

  it('reports unsupported when the device has no geolocation', () => {
    const { result } = renderHook(() => useOneShotLocation(undefined));
    act(() => result.current.request());
    expect(result.current.state.kind).toBe('unsupported');
  });
});
