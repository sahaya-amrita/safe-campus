import { useCallback, useState } from "react";
import type { ResponderApi } from "./api";
import type { HelpRequest, HelpRequestStatus } from "./contracts";
import { HELP_REQUEST_STATUSES } from "./contracts";
import { formatRelative, formatTimestamp } from "./formatTime";
import { HELP_REQUEST_STATUS_PRESENTATION } from "./helpRequests";
import { HelpRequestDetail } from "./HelpRequestDetail";
import { Icon } from "./Icon";
import { RequestErrorNotice } from "./RequestErrorNotice";
import { StatusBadge } from "./StatusBadge";
import { usePagedList } from "./usePagedList";

export interface HelpRequestQueueProps {
  api: ResponderApi;
  now?: () => Date;
  initialStatus?: HelpRequestStatus;
  /** Called after the server confirms a change (e.g. to refresh summaries). */
  onChanged?: () => void;
}

export function HelpRequestQueue({ api, now = () => new Date(), initialStatus = "OPEN", onChanged }: HelpRequestQueueProps) {
  const [status, setStatus] = useState<HelpRequestStatus>(initialStatus);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fetchPage = useCallback(
    (cursor: string | null) => api.listHelpRequests({ status, cursor }),
    [api, status],
  );
  const { state, reload, loadMore, replaceItem } = usePagedList<HelpRequest>(fetchPage, `hr:${status}`);
  const selected = state.items.find((i) => i.id === selectedId) ?? null;
  const n = now();
  const statusLabel = HELP_REQUEST_STATUS_PRESENTATION[status].label.toLowerCase();

  if (selected) {
    return (
      <HelpRequestDetail
        request={selected}
        api={api}
        now={now}
        onUpdated={(r) => {
          replaceItem(r);
          onChanged?.();
        }}
        onClose={() => setSelectedId(null)}
      />
    );
  }

  return (
    <section aria-labelledby="sc-hr-title" className="sc-view">
      <div className="sc-view__head">
        <h2 id="sc-hr-title">Help requests</h2>
        <p className="sc-muted">Longest-waiting first. Status changes only when the server confirms them.</p>
      </div>
      <fieldset className="sc-seg">
        <legend>Show status</legend>
        <div className="sc-seg__options">
          {HELP_REQUEST_STATUSES.map((s) => {
            const p = HELP_REQUEST_STATUS_PRESENTATION[s];
            return (
              <label key={s} className={`sc-seg__opt sc-seg__opt--${p.tone}`}>
                <input
                  type="radio"
                  name="sc-hr-status"
                  value={s}
                  checked={status === s}
                  onChange={() => {
                    setStatus(s);
                    setSelectedId(null);
                  }}
                />
                <span>
                  <span aria-hidden="true">{p.icon}</span> {p.label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {state.phase === "loading" && (
        <p role="status" className="sc-loading">
          Loading help requests…
        </p>
      )}
      {state.phase === "error" && <RequestErrorNotice error={state.error} onRetry={reload} subject="help requests" />}
      {state.phase === "ready" && (
        <>
          <p role="status" className="sc-muted sc-count">
            {state.items.length === 0
              ? `No ${statusLabel} help requests returned by the server.`
              : `Showing ${state.items.length} ${statusLabel} request(s)${state.nextCursor ? " (more available)" : ""}, oldest first.`}
          </p>
          {state.items.length === 0 ? (
            <div className="sc-empty">
              <Icon name="check" size={28} />
              <p className="sc-empty__title">Nothing {statusLabel} right now</p>
              <p className="sc-muted">New requests appear here after the server accepts them. Use Refresh in the header to check again.</p>
            </div>
          ) : (
            <ul className="sc-list" aria-label={`${HELP_REQUEST_STATUS_PRESENTATION[status].label} help requests`}>
              {state.items.map((r) => {
                const p = HELP_REQUEST_STATUS_PRESENTATION[r.status];
                const created = Date.parse(r.createdAt);
                return (
                  <li key={r.id} className={`sc-item sc-item--${p.tone}`} data-status={r.status}>
                    <div className="sc-item__main">
                      <div className="sc-item__line">
                        <StatusBadge {...p} />
                        <span className="sc-mono sc-item__id">{r.id}</span>
                        {r.status === "OPEN" && !Number.isNaN(created) && (
                          <span className="sc-item__wait">Waiting {formatRelative(created, n).replace(" ago", "")}</span>
                        )}
                      </div>
                      <p className="sc-item__meta">
                        <span>Received {formatTimestamp(r.createdAt, n)}</span>
                        {r.acknowledgedAt && <span>Acknowledged {formatTimestamp(r.acknowledgedAt, n)}</span>}
                        <span>Location ref: {r.locationReference ?? "not provided"}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      className="sc-btn"
                      onClick={() => setSelectedId(r.id)}
                      aria-label={`Open help request ${r.id}`}
                    >
                      Open
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {state.nextCursor && (
            <button type="button" className="sc-btn sc-btn--ghost" onClick={loadMore} disabled={state.loadingMore}>
              {state.loadingMore ? "Loading more…" : "Load more"}
            </button>
          )}
          {state.moreError != null && (
            <RequestErrorNotice error={state.moreError} onRetry={loadMore} subject="more help requests" />
          )}
        </>
      )}
    </section>
  );
}
