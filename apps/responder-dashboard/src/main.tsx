// DEMO harness only: mounts the responder module against the isolated mock
// adapter so it can be viewed without the (not yet created) app shell.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MockResponderApi, ResponderDashboard, type ResponderView } from "@web/features/responder";
import { Tom } from "@web/components/tom";

const api = new MockResponderApi({ latencyMs: 400 });

function Harness() {
  const [view, setView] = useState<ResponderView>("help-requests");
  return (
    <>
      <ResponderDashboard api={api} onViewChange={setView} />
      <Tom role="RESPONDER" context={`responder.${view}`} mode="DEMO" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
