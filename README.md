# SAFE CAMPUS Agent Task Pack

This pack coordinates four separate coding sessions/computers. It contains shared project rules, module specifications, and optional native agent definitions.

## Important distinction

- `docs/tasks/*.md` are durable task briefs. All four contributors should read their assigned brief before coding.
- `CLAUDE.md` and `.claude/agents/*.md` are instructions/custom-agent definitions for Claude Code. Claude Code custom agent Markdown uses YAML frontmatter followed by the agent instructions.
- `.codex/agents/*.toml` are optional custom agent definitions for Codex. Codex custom agent files use TOML, not the Claude Markdown-frontmatter format.
- On separate computers, each person should still open their own normal Codex/Claude Code session, create their own feature branch, and follow their task brief. The native agent definitions are optional and are not a replacement for Git branches or PR review.

## Before implementation

1. Create the GitHub repository `sahaya-amrita/safe-campus` as private.
2. Put this pack into the repository root and push it on a documentation branch.
3. Open and merge a PR containing the task briefs and shared rules into `main`.
4. All four computers fetch the updated `main` and create their assigned branches.
5. Codex 1 defines and publishes the shared API contracts before the other contributors replace mocks with real API calls.

## Suggested branches and owners

| Contributor | Branch | Owns |
|---|---|---|
| Codex 1 | `feat/api-core` | API, shared contracts, schema/migrations, API tests |
| Claude Code 1 | `feat/student-pwa` | Student PWA and offline experience |
| Claude Code 2 | `feat/responder-dashboard` | Responder dashboard, incident review, Tom guide |
| Codex 2 | `feat/maps-drills` | Maps, verified-route rendering, digital drill simulation |

Each contributor pushes to their branch and opens a PR. Do not work directly on `main` or merge your own PR without the project's agreed review.

## Kickoff instruction

For each session, replace the task filename with the one assigned to that contributor:

> Read `AGENTS.md`, `CLAUDE.md` if you are Claude Code, `docs/architecture.md`, `docs/api-contracts.md`, `docs/safety-rules.md`, and your assigned file under `docs/tasks/`. Inspect the existing repository before editing. Implement only your owned module, add tests, run the checks you claim to have run, and report changed files, results, integration needs, and limitations. Do not modify unrelated modules or commit directly to `main`.
