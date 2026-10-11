import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { HazardVerificationStatus, HelpRequestStatus, OperatingMode } from '@sahaya/contracts';
import { describeProblem } from './api/client';

// ---------------------------------------------------------------------------
// Icons (stroke, 24px grid, currentColor)
// ---------------------------------------------------------------------------
const PATHS = {
  home: 'M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z',
  map: 'M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4zM9 4v13M15 6.5v13',
  bell: 'M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 20.5a2 2 0 004 0',
  book: 'M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 20.5A2.5 2.5 0 016.5 18H20v3H6.5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  shield: 'M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  hand: 'M8 13V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v7c0 4-2.5 7-6.5 7-2.6 0-4.2-1.3-5.6-3.5L4.3 13.6a1.4 1.4 0 012.3-1.6L8 13.5',
  phone:
    'M6.6 3.5h3l1.5 4-2 1.3a11 11 0 005.1 5.1l1.3-2 4 1.5v3a2 2 0 01-2.2 2A16.5 16.5 0 014.6 5.7a2 2 0 012-2.2z',
  alert: 'M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5h.01',
  report: 'M5 21V4M5 4h11l-2 4 2 4H5',
  users:
    'M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M10 11.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.4M15.5 4.6a3.5 3.5 0 010 6.8',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  chevron: 'M9.5 6l6 6-6 6',
  back: 'M14.5 6l-6 6 6 6',
  x: 'M6 6l12 12M18 6L6 18',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5.5M12 7.5h.01',
  retry: 'M4 12a8 8 0 0113.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.6L4 15.5M4 20v-4.5h4.5',
  logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  truck:
    'M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 18.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  wifi: 'M2.5 9a14 14 0 0119 0M5.5 12.5a9.5 9.5 0 0113 0M8.7 16a5 5 0 016.6 0M12 19.5h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  camera:
    'M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 17a4 4 0 100-8 4 4 0 000 8z',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 01-2.1 1.2L14.7 21h-4l-.3-2.4a7 7 0 01-2.1-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 010-2.4L4.4 9.9l2-3.4 1.9.7a7 7 0 012.1-1.2L10.7 3h4l.3 2.4a7 7 0 012.1 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 010 2.4z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
} as const;

export type AppIconName = keyof typeof PATHS;

export function AppIcon({
  name,
  size = 20,
  className,
}: {
  name: AppIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status language. Reported is never presented as verified.
// ---------------------------------------------------------------------------
export type Tone = 'danger' | 'warn' | 'info' | 'ok' | 'neutral';

export const VERIFICATION: Record<
  HazardVerificationStatus,
  { label: string; tone: Tone; hint: string }
> = {
  REPORTED: {
    label: 'Reported · not verified',
    tone: 'warn',
    hint: 'Submitted by a user. Not confirmed by any authorised reviewer.',
  },
  CORROBORATED: {
    label: 'Corroborated · not verified',
    tone: 'warn',
    hint: 'Supported by further evidence, still awaiting verification.',
  },
  VERIFIED: {
    label: 'Verified by reviewer',
    tone: 'danger',
    hint: 'An authorised reviewer verified this incident in the system.',
  },
  RESOLVED: {
    label: 'Resolved',
    tone: 'ok',
    hint: 'Recorded as resolved by an authorised reviewer.',
  },
  DISMISSED: { label: 'Dismissed', tone: 'neutral', hint: 'Dismissed by an authorised reviewer.' },
};

export const HELP_STATUS: Record<HelpRequestStatus, { label: string; tone: Tone; hint: string }> = {
  OPEN: {
    label: 'Open · not yet acknowledged',
    tone: 'danger',
    hint: 'Received by the server. No responder has acknowledged it yet.',
  },
  ACKNOWLEDGED: {
    label: 'Acknowledged',
    tone: 'warn',
    hint: 'A responder recorded that they saw it. Not yet assigned.',
  },
  ASSIGNED: {
    label: 'Assigned to a responder',
    tone: 'info',
    hint: 'A verified responder is assigned in the system.',
  },
  RESOLVED: {
    label: 'Resolved',
    tone: 'ok',
    hint: 'Closed as resolved by the assigned responder.',
  },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', hint: 'Cancelled.' },
};

export function Pill({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`as-pill as-pill--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function VerificationPill({ status }: { status: HazardVerificationStatus }) {
  const v = VERIFICATION[status];
  return (
    <Pill tone={v.tone} title={v.hint}>
      {v.label}
    </Pill>
  );
}

export function HelpStatusPill({ status }: { status: HelpRequestStatus }) {
  const v = HELP_STATUS[status];
  return (
    <Pill tone={v.tone} title={v.hint}>
      {v.label}
    </Pill>
  );
}

/** Persistent operating-mode banner. Everything in DEMO/DRILL/TEST/SIMULATION is simulated. */
export function ModeBanner({
  mode,
  compact = false,
}: {
  mode: OperatingMode | 'MOCK';
  compact?: boolean;
}) {
  const text =
    mode === 'MOCK'
      ? 'MOCK PREVIEW · Nothing is sent to any server'
      : `${mode} MODE · Simulated data · Not connected to campus security, alarms or emergency services`;
  return (
    <p className={`as-mode${compact ? ' as-mode--compact' : ''}`} role="note">
      <AppIcon name="info" size={16} />
      <span>{text}</span>
    </p>
  );
}

export function EmptyState({
  icon = 'info',
  title,
  children,
}: {
  icon?: AppIconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="as-empty">
      <AppIcon name={icon} size={28} />
      <p className="as-empty__title">{title}</p>
      {children && <div className="as-empty__body">{children}</div>}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="as-error" role="alert">
      <AppIcon name="alert" size={18} />
      <span>{describeProblem(error)}</span>
      {onRetry && (
        <button type="button" className="as-btn as-btn--ghost as-btn--sm" onClick={onRetry}>
          <AppIcon name="retry" size={16} /> Retry
        </button>
      )}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="as-loading" role="status">
      <span className="as-spinner" aria-hidden="true" />
      {label}
    </p>
  );
}

/** A card that opens on tap, for secondary sections on long phone screens. */
export function Fold({
  title,
  icon,
  meta,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  icon?: AppIconName;
  /** Short status shown on the closed card, e.g. "2 saved". */
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="as-card as-details as-fold" open={defaultOpen || undefined}>
      <summary>
        {icon && <AppIcon name={icon} size={18} />}
        <span className="as-fold__title">{title}</span>
        {meta !== undefined && meta !== null && <small className="as-muted">{meta}</small>}
      </summary>
      <div className="as-fold__body">{children}</div>
    </details>
  );
}

export function Card({
  title,
  icon,
  action,
  children,
  className,
  labelledBy,
}: {
  title?: ReactNode;
  icon?: AppIconName;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section className={`as-card${className ? ` ${className}` : ''}`} aria-labelledby={labelledBy}>
      {(title || action) && (
        <header className="as-card__head">
          {title && (
            <h2 className="as-card__title" id={labelledBy}>
              {icon && <AppIcon name={icon} size={18} />}
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// ---------------------------------------------------------------------------
// Async data hook with optional polling (paused while offline / hidden).
// ---------------------------------------------------------------------------
export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** When the data was last fetched successfully. */
  at: Date | null;
  reload: () => void;
}

export function useAsync<T>(
  load: (() => Promise<T>) | null,
  deps: readonly unknown[],
  pollMs?: number,
): AsyncState<T> {
  const [state, setState] = useState<{
    data: T | undefined;
    error: unknown;
    loading: boolean;
    at: Date | null;
  }>({
    data: undefined,
    error: null,
    loading: Boolean(load),
    at: null,
  });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const fn = loadRef.current;
    if (!fn) return;
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then(
      (data) => active && setState({ data, error: null, loading: false, at: new Date() }),
      (error: unknown) => active && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the inputs that change the request
  }, [...deps, tick]);

  useEffect(() => {
    if (!pollMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) reload();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, reload]);

  return { ...state, reload };
}
