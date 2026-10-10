/// <reference types="vitest" />
// Standalone dev/test harness for the responder module (Claude Code 2).
// The feature code lives in the owned paths under apps/web/src/; this harness
// exists only because the integration-owned apps/web shell has not been created
// yet. Delete it once the shared shell, router and test config land.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.resolve(here, "../web/src");
const nm = (pkg: string) => path.resolve(here, "node_modules", pkg);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Files under apps/web/src cannot see this harness's node_modules, so
    // resolve shared dependencies explicitly.
    alias: [
      { find: /^react$/, replacement: nm("react") },
      { find: /^react\/(.*)$/, replacement: nm("react") + "/$1" },
      { find: /^react-dom$/, replacement: nm("react-dom") },
      { find: /^react-dom\/(.*)$/, replacement: nm("react-dom") + "/$1" },
      { find: /^@testing-library\/(.*)$/, replacement: nm("@testing-library") + "/$1" },
      { find: "@web", replacement: webSrc },
    ],
  },
  server: { fs: { allow: [here, webSrc] } },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: [path.resolve(here, "src/setupTests.ts")],
    dir: path.resolve(here, ".."),
    include: [
      "web/src/features/responder/**/*.test.{ts,tsx}",
      "web/src/features/incidents/**/*.test.{ts,tsx}",
      "web/src/components/tom/**/*.test.{ts,tsx}",
      "responder-dashboard/src/**/*.test.{ts,tsx}",
    ],
    restoreMocks: true,
  },
});
