/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { AssistantHttpError, checkSuggestedAction, HttpTomAssistantBackend, validateInterpretResponse } from "./assistantClient";
import type { TomDestination } from "./navigation";

const ok = {
  status: "ANSWERED",
  answer: "Use Hazard review.",
  suggestedAction: { type: "NAVIGATE", destinationId: "responder.hazard-review" },
  references: [{ id: "a", kind: "APP_HELP", title: "T", version: "1", source: "S", reviewState: "APPROVED" }],
  provider: { kind: "LLM", model: "claude-opus-5-5" },
  degraded: false,
  generatedAt: "2026-10-10T12:00:00Z",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("validateInterpretResponse", () => {
  it("accepts the proposed shape", () => expect(validateInterpretResponse(ok)).not.toBeNull());
  it.each([
    ["unknown top-level field", { ...ok, executed: true }],
    ["action outside the allowlist", { ...ok, suggestedAction: { type: "ACKNOWLEDGE_REQUEST", requestId: "1" } }],
    ["extra field on an action", { ...ok, suggestedAction: { type: "NAVIGATE", destinationId: "x", url: "https://e" } }],
    ["unknown status", { ...ok, status: "DONE" }],
    ["oversized answer", { ...ok, answer: "x".repeat(1201) }],
    ["too many references", { ...ok, references: Array(6).fill(ok.references[0]) }],
    ["bad provider kind", { ...ok, provider: { kind: "GPT", model: null } }],
    ["bad timestamp", { ...ok, generatedAt: "yesterday" }],
  ])("rejects %s", (_n, body) => expect(validateInterpretResponse(body)).toBeNull());
});

describe("HttpTomAssistantBackend", () => {
  it("posts only question/screen/locale with the session token, and validates the reply", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(ok));
    const client = new HttpTomAssistantBackend({ baseUrl: "https://api.example.test/", fetchImpl, getAccessToken: () => "session-token" });
    const res = await client.interpret({ question: "q".repeat(600), context: { screen: "responder.help-requests", locale: "en" } });
    expect(res.status).toBe("ANSWERED");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/assistant/interpret");
    expect(init.headers.Authorization).toBe("Bearer session-token");
    const body = JSON.parse(init.body);
    expect(Object.keys(body)).toEqual(["question", "context"]);
    expect(body.question).toHaveLength(500);
  });

  it("maps errors and invalid replies to AssistantHttpError", async () => {
    const err = (r: Response | Error) => new HttpTomAssistantBackend({ fetchImpl: vi.fn(() => (r instanceof Error ? Promise.reject(r) : Promise.resolve(r))) }).interpret({ question: "q", context: { screen: "s", locale: "en" } }).catch((e) => e);
    expect(await err(json({ error: { code: "RATE_LIMITED", message: "slow down", requestId: "r" } }, 429))).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(await err(json({ ...ok, status: "DONE" }))).toMatchObject({ code: "INVALID_RESPONSE" });
    const net = await err(new TypeError("offline"));
    expect(net).toBeInstanceOf(AssistantHttpError);
    expect(net.code).toBe("NETWORK_ERROR");
  });

  it("times out", async () => {
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))));
    const e = await new HttpTomAssistantBackend({ fetchImpl: fetchImpl as never, timeoutMs: 20 }).interpret({ question: "q", context: { screen: "s", locale: "en" } }).catch((x) => x);
    expect(e).toMatchObject({ code: "TIMEOUT" });
  });

  it("contains no credentials or model configuration", async () => {
    const src = (await import("./assistantClient?raw")).default;
    expect(src.length).toBeGreaterThan(1000);
    expect(src).not.toMatch(/ANTHROPIC|api[_-]?key|sk-ant|claude-opus/i);
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
