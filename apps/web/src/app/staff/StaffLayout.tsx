import { useEffect, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import type { Role } from '@sahaya/contracts';
import { BRAND } from '../../brand';
import type { Me, SahayaApi } from '../api/sahaya';
import { useSession } from '../auth/session';
import { DrillBanner } from '../DrillBanner';
import { useRoute } from '../router';
import { TomHost, type AppDestination } from '../TomHost';
import { AppIcon, ModeBanner, type AppIconName } from '../ui';
import { StaffWorkspaceProvider } from './workspace';

export interface StaffNavItem {
  id: string;
  /** Path segment under the workspace base, e.g. "incidents". */
  section: string;
  path: string;
  label: string;
  icon: AppIconName;
  description: string;
  keywords: string[];
  /** Advisory: hides links the role cannot use. The API enforces access regardless. */
  roles: Role[];
  /** Sidebar group heading (admin console). Items without one are listed first. */
  group?: string;
  /** Shown in the phone tab bar (up to four; the rest are under More). */
  primary?: boolean;
  /** Shorter label for the phone tab bar. */
  short?: string;
}

/** Up to four tab-bar sections: the role's primary ones, then the next in order. */
export function phoneTabs(nav: readonly StaffNavItem[]): StaffNavItem[] {
  const primary = nav.filter((n) => n.primary);
  const rest = nav.filter((n) => !n.primary);
  return [...primary, ...rest].slice(0, 4);
}

const GROUP_ORDER = ['Operations', 'People', 'Safety data', 'System'];

/** Sidebar groups: ungrouped items first, then GROUP_ORDER, then any others. */
export function groupNav(
  nav: readonly StaffNavItem[],
): { group: string | null; items: StaffNavItem[] }[] {
  const groups: { group: string | null; items: StaffNavItem[] }[] = [];
  for (const item of nav) {
    const key = item.group ?? null;
    const found = groups.find((g) => g.group === key);
    if (found) found.items.push(item);
    else groups.push({ group: key, items: [item] });
  }
  const rank = (g: string | null) => (g === null ? -1 : GROUP_ORDER.indexOf(g) + 1 || 99);
  return groups.sort((a, b) => rank(a.group) - rank(b.group));
}

const PHONE_QUERY = '(max-width: 899px)';

/** True on phone-width screens. Without matchMedia (tests) it reports desktop. */
export function usePhoneLayout(): boolean {
  const query = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(PHONE_QUERY)
      : null;
  const [phone, setPhone] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function activeItem(nav: readonly StaffNavItem[], path: string): StaffNavItem | undefined {
  return nav.find((n) => path === n.path || path.startsWith(`${n.path}/`)) ?? nav[0];
}

export function toDestinations(nav: readonly StaffNavItem[]): AppDestination[] {
  return nav.map((n) => ({
    id: n.id,
    path: n.path,
    label: n.label,
    description: n.description,
    keywords: n.keywords,
    roles: ['RESPONDER', 'ADMIN'],
  }));
}

/**
 * Staff layout shared by the responder workspace and the admin console.
 * Desktop: a sidebar (grouped sections, user card) beside the content.
 * Phone: a top bar with 112, the content, and a bottom tab bar whose "More"
 * sheet lists every section and the account actions. Only one of the two
 * navigations is rendered, so assistive technology never hears it twice.
 */
export function StaffLayout({
  user,
  api,
  base,
  workspaceLabel,
  nav,
  active,
  title,
  destinations,
  switchTo,
  navRef,
  bannerRef,
  headerExtra,
  children,
}: {
  user: Me;
  api: SahayaApi;
  base: string;
  workspaceLabel: string;
  nav: readonly StaffNavItem[];
  active: StaffNavItem | undefined;
  title: string;
  destinations: AppDestination[];
  /** Link to the other staff workspace, when the user may open it. */
  switchTo?: { label: string; path: string } | null;
  navRef?: Ref<HTMLElement>;
  bannerRef?: Ref<HTMLDivElement>;
  /** Extra controls in the title bar (e.g. the responder's duty status). */
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const { signOut, signOutEverywhere } = useSession();
  const [confirmAll, setConfirmAll] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { path, navigate } = useRoute();
  const phone = usePhoneLayout();
  const tabs = phoneTabs(nav);
  const activeInMore = !!active && !tabs.some((t) => t.id === active.id);

  // Close the More sheet on navigation and with Escape.
  useEffect(() => setMoreOpen(false), [path]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const account = (
    <div className="as-staff__account">
      <div className="as-usercard">
        <span className="as-usercard__avatar" aria-hidden="true">
          {initials(user.displayName)}
        </span>
        <span className="as-usercard__text">
          <strong>{user.displayName}</strong>
          <small>{user.roles.join(' · ').toLowerCase().replace(/_/g, ' ')}</small>
        </span>
      </div>
      <p className="as-usercard__note">Prototype sign-in · not institutional SSO</p>
      {switchTo && (
        <button
          type="button"
          className="as-btn as-btn--ghost as-btn--sm as-btn--block"
          onClick={() => navigate(switchTo.path)}
        >
          <AppIcon name="grid" size={16} /> {switchTo.label}
        </button>
      )}
      <button
        type="button"
        className="as-btn as-btn--ghost as-btn--sm as-btn--block"
        onClick={() => signOut()}
      >
        <AppIcon name="logout" size={16} /> Sign out
      </button>
      {confirmAll ? (
        <span className="as-row">
          <button
            type="button"
            className="as-linkbtn as-side__linkbtn"
            onClick={() => void signOutEverywhere()}
          >
            Confirm sign out everywhere
          </button>
          <button
            type="button"
            className="as-linkbtn as-side__linkbtn"
            onClick={() => setConfirmAll(false)}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="as-linkbtn as-side__linkbtn"
          onClick={() => setConfirmAll(true)}
        >
          Sign out everywhere
        </button>
      )}
    </div>
  );

  const sectionButton = (item: StaffNavItem) => (
    <button
      key={item.id}
      type="button"
      className="as-side__link"
      aria-current={active?.id === item.id ? 'page' : undefined}
      onClick={() => navigate(item.path)}
    >
      <AppIcon name={item.icon} size={18} />
      {item.label}
    </button>
  );

  return (
    <StaffWorkspaceProvider value={{ base, sections: nav.map((n) => n.section) }}>
      <div className={`as-staff${phone ? ' as-staff--phone' : ''}`}>
        <a className="as-skip" href="#as-staff-main">
          Skip to content
        </a>
        {!phone && (
          <aside className="as-side" aria-label={workspaceLabel}>
            <div className="as-brand">
              <span className="as-topbar__emblem">
                <img src={BRAND.emblemUrl} alt="" width={24} height={28} />
              </span>
              <div>
                <p className="as-brand__name">{BRAND.name}</p>
                <p className="as-brand__tag">{workspaceLabel}</p>
              </div>
            </div>
            <nav aria-label="Sections" ref={navRef} className="as-side__nav">
              {groupNav(nav).map(({ group, items }) => (
                <div key={group ?? 'main'} className="as-side__group">
                  {group && <p className="as-side__heading">{group}</p>}
                  {items.map(sectionButton)}
                </div>
              ))}
            </nav>
            <div className="as-side__foot">{account}</div>
          </aside>
        )}
        <div className="as-staff__main">
          {phone && (
            <header className="as-staff__bar">
              <span className="as-topbar__emblem">
                <img src={BRAND.emblemUrl} alt="" width={22} height={26} />
              </span>
              <span className="as-staff__bar-text">
                <strong>{BRAND.name}</strong>
                <small>{workspaceLabel}</small>
              </span>
              <a className="as-staff__call" href="tel:112" aria-label="Call 112">
                <AppIcon name="phone" size={18} /> 112
              </a>
            </header>
          )}
          <div>
            <div ref={bannerRef}>
              <ModeBanner mode={user.mode} />
            </div>
            <DrillBanner api={api} />
            <header className="as-staff__head">
              <div className="as-staff__titles">
                <h1 className="as-screen-title">{title}</h1>
                {active?.description && <p className="as-staff__lede">{active.description}</p>}
              </div>
              <div className="as-staff__actions">
                {/* On phones the duty control lives on the first section only, to save space. */}
                {(!phone || active?.id === nav[0]?.id) && headerExtra}
                {!phone && (
                  <a className="as-btn as-btn--light as-btn--sm" href="tel:112">
                    <AppIcon name="phone" size={16} /> 112
                  </a>
                )}
              </div>
            </header>
          </div>
          <main className="as-staff__content" id="as-staff-main">
            {children}
          </main>
        </div>
        {phone && (
          <nav className="as-staff__tabs" aria-label="Sections" ref={navRef}>
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className="as-staff__tab"
                aria-current={active?.id === item.id ? 'page' : undefined}
                onClick={() => navigate(item.path)}
              >
                <AppIcon name={item.icon} size={22} />
                <span>{item.short ?? item.label}</span>
              </button>
            ))}
            <button
              type="button"
              className="as-staff__tab"
              aria-expanded={moreOpen}
              aria-current={activeInMore ? 'page' : undefined}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <AppIcon name="menu" size={22} />
              <span>More</span>
            </button>
          </nav>
        )}
        {phone && moreOpen && (
          <div className="as-sheet" role="dialog" aria-modal="true" aria-label="All sections">
            <button
              type="button"
              className="as-sheet__scrim"
              aria-label="Close"
              onClick={() => setMoreOpen(false)}
            />
            <div className="as-sheet__panel">
              <div className="as-sheet__grab" aria-hidden="true" />
              {groupNav(nav).map(({ group, items }) => (
                <div key={group ?? 'main'} className="as-side__group">
                  <p className="as-side__heading">{group ?? workspaceLabel}</p>
                  <div className="as-sheet__grid">{items.map(sectionButton)}</div>
                </div>
              ))}
              {account}
            </div>
          </div>
        )}
        <TomHost user={user} destinations={destinations} currentPath={path} onboarding={!phone} />
      </div>
    </StaffWorkspaceProvider>
  );
}
