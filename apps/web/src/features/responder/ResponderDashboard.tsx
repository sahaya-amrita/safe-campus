import { useState } from "react";
import { HazardReviewQueue } from "../incidents/HazardReviewQueue";
import type { ResponderApi } from "./api";
import { HelpRequestQueue } from "./HelpRequestQueue";
import { RollCallSummary } from "./RollCallSummary";
import "./responder.css";

export type ResponderView = "help-requests" | "hazard-review" | "roll-call";

const VIEWS: Array<{ id: ResponderView; label: string }> = [
  { id: "help-requests", label: "Help requests" },
  { id: "hazard-review", label: "Hazard review" },
  { id: "roll-call", label: "Roll-call summary" },
];

export interface ResponderDashboardProps {
  api: ResponderApi;
  now?: () => Date;
  initialView?: ResponderView;
  /** Lets the app shell (and Tom) know which view is shown, for context-aware help. */
  onViewChange?: (view: ResponderView) => void;
}

/**
 * Responder workspace. It renders whatever the server returns and relies on
 * the server for authorization: a 401/403 from any section shows an access
 * notice instead of data. Nothing in the client grants responder access.
 */
export function ResponderDashboard({ api, now, initialView = "help-requests", onViewChange }: ResponderDashboardProps) {
  const [view, setView] = useState<ResponderView>(initialView);

  return (
    <div className="sc-responder">
      <header className="sc-responder__header">
        <h1>Responder workspace</h1>
        <p className="sc-muted">
          Prototype. Supplements, and does not replace, campus security and official emergency procedures.
        </p>
        {api.kind === "MOCK" && (
          <p className="sc-demo-label" role="note">
            DEMO MODE — synthetic records only. These are not real people, incidents or locations, and no action
            here reaches anyone.
          </p>
        )}
      </header>
      <nav aria-label="Responder sections" className="sc-tabs">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-current={view === v.id ? "page" : undefined}
            className={view === v.id ? "sc-tab sc-tab--active" : "sc-tab"}
            onClick={() => {
              setView(v.id);
              onViewChange?.(v.id);
            }}
          >
            {v.label}
          </button>
        ))}
      </nav>
      <div className="sc-responder__body">
        {view === "help-requests" && <HelpRequestQueue api={api} now={now} />}
        {view === "hazard-review" && <HazardReviewQueue api={api} now={now} />}
        {view === "roll-call" && <RollCallSummary api={api} now={now} />}
      </div>
    </div>
  );
}
