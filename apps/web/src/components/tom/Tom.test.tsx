import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disabledTomAi, mockTomAi, type TomAiAdapter } from "./aiAdapter";
import { DEFAULT_TOM_KNOWLEDGE } from "./knowledgeBase";
import { Tom } from "./Tom";
import type { ApprovedInstructionLink, TomEntry } from "./types";

afterEach(() => { try { window.sessionStorage.clear(); } catch { /* storage unavailable */ } });

const launcher = () => screen.getByRole("button", { name: /Help \(Tom\)|Close Tom$/ });
const panel = () => screen.getByRole("complementary", { name: "Tom — app help" });

async function openTom(user: ReturnType<typeof userEvent.setup>) {
  await user.click(launcher());
  return panel();
}

const reviewed = (e: TomEntry): TomEntry => ({ ...e, review: { reviewed: true, reviewer: "test" } });

describe("Tom launcher and panel", () => {
  it("is closed by default and does not block the page", () => {
    render(
      <>
        <button type="button">Page action</button>
        <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />
      </>,
    );
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(launcher()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens and closes, moving focus sensibly", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await openTom(user);
    expect(launcher()).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Tom — app help" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Close Tom help panel" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await waitFor(() => expect(launcher()).toHaveFocus());
  });

  it("is keyboard accessible: Enter opens, Escape closes and returns focus", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    launcher().focus();
    await user.keyboard("{Enter}");
    expect(panel()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await waitFor(() => expect(launcher()).toHaveFocus());
  });

  it("does not trap focus: page content stays reachable while open", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Page action</button>
        <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />
      </>,
    );
    await openTom(user);
    const pageButton = screen.getByRole("button", { name: "Page action" });
    await user.click(pageButton);
    expect(pageButton).toHaveFocus();
    expect(panel()).toBeInTheDocument();
  });

  it("dismissed tips stay dismissed for the session and can be restored", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Tom role="RESPONDER" context="responder.hazard-review" mode="DEMO" />);
    await openTom(user);
    await user.click(screen.getByRole("button", { name: "Dismiss tip: Counts are not alerts" }));
    expect(screen.queryByText("Counts are not alerts.")).not.toBeInTheDocument();
    unmount();

    render(<Tom role="RESPONDER" context="responder.hazard-review" mode="DEMO" />);
    await openTom(user);
    expect(screen.queryByText("Counts are not alerts.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show dismissed tips" }));
    expect(screen.getByText("Counts are not alerts.")).toBeInTheDocument();
  });

  it("can be hidden for the session", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await openTom(user);
    await user.click(screen.getByRole("button", { name: "Hide Tom for this session" }));
    expect(screen.queryByRole("button", { name: /Tom/ })).not.toBeInTheDocument();
    unmount();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    expect(screen.queryByRole("button", { name: /Tom/ })).not.toBeInTheDocument();
  });

  it("works when session storage is unavailable", async () => {
    const user = userEvent.setup();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    render(<Tom role="RESPONDER" context="responder.hazard-review" mode="DEMO" store={broken} />);
    await openTom(user);
    await user.click(screen.getByRole("button", { name: "Dismiss tip: Counts are not alerts" }));
    expect(screen.queryByText("Counts are not alerts.")).not.toBeInTheDocument();
  });
});

describe("guided tour", () => {
  it("steps through and can be exited at any step", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await openTom(user);
    await user.click(screen.getByRole("button", { name: "Start guided tour (3 steps)" }));
    expect(screen.getByRole("heading", { name: /Tour step 1 of 3/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: /Tour step 2 of 3/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Exit tour" }));
    expect(screen.queryByRole("heading", { name: /Tour step/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tips for this screen" })).toBeInTheDocument();
  });

  it("Escape during a tour closes Tom entirely", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await openTom(user);
    await user.click(screen.getByRole("button", { name: /Start guided tour/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});

describe("role and context awareness", () => {
  it("shows responder help only to responders", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Tom role="STUDENT" context="responder.hazard-review" mode="DEMO" />);
    await openTom(user);
    expect(screen.queryByText(/Does verifying a report alert the campus/)).not.toBeInTheDocument();
    expect(screen.getByText("How do I know my check-in was received?")).toBeInTheDocument();
    unmount();
    render(<Tom role="RESPONDER" context="responder.hazard-review" mode="DEMO" />);
    await openTom(user);
    expect(screen.getByText(/Does verifying a report alert the campus/)).toBeInTheDocument();
  });

  it("changes tips with the screen context", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await openTom(user);
    expect(screen.getByText("Oldest requests are listed first.")).toBeInTheDocument();
    rerender(<Tom role="RESPONDER" context="responder.roll-call" mode="DEMO" />);
    expect(screen.queryByText("Oldest requests are listed first.")).not.toBeInTheDocument();
    expect(screen.getByText("Check the scope.")).toBeInTheDocument();
  });

  it("in LIVE mode hides unreviewed drafts and says so when nothing reviewed exists", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="LIVE" />);
    await openTom(user);
    expect(screen.getByText("No tips to show here.")).toBeInTheDocument();
    expect(screen.getByText("No reviewed questions are available for this screen.")).toBeInTheDocument();
    expect(screen.queryByText(/prototype draft/)).not.toBeInTheDocument();
  });

  it("in LIVE mode shows reviewed entries", async () => {
    const user = userEvent.setup();
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="LIVE"
        knowledgeBase={DEFAULT_TOM_KNOWLEDGE.map(reviewed)}
      />,
    );
    await openTom(user);
    expect(screen.getByText("Oldest requests are listed first.")).toBeInTheDocument();
  });
});

describe("questions, missing knowledge and emergency boundary", () => {
  it("answers from the knowledge base", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await openTom(user);
    await user.type(screen.getByLabelText("Ask about using this screen"), "what does acknowledge do");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(within(screen.getByRole("status")).getByText(/What does “Acknowledge” do\?/)).toBeInTheDocument();
  });

  it("says it does not know instead of improvising", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await openTom(user);
    await user.type(screen.getByLabelText("Ask about using this screen"), "best pizza on campus");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByRole("status")).toHaveTextContent("I don't know the answer to that.");
  });

  it("refuses emergency instructions and invents no contacts when none are configured", async () => {
    const user = userEvent.setup();
    render(<Tom role="STUDENT" context="student.check-in" mode="DEMO" />);
    await openTom(user);
    await user.type(screen.getByLabelText("Ask about using this screen"), "there is a fire, which exit do I use?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("I can't give emergency instructions, routes or contacts.");
    expect(status).toHaveTextContent("No approved instruction pack is configured");
    expect(status).toHaveTextContent("not a guarantee that someone will respond");
    expect(status.textContent).not.toMatch(/\d{3,}/); // no phone numbers
    expect(status.textContent).not.toMatch(/on (the|their) way|coming/i);
    expect(within(status).queryByRole("link")).not.toBeInTheDocument();
  });

  it("links only approved, unexpired instruction packs", async () => {
    const user = userEvent.setup();
    const packs: ApprovedInstructionLink[] = [
      { id: "ok", title: "Fire procedure (test pack)", href: "/instructions/ok", version: "3", sourceLabel: "Test source", approvalState: "PUBLISHED", language: "en", expiresAt: "2027-01-01T00:00:00Z" },
      { id: "draft", title: "Draft pack", href: "/instructions/d", version: "1", sourceLabel: "Test", approvalState: "DRAFT", language: "en" },
      { id: "old", title: "Expired pack", href: "/instructions/o", version: "1", sourceLabel: "Test", approvalState: "APPROVED", language: "en", expiresAt: "2020-01-01T00:00:00Z" },
      { id: "nosrc", title: "No source pack", href: "/instructions/n", version: "1", sourceLabel: "", approvalState: "APPROVED", language: "en" },
    ];
    render(
      <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" approvedInstructions={packs} now={() => new Date("2026-10-10T00:00:00Z")} />,
    );
    await openTom(user);
    const section = screen.getByRole("region", { name: "Official instructions" });
    expect(within(section).getAllByRole("link").map((l) => l.textContent)).toEqual(["Fire procedure (test pack)"]);
    expect(within(section).getByText(/Test source, version 3, en/)).toBeInTheDocument();
  });

  it("has no controls that perform consequential actions", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" ai={mockTomAi} />);
    await openTom(user);
    const names = within(panel()).getAllByRole("button").map((b) => b.textContent ?? "");
    for (const n of names) expect(n).not.toMatch(/acknowledge|verify|send|alert|call|notify|submit/i);
  });
});

describe("AI adapter", () => {
  it("is disabled by default: no explain controls", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await openTom(user);
    expect(screen.queryByRole("button", { name: "Explain in simpler words" })).not.toBeInTheDocument();
  });

  it("never calls AI in LIVE mode even if configured", async () => {
    const user = userEvent.setup();
    const explain = vi.fn().mockResolvedValue("text");
    const ai: TomAiAdapter = { status: "CONFIGURED", explain };
    render(
      <Tom role="RESPONDER" context="responder.help-requests" mode="LIVE" ai={ai} knowledgeBase={DEFAULT_TOM_KNOWLEDGE.map(reviewed)} />,
    );
    await openTom(user);
    expect(screen.queryByRole("button", { name: "Explain in simpler words" })).not.toBeInTheDocument();
    expect(explain).not.toHaveBeenCalled();
  });

  it("labels mock explanations as not official and keeps the source text", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" ai={mockTomAi} />);
    await openTom(user);
    await user.click(screen.getByText("What does “Acknowledge” do?"));
    await user.click(screen.getAllByRole("button", { name: "Explain in simpler words" })[0]!);
    expect(await screen.findByText(/Simulated \(mock\) explanation of the help text above — not an official instruction/)).toBeInTheDocument();
  });

  it("handles AI failure without changing the reviewed text", async () => {
    const user = userEvent.setup();
    const ai: TomAiAdapter = { status: "CONFIGURED", explain: () => Promise.reject(new Error("down")) };
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" ai={ai} />);
    await openTom(user);
    await user.click(screen.getAllByRole("button", { name: "Explain in simpler words" })[0]!);
    expect(await screen.findByText("Explanation unavailable. The help text above is unchanged.")).toBeInTheDocument();
  });

  it("disabled adapter rejects if called directly", async () => {
    await expect(disabledTomAi.explain({ entry: DEFAULT_TOM_KNOWLEDGE[0]!, role: "RESPONDER" })).rejects.toThrow();
  });
});
