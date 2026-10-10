import { useCallback, useState } from "react";
import type { ResponderApi } from "./api";
import type { HelpRequest, HelpRequestStatus } from "./contracts";
import { HELP_REQUEST_STATUSES } from "./contracts";
import { formatTimestamp } from "./formatTime";
import { HELP_REQUEST_STATUS_PRESENTATION } from "./helpRequests";
import { HelpRequestDetail } from "./HelpRequestDetail";
import { RequestErrorNotice } from "./RequestErrorNotice";
import { StatusBadge } from "./StatusBadge";
import { usePagedList } from "./usePagedList";

export interface HelpRequestQueueProps {
  api: ResponderApi;
  now?: () => Date;
  initialStatus?: HelpRequestStatus;
}

export function HelpRequestQueue({ api, now = () => new Date(), initialStatus = "OPEN" }: HelpRequestQueueProps) {
  const [status, setStatus] = useState<HelpRequestStatus>(initialStatus);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fetchPage = useCallback(
    (cursor: string | null) => api.listHelpRequests({ status, cursor }),
    [api, status],
  );
  const { state, reload, loadMore, replaceItem } = usePagedList<HelpRequest>(fetchPage, `hr:${status}`);
  const selected = state.items.find((i) => i.id === selectedId) ?? null;
  const n = now();

  if (selected) {
    return (
      <HelpRequestDetail
        request={selected}
        api={api}
        now={now}
        onUpdated={replaceItem}
        onClose={() => setSelectedId(null)}
      />
    );
  }

  return (
    <section aria-labelledby="sc-hr-title">
      <h2 id="sc-hr-title">Help requests</h2>
      <fieldset className="sc-filter">
        <legend>Show status</legend>
        {HELP_REQUEST_STATUSES.map((s) => (
          <label key={s} className="sc-filter__option">
            <input
              type="radio"
              name="sc-hr-status"
              value={s}
              checked={status === s}
              onChange={() => {
                setStatus(s);
                setSelectedId(null);
              }}
            />{" "}
            {HELP_REQUEST_STATUS_PRESENTATION[s].label}
          </label>
        ))}
      </fieldset>

      {state.phase === "loading" && <p role="status">Loading help requests…</p>}
      {state.phase === "error" && <RequestErrorNotice error={state.error} onRetry={reload} subject="help requests" />}
      {state.phase === "ready" && (
        <>
          <p role="status" className="sc-muted">
            {state.items.length === 0
              ? `No ${HELP_REQUEST_STATUS_PRESENTATION[status].label.toLowerCase()} help requests returned by the server.`
              : `Showing ${state.items.length} ${HELP_REQUEST_STATUS_PRESENTATION[status].label.toLowerCase()} request(s)${state.nextCursor ? " (more available)" : ""}, oldest first.`}
          </p>
          <ul className="sc-list" aria-label={`${HELP_REQUEST_STATUS_PRESENTATION[status].label} help requests`}>
            {state.items.map((r) => {
              const p = HELP_REQUEST_STATUS_PRESENTATION[r.status];
              return (
                <li key={r.id} className={`sc-row sc-row--${p.tone}`} data-status={r.status}>
                  <StatusBadge {...p} />
                  <span className="sc-row__id">{r.id}</span>
                  <span className="sc-row__meta">Received {formatTimestamp(r.createdAt, n)}</span>
                  {r.acknowledgedAt && (
                    <span className="sc-row__meta">Acknowledged {formatTimestamp(r.acknowledgedAt, n)}</span>
                  )}
                  <button type="button" onClick={() => setSelectedId(r.id)} aria-label={`Open help request ${r.id}`}>
                    Open
                  </button>
                </li>
              );
            })}
          </ul>
          {state.nextCursor && (
            <button type="button" onClick={loadMore} disabled={state.loadingMore}>
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
