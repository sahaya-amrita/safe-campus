import { useMemo } from 'react';
import { HttpTomAssistantBackend, Tom, disabledAssistantBackend } from '../components/tom';
import type {
  ApprovedInstructionLink,
  TomDestination,
  TomNavigationAdapter,
} from '../components/tom';
import type { Role as TomRole } from '../features/responder/contracts';
import type { Me } from './api/sahaya';
import { useSession } from './auth/session';
import { navigate } from './router';
import { useAsync } from './ui';

export interface AppDestination extends TomDestination {
  path: string;
}

/** Tom's guide roles: verifiers and drill managers get the responder guide. */
export function tomRoleFor(user: Pick<Me, 'roles'>): TomRole {
  if (user.roles.includes('ADMIN')) return 'ADMIN';
  if (
    user.roles.some((r) => r === 'RESPONDER' || r === 'INCIDENT_VERIFIER' || r === 'DRILL_MANAGER')
  )
    return 'RESPONDER';
  return 'STUDENT';
}

/**
 * Mounts the existing Tom guide with this shell's routes. Tom can only open
 * registered destinations and cannot submit, acknowledge or alert anything.
 * Open questions go to the server assistant (/api/v1/assistant/interpret)
 * with the session token; model credentials never reach the browser.
 */
export function TomHost({
  user,
  destinations,
  currentPath,
  locale = 'en',
  onboarding = true,
}: {
  user: Me;
  destinations: readonly AppDestination[];
  currentPath: string;
  locale?: 'en' | 'ta';
  /** First-visit welcome bubble; off where it would cover safety actions. */
  onboarding?: boolean;
}) {
  const { client, getToken, api } = useSession();
  // Tom links only to PUBLISHED packs the server returns; it never rewrites them.
  const packs = useAsync(api ? () => api.publishedPacks(locale) : null, [api, locale]);
  const instructionsPath =
    destinations.find((d) => d.id === 'student.prepare' || d.id === 'responder.packs')?.path ??
    null;
  const approvedInstructions = useMemo<ApprovedInstructionLink[]>(
    () =>
      (packs.data?.items ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        href: instructionsPath ? `#${instructionsPath}` : '#',
        version: p.version,
        sourceLabel: p.sourceLabel,
        approvalState: p.approvalState,
        language: p.language,
        expiresAt: p.expiresAt ?? null,
      })),
    [packs.data, instructionsPath],
  );
  const current =
    destinations.find((d) => currentPath === d.path || currentPath.startsWith(`${d.path}/`)) ??
    null;

  const navigation = useMemo<TomNavigationAdapter>(
    () => ({
      destinations: () => destinations,
      current: () => {
        const path = window.location.hash.replace(/^#/, '');
        return (
          destinations.find((d) => path === d.path || path.startsWith(`${d.path}/`))?.id ?? null
        );
      },
      canNavigate: (id) => destinations.some((d) => d.id === id),
      navigate: (id) => {
        const target = destinations.find((d) => d.id === id);
        if (!target) return { ok: false, reason: 'NOT_REGISTERED' };
        navigate(target.path);
        return { ok: true };
      },
      canGoBack: () => window.history.length > 1,
      back: () => {
        window.history.back();
        return { ok: true };
      },
    }),
    [destinations],
  );

  const assistant = useMemo(
    () =>
      client
        ? new HttpTomAssistantBackend({ baseUrl: client.baseUrl, getAccessToken: getToken })
        : disabledAssistantBackend,
    [client, getToken],
  );

  return (
    <Tom
      role={tomRoleFor(user)}
      context={current?.id ?? 'app'}
      mode={user.mode === 'DEMO' ? 'DEMO' : 'DRILL'}
      navigation={navigation}
      assistant={assistant}
      locale={locale}
      onboarding={onboarding}
      approvedInstructions={approvedInstructions}
    />
  );
}
