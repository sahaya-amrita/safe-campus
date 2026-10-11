import { useState, type FormEvent } from 'react';
import { RollCallCard } from './operations';
import { DrillReviewPanel } from './drillReview';
import type { Drill, Me, SahayaApi } from '../api/sahaya';
import { useTourTarget } from '../../components/tom';
import { hasRole } from '../auth/session';
import { Card, EmptyState, ErrorNotice, Loading, Pill, formatWhen, useAsync } from '../ui';
import { announceDrillsChanged } from '../DrillBanner';
import { useActions, useKeyForBody } from './shared';

export function useActiveDrills(api: SahayaApi) {
  const drills = useAsync(() => api.drills(), [api], 15_000);
  const active = (drills.data?.items ?? []).filter((d) => d.status === 'ACTIVE');
  return { ...drills, active };
}

/**
 * Kill switch: stops every running drill. Two taps (arm, then confirm) so it
 * is hard to hit by accident but needs no typing under pressure.
 */
export function StopAllDrills({
  api,
  onStopped,
}: {
  api: SahayaApi;
  onStopped: (count: number) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const stop = () => {
    setBusy(true);
    setError(null);
    api
      .stopAllDrills()
      .then((r) => {
        setArmed(false);
        announceDrillsChanged();
        onStopped(r.stopped);
      }, setError)
      .finally(() => setBusy(false));
  };
  return (
    <div className="as-killswitch">
      {armed ? (
        <>
          <button type="button" className="as-btn as-btn--danger" onClick={stop} disabled={busy}>
            {busy ? 'Stopping…' : 'Confirm: STOP ALL DRILLS'}
          </button>
          <button type="button" className="as-btn as-btn--ghost" onClick={() => setArmed(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="as-btn as-btn--danger" onClick={() => setArmed(true)}>
          STOP DRILL
        </button>
      )}
      {Boolean(error) && <ErrorNotice error={error} />}
    </div>
  );
}

const STOP_REASON: Record<string, string> = {
  STOPPED_BY_CONTROLLER: 'stopped by a controller',
  KILL_SWITCH: 'stopped with the kill switch',
  LIVE_INCIDENT_VERIFIED: 'suspended automatically: a live incident was verified',
};

/** Scenarios available in this DEMO. None is institution-approved yet. */
const SCENARIOS = [
  { ref: 'demo-familiarisation', label: 'Familiarisation: check in and find open ground' },
  { ref: 'demo-smoke-corridor', label: 'Smoke in a corridor (S1)' },
  { ref: 'demo-blocked-exit', label: 'Blocked exit (S2)' },
  { ref: 'demo-network-down', label: 'Network down during check-in (S4)' },
];

/**
 * Drill console (blueprint Appendix C): preflight, start, stop, kill switch,
 * and a short after-drill summary. Students see a striped DRILL banner while
 * any drill is ACTIVE.
 */
export function DrillsView({ api, user }: { api: SahayaApi; user: Me }) {
  const drills = useActiveDrills(api);
  const preflightTarget = useTourTarget('drills.preflight');
  const preflight = useAsync(() => api.drillPreflight(), [api, drills.data], 15_000);
  const buildings = useAsync(() => api.buildings(), [api]);
  const canControl = hasRole(user, 'DRILL_MANAGER', 'ADMIN');
  const { run, busy, errors } = useActions();
  const [stopped, setStopped] = useState<number | null>(null);
  const reload = () => {
    drills.reload();
    preflight.reload();
    announceDrillsChanged();
  };
  const items = drills.data?.items ?? [];

  return (
    <div className="as-stack">
      {drills.active.map((d) => (
        <RollCallCard key={d.id} api={api} kind="drills" id={d.id} />
      ))}
      <div ref={preflightTarget}>
        <Card
          title="Before you start"
          icon="check"
          labelledBy="as-drill-preflight"
          action={
            drills.active.length > 0 ? (
              <StopAllDrills
                api={api}
                onStopped={(count) => {
                  setStopped(count);
                  reload();
                }}
              />
            ) : undefined
          }
        >
          {stopped !== null && (
            <p className="as-notice as-notice--ok" role="status">
              Stopped {stopped} drill{stopped === 1 ? '' : 's'}.
            </p>
          )}
          {preflight.loading && !preflight.data && <Loading />}
          {Boolean(preflight.error) && (
            <ErrorNotice error={preflight.error} onRetry={preflight.reload} />
          )}
          {preflight.data && (
            <ul className="as-checklist">
              <li className={preflight.data.verifiedIncidentsOpen === 0 ? 'is-ok' : 'is-fail'}>
                {preflight.data.verifiedIncidentsOpen === 0
                  ? 'No verified incident is open.'
                  : `${preflight.data.verifiedIncidentsOpen} verified incident(s) open: drills are blocked.`}
              </li>
              <li className="is-ok">
                {preflight.data.activeDrills === 0
                  ? 'No drill is running.'
                  : `${preflight.data.activeDrills} drill(s) running. STOP DRILL ends them all.`}
              </li>
              <li className="is-note">
                Digital drills only. Physical drills need the Security Officer's approval and
                qualified supervision.
              </li>
            </ul>
          )}
        </Card>
      </div>

      {canControl && (
        <NewDrill api={api} buildings={buildings.data?.items ?? []} onCreated={reload} />
      )}

      <Card title="Drills" icon="layers" labelledBy="as-drill-list">
        {drills.loading && !drills.data && <Loading />}
        {Boolean(drills.error) && <ErrorNotice error={drills.error} onRetry={drills.reload} />}
        {drills.data && items.length === 0 && <EmptyState title="No drills yet." />}
        <ul className="as-list">
          {items.map((d) => (
            <li key={d.id} className="as-item">
              <div className="as-row as-row--between">
                <span className="as-item__title">{d.name}</span>
                <Pill
                  tone={
                    d.status === 'ACTIVE'
                      ? 'danger'
                      : d.status === 'COMPLETED' || d.status === 'REVIEWED'
                        ? 'ok'
                        : 'neutral'
                  }
                >
                  {d.status}
                </Pill>
              </div>
              <p className="as-muted as-small">
                {d.mode} · {d.scenarioRef} · created {formatWhen(d.createdAt)}
                {d.startedAt && ` · started ${formatWhen(d.startedAt)}`}
                {d.stoppedAt &&
                  ` · ${STOP_REASON[d.stopReason ?? ''] ?? 'ended'} ${formatWhen(d.stoppedAt)}`}
              </p>
              <div className="as-row">
                {canControl && (d.status === 'DRAFT' || d.status === 'AUTHORIZED') && (
                  <button
                    type="button"
                    className="as-btn as-btn--sm"
                    disabled={busy !== null || preflight.data?.canStart === false}
                    onClick={() =>
                      void run(`${d.id}:start`, (key) => api.startDrill(d.id, key), reload)
                    }
                  >
                    {busy === `${d.id}:start` ? 'Starting…' : 'Start drill'}
                  </button>
                )}
                {d.status === 'ACTIVE' && (
                  <button
                    type="button"
                    className="as-btn as-btn--danger as-btn--sm"
                    disabled={busy !== null}
                    onClick={() => void run(`${d.id}:stop`, () => api.stopDrill(d.id), reload)}
                  >
                    {busy === `${d.id}:stop` ? 'Stopping…' : 'Stop this drill'}
                  </button>
                )}
              </div>
              {(['start', 'stop'] as const).map((a) =>
                errors[`${d.id}:${a}`] ? (
                  <ErrorNotice key={a} error={errors[`${d.id}:${a}`]} />
                ) : null,
              )}
              {canControl && (d.status === 'COMPLETED' || d.status === 'ACTIVE') && (
                <DrillSummary api={api} drill={d} />
              )}
              {(d.status === 'COMPLETED' || d.status === 'REVIEWED') && (
                <DrillReviewPanel api={api} drillId={d.id} canEdit={canControl} onSaved={reload} />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function NewDrill({
  api,
  buildings,
  onCreated,
}: {
  api: SahayaApi;
  buildings: readonly { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [scenario, setScenario] = useState(SCENARIOS[0]!.ref);
  const [buildingId, setBuildingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const keyFor = useKeyForBody();
  const building = buildingId || buildings[0]?.id || '';
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const input = {
      name: name.trim(),
      buildingId: building,
      scenarioRef: scenario,
      scenarioVersion: 'demo-1',
      mode: 'DRILL' as const,
    };
    api
      .createDrill(input, keyFor(input))
      .then(() => {
        setName('');
        onCreated();
      }, setError)
      .finally(() => setSaving(false));
  };
  return (
    <Card title="Plan a drill" icon="plus" labelledBy="as-drill-new">
      <form className="as-form" onSubmit={submit}>
        <label className="as-field">
          Name
          <input
            className="as-input"
            required
            minLength={3}
            maxLength={160}
            value={name}
            placeholder="e.g. Block B smoke drill, morning"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="as-field">
          Scenario (DEMO, not approved)
          <select
            className="as-select"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            {SCENARIOS.map((s) => (
              <option key={s.ref} value={s.ref}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="as-field">
          Building
          <select
            className="as-select"
            value={building}
            onChange={(e) => setBuildingId(e.target.value)}
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {Boolean(error) && <ErrorNotice error={error} />}
        <button
          type="submit"
          className="as-btn"
          disabled={saving || name.trim().length < 3 || !building}
        >
          {saving ? 'Saving…' : 'Save as draft'}
        </button>
      </form>
    </Card>
  );
}

/** After-action numbers with their denominators; aggregate only. */
function DrillSummary({ api, drill }: { api: SahayaApi; drill: Drill }) {
  const metrics = useAsync(() => api.drillMetrics(drill.id), [api, drill.id, drill.status]);
  if (!metrics.data) return null;
  const c = metrics.data.checkins;
  return (
    <p className="as-small as-drill-summary">
      <strong>Summary:</strong> {c.participants} checked in · {c.confirmed_safe} safe ·{' '}
      {c.help_requested} asked for help · {metrics.data.training.completions} practice scenario(s)
      completed. Students who did not check in are unconfirmed, not missing.
    </p>
  );
}
