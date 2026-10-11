import { useState } from 'react';
import type { ReactNode, Ref } from 'react';
import type { Role } from '@sahaya/contracts';
import { BRAND } from '../../brand';
import type { Me, SahayaApi } from '../api/sahaya';
import { useSession } from '../auth/session';
import { DrillBanner } from '../DrillBanner';
import { useRoute } from '../router';
import { TomHost, type AppDestination } from '../TomHost';
import { AppIcon, ModeBanner, Pill, type AppIconName } from '../ui';
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
}

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
 * Desktop-first staff layout (sidebar + content), shared by the responder
 * workspace and the admin console. On narrow screens the sidebar stacks above
 * the content (theme.css).
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
  const { path, navigate } = useRoute();
  return (
    <StaffWorkspaceProvider value={{ base, sections: nav.map((n) => n.section) }}>
      <div className="as-staff">
        <a className="as-skip" href="#as-staff-main">
          Skip to content
        </a>
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
          <nav aria-label="Sections" ref={navRef}>
            {nav.map((item) => (
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
            ))}
          </nav>
          <div className="as-side__foot">
            {switchTo && (
              <button
                type="button"
                className="as-btn as-btn--ghost as-btn--sm"
                onClick={() => navigate(switchTo.path)}
              >
                <AppIcon name="grid" size={16} /> {switchTo.label}
              </button>
            )}
            <span>
              {user.displayName}
              <br />
              <small>{user.roles.join(' · ')}</small>
            </span>
            <button
              type="button"
              className="as-btn as-btn--ghost as-btn--sm"
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
        </aside>
        <div className="as-staff__main">
          <div>
            <div ref={bannerRef}>
              <ModeBanner mode={user.mode} />
            </div>
            <DrillBanner api={api} />
            <header className="as-staff__head">
              <h1 className="as-screen-title">{title}</h1>
              <div className="as-row">
                {headerExtra}
                <Pill tone="neutral">Prototype · not institutional SSO</Pill>
                <a className="as-btn as-btn--light as-btn--sm" href="tel:112">
                  <AppIcon name="phone" size={16} /> 112
                </a>
              </div>
            </header>
          </div>
          <main className="as-staff__content" id="as-staff-main">
            {children}
          </main>
        </div>
        <TomHost user={user} destinations={destinations} currentPath={path} />
      </div>
    </StaffWorkspaceProvider>
  );
}
