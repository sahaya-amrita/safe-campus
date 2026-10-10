import { useCallback, useEffect, useState } from "react";
import { HazardReviewQueue } from "../incidents/HazardReviewQueue";
import type { ResponderApi } from "./api";
import { classifyError } from "./apiError";
import type { CampusContact, OfficialResource } from "./campusDirectory";
import { CAMPUS_CONTACTS, OFFICIAL_RESOURCES } from "./campusDirectory";
import { ContactsView } from "./ContactsView";
import type { AppMode } from "./contracts";
import { HelpRequestQueue } from "./HelpRequestQueue";
import { Icon, type IconName } from "./Icon";
import { RollCallSummary } from "./RollCallSummary";
import "./responder.css";

export type ResponderView = "help-requests" | "hazard-review" | "roll-call" | "contacts";

const VIEWS: Array<{ id: ResponderView; label: string; icon: IconName }> = [
  { id: "help-requests", label: "Help requests", icon: "inbox" },
  { id: "hazard-review", label: "Hazard review", icon: "hazard" },
  { id: "roll-call", label: "Roll-call summary", icon: "rollcall" },
  { id: "contacts", label: "Contacts & resources", icon: "phone" },
];

export interface ResponderDashboardProps {
  api: ResponderApi;
  now?: () => Date;
  initialView?: ResponderView;
  /** Lets the app shell (and Tom) know which view is shown, for context-aware help. */
  onViewChange?: (view: ResponderView) => void;
  /** Defaults to DEMO for the mock adapter and LIVE otherwise. */
  mode?: AppMode;
  contacts?: readonly CampusContact[];
  resources?: readonly OfficialResource[];
}

type Count = { kind: "loading" } | { kind: "count"; value: number; more: boolean } | { kind: "denied" } | { kind: "error" };

function toCount(p: PromiseSettledResult<{ items: unknown[]; nextCursor: string | null }>): Count {
  if (p.status === "fulfilled") return { kind: "count", value: p.value.items.length, more: p.value.nextCursor !== null };
  const k = classifyError(p.reason);
  return k === "FORBIDDEN" || k === "UNAUTHENTICATED" ? { kind: "denied" } : { kind: "error" };
}

function CountValue({ c }: { c: Count }) {
  if (c.kind === "loading") return <>…</>;
  if (c.kind === "denied") return <span className="sc-summary__na">No access</span>;
  if (c.kind === "error") return <span className="sc-summary__na">Unavailable</span>;
  return <>{c.more ? `${c.value}+` : c.value}</>;
}

/**
 * Responder workspace. It renders whatever the server returns and relies on
 * the server for authorization: a 401/403 from any section shows an access
 * notice instead of data. Nothing in the client grants responder access.
 */
export function ResponderDashboard({
  api,
  now = () => new Date(),
  initialView = "help-requests",
  onViewChange,
  mode = api.kind === "MOCK" ? "DEMO" : "LIVE",
  contacts = CAMPUS_CONTACTS,
  resources = OFFICIAL_RESOURCES,
}: ResponderDashboardProps) {
  const [view, setView] = useState<ResponderView>(initialView);
  const [summary, setSummary] = useState<{ open: Count; pending: Count; at: Date | null }>({
    open: { kind: "loading" },
    pending: { kind: "loading" },
    at: null,
  });
  const [summaryKey, setSummaryKey] = useState(0);
  const refreshSummary = useCallback(() => setSummaryKey((k) => k + 1), []);

  // Runs after the child views' effects, so a view's own first load is never
  // pre-empted by the header summary.
  useEffect(() => {
    let active = true;
    // Previous counts stay visible (with their "Updated" time) until new ones arrive.
    Promise.allSettled([
      api.listHelpRequests({ status: "OPEN" }),
      api.listHazardReports({ status: "PENDING_REVIEW" }),
    ]).then(([open, pending]) => {
      if (active) setSummary({ open: toCount(open), pending: toCount(pending), at: now() });
    });
    return () => {
      active = false;
    };
    // `now` is a clock, not an input: re-running on its identity would loop.
  }, [api, summaryKey]);

  const isDemoData = api.kind === "MOCK";
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!;

  return (
    <div className="sc-ops" data-mode={mode}>
      <aside className="sc-rail">
        <div className="sc-brand">
          <span className="sc-brand__mark" aria-hidden="true">
            SC
          </span>
          <span className="sc-brand__text">
            <strong>SAFE CAMPUS</strong>
            <span>Responder</span>
          </span>
        </div>
        <nav aria-label="Responder sections" className="sc-nav">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              title={v.label}
              aria-current={view === v.id ? "page" : undefined}
              className={view === v.id ? "sc-nav__item sc-nav__item--active" : "sc-nav__item"}
              onClick={() => {
                setView(v.id);
                onViewChange?.(v.id);
                refreshSummary();
              }}
            >
              <Icon name={v.icon} />
              <span>{v.label}</span>
            </button>
          ))}
        </nav>
        <p className="sc-rail__foot">
          Prototype. Supplements, and does not replace, campus security and official emergency procedures.
        </p>
      </aside>

      <div className="sc-main">
        <header className="sc-topbar">
          <div className="sc-topbar__title">
            <p className="sc-eyebrow">Responder workspace</p>
            <h1>{current.label}</h1>
          </div>
          <div className="sc-topbar__status">
            <span className={`sc-mode sc-mode--${mode.toLowerCase()}`}>{mode} mode</span>
            <dl className="sc-summary" role="group" aria-label="Queue summary">
              <div>
                <dt>Open help requests</dt>
                <dd>
                  <CountValue c={summary.open} />
                </dd>
              </div>
              <div>
                <dt>Hazards pending review</dt>
                <dd>
                  <CountValue c={summary.pending} />
                </dd>
              </div>
            </dl>
            <button type="button" className="sc-btn sc-btn--ghost" onClick={refreshSummary} aria-label="Refresh queue summary">
              <Icon name="refresh" size={16} />
              <span className="sc-summary__at">
                {summary.at
                  ? `Updated ${summary.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                  : "Loading"}
              </span>
            </button>
          </div>
        </header>

        {isDemoData && (
          <p className="sc-demo-label" role="note">
            DEMO MODE — synthetic records only. These are not real people, incidents or locations, and no action
            here reaches anyone.
          </p>
        )}
        {!isDemoData && mode === "DRILL" && (
          <p className="sc-demo-label" role="note">
            DRILL MODE — exercise data. No real emergency messages are sent.
          </p>
        )}

        <div className="sc-workspace">
          {view === "help-requests" && <HelpRequestQueue api={api} now={now} onChanged={refreshSummary} />}
          {view === "hazard-review" && <HazardReviewQueue api={api} now={now} onChanged={refreshSummary} />}
          {view === "roll-call" && <RollCallSummary api={api} now={now} />}
          {view === "contacts" && <ContactsView contacts={contacts} resources={resources} mode={mode} />}
        </div>
      </div>
    </div>
  );
}
