// TEMPORARY dev-only harness (not the production shell). Mounts the responder
// workspace and exactly one Tom against the isolated mock adapter (DEMO data).
import { useState } from "react";
import { CAMPUS_CONTACTS } from "@web/features/responder/campusDirectory";
import { MockResponderApi, ResponderDashboard, type ResponderApi, type ResponderView } from "@web/features/responder";
import { Tom } from "@web/components/tom";

export function HarnessApp({ api }: { api: ResponderApi }) {
  const [view, setView] = useState<ResponderView>("help-requests");
  return (
    <>
      <ResponderDashboard api={api} mode="DEMO" onViewChange={setView} contacts={CAMPUS_CONTACTS} />
      <Tom role="RESPONDER" context={`responder.${view}`} mode="DEMO" contacts={CAMPUS_CONTACTS} />
    </>
  );
}

export function createDemoApi(): ResponderApi {
  return new MockResponderApi({ latencyMs: 400 });
}
