/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { AssistantHttpError, checkSuggestedAction, HttpTomAssistantBackend, validateInterpretResponse } from "./assistantClient";
import type { TomDestination } from "./navigation";

const ok = {
  type: "navigation_suggestion",
  answer: "Use Hazard review.",
  action: { type: "NAVIGATE", destinationId: "responder.hazard-review" },
  references: [{ id: "a", kind: "SCREEN_GUIDE", title: "T", version: "1", source: "S", reviewState: "DRAFT" }],
  origin: { source: "AI", provider: "groq", model: "some-model", fallbackReason: null },
  generatedAt: "2026-10-10T12:00:00Z",
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const req = { question: "q", context: { screen: "s", locale: "en" as const }, history: [] };

describe("validateInterpretResponse", () => {
  it("accepts the contract shape", () => expect(validateInterpretResponse(ok)).not.toBeNull());
  it.each([
    ["unknown top-level field", { ...ok, executed: true }],
    ["action outside the allowlist", { ...ok, action: { type: "ACKNOWLEDGE_REQUEST", requestId: "1" } }],
    ["extra field on an action", { ...ok, action: { type: "NAVIGATE", destinationId: "x", url: "https://e" } }],
    ["unknown type", { ...ok, type: "done" }],
    ["oversized answer", { ...ok, answer: "x".repeat(1201) }],
    ["too many references", { ...ok, references: Array(6).fill(ok.references[0]) }],
    ["unknown provider", { ...ok, origin: { ...ok.origin, provider: "gpt" } }],
    ["AI origin claiming a fallback reason", { ...ok, origin: { ...ok.origin, fallbackReason: "TIMEOUT" } }],
    ["AI origin from rules", { ...ok, origin: { source: "AI", provider: "rules", model: null, fallbackReason: null } }],
    ["FALLBACK without a reason", { ...ok, origin: { source: "FALLBACK", provider: "rules", model: null, fallbackReason: null } }],
    ["bad timestamp", { ...ok, generatedAt: "yesterday" }],
  ])("rejects %s", (_n, body) => expect(validateInterpretResponse(body)).toBeNull());
});

describe("HttpTomAssistantBackend", () => {
  it("posts only question/screen/locale/bounded history with the session token, and validates the reply", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(ok));
    const client = new HttpTomAssistantBackend({ baseUrl: "https://api.example.test/", fetchImpl, getAccessToken: () => "session-token" });
    const history = Array.from({ length: 9 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `turn ${i} ${"x".repeat(700)}` }));
    const res = await client.interpret({ question: "q".repeat(600), context: { screen: "responder.help-requests", locale: "en" }, history });
    expect(res.origin.source).toBe("AI");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/assistant/interpret");
    expect(init.headers.Authorization).toBe("Bearer session-token");
    const body = JSON.parse(init.body);
    expect(Object.keys(body)).toEqual(["question", "context", "history"]);
    expect(body.question).toHaveLength(500);
    expect(body.history).toHaveLength(6);
    expect(body.history.every((t: { content: string }) => t.content.length <= 600)).toBe(true);
  });

  it("maps errors (with Retry-After) and invalid replies to AssistantHttpError", async () => {
    const err = (r: Response | Error) =>
      new HttpTomAssistantBackend({ fetchImpl: vi.fn(() => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r))) }).interpret(req).catch((e) => e);
    expect(await err(json({ error: { code: "RATE_LIMITED", message: "slow", requestId: "r" } }, 429, { "Retry-After": "12" }))).toMatchObject({ status: 429, code: "RATE_LIMITED", retryAfter: 12 });
    expect(await err(json({ ...ok, type: "done" }))).toMatchObject({ code: "INVALID_RESPONSE" });
    const net = await err(new TypeError("offline"));
    expect(net).toBeInstanceOf(AssistantHttpError);
    expect(net.code).toBe("NETWORK_ERROR");
  });

  it("times out", async () => {
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))));
    const e = await new HttpTomAssistantBackend({ fetchImpl: fetchImpl as never, timeoutMs: 20 }).interpret(req).catch((x) => x);
    expect(e).toMatchObject({ code: "TIMEOUT" });
  });

  it("contains no credentials, provider names or model configuration", async () => {
    const src = (await import("./assistantClient?raw")).default;
    expect(src.length).toBeGreaterThan(1000);
    expect(src).not.toMatch(/GROQ_API_KEY|ANTHROPIC|api\.groq\.com|sk-ant|gsk_|VITE_[A-Z_]*KEY/i);
  });
});

describe("checkSuggestedAction", () => {
  const d: TomDestination = { id: "responder.hazard-review", label: "Hazard review", description: "", keywords: [], roles: ["RESPONDER"] };
  it("keeps only registered, usable targets", () => {
    const ctx = { destinations: [d], tours: [], instructions: [] };
    expect(checkSuggestedAction({ type: "NAVIGATE", destinationId: d.id }, ctx)).toEqual({ type: "NAVIGATE", destination: d });
    expect(checkSuggestedAction({ type: "NAVIGATE", destinationId: "x" }, ctx)).toBeNull();
    expect(checkSuggestedAction({ type: "START_GUIDED_TOUR", tourId: "t" }, ctx)).toBeNull();
    expect(checkSuggestedAction({ type: "OPEN_APPROVED_INSTRUCTIONS", instructionPackId: "p" }, ctx)).toBeNull();
  });
});
