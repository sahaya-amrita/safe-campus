import { useState } from 'react';
import type { DrillAction } from '@sahaya/contracts';
import { Button, FormError, Pill, StatusBanner, TextField } from '../../design-system';
import { ApiError, describeProblem, newIdempotencyKey } from '../api/client';
import type { SahayaApi } from '../api/sahaya';
import { formatWhen, useAsync } from '../ui';

/**
 * After-action review of an ended drill: what happened, what went well, what
 * to improve, and follow-up actions with owners. Drill managers and admins
 * edit it; other staff read it. Saving marks the drill REVIEWED.
 */
export function DrillReviewPanel({
  api,
  drillId,
  canEdit,
  onSaved,
}: {
  api: SahayaApi;
  drillId: string;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const review = useAsync(() => api.drillReview(drillId), [api, drillId]);
  const [editing, setEditing] = useState(false);
  const missing = review.error instanceof ApiError && review.error.problem === 'NOT_FOUND';

  if (review.loading && !review.data) return null;
  if (editing)
    return (
      <ReviewForm
        api={api}
        drillId={drillId}
        initial={review.data ?? null}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          review.reload();
          onSaved?.();
        }}
      />
    );
  if (!review.data)
    return missing ? (
      <div className="as-row">
        <span className="as-small as-muted">No after-action review yet.</span>
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Write the review
          </Button>
        )}
      </div>
    ) : (
      <p className="as-small as-muted">{describeProblem(review.error)}</p>
    );
  const r = review.data;
  const open = r.actions.filter((a) => a.status === 'OPEN').length;
  return (
    <details className="as-details as-aar">
      <summary>
        After-action review · {open} open action{open === 1 ? '' : 's'}
      </summary>
      <p>{r.summary}</p>
      {r.wentWell && (
        <p>
          <strong>Went well:</strong> {r.wentWell}
        </p>
      )}
      {r.toImprove && (
        <p>
          <strong>To improve:</strong> {r.toImprove}
        </p>
      )}
      {r.actions.length > 0 && (
        <ul className="as-list">
          {r.actions.map((a) => (
            <li key={a.id} className="as-item as-row as-row--between">
              <span>
                {a.text}
                {a.owner ? ` · ${a.owner}` : ''}
                {a.dueDate ? ` · due ${a.dueDate}` : ''}
              </span>
              <Pill tone={a.status === 'DONE' ? 'ok' : 'warn'}>
                {a.status === 'DONE' ? 'Done' : 'Open'}
              </Pill>
            </li>
          ))}
        </ul>
      )}
      <p className="as-small as-muted">
        Last updated by {r.updatedByName ?? 'staff'} {formatWhen(r.updatedAt)}
      </p>
      {canEdit && (
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Edit review
        </Button>
      )}
    </details>
  );
}

function ReviewForm({
  api,
  drillId,
  initial,
  onCancel,
  onSaved,
}: {
  api: SahayaApi;
  drillId: string;
  initial: { summary: string; wentWell: string; toImprove: string; actions: DrillAction[] } | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const [wentWell, setWentWell] = useState(initial?.wentWell ?? '');
  const [toImprove, setToImprove] = useState(initial?.toImprove ?? '');
  const [actions, setActions] = useState<DrillAction[]>(initial?.actions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (summary.trim().length < 3) {
      setError('Write a short summary of what happened.');
      return;
    }
    const clean = actions.filter((a) => a.text.trim().length > 0);
    if (clean.some((a) => a.text.trim().length < 3)) {
      setError('Each action needs at least 3 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveDrillReview(drillId, {
        summary: summary.trim(),
        wentWell: wentWell.trim(),
        toImprove: toImprove.trim(),
        actions: clean.map((a) => ({ ...a, text: a.text.trim(), owner: a.owner.trim() })),
      });
      onSaved();
    } catch (reason) {
      setError(describeProblem(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="as-stack as-aar">
      <StatusBanner tone="info">
        After-action review. Aggregate notes only: do not name students.
      </StatusBanner>
      <TextField
        label="What happened (summary)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <TextField
        label="What went well"
        value={wentWell}
        onChange={(e) => setWentWell(e.target.value)}
      />
      <TextField
        label="What to improve"
        value={toImprove}
        onChange={(e) => setToImprove(e.target.value)}
      />
      <fieldset className="as-report__group">
        <legend>Follow-up actions</legend>
        {actions.map((a, i) => (
          <div key={a.id} className="as-aar__action">
            <TextField
              label={`Action ${i + 1}`}
              value={a.text}
              onChange={(e) =>
                setActions((list) =>
                  list.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)),
                )
              }
            />
            <TextField
              label="Owner"
              value={a.owner}
              onChange={(e) =>
                setActions((list) =>
                  list.map((x) => (x.id === a.id ? { ...x, owner: e.target.value } : x)),
                )
              }
            />
            <label className="as-check">
              <input
                type="checkbox"
                checked={a.status === 'DONE'}
                onChange={(e) =>
                  setActions((list) =>
                    list.map((x) =>
                      x.id === a.id ? { ...x, status: e.target.checked ? 'DONE' : 'OPEN' } : x,
                    ),
                  )
                }
              />
              Done
            </label>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon="plus"
          onClick={() =>
            setActions((list) => [
              ...list,
              {
                id: newIdempotencyKey().slice(0, 12),
                text: '',
                owner: '',
                dueDate: null,
                status: 'OPEN',
              },
            ])
          }
        >
          Add action
        </Button>
      </fieldset>
      <FormError>{error}</FormError>
      <div className="as-row">
        <Button loading={busy} onClick={() => void save()}>
          Save review
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
