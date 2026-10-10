import { describe, expect, it } from "vitest";
import { DEFAULT_TOM_KNOWLEDGE } from "./knowledgeBase";
import { answerQuestion, isEmergencyQuestion, selectEntries } from "./tomLogic";

describe("tomLogic", () => {
  it("routes emergency-sounding questions to the fallback even if an FAQ matches", () => {
    const { faqs } = selectEntries(DEFAULT_TOM_KNOWLEDGE, { role: "RESPONDER", context: "responder.hazard-review", mode: "DEMO" });
    expect(answerQuestion("should I verify and alert everyone about the fire", faqs).kind).toBe("EMERGENCY_FALLBACK");
    for (const q of ["I need help", "who do I call", "where is the assembly point", "someone is injured"]) {
      expect(isEmergencyQuestion(q)).toBe(true);
    }
    expect(isEmergencyQuestion("how do I mark a duplicate")).toBe(false);
  });

  it("knowledge base contains app help only, with no phone numbers or routes", () => {
    for (const e of DEFAULT_TOM_KNOWLEDGE) {
      expect(e.contentType).toBe("APP_HELP");
      expect(`${e.title} ${e.body}`).not.toMatch(/\d{3,}/);
      expect(`${e.title} ${e.body}`).not.toMatch(/\b(evacuate|assembly point|stairwell|exit via)\b/i);
    }
  });

  it("returns EMPTY for blank and UNKNOWN for stopword-only questions", () => {
    expect(answerQuestion("   ", []).kind).toBe("EMPTY");
    expect(answerQuestion("how do I", []).kind).toBe("UNKNOWN");
  });
});
