import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuditEventView } from '@sahaya/contracts';
import type { SahayaApi } from '../api/sahaya';
import { describeAuthError } from '../auth/AuthScreens';
import { Button, EmptyState, ErrorState, Skeleton, Surface, TextField } from '../../design-system';
import { auditActionLabel, auditDetails, COMMON_AUDIT_ACTIONS, humanize } from '../labels';
import { formatWhen } from '../ui';

/** Kinds of record an event can be about; values match the stored entity type exactly. */
const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: 'user', label: 'Accounts' },
  { value: 'HELP_REQUEST', label: 'Help requests' },
  { value: 'INCIDENT', label: 'Incidents' },
  { value: 'ALERT', label: 'Alerts' },
  { value: 'DRILL', label: 'Drills' },
  { value: 'RESPONDER', label: 'Responders' },
  { value: 'SAFE_POINT', label: 'Safe points' },
  { value: 'ROUTE_GRAPH', label: 'Route data' },
  { value: 'INSTRUCTION_PACK', label: 'Guides' },
  { value: 'attachment', label: 'Photos' },
  { value: 'SETTINGS', label: 'Settings' },
];
const OTHER = '__other__';

/** Read-only audit log (ADMIN). Events cannot be edited or deleted from the app. */
export function AuditPage({ api }: { api: SahayaApi }) {
  const [action, setAction] = useState('');
  const [otherAction, setOtherAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [filters, setFilters] = useState({ action: '', entityType: '' });
  const [items, setItems] = useState<AuditEventView[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.auditEvents(filters).then(
      (page) => {
        if (!active) return;
        setItems(page.items);
        setNextBefore(page.nextBefore);
        setLoading(false);
      },
      (reason: unknown) => {
        if (!active) return;
        setError(reason);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, filters, attempt]);

  const more = async () => {
    if (nextBefore === null) return;
    try {
      const page = await api.auditEvents({ ...filters, before: nextBefore });
      setItems((current) => [...current, ...page.items]);
      setNextBefore(page.nextBefore);
    } catch (reason) {
      setError(reason);
    }
  };

  const apply = (event: FormEvent) => {
    event.preventDefault();
    setFilters({
      action: (action === OTHER ? otherAction : action).trim().toUpperCase(),
      entityType,
    });
  };

  return (
    <div className="as-stack">
      <Surface title="Filter" description="Newest events first. Sign-in codes are never recorded.">
        <form className="as-admin-filters" onSubmit={apply}>
          <label className="ds-field">
            <span className="ds-field__label">What happened</span>
            <select className="ds-input" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">Any action</option>
              {COMMON_AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {auditActionLabel(a)}
                </option>
              ))}
              <option value={OTHER}>Other (enter the code)…</option>
            </select>
          </label>
          {action === OTHER && (
            <TextField
              label="Action code"
              placeholder="e.g. DRILL_STOPPED"
              value={otherAction}
              onChange={(e) => setOtherAction(e.target.value)}
            />
          )}
          <label className="ds-field">
            <span className="ds-field__label">About</span>
            <select
              className="ds-input"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">Anything</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      </Surface>

      {loading && items.length === 0 ? (
        <Skeleton lines={5} label="audit events" />
      ) : error && items.length === 0 ? (
        <ErrorState
          title="Could not load audit events"
          message={describeAuthError(error)}
          onRetry={() => setAttempt((a) => a + 1)}
        />
      ) : items.length === 0 ? (
        <EmptyState icon="file" title="No audit events match" />
      ) : (
        <div className="as-table-wrap">
          <table className="as-table as-audit-table">
            <caption className="as-sr-only">Audit events, newest first</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What happened</th>
                <th scope="col">By</th>
                <th scope="col">About</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((event) => (
                <tr key={event.id}>
                  <td data-label="When" className="as-nowrap">
                    {formatWhen(event.createdAt)}
                  </td>
                  <td data-label="What happened">
                    <strong>{auditActionLabel(event.action)}</strong>
                    <small className="as-audit-code">{event.action}</small>
                  </td>
                  <td data-label="By">
                    {event.actorEmail ?? (event.actorId ? event.actorId : 'System')}
                  </td>
                  <td data-label="About">
                    {humanize(event.entityType)}
                    {event.entityId && (
                      <small className="as-muted"> #{event.entityId.slice(0, 8)}</small>
                    )}
                  </td>
                  <td data-label="Details">
                    {auditDetails(event.metadata).length === 0 ? (
                      <span className="as-muted">—</span>
                    ) : (
                      <dl className="as-audit-details">
                        {auditDetails(event.metadata).map((d) => (
                          <div key={d.label}>
                            <dt>{d.label}</dt>
                            <dd>{d.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextBefore !== null && (
        <Button variant="secondary" onClick={() => void more()}>
          Load older events
        </Button>
      )}
    </div>
  );
}
