// TEMPORARY dev-only harness (not the production shell). Mounts the responder
// workspace and exactly one Tom against the isolated mock adapter (DEMO data),
// and wires Tom's typed navigation adapter to simple view state with history.
import { useMemo, useRef, useState } from "react";
import {
  CAMPUS_CONTACTS,
  createResponderNavigation,
  destinationForView,
  MockResponderApi,
  ResponderDashboard,
  type ResponderApi,
  type ResponderView,
  type Role,
} from "@web/features/responder";
import { Tom, TourTargetProvider, type TomStore } from "@web/components/tom";

export interface HarnessAppProps {
  api: ResponderApi;
  /** Session role; the real shell gets this from authentication. */
  role?: Role | null;
  persistentStore?: TomStore | null;
}

export function HarnessApp({ api, role = "RESPONDER", persistentStore }: HarnessAppProps) {
  const [view, setView] = useState<ResponderView>("help-requests");
  const history = useRef<ResponderView[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const roleRef = useRef(role);
  roleRef.current = role;

  const go = (next: ResponderView) => {
    if (next === viewRef.current) return;
    history.current.push(viewRef.current);
    viewRef.current = next;
    setView(next);
  };

  const navigation = useMemo(
    () =>
      createResponderNavigation({
        getRole: () => roleRef.current,
        getView: () => viewRef.current,
        setView: go,
        canGoBack: () => history.current.length > 0,
        goBack: () => {
          const prev = history.current.pop();
          if (!prev) return false;
          viewRef.current = prev;
          setView(prev);
          return true;
        },
      }),
    // Created once; it reads live values through refs.
    [],
  );

  return (
    <TourTargetProvider>
      <ResponderDashboard api={api} mode="DEMO" view={view} onViewChange={go} contacts={CAMPUS_CONTACTS} />
      <Tom
        role={role ?? "STUDENT"}
        context={destinationForView(view)}
        mode="DEMO"
        contacts={CAMPUS_CONTACTS}
        navigation={navigation}
        persistentStore={persistentStore}
      />
    </TourTargetProvider>
  );
}

export function createDemoApi(): ResponderApi {
  return new MockResponderApi({ latencyMs: 400 });
}
