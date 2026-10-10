import { useCallback, useEffect, useState } from "react";
import type { ResponderApi } from "./api";
import { classifyError } from "./apiError";
import type { RollCallSnapshot } from "./contracts";
import { formatTimestamp } from "./formatTime";
import { RequestErrorNotice } from "./RequestErrorNotice";
import { rollCallCompleteness } from "./rollCall";

export interface RollCallSummaryProps {
  api: Pick<ResponderApi, "getRollCallSummary">;
  now?: () => Date;
}

type State = { phase: "loading" } | { phase: "ready"; data: RollCallSnapshot } | { phase: "error"; error: unknown };

export function RollCallSummary({ api, now = () => new Date() }: RollCallSummaryProps) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const load = useCallback(() => {
    let active = true;
    setState({ phase: "loading" });
    api.getRollCallSummary().then(
      (data) => active && setState({ phase: "ready", data }),
      (error: unknown) => active && setState({ phase: "error", error }),
    );
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => load(), [load]);

  return (
    <section aria-labelledby="sc-rc-title">
      <h2 id="sc-rc-title">Roll-call summary</h2>
      {state.phase === "loading" && <p role="status">Loading roll-call summary…</p>}
      {state.phase === "error" &&
        (classifyError(state.error) === "UNAVAILABLE" ? (
          <p className="sc-notice">
            Roll-call data is not available: no roll-call endpoint has been agreed in the API contract yet. No totals
            are shown rather than estimates.
          </p>
        ) : (
          <RequestErrorNotice error={state.error} onRetry={load} subject="the roll-call summary" />
        ))}
      {state.phase === "ready" && <RollCallBody data={state.data} now={now()} />}
    </section>
  );
}

function RollCallBody({ data, now }: { data: RollCallSnapshot; now: Date }) {
  const c = rollCallCompleteness(data);
  return (
    <>
      {data.isDemo && (
        <p className="sc-demo-label">DEMO DATA — synthetic participants, not real people.</p>
      )}
      <p>
        <strong>Scope:</strong> {data.scopeLabel}.{" "}
        {data.scopeKind === "PARTIAL"
          ? "This is a partial scope, not a campus-wide roll call."
          : "The data source cannot state its coverage; do not treat this as campus-wide."}
      </p>
      <dl className="sc-fields">
        <dt>Reported safe</dt>
        <dd>{data.safeCount}</dd>
        <dt>Reported needing help</dt>
        <dd>{data.needHelpCount}</dd>
        <dt>Expected in scope</dt>
        <dd>{data.expectedCount ?? "Unknown"}</dd>
        <dt>As of</dt>
        <dd>{formatTimestamp(data.asOf, now)}</dd>
      </dl>
      <p role="status">
        {c.kind === "UNKNOWN_EXPECTED" &&
          `${c.responded} responses received. Expected headcount is unknown, so completeness cannot be determined.`}
        {c.kind === "INCOMPLETE" &&
          `${c.responded} of ${c.expected} expected have responded in this scope. ${c.missing} not yet accounted for.`}
        {c.kind === "ALL_RESPONDED_IN_SCOPE" &&
          `All ${c.expected} expected in this scope have responded. This covers only the stated scope.`}
      </p>
    </>
  );
}
