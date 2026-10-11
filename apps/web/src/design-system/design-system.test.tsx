import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BottomNav,
  Button,
  DevPlaceholder,
  ErrorState,
  FormError,
  OfflineIndicator,
  PermissionNotice,
  Sheet,
  Skeleton,
  StatusBanner,
  Tabs,
  TextField,
} from '.';

describe('Button', () => {
  it('disables itself and announces work while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('type', 'button');
  });
});

describe('TextField and FormError', () => {
  it('links the hint and the error to the input', () => {
    render(<TextField label="Email" hint="Use your campus email." error="Enter an email." />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Use your campus email. Enter an email.');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an email.');
  });

  it('renders nothing without an error', () => {
    const { container } = render(<FormError>{null}</FormError>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Sheet', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open details
        </button>
        <Sheet open={open} title="Details" onClose={() => setOpen(false)}>
          <button type="button">Inside</button>
        </Sheet>
      </>
    );
  }

  it('is a labelled modal that focuses its title, closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open details' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Details' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open details' }));
    await user.tab(); // close button
    await user.tab(); // Inside
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus();
    await user.tab(); // wraps to the first control
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});

describe('Tabs', () => {
  function Harness() {
    const [tab, setTab] = useState('one');
    return (
      <Tabs
        label="Sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'one', label: 'One', panel: <p>First panel</p> },
          { id: 'two', label: 'Two', panel: <p>Second panel</p> },
          { id: 'three', label: 'Three', panel: <p>Third panel</p> },
        ]}
      />
    );
  }

  it('follows the ARIA tabs pattern with arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByRole('tab', { name: 'One' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('First panel');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('tabindex', '-1');

    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Second panel');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Three' })).toHaveFocus();
  });
});

describe('BottomNav', () => {
  it('marks the current item and reports pending counts', async () => {
    const onSelect = vi.fn();
    render(
      <BottomNav
        label="Main"
        current="home"
        onSelect={onSelect}
        items={[
          { id: 'home', label: 'Home', icon: 'home', badge: 2 },
          { id: 'map', label: 'Map', icon: 'map' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /Home/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('2 pending')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(onSelect).toHaveBeenCalledWith('map');
  });
});

describe('status components', () => {
  it('interrupts only for danger banners', () => {
    render(
      <>
        <StatusBanner tone="info" title="Saved" />
        <StatusBanner tone="danger" title="Not sent" />
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('alert')).toHaveTextContent('Not sent');
  });

  it('announces skeletons once and hides the placeholder bars', () => {
    const { container } = render(<Skeleton lines={4} label="alerts" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading alerts…');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
  });

  it('offers retry from an error state', async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Could not load alerts" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('never describes connectivity as delivery', () => {
    const { rerender } = render(<OfflineIndicator online={false} pending={2} />);
    expect(screen.getByTestId('offline-indicator')).toHaveTextContent(
      'Offline· 2 waiting on this device',
    );
    rerender(<OfflineIndicator online serverUnreachable />);
    expect(screen.getByTestId('offline-indicator')).toHaveTextContent('Server unreachable');
    rerender(<OfflineIndicator online />);
    expect(screen.getByTestId('offline-indicator')).toHaveTextContent('Online');
    expect(screen.getByTestId('offline-indicator')).not.toHaveTextContent(/deliver|sent/i);
  });
});

describe('PermissionNotice', () => {
  it('explains first and asks only when the user continues', async () => {
    const onContinue = vi.fn();
    const { rerender } = render(
      <PermissionNotice
        kind="location"
        state="prompt"
        purpose="Adds where you are to your help request."
        fallback="You can type a landmark instead."
        onContinue={onContinue}
        continueLabel="Use my location"
      />,
    );
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('note')).toHaveTextContent('Location access');
    await userEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(onContinue).toHaveBeenCalledOnce();

    rerender(
      <PermissionNotice
        kind="location"
        state="insecure"
        purpose="Adds where you are."
        onContinue={onContinue}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/not on a secure \(https\) connection/);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('DevPlaceholder', () => {
  it('is clearly marked as not functional and lists what it needs', () => {
    render(
      <DevPlaceholder
        title="Audit logs"
        phase="Phase 2"
        summary="Read-only audit view."
        needs={['A read endpoint']}
        headingLevel={2}
      />,
    );
    expect(screen.getByText('In development · not functional')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Audit logs' })).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('A read endpoint');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
