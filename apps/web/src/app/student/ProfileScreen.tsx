import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { LOCALES } from '../../i18n';
import { RecentActivity } from '../../features/student/components/RecentActivity';
import { SyncStatus } from '../../features/student/components/SyncStatus';
import { newIdempotencyKey } from '../api/client';
import {
  AppIcon,
  Card,
  EmptyState,
  ErrorNotice,
  HelpStatusPill,
  Loading,
  Pill,
  formatWhen,
  useAsync,
} from '../ui';
import { useStudent } from './core';
import { useSession } from '../auth/session';
import { describeAuthError } from '../auth/AuthScreens';
import { Button, FormError, StatusBanner, TextField } from '../../design-system';

/** Name and sessions. Roles are shown but can only be changed by an administrator. */
function AccountSettings() {
  const s = useStudent();
  const { updateUser, signOutEverywhere } = useSession();
  const [name, setName] = useState(s.user.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  if (!s.api) return <p className="as-muted">Needs a signed-in API session.</p>;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setError(null);
    if (name.trim().length < 2) {
      setError('Enter at least 2 characters.');
      return;
    }
    setBusy(true);
    try {
      updateUser(await s.api!.updateMe({ displayName: name.trim() }));
      setSaved(true);
    } catch (reason) {
      setError(describeAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="as-stack">
      <form className="as-form" onSubmit={(e) => void save(e)}>
        <TextField
          label="Display name"
          value={name}
          maxLength={80}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
        <FormError>{error}</FormError>
        {saved && <StatusBanner tone="ok">Name saved.</StatusBanner>}
        <Button type="submit" variant="secondary" loading={busy} loadingLabel="Saving…">
          Save name
        </Button>
      </form>
      <div className="as-stack">
        <p className="as-small as-muted">
          Lost a phone or used a shared computer? Sign out everywhere ends every session of your
          account, including this one.
        </p>
        {confirmAll ? (
          <div className="as-row">
            <Button variant="danger" size="sm" onClick={() => void signOutEverywhere()}>
              Yes, sign out everywhere
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmAll(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" icon="logout" onClick={() => setConfirmAll(true)}>
            Sign out of all devices
          </Button>
        )}
      </div>
    </div>
  );
}

function TrustedContacts() {
  const s = useStudent();
  const list = useAsync(s.api ? () => s.api!.trustedContacts() : null, [s.api]);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<'EMAIL' | 'PHONE'>('PHONE');
  const [value, setValue] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());

  if (!s.api) return <p className="as-muted">Needs a signed-in API session.</p>;
  const api = s.api;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.addTrustedContact(
        {
          name: name.trim(),
          contactChannel: channel,
          contactValue: value.trim(),
          notificationPreferences: { incidentUpdates: false, helpRequests: false },
        },
        key.current,
      );
      key.current = newIdempotencyKey();
      setName('');
      setValue('');
      list.reload();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteTrustedContact(id);
      list.reload();
    } catch (reason) {
      setError(reason);
    }
  };
  return (
    <div className="as-stack">
      {list.loading && !list.data && <Loading />}
      {list.data && list.data.items.length === 0 && <EmptyState title="No trusted contacts yet." />}
      {list.data && list.data.items.length > 0 && (
        <ul className="as-list">
          {list.data.items.map((c) => (
            <li key={c.id} className="as-item">
              <div className="as-row as-row--between">
                <span className="as-item__title">{c.name}</span>
                <Pill tone={c.consent === 'VERIFIED' ? 'ok' : 'warn'}>
                  Consent {c.consent.toLowerCase()}
                </Pill>
              </div>
              <div className="as-row as-row--between">
                <span className="as-muted as-small">
                  {c.contactChannel} · stored encrypted · never contacted automatically
                </span>
                <button
                  type="button"
                  className="as-btn as-btn--ghost as-btn--sm"
                  onClick={() => void remove(c.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="as-form" onSubmit={(e) => void add(e)}>
        <div className="as-grid2">
          <label className="as-field">
            Name
            <input
              className="as-input"
              value={name}
              minLength={2}
              maxLength={120}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="as-field">
            Channel
            <select
              className="as-select"
              value={channel}
              onChange={(e) => setChannel(e.target.value as 'EMAIL' | 'PHONE')}
            >
              <option value="PHONE">Phone</option>
              <option value="EMAIL">Email</option>
            </select>
          </label>
        </div>
        <label className="as-field">
          {channel === 'PHONE' ? 'Phone number' : 'Email address'}
          <input
            className="as-input"
            type={channel === 'PHONE' ? 'tel' : 'email'}
            value={value}
            minLength={3}
            maxLength={254}
            required
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {Boolean(error) && <ErrorNotice error={error} />}
        <button type="submit" className="as-btn as-btn--ghost" disabled={busy || !s.online}>
          <AppIcon name="plus" size={16} /> Add trusted contact
        </button>
      </form>
    </div>
  );
}

function PermissionStatus() {
  const [location, setLocation] = useState<string>('checking…');
  useEffect(() => {
    const permissions = globalThis.navigator?.permissions;
    if (!permissions) {
      setLocation('unknown (browser does not report it)');
      return;
    }
    permissions.query({ name: 'geolocation' }).then(
      (status) => setLocation(status.state),
      () => setLocation('unknown'),
    );
  }, []);
  return (
    <dl className="as-kv">
      <dt>Location</dt>
      <dd>
        {location}. Location is only read when you choose to share it with a help request; it is
        never tracked in the background.
      </dd>
      <dt>Stored on this device</dt>
      <dd>
        Your queued check-ins, photos you attach, cached instruction packs and display preferences.
      </dd>
    </dl>
  );
}

export function ProfileScreen({ onSignOut }: { onSignOut: () => void }) {
  const s = useStudent();
  const waiting = s.entries.filter(
    (e) => e.lifecycle === 'QUEUED' || e.lifecycle === 'SENDING',
  ).length;

  return (
    <>
      <h1 className="as-screen-title">Profile</h1>
      <Card title={s.user.displayName} icon="user" labelledBy="as-profile-user">
        <dl className="as-kv">
          <dt>Email</dt>
          <dd>{s.user.email}</dd>
          <dt>Role</dt>
          <dd>{s.user.roles.join(', ')}</dd>
          <dt>Mode</dt>
          <dd>
            {s.mock
              ? 'MOCK preview (nothing is sent)'
              : `${s.user.mode} — simulated data, prototype`}
          </dd>
        </dl>
      </Card>

      <Card title="Account" icon="settings" labelledBy="as-profile-account">
        <AccountSettings />
      </Card>

      <Card title="Trusted contacts" icon="users" labelledBy="as-profile-contacts">
        <TrustedContacts />
      </Card>

      <Card title="My help requests" icon="hand" labelledBy="as-profile-help">
        {!s.myHelp ? (
          <p className="as-muted">Needs a signed-in API session.</p>
        ) : s.myHelp.loading && !s.myHelp.data ? (
          <Loading />
        ) : s.myHelp.error ? (
          <ErrorNotice error={s.myHelp.error} onRetry={s.myHelp.reload} />
        ) : s.myHelp.data?.items.length ? (
          <ul className="as-list">
            {s.myHelp.data.items.map((h) => (
              <li key={h.id} className="as-item">
                <div className="as-row as-row--between">
                  <HelpStatusPill status={h.status} />
                  <span className="as-muted as-small">{formatWhen(h.createdAt)}</span>
                </div>
                {h.details && <p className="as-muted as-small">{h.details.split('\n')[0]}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No help requests on the server." />
        )}
      </Card>

      <Card title="My check-ins on this device" icon="clock" labelledBy="as-profile-checkins">
        <RecentActivity entries={s.entries} onRetry={s.checkIns.retry} />
      </Card>

      <Card title="Language" icon="info" labelledBy="as-profile-language">
        <div className="as-seg" role="group" aria-label="Language">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              lang={l.code}
              aria-pressed={s.language === l.code}
              onClick={() => s.setLanguage(l.code)}
            >
              {l.nativeName}
            </button>
          ))}
        </div>
        <p className="as-muted as-small">
          English is the source. Other languages are unreviewed drafts; safety-critical text also
          shows the English original.
        </p>
      </Card>

      <Card title="Accessibility" icon="info" labelledBy="as-profile-a11y">
        <label className="as-check">
          <input
            type="checkbox"
            checked={s.prefs.text === 'large'}
            onChange={(e) =>
              s.setPrefs({ ...s.prefs, text: e.target.checked ? 'large' : 'normal' })
            }
          />
          Larger text
        </label>
        <label className="as-check">
          <input
            type="checkbox"
            checked={s.prefs.contrast === 'high'}
            onChange={(e) =>
              s.setPrefs({ ...s.prefs, contrast: e.target.checked ? 'high' : 'normal' })
            }
          />
          Higher contrast
        </label>
        <label className="as-check">
          <input
            type="checkbox"
            checked={s.prefs.motion === 'reduce'}
            onChange={(e) =>
              s.setPrefs({ ...s.prefs, motion: e.target.checked ? 'reduce' : 'system' })
            }
          />
          Reduce motion
        </label>
      </Card>

      <div className="as-card">
        <SyncStatus
          connection={s.connection}
          entries={s.entries}
          offlineReady={s.offlineReady}
          storagePersisted={s.persisted}
        />
      </div>

      <Card title="Privacy & permissions" icon="shield" labelledBy="as-profile-privacy">
        <PermissionStatus />
      </Card>

      <button type="button" className="as-btn as-btn--ghost as-btn--block" onClick={onSignOut}>
        <AppIcon name="logout" size={18} /> Sign out
      </button>
      {waiting > 0 && (
        <p className="as-muted as-small">
          {waiting} check-in(s) are still waiting to send. They stay on this device and are sent
          only after you sign in again.
        </p>
      )}
    </>
  );
}
