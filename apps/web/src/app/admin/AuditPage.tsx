import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuditEventView } from '@sahaya/contracts';
import type { SahayaApi } from '../api/sahaya';
import { describeAuthError } from '../auth/AuthScreens';
import { Button, EmptyState, ErrorState, Skeleton, Surface, TextField } from '../../design-system';
import { formatWhen } from '../ui';

/** Read-only audit log (ADMIN). Events cannot be edited or deleted from the app. */
export function AuditPage({ api }: { api: SahayaApi }) {
  const [action, setAction] = useState('');
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
    setFilters({ action: action.trim().toUpperCase(), entityType: entityType.trim() });
  };

  return (
    <div className="as-stack">
      <Surface title="Filter" description="Newest events first. Codes are never recorded.">
        <form className="as-admin-filters" onSubmit={apply}>
          <TextField
            label="Action"
            placeholder="e.g. ROLE_GRANTED"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
          <TextField
            label="Entity type"
            placeholder="e.g. user"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          />
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
                <th scope="col">Action</th>
                <th scope="col">Actor</th>
                <th scope="col">Entity</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((event) => (
                <tr key={event.id}>
                  <td>{formatWhen(event.createdAt)}</td>
                  <td>
                    <code>{event.action}</code>
                  </td>
                  <td>{event.actorEmail ?? (event.actorId ? event.actorId : 'System')}</td>
                  <td>
                    {event.entityType}
                    {event.entityId && (
                      <small className="as-muted"> {event.entityId.slice(0, 8)}</small>
                    )}
                  </td>
                  <td>
                    <code className="as-audit-meta">{JSON.stringify(event.metadata)}</code>
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
