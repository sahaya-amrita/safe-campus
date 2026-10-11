import { useState } from 'react';
import type { AssistantContentView } from '@sahaya/contracts';
import type { SahayaApi } from '../api/sahaya';
import { describeAuthError } from '../auth/AuthScreens';
import {
  Button,
  ErrorState,
  FormError,
  Pill,
  Sheet,
  Skeleton,
  StatusBanner,
  Surface,
  TextField,
} from '../../design-system';
import { roleLabel } from '../labels';
import { formatWhen, useAsync, type Tone } from '../ui';

const TONE: Record<AssistantContentView['state'], Tone> = {
  APPROVED: 'ok',
  DRAFT: 'warn',
  REJECTED: 'danger',
};

/**
 * Tom's help text, reviewed by a named person. An approval covers the exact
 * text shown; if the text changes in a later release, it returns to DRAFT and
 * needs a new review. Outside DEMO, Tom only uses APPROVED text.
 */
export function TomContentPage({ api }: { api: SahayaApi }) {
  const content = useAsync(() => api.assistantContent(), [api]);
  const [open, setOpen] = useState<{
    item: AssistantContentView;
    decision: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const items = content.data?.items ?? [];
  const approved = items.filter((i) => i.state === 'APPROVED').length;
  const [view, setView] = useState<'REVIEW' | 'APPROVED' | 'ALL'>('REVIEW');
  const shown = items.filter((i) =>
    view === 'ALL' ? true : view === 'APPROVED' ? i.state === 'APPROVED' : i.state !== 'APPROVED',
  );
  const percent = items.length ? Math.round((approved / items.length) * 100) : 0;

  const save = async () => {
    if (!open) return;
    if (notes.trim().length < 5) {
      setError('Add a note of at least 5 characters (for example, what you checked).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.reviewAssistantContent(open.item.id, {
        decision: open.decision,
        notes: notes.trim(),
      });
      setDone(`${open.decision === 'APPROVED' ? 'Approved' : 'Rejected'} “${open.item.title}”.`);
      setOpen(null);
      setNotes('');
      content.reload();
    } catch (reason) {
      setError(describeAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="as-stack">
      <StatusBanner tone="info" title={`${approved} of ${items.length} help texts approved`}>
        Tom answers only from approved text outside DEMO mode. An approval covers the exact wording;
        any change sends it back to draft.
      </StatusBanner>
      {items.length > 0 && (
        <div className="as-progressbar" role="img" aria-label={`${percent}% approved`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {done && <StatusBanner tone="ok">{done}</StatusBanner>}
      <div className="as-seg" role="group" aria-label="Show">
        {(
          [
            ['REVIEW', `Needs review (${items.length - approved})`],
            ['APPROVED', `Approved (${approved})`],
            ['ALL', `All (${items.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {content.loading && !content.data ? (
        <Skeleton lines={5} label="help content" />
      ) : content.error && !content.data ? (
        <ErrorState
          title="Could not load help content"
          message={describeAuthError(content.error)}
          onRetry={content.reload}
        />
      ) : shown.length === 0 ? (
        <p className="as-muted">
          {view === 'REVIEW' ? 'Everything has been reviewed.' : 'Nothing here yet.'}
        </p>
      ) : (
        shown.map((item) => (
          <Surface
            key={item.id}
            title={item.title}
            description={`${item.kind.replace(/_/g, ' ').toLowerCase()} · version ${item.version} · for ${item.audience === 'ALL' ? 'everyone' : item.audience.map(roleLabel).join(', ')}`}
            action={<Pill tone={TONE[item.state]}>{item.state.toLowerCase()}</Pill>}
          >
            <p className="as-tom-text">{item.body}</p>
            {item.reviewedAt && (
              <p className="as-small as-muted">
                {item.state === 'APPROVED'
                  ? `Approved by ${item.reviewedBy ?? 'a reviewer'}`
                  : 'Reviewed'}{' '}
                {formatWhen(item.reviewedAt)}
                {item.notes ? ` · “${item.notes}”` : ''}
              </p>
            )}
            <div className="as-row">
              {item.state !== 'APPROVED' && (
                <Button size="sm" onClick={() => setOpen({ item, decision: 'APPROVED' })}>
                  Approve this text
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpen({ item, decision: 'REJECTED' })}
              >
                {item.state === 'APPROVED' ? 'Withdraw approval' : 'Reject'}
              </Button>
            </div>
          </Surface>
        ))
      )}
      <Sheet
        open={open !== null}
        title={
          open ? `${open.decision === 'APPROVED' ? 'Approve' : 'Reject'}: ${open.item.title}` : ''
        }
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant={open?.decision === 'REJECTED' ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => void save()}
            >
              Save review
            </Button>
          </>
        }
      >
        <div className="as-stack">
          <p>Your name and this note are recorded with the review.</p>
          <TextField label="Review note" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <FormError>{error}</FormError>
        </div>
      </Sheet>
    </div>
  );
}
