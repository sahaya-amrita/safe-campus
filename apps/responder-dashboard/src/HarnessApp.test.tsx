import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MockResponderApi } from "@web/features/responder";
import { HarnessApp } from "./HarnessApp";

afterEach(() => {
  for (const s of [window.sessionStorage, window.localStorage]) {
    try {
      s.clear();
    } catch {
      /* storage unavailable */
    }
  }
});

/** Skip the first-visit welcome for tests about other behaviour. */
function seen() {
  window.localStorage.setItem("safe-campus.tom.onboarded", "1");
}

async function ask(user: ReturnType<typeof userEvent.setup>, q: string) {
  await user.type(screen.getByLabelText("Ask Tom about this app"), q);
  await user.click(screen.getByRole("button", { name: "Ask" }));
  return screen.getByRole("log", { name: "Conversation with Tom" });
}

const launcher = () => screen.getByRole("button", { name: /Help \(Tom\)|Close Tom$/ });

describe("responder harness", () => {
  it("mounts exactly one Tom with a visible launcher", async () => {
    seen();
    const { container } = render(<HarnessApp api={new MockResponderApi()} />);
    await screen.findByText("DEMO-HR-001");
    expect(container.querySelectorAll(".sc-tom")).toHaveLength(1);
    expect(launcher()).toBeVisible();
    expect(launcher()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the Tom panel from the launcher and closes it with Escape, restoring focus", async () => {
    seen();
    const user = userEvent.setup();
    render(<HarnessApp api={new MockResponderApi()} />);
    await user.click(launcher());
    const panel = screen.getByRole("complementary", { name: "Tom — app help" });
    expect(panel).toBeVisible();
    expect(within(panel).getByText("Oldest requests are listed first.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "Tom — app help" })).not.toBeInTheDocument();
    await waitFor(() => expect(launcher()).toHaveFocus());
  });

  it("keeps the DEMO MODE banner and gives Tom the current view as context", async () => {
    seen();
    const user = userEvent.setup();
    render(<HarnessApp api={new MockResponderApi()} />);
    expect(screen.getByText(/DEMO MODE — synthetic records only/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Contacts & resources" }));
    await user.click(launcher());
    expect(screen.getByText("Check each number's status.")).toBeInTheDocument();
  });

  it("regression: a legacy 'hidden' session flag no longer removes Tom", async () => {
    window.sessionStorage.setItem("safe-campus.tom.hidden", "1");
    render(<HarnessApp api={new MockResponderApi()} />);
    expect(launcher()).toBeVisible();
  });

  it("regression: a minimised Tom still offers a launcher that restores it", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem("safe-campus.tom.minimised", "1");
    render(<HarnessApp api={new MockResponderApi()} />);
    const compact = screen.getByRole("button", { name: "Show Tom help" });
    expect(compact).toBeVisible();
    await user.click(compact);
    expect(screen.getByRole("complementary", { name: "Tom — app help" })).toBeInTheDocument();
  });
});

describe("Tom guides the real responder workspace", () => {
  it("first visit: shows the welcome once; 'Not now' keeps the launcher", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HarnessApp api={new MockResponderApi()} />);
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(launcher()).toBeVisible();
    unmount();
    render(<HarnessApp api={new MockResponderApi()} />);
    expect(screen.queryByRole("region", { name: "Hi, I'm Tom" })).not.toBeInTheDocument();
  });

  it("navigates between registered views from a question, and back", async () => {
    seen();
    const user = userEvent.setup();
    render(<HarnessApp api={new MockResponderApi()} />);
    await user.click(launcher());
    let thread = await ask(user, "take me to hazard review");
    await waitFor(() => expect(thread).toHaveTextContent("You're on Hazard review now."));
    expect(screen.getByRole("heading", { level: 1, name: "Hazard review" })).toBeInTheDocument();
    expect(await screen.findByText("DEMO-HZ-001")).toBeInTheDocument();

    thread = await ask(user, "open campus contacts");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Contacts & resources" })).toBeInTheDocument());
    thread = await ask(user, "roll call please");
    await user.click(within(thread).getByRole("button", { name: "Go to Roll-call summary" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Roll-call summary" })).toBeInTheDocument());

    thread = await ask(user, "go back");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Contacts & resources" })).toBeInTheDocument());
  });

  it("refuses to acknowledge and changes nothing on the server", async () => {
    seen();
    const user = userEvent.setup();
    const api = new MockResponderApi();
    render(<HarnessApp api={api} />);
    await screen.findByText("DEMO-HR-001");
    await user.click(launcher());
    const thread = await ask(user, "acknowledge DEMO-HR-001");
    expect(thread).toHaveTextContent("I can't acknowledge requests for you.");
    expect(api.auditLog).toHaveLength(0);
    expect((await api.listHelpRequests({ status: "OPEN" })).items.map((r) => r.id)).toContain("DEMO-HR-001");
  });

  it("enforces role restrictions through the app's guard and the server", async () => {
    seen();
    const user = userEvent.setup();
    const api = new MockResponderApi({ session: { role: "STUDENT", actorId: "demo-student" } });
    render(<HarnessApp api={api} role="STUDENT" />);
    expect(await screen.findByRole("heading", { name: "Responder access required" })).toBeInTheDocument();
    await user.click(launcher());
    const thread = await ask(user, "take me to hazard review");
    await waitFor(() => expect(thread).toHaveTextContent("your account doesn't have access. Nothing changed."));
    expect(screen.getByRole("heading", { level: 1, name: "Help requests" })).toBeInTheDocument();
  });

  it("runs the workspace tour across views and returns to the start", async () => {
    const user = userEvent.setup();
    render(<HarnessApp api={new MockResponderApi()} />);
    await screen.findByText("DEMO-HR-001");
    await user.click(screen.getByRole("button", { name: "Take a tour" }));
    expect(screen.getByRole("dialog", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByTestId("tour-highlight")).toBeInTheDocument();
    const visited: string[] = [];
    for (let i = 0; i < 12 && !screen.queryByRole("button", { name: "Finish tour" }); i++) {
      visited.push(screen.getByRole("heading", { level: 1 }).textContent ?? "");
      await user.click(screen.getByRole("button", { name: "Next" }));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
    }
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Contacts & resources" })).toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Ask Tom" })).toBeInTheDocument();
    expect(new Set(visited)).toEqual(new Set(["Help requests", "Hazard review", "Roll-call summary", "Contacts & resources"]));
    await user.click(screen.getByRole("button", { name: "Finish tour" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Help requests" })).toBeInTheDocument());
  }, 15000);
});
