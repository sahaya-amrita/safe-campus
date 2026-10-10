import { describe, expect, it } from "vitest";
import type { ResponderView } from "./ResponderDashboard";
import { canAccessResponderWorkspace, createResponderNavigation, RESPONDER_DESTINATIONS } from "./navigation";
import type { Role } from "./contracts";

function setup(role: Role | null) {
  let view: ResponderView = "help-requests";
  const history: ResponderView[] = [];
  const nav = createResponderNavigation({
    getRole: () => role,
    getView: () => view,
    setView: (v) => {
      history.push(view);
      view = v;
    },
    canGoBack: () => history.length > 0,
    goBack: () => {
      const p = history.pop();
      if (!p) return false;
      view = p;
      return true;
    },
  });
  return { nav, view: () => view };
}

describe("responder navigation adapter", () => {
  it("registers exactly the four responder views", () => {
    expect(RESPONDER_DESTINATIONS.map((d) => d.id)).toEqual([
      "responder.help-requests",
      "responder.hazard-review",
      "responder.roll-call",
      "responder.contacts",
    ]);
  });

  it("navigates and goes back for responders", async () => {
    const { nav, view } = setup("RESPONDER");
    expect(await nav.canNavigate("responder.contacts")).toBe(true);
    expect(await nav.navigate("responder.contacts")).toEqual({ ok: true });
    expect(view()).toBe("contacts");
    expect(nav.current()).toBe("responder.contacts");
    expect(nav.canGoBack?.()).toBe(true);
    expect(await nav.back?.()).toEqual({ ok: true });
    expect(view()).toBe("help-requests");
    expect(await nav.back?.()).toEqual({ ok: false, reason: "UNAVAILABLE" });
  });

  it.each<Role | null>(["STUDENT", "VOLUNTEER", null])("denies %s", async (role) => {
    const { nav, view } = setup(role);
    expect(await nav.canNavigate("responder.hazard-review")).toBe(false);
    expect(await nav.navigate("responder.hazard-review")).toEqual({ ok: false, reason: "NOT_PERMITTED" });
    expect(view()).toBe("help-requests");
  });

  it("rejects ids it never registered", async () => {
    const { nav } = setup("ADMIN");
    expect(await nav.canNavigate("admin.settings")).toBe(false);
    expect(await nav.navigate("admin.settings")).toEqual({ ok: false, reason: "NOT_REGISTERED" });
  });

  it("guard matches the server's responder roles", () => {
    expect(canAccessResponderWorkspace("RESPONDER")).toBe(true);
    expect(canAccessResponderWorkspace("ADMIN")).toBe(true);
    expect(canAccessResponderWorkspace("STUDENT")).toBe(false);
  });
});
