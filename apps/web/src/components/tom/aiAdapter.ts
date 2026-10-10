import type { AppMode, Role, TomEntry } from "./types";

/**
 * Optional adapter that may rephrase an existing app-help entry. It never
 * receives free-text user questions and never produces instructions on its
 * own. Disabled by default; never used in LIVE mode.
 */
export interface TomAiAdapter {
  readonly status: "DISABLED" | "MOCK" | "CONFIGURED";
  explain(input: { entry: TomEntry; role: Role }): Promise<string>;
}

export const disabledTomAi: TomAiAdapter = {
  status: "DISABLED",
  explain: () => Promise.reject(new Error("Tom AI is disabled")),
};

/** Deterministic stand-in for development. Uses no model and no network. */
export const mockTomAi: TomAiAdapter = {
  status: "MOCK",
  explain: async ({ entry }) => `Simulated explanation (mock — no AI model used): ${entry.body}`,
};

export function isAiAvailable(adapter: TomAiAdapter, mode: AppMode): boolean {
  return adapter.status !== "DISABLED" && mode !== "LIVE";
}

export const MAX_AI_TEXT = 800;
