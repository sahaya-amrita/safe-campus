import { useCallback, useState } from "react";
import { formatTimestamp } from "../responder/formatTime";
import { RequestErrorNotice } from "../responder/RequestErrorNotice";
import { StatusBadge } from "../responder/StatusBadge";
import { usePagedList } from "../responder/usePagedList";
import type { HazardReport, HazardReviewApi, HazardStatus } from "./contracts";
import { HAZARD_STATUSES } from "./contracts";
import { countPendingByCategory, HAZARD_STATUS_PRESENTATION } from "./hazardReview";
import { HazardReviewForm } from "./HazardReviewForm";

export interface HazardReviewQueueProps {
  api: HazardReviewApi;
  now?: () => Date;
  initialStatus?: HazardStatus;
}

export function HazardReviewQueue({ api, now = () => new Date(), initialStatus = "PENDING_REVIEW" }: HazardReviewQueueProps) {
  const [status, setStatus] = useState<HazardStatus>(initialStatus);
  const [lastReviewed, setLastReviewed] = useState<HazardReport | null>(null);
  const fetchPage = useCallback((cursor: string | null) => api.listHazardReports({ status, cursor }), [api, status]);
  const { state, reload, loadMore, replaceItem } = usePagedList<HazardReport>(fetchPage, `hz:${status}`);
  const n = now();
  const categoryCounts = state.phase === "ready" ? countPendingByCategory(state.items) : [];

  function onReviewed(updated: HazardReport) {
    replaceItem(updated);
    setLastReviewed(updated);
  }

  return (
    <section aria-labelledby="sc-hz-title">
      <h2 id="sc-hz-title">Hazard review</h2>
      <p className="sc-muted">
        Reports are unverified until a human reviewer records a decision. Report counts are informational only:
        they never raise an official alert. Campus notices are issued separately by authorized staff.
      </p>
      <fieldset className="sc-filter">
        <legend>Show status</legend>
        {HAZARD_STATUSES.map((s) => (
          <label key={s} className="sc-filter__option">
            <input
              type="radio"
              name="sc-hz-status"
              value={s}
              checked={status === s}
              onChange={() => {
                setStatus(s);
                setLastReviewed(null);
              }}
            />{" "}
            {HAZARD_STATUS_PRESENTATION[s].label}
          </label>
        ))}
      </fieldset>

      <div role="status" aria-live="polite" className="sc-live">
        {lastReviewed &&
          `Review saved by the server: ${lastReviewed.id} is now ${HAZARD_STATUS_PRESENTATION[lastReviewed.status].label}` +
            (lastReviewed.reviewedBy ? ` (reviewer ${lastReviewed.reviewedBy})` : "") +
            "."}
      </div>

      {state.phase === "loading" && <p role="status">Loading hazard reports…</p>}
      {state.phase === "error" && <RequestErrorNotice error={state.error} onRetry={reload} subject="hazard reports" />}
      {state.phase === "ready" && (
        <>
          {categoryCounts.length > 0 && (
            <section className="sc-counts" aria-labelledby="sc-hz-counts">
              <h3 id="sc-hz-counts">Pending reports by category (informational)</h3>
              <p className="sc-muted">Counts of loaded, unverified reports. Many reports do not confirm a hazard.</p>
              <ul>
                {categoryCounts.map((c) => (
                  <li key={c.category}>
                    {c.category}: {c.count} unverified
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="sc-muted">
            {state.items.length === 0
              ? `No ${HAZARD_STATUS_PRESENTATION[status].label.toLowerCase()} reports returned by the server.`
              : `Showing ${state.items.length} report(s)${state.nextCursor ? " (more available)" : ""}, oldest first.`}
          </p>
          <ul className="sc-list" aria-label={`${HAZARD_STATUS_PRESENTATION[status].label} hazard reports`}>
            {state.items.map((r) => {
              const p = HAZARD_STATUS_PRESENTATION[r.status];
              return (
                <li key={r.id} className={`sc-card sc-card--${p.tone}`} data-status={r.status}>
                  <div className="sc-card__head">
                    <StatusBadge {...p} />
                    <strong>{r.category}</strong>
                    <span className="sc-row__id">{r.id}</span>
                  </div>
                  <p>{r.description}</p>
                  <dl className="sc-fields">
                    <dt>Reported</dt>
                    <dd>{formatTimestamp(r.createdAt, n)}</dd>
                    <dt>Location reference</dt>
                    <dd>{r.locationReference ?? "Not provided"}</dd>
                    {r.reviewedAt && (
                      <>
                        <dt>Reviewed</dt>
                        <dd>
                          {formatTimestamp(r.reviewedAt, n)}
                          {r.reviewedBy ? ` by ${r.reviewedBy}` : ""}
                        </dd>
                      </>
                    )}
                    {r.duplicateOfId && (
                      <>
                        <dt>Duplicate of</dt>
                        <dd>{r.duplicateOfId}</dd>
                      </>
                    )}
                    {r.reviewNote && (
                      <>
                        <dt>Review note</dt>
                        <dd>{r.reviewNote}</dd>
                      </>
                    )}
                  </dl>
                  <p className="sc-muted">{p.description}</p>
                  <HazardReviewForm key={`${r.id}:${r.status}`} report={r} api={api} onReviewed={onReviewed} />
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
            <RequestErrorNotice error={state.moreError} onRetry={loadMore} subject="more hazard reports" />
          )}
        </>
      )}
    </section>
  );
}
