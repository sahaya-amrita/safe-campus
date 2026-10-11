import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PushConfigView } from '@sahaya/contracts';
import type { SahayaApi } from '../api/sahaya';
import {
  ServiceWorkerNotReadyError,
  base64UrlToBytes,
  readyWithin,
  type PushEnvironment,
} from '../../lib/push';
import { PhoneNotices } from './operations';

const enabled: PushConfigView = {
  enabled: true,
  publicKey: 'BAAB',
  devices: 0,
  note: 'Phone notices only say a help request was matched to you.',
};
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } };

function fakeEnv(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    supported: true,
    permission: () => 'default',
    requestPermission: vi.fn(async () => 'granted' as NotificationPermission),
    current: async () => null,
    subscribe: vi.fn(async () => SUB),
    unsubscribe: vi.fn(async () => SUB.endpoint),
    ...overrides,
  };
}

describe('PhoneNotices', () => {
  it('says when the server has no push set up, and offers nothing to turn on', async () => {
    const api = {
      pushConfig: async () => ({
        enabled: false,
        publicKey: null,
        devices: 0,
        note: 'Phone notices are not set up on this server. Matched requests appear in your in-app inbox.',
      }),
    } as unknown as SahayaApi;
    render(<PhoneNotices api={api} env={fakeEnv()} />);
    expect(await screen.findByText(/not set up on this server/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks for permission, registers the device, and can turn it off again', async () => {
    const registerPushDevice = vi.fn(async () => ({ devices: 1 }));
    const removePushDevice = vi.fn(async () => ({ devices: 0 }));
    const api = {
      pushConfig: async () => enabled,
      registerPushDevice,
      removePushDevice,
    } as unknown as SahayaApi;
    const env = fakeEnv();
    const user = userEvent.setup();
    render(<PhoneNotices api={api} env={env} />);
    await user.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(env.requestPermission).toHaveBeenCalled();
    expect(env.subscribe).toHaveBeenCalledWith('BAAB');
    expect(registerPushDevice).toHaveBeenCalledWith(SUB);
    expect(await screen.findByText('On for this device')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Turn off on this device' }));
    expect(removePushDevice).toHaveBeenCalledWith(SUB.endpoint);
    expect(await screen.findByText('Off for this device')).toBeInTheDocument();
  });

  it('explains blocked notifications and registers nothing', async () => {
    const registerPushDevice = vi.fn();
    const api = { pushConfig: async () => enabled, registerPushDevice } as unknown as SahayaApi;
    const env = fakeEnv({ requestPermission: async () => 'denied' });
    const user = userEvent.setup();
    render(<PhoneNotices api={api} env={env} />);
    await user.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/blocked/);
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it('decodes base64url VAPID keys', () => {
    expect(Array.from(base64UrlToBytes('AQID_w'))).toEqual([1, 2, 3, 255]);
  });

  it('stops waiting when the app is not installed in the browser', async () => {
    const registerPushDevice = vi.fn();
    const api = { pushConfig: async () => enabled, registerPushDevice } as unknown as SahayaApi;
    const env = fakeEnv({
      subscribe: () => Promise.reject(new ServiceWorkerNotReadyError()),
    });
    const user = userEvent.setup();
    render(<PhoneNotices api={api} env={env} />);
    await user.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/need the installed app/);
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it('times out a service worker that never becomes ready', async () => {
    vi.useFakeTimers();
    const never = readyWithin(new Promise<never>(() => undefined), 8_000);
    const check = expect(never).rejects.toBeInstanceOf(ServiceWorkerNotReadyError);
    await vi.advanceTimersByTimeAsync(8_000);
    await check;
    vi.useRealTimers();
    await expect(readyWithin(Promise.resolve(1), 8_000)).resolves.toBe(1);
  });
});
