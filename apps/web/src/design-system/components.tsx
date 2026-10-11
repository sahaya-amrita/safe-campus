import { useEffect, useId, useRef } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { AppIcon, type AppIconName } from '../app/ui';
import { useOnlineStatus } from '../lib/offline/useOnlineStatus';

/*
 * Amrita Sahaya 2.0 design-system components. Styles live in ds.css (`ds-`
 * prefix) and read the tokens in tokens.css. Every interactive element is at
 * least 44 px tall and keeps a visible focus ring.
 */

function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: AppIconName;
  /** Disables the button and announces the work in progress. */
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  loading = false,
  loadingLabel,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx(
        'ds-btn',
        `ds-btn--${variant}`,
        size === 'sm' && 'ds-btn--sm',
        block && 'ds-btn--block',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="ds-spinner" aria-hidden="true" />
      ) : (
        icon && <AppIcon name={icon} size={18} />
      )}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form error and text field
// ---------------------------------------------------------------------------
export function FormError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="ds-form-error" id={id} role="alert">
      <AppIcon name="alert" size={16} />
      <span>{children}</span>
    </p>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string | null;
  id?: string;
}

export function TextField({ label, hint, error, id, className, ...input }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? `ds-field-${autoId}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ds-field', error && 'ds-field--invalid', className)}>
      <label className="ds-field__label" htmlFor={fieldId}>
        {label}
      </label>
      {hint && (
        <p className="ds-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      <input
        {...input}
        id={fieldId}
        className="ds-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <FormError id={errorId}>{error}</FormError>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Surface({
  title,
  description,
  action,
  children,
  className,
  as: Tag = 'section',
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}) {
  const headingId = useId();
  return (
    <Tag
      className={cx('ds-card', className)}
      aria-labelledby={title && Tag !== 'div' ? headingId : undefined}
    >
      {(title || action) && (
        <header className="ds-card__head">
          <div>
            {title && (
              <h2 className="ds-card__title" id={headingId}>
                {title}
              </h2>
            )}
            {description && <p className="ds-card__desc">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Sheet / modal
// ---------------------------------------------------------------------------
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: bottom sheet on phones, centred panel on wider screens.
 * Focus moves to the title on open, Tab stays inside, Escape and the close
 * button call onClose, and focus returns to the opener afterwards.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  closeLabel = 'Close',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    headingRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === headingRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="ds-sheet" onKeyDown={onKeyDown}>
      <div className="ds-sheet__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className="ds-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="ds-sheet__head">
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className="ds-sheet__title">
            {title}
          </h2>
          <button type="button" className="ds-icon-btn" onClick={onClose} aria-label={closeLabel}>
            <AppIcon name="x" size={20} />
          </button>
        </header>
        <div className="ds-sheet__body">{children}</div>
        {footer && <footer className="ds-sheet__foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs (WAI-ARIA tabs pattern with roving tabindex)
// ---------------------------------------------------------------------------
export interface TabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

export function Tabs({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const selected = items.find((t) => t.id === value) ?? items[0];

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((t) => t.id === selected?.id);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next]!.id);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div className="ds-tabs">
      <div
        ref={listRef}
        className="ds-tabs__list"
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
      >
        {items.map((tab) => {
          const active = tab.id === selected?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              className="ds-tabs__tab"
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${selected.id}`}
          aria-labelledby={`${baseId}-tab-${selected.id}`}
          className="ds-tabs__panel"
          tabIndex={0}
        >
          {selected.panel}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Navigation bars
// ---------------------------------------------------------------------------
export interface NavItem {
  id: string;
  label: string;
  icon: AppIconName;
  badge?: number;
}

/** Bottom navigation for phones. The current item carries aria-current="page". */
export function BottomNav({
  label,
  items,
  current,
  onSelect,
}: {
  label: string;
  items: NavItem[];
  current: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="ds-bottomnav" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="ds-bottomnav__item"
          aria-current={current === item.id ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <AppIcon name={item.icon} size={22} />
          <span>{item.label}</span>
          {item.badge ? (
            <span className="ds-bottomnav__badge" aria-label={`${item.badge} pending`}>
              {item.badge}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

/** Top app bar: brand or title on the left, status and actions on the right. */
export function TopBar({ start, end }: { start: ReactNode; end?: ReactNode }) {
  return (
    <header className="ds-topbar">
      <div className="ds-topbar__start">{start}</div>
      {end && <div className="ds-topbar__end">{end}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Status banner, skeleton, error state
// ---------------------------------------------------------------------------
export type BannerTone = 'info' | 'ok' | 'warn' | 'danger';
const BANNER_ICON: Record<BannerTone, AppIconName> = {
  info: 'info',
  ok: 'check',
  warn: 'alert',
  danger: 'alert',
};

/** Inline status message. Danger banners interrupt screen readers; others are polite. */
export function StatusBanner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`ds-banner ds-banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <AppIcon name={BANNER_ICON[tone]} size={18} className="ds-banner__icon" />
      <div className="ds-banner__text">
        {title && <p className="ds-banner__title">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="ds-banner__action">{action}</div>}
    </div>
  );
}

/** Placeholder blocks while content loads. Announced once as "Loading …". */
export function Skeleton({ lines = 3, label = 'content' }: { lines?: number; label?: string }) {
  return (
    <div className="ds-skeleton" role="status">
      <span className="as-sr-only">Loading {label}…</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="ds-skeleton__line" aria-hidden="true" />
      ))}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  title: string;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="ds-state ds-state--error" role="alert">
      <AppIcon name="alert" size={28} />
      <p className="ds-state__title">{title}</p>
      {message && <div className="ds-state__body">{message}</div>}
      {onRetry && (
        <Button variant="secondary" size="sm" icon="retry" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission notice
// ---------------------------------------------------------------------------
export type PermissionKind = 'location' | 'camera' | 'notifications' | 'contacts';
export type PermissionState = 'prompt' | 'denied' | 'unsupported' | 'insecure';

const PERMISSION_NAME: Record<PermissionKind, string> = {
  location: 'Location',
  camera: 'Camera',
  notifications: 'Notifications',
  contacts: 'Contacts',
};

const PERMISSION_ICON: Record<PermissionKind, AppIconName> = {
  location: 'pin',
  camera: 'camera',
  notifications: 'bell',
  contacts: 'users',
};

const PERMISSION_STATE_TEXT: Record<PermissionState, string> = {
  prompt: 'Your browser will ask for permission when you choose to continue.',
  denied:
    'Permission is turned off for this site. You can turn it on in your browser or phone settings.',
  unsupported: 'This browser does not support this feature.',
  insecure: 'This page is not on a secure (https) connection, so the browser blocks this feature.',
};

/**
 * Explains why a permission is needed before the browser asks. It never
 * requests the permission by itself: only the student's tap on the action does.
 */
export function PermissionNotice({
  kind,
  state,
  purpose,
  onContinue,
  continueLabel = 'Continue',
  fallback,
}: {
  kind: PermissionKind;
  state: PermissionState;
  purpose: string;
  onContinue?: () => void;
  continueLabel?: string;
  /** What still works without the permission. */
  fallback?: string;
}) {
  return (
    <div className={`ds-permission ds-permission--${state}`} role="note">
      <p className="ds-permission__title">
        <AppIcon name={PERMISSION_ICON[kind]} />
        {PERMISSION_NAME[kind]} access
      </p>
      <p>{purpose}</p>
      <p className="ds-permission__state">{PERMISSION_STATE_TEXT[state]}</p>
      {fallback && <p className="ds-permission__fallback">{fallback}</p>}
      {state === 'prompt' && onContinue && (
        <Button size="sm" onClick={onContinue}>
          {continueLabel}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offline indicator
// ---------------------------------------------------------------------------
/**
 * Network state chip. "Online" only means a network interface is up; it does
 * not prove the server received anything, so it never says "delivered".
 */
export function OfflineIndicator({
  online: onlineProp,
  serverUnreachable = false,
  pending = 0,
}: {
  online?: boolean;
  serverUnreachable?: boolean;
  pending?: number;
}) {
  const browserOnline = useOnlineStatus();
  const online = onlineProp ?? browserOnline;
  const state = !online ? 'offline' : serverUnreachable ? 'unreachable' : 'online';
  const text =
    state === 'offline' ? 'Offline' : state === 'unreachable' ? 'Server unreachable' : 'Online';
  return (
    <span className={`ds-net ds-net--${state}`} role="status" data-testid="offline-indicator">
      <AppIcon name="wifi" size={14} />
      {text}
      {pending > 0 && <span className="ds-net__pending">· {pending} waiting on this device</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Development placeholder
// ---------------------------------------------------------------------------
/**
 * Marks a screen that is planned but not built. It must never look like a
 * working feature: no fake data, no controls that pretend to act.
 */
export function DevPlaceholder({
  title,
  phase,
  summary,
  needs = [],
  headingLevel = 1,
}: {
  title: string;
  phase: string;
  summary: string;
  needs?: string[];
  /** Use 2 when the page already has an h1 (e.g. inside a staff workspace). */
  headingLevel?: 1 | 2;
}) {
  const headingId = useId();
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <section className="ds-placeholder" aria-labelledby={headingId}>
      <p className="ds-placeholder__flag">In development · not functional</p>
      <Heading id={headingId} className="ds-placeholder__title">
        {title}
      </Heading>
      <p>{summary}</p>
      <p className="ds-placeholder__phase">Planned for {phase}.</p>
      {needs.length > 0 && (
        <>
          <p className="ds-placeholder__needs-title">Needs before it can be built:</p>
          <ul className="ds-placeholder__needs">
            {needs.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
