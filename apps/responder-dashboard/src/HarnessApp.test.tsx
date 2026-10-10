import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MockResponderApi } from "@web/features/responder";
import { HarnessApp } from "./HarnessApp";

afterEach(() => {
  try {
    window.sessionStorage.clear();
  } catch {
    /* storage unavailable */
  }
});

const launcher = () => screen.getByRole("button", { name: /Help \(Tom\)|Close Tom$/ });

describe("responder harness", () => {
  it("mounts exactly one Tom with a visible launcher", async () => {
    const { container } = render(<HarnessApp api={new MockResponderApi()} />);
    await screen.findByText("DEMO-HR-001");
    expect(container.querySelectorAll(".sc-tom")).toHaveLength(1);
    expect(launcher()).toBeVisible();
    expect(launcher()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the Tom panel from the launcher and closes it with Escape, restoring focus", async () => {
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
