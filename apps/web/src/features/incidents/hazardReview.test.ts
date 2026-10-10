import { describe, expect, it } from "vitest";
import * as hazardReview from "./hazardReview";
import { allowedDecisions, countByStatus, countPendingByCategory, validateReview } from "./hazardReview";
import type { HazardReport } from "./contracts";

const r = (id: string, status: HazardReport["status"], category = "c"): HazardReport => ({
  id,
  status,
  category,
  description: "d",
  createdAt: "2026-10-10T10:00:00Z",
});

describe("hazard review rules", () => {
  it("never offers PENDING_REVIEW as a decision and closes terminal states", () => {
    expect(allowedDecisions("PENDING_REVIEW")).toEqual(["VERIFIED", "REJECTED", "DUPLICATE"]);
    expect(allowedDecisions("VERIFIED")).toEqual(["RESOLVED"]);
    expect(allowedDecisions("REJECTED")).toEqual([]);
    expect(allowedDecisions("DUPLICATE")).toEqual([]);
    expect(allowedDecisions("RESOLVED")).toEqual([]);
  });

  it("requires an explicit decision", () => {
    expect(validateReview("PENDING_REVIEW", {}).ok).toBe(false);
  });

  it("requires a duplicate target", () => {
    expect(validateReview("PENDING_REVIEW", { decision: "DUPLICATE", duplicateOfId: " " }).ok).toBe(false);
    expect(validateReview("PENDING_REVIEW", { decision: "DUPLICATE", duplicateOfId: "X" }).ok).toBe(true);
  });

  it("rejects skipping review (pending straight to resolved)", () => {
    expect(validateReview("PENDING_REVIEW", { decision: "RESOLVED" }).ok).toBe(false);
  });

  it("counts are plain numbers with no alert level, however many reports", () => {
    const many = Array.from({ length: 500 }, (_, i) => r(`h${i}`, "PENDING_REVIEW", "fire (demo)"));
    expect(countByStatus(many)).toEqual({ PENDING_REVIEW: 500, VERIFIED: 0, REJECTED: 0, DUPLICATE: 0, RESOLVED: 0 });
    expect(countPendingByCategory(many)).toEqual([{ category: "fire (demo)", count: 500 }]);
    // No export in this module derives alerts or severity from counts.
    expect(Object.keys(hazardReview).filter((k) => /alert|severity|threshold|escalat/i.test(k))).toEqual([]);
  });
});
