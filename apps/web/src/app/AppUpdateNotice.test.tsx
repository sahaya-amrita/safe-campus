import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppUpdateNotice } from './AppUpdateNotice';
import { UPDATE_READY_EVENT } from '../lib/offline/appShell';

describe('app update notice', () => {
  it('waits for user consent before activating a waiting version', async () => {
    const apply = vi.fn();
    render(<AppUpdateNotice />);
    expect(screen.queryByRole('button', { name: 'Reload to update' })).toBeNull();
    await act(() => window.dispatchEvent(new CustomEvent(UPDATE_READY_EVENT, { detail: apply })));
    expect(screen.getByRole('status')).toHaveTextContent('A new version is ready');
    expect(apply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload to update' }));
    expect(apply).toHaveBeenCalledOnce();
  });

  it('ignores malformed update events', async () => {
    render(<AppUpdateNotice />);
    await act(() =>
      window.dispatchEvent(new CustomEvent(UPDATE_READY_EVENT, { detail: 'invalid' })),
    );
    expect(screen.queryByRole('button', { name: 'Reload to update' })).toBeNull();
  });
});
