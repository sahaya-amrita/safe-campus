import { useMemo, useState } from 'react';
import type { SahayaApi } from '../api/sahaya';
import { useRoute } from '../router';
import {
  AppIcon,
  Card,
  EmptyState,
  ErrorNotice,
  Loading,
  VerificationPill,
  formatWhen,
  useAsync,
} from '../ui';
import { LEVEL_TEXT } from './controlRoomModel';
import {
  DEFAULT_FILTER,
  applyIncidentFilter,
  incidentTypes,
  prettyType,
  type IncidentFilter,
} from './incidentFilters';

/**
 * Searchable incident list for staff (master prompt §7): filter by type,
 * status, level, building, floor and time; sort by level or time. Location is
 * shown as building + floor separately; a report on one floor is never shown
 * as affecting the whole building.
 */
export function IncidentSearch({ api }: { api: SahayaApi }) {
  const { navigate } = useRoute();
  const incidents = useAsync(() => api.listIncidents(100), [api], 15_000);
  const buildings = useAsync(() => api.buildings(), [api]);
  // Floor names for every building (a handful in DEMO), for display and filtering.
  const maps = useAsync(
    buildings.data
      ? () => Promise.all(buildings.data!.items.map((b) => api.buildingMap(b.id)))
      : null,
    [api, buildings.data],
  );
  const [f, setF] = useState<IncidentFilter>(DEFAULT_FILTER);
  const set = (patch: Partial<IncidentFilter>) => setF((prev) => ({ ...prev, ...patch }));

  const all = useMemo(() => incidents.data?.items ?? [], [incidents.data]);
  const items = useMemo(() => applyIncidentFilter(all, f, Date.now()), [all, f]);
  const buildingName = useMemo(
    () => new Map((buildings.data?.items ?? []).map((b) => [b.id, b.name])),
    [buildings.data],
  );
  const floorName = useMemo(
    () =>
      new Map((maps.data ?? []).flatMap((m) => m.floors.map((fl) => [fl.id, fl.name] as const))),
    [maps.data],
  );
  const floorsOfBuilding = (maps.data ?? []).find((m) => m.id === f.buildingId)?.floors ?? [];
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTER);

  return (
    <Card title="Incident queue" icon="alert" labelledBy="as-inc-queue">
      <p className="as-muted as-small">
        Reports are unverified until an authorised verifier records a decision. Many reports never
        verify an incident.
      </p>
      <form className="as-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="as-field as-filters__text">
          Search
          <input
            className="as-input"
            type="search"
            value={f.text}
            placeholder="ID, type or description"
            onChange={(e) => set({ text: e.target.value })}
          />
        </label>
        <label className="as-field">
          Status
          <select
            className="as-select"
            value={f.status}
            onChange={(e) => set({ status: e.target.value as IncidentFilter['status'] })}
          >
            <option value="OPEN">Open</option>
            <option value="ALL">All</option>
            <option value="REPORTED">Reported</option>
            <option value="CORROBORATED">Corroborated</option>
            <option value="VERIFIED">Verified</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed / duplicate</option>
          </select>
        </label>
        <label className="as-field">
          Level
          <select
            className="as-select"
            value={f.level}
            onChange={(e) => set({ level: e.target.value as IncidentFilter['level'] })}
          >
            <option value="ANY">Any</option>
            <option value="3">L3 verified</option>
            <option value="2">L2 suspected</option>
            <option value="1">L1 unverified</option>
          </select>
        </label>
        <label className="as-field">
          Type
          <select
            className="as-select"
            value={f.type}
            onChange={(e) => set({ type: e.target.value })}
          >
            <option value="">Any</option>
            {incidentTypes(all).map((t) => (
              <option key={t} value={t}>
                {prettyType(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="as-field">
          Building
          <select
            className="as-select"
            value={f.buildingId}
            onChange={(e) => set({ buildingId: e.target.value, floorId: '' })}
          >
            <option value="">Any</option>
            {(buildings.data?.items ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="as-field">
          Floor
          <select
            className="as-select"
            value={f.floorId}
            disabled={!f.buildingId}
            onChange={(e) => set({ floorId: e.target.value })}
          >
            <option value="">{f.buildingId ? 'Any floor' : 'Choose a building'}</option>
            {floorsOfBuilding.map((fl) => (
              <option key={fl.id} value={fl.id}>
                {fl.name}
              </option>
            ))}
          </select>
        </label>
        <label className="as-field">
          Received
          <select
            className="as-select"
            value={f.window}
            onChange={(e) => set({ window: e.target.value as IncidentFilter['window'] })}
          >
            <option value="ALL">Any time</option>
            <option value="1H">Last hour</option>
            <option value="24H">Last 24 hours</option>
            <option value="7D">Last 7 days</option>
          </select>
        </label>
        <label className="as-field">
          Sort
          <select
            className="as-select"
            value={f.sort}
            onChange={(e) => set({ sort: e.target.value as IncidentFilter['sort'] })}
          >
            <option value="LEVEL">Level, then newest</option>
            <option value="NEWEST">Newest first</option>
            <option value="OLDEST">Oldest first</option>
          </select>
        </label>
        {filtered && (
          <button
            type="button"
            className="as-btn as-btn--ghost as-btn--sm"
            onClick={() => setF(DEFAULT_FILTER)}
          >
            Clear filters
          </button>
        )}
      </form>

      {incidents.loading && !incidents.data && <Loading />}
      {Boolean(incidents.error) && (
        <ErrorNotice error={incidents.error} onRetry={incidents.reload} />
      )}
      {incidents.data && (
        <p className="as-muted as-small" role="status">
          {items.length} of {all.length} incident{all.length === 1 ? '' : 's'} shown
          {all.length >= 100 && ' (newest 100 loaded)'}.
        </p>
      )}
      {incidents.data && items.length === 0 && (
        <EmptyState title="No incidents match these filters." />
      )}
      {items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="as-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Level · status</th>
                <th>Location</th>
                <th>Received</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{prettyType(i.type)}</strong>{' '}
                    <span className="as-muted as-small as-mono">#{i.id.slice(0, 8)}</span>
                    <br />
                    <span className="as-muted as-small">{i.description.slice(0, 90)}</span>
                  </td>
                  <td>
                    {i.level && (
                      <span
                        className={`as-level as-level--${i.level}`}
                        title={LEVEL_TEXT[i.level].text}
                      >
                        {LEVEL_TEXT[i.level].short}
                      </span>
                    )}{' '}
                    <VerificationPill status={i.verificationStatus} />
                  </td>
                  <td className="as-small">
                    {i.buildingId
                      ? (buildingName.get(i.buildingId) ?? 'Unknown building')
                      : 'No building given'}
                    <br />
                    <span className="as-muted">
                      {i.floorId
                        ? (floorName.get(i.floorId) ?? 'Floor recorded')
                        : 'Floor not given'}
                      {i.zoneId && ' · zone recorded'}
                    </span>
                  </td>
                  <td className="as-small">{formatWhen(i.serverReceivedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="as-btn as-btn--ghost as-btn--sm"
                      onClick={() => navigate(`/r/incidents/${i.id}`)}
                    >
                      Open <AppIcon name="chevron" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
