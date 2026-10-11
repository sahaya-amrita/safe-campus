import { useState } from 'react';
import type { FormEvent } from 'react';
import { roleSchema, type AdminUser, type Role } from '@sahaya/contracts';
import type { Me, SahayaApi } from '../api/sahaya';
import { describeAuthError } from '../auth/AuthScreens';
import {
  Button,
  EmptyState,
  ErrorState,
  FormError,
  Pill,
  Sheet,
  Skeleton,
  StatusBanner,
  Surface,
  TextField,
} from '../../design-system';
import { formatWhen, useAsync } from '../ui';

const ROLES: readonly Role[] = roleSchema.options;

const ROLE_HINT: Record<Role, string> = {
  STUDENT: 'Student app: check-ins, help requests, reports.',
  RESPONDER: 'Responder workspace: help requests and dispatches.',
  INCIDENT_VERIFIER: 'Reviews and verifies incidents and instruction packs.',
  DRILL_MANAGER: 'Plans, starts and stops drills.',
  ADMIN: 'Full administration, including roles and audit logs.',
};

type Change =
  | { kind: 'grant'; user: AdminUser; role: Role }
  | { kind: 'revoke'; user: AdminUser; role: Role }
  | { kind: 'status'; user: AdminUser; status: 'ACTIVE' | 'DISABLED' };

function describeChange(change: Change): string {
  if (change.kind === 'grant') return `Grant ${change.role} to ${change.user.email}`;
  if (change.kind === 'revoke') return `Remove ${change.role} from ${change.user.email}`;
  return `${change.status === 'DISABLED' ? 'Disable' : 'Enable'} ${change.user.email}`;
}

/**
 * Users and roles (ADMIN). Roles change only through these audited server
 * endpoints; each change needs a reason. The server refuses removing your own
 * ADMIN role, disabling yourself, or removing the last active ADMIN.
 */
export function UsersPage({ api, user }: { api: SahayaApi; user: Me }) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [change, setChange] = useState<Change | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const users = useAsync(
    () => api.adminUsers({ q: submitted, ...(roleFilter ? { role: roleFilter } : {}) }),
    [api, submitted, roleFilter],
  );

  const search = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(query.trim());
  };

  return (
    <div className="as-stack">
      <Surface
        title="Find accounts"
        description="Students register themselves with an allowed email domain. Staff roles are granted here."
      >
        <form className="as-admin-filters" onSubmit={search} role="search">
          <TextField
            label="Name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />
          <label className="ds-field">
            <span className="ds-field__label">Role</span>
            <select
              className="ds-input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | '')}
            >
              <option value="">Any role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </Surface>

      {done && (
        <StatusBanner tone="ok" title="Saved">
          {done}
        </StatusBanner>
      )}

      {users.loading && !users.data ? (
        <Skeleton lines={4} label="accounts" />
      ) : users.error && !users.data ? (
        <ErrorState
          title="Could not load accounts"
          message={describeAuthError(users.error)}
          onRetry={users.reload}
        />
      ) : users.data && users.data.items.length === 0 ? (
        <EmptyState icon="users" title="No accounts match" />
      ) : (
        <ul className="as-user-list">
          {users.data?.items.map((u) => (
            <li key={u.id} className="as-user">
              <div className="as-user__head">
                <div>
                  <p className="as-user__name">
                    {u.displayName}
                    {u.id === user.id && <span className="as-muted"> (you)</span>}
                  </p>
                  <p className="as-muted as-small">{u.email}</p>
                </div>
                <Pill tone={u.status === 'ACTIVE' ? 'ok' : 'neutral'}>
                  {u.status === 'ACTIVE' ? 'Active' : 'Disabled'}
                </Pill>
              </div>
              <p className="as-small as-muted">
                Last sign-in: {formatWhen(u.lastSignInAt)} · Email verified:{' '}
                {u.emailVerifiedAt ? formatWhen(u.emailVerifiedAt) : 'not yet'}
              </p>
              <div className="as-user__roles" aria-label={`Roles of ${u.email}`}>
                {ROLES.map((role) => {
                  const has = u.roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      className="as-role-chip"
                      aria-pressed={has}
                      title={ROLE_HINT[role]}
                      disabled={u.status !== 'ACTIVE' && !has}
                      onClick={() => setChange({ kind: has ? 'revoke' : 'grant', user: u, role })}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
              {u.id !== user.id && (
                <Button
                  size="sm"
                  variant={u.status === 'ACTIVE' ? 'ghost' : 'secondary'}
                  onClick={() =>
                    setChange({
                      kind: 'status',
                      user: u,
                      status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                    })
                  }
                >
                  {u.status === 'ACTIVE' ? 'Disable account' : 'Enable account'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ChangeSheet
        api={api}
        change={change}
        onClose={() => setChange(null)}
        onDone={(message) => {
          setChange(null);
          setDone(message);
          users.reload();
        }}
      />
    </div>
  );
}

function ChangeSheet({
  api,
  change,
  onClose,
  onDone,
}: {
  api: SahayaApi;
  change: Change | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!change) return;
    if (reason.trim().length < 5) {
      setError('Give a reason of at least 5 characters. It is kept in the audit log.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (change.kind === 'grant') await api.grantRole(change.user.id, change.role, reason.trim());
      else if (change.kind === 'revoke')
        await api.revokeRole(change.user.id, change.role, reason.trim());
      else await api.setUserStatus(change.user.id, change.status, reason.trim());
      setReason('');
      onDone(`${describeChange(change)}: done and recorded in the audit log.`);
    } catch (reason) {
      setError(describeAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={change !== null}
      title={change ? describeChange(change) : ''}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={
              change?.kind === 'grant' || (change?.kind === 'status' && change.status === 'ACTIVE')
                ? 'primary'
                : 'danger'
            }
            loading={busy}
            loadingLabel="Saving…"
            onClick={() => void confirm()}
          >
            Confirm
          </Button>
        </>
      }
    >
      {change?.kind === 'status' && change.status === 'DISABLED' && (
        <p>The account is signed out everywhere and cannot sign in until enabled again.</p>
      )}
      {change?.kind === 'grant' && <p>{ROLE_HINT[change.role]} Takes effect immediately.</p>}
      {change?.kind === 'revoke' && <p>Takes effect on the user&apos;s next request.</p>}
      <TextField
        label="Reason (kept in the audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
      />
      <FormError>{error}</FormError>
    </Sheet>
  );
}
