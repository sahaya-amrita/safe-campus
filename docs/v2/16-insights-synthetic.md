# 16. Insights: synthetic analytics, an illustrative forecast and precautions

Requested for all four accounts. Two decisions were taken with the owner (2026-10-11): **transparent statistics plus a checked AI summary**, and **a separate synthetic history** that never enters the live queues.

## What each account sees

| Account   | Where                                                     | Content                                                                                                                                          |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Student   | Prepare → Patterns and precautions                        | Summary, busiest hours, where reports cluster, and precautions that open the matching DEMO guide. No workload, forecast or verification figures. |
| Responder | Responder workspace → Insights (views: Campus, Responder) | Plus trends by category, a 7-day forecast of help requests with a 90% range, and median time to acknowledge (this period vs the previous one).   |
| Verifier  | Responder workspace → Insights (views: Campus, Verifier)  | Plus the share of decided reports verified or dismissed, and possible duplicate clusters (same place and category within 30 minutes).            |
| Admin     | Admin console → Operations → Insights (all four views)    | Everything above.                                                                                                                                |

## How it works

- **Synthetic history** (`services/api/src/insights/synthetic.ts`): a seeded generator produces about 90 days of fictional reports, help requests and verification outcomes across the five DEMO places, with deliberate patterns: medical reports at midday in academic buildings and rising recently, wet-floor hazards rising near the hostel and Academic Block 1, canteen smoke at meal times, and late-evening personal-safety reports near the hostel. It is generated in memory: the same day gives the same history, and nothing is written to the database.
- **Statistics** (`compute.ts`): last 30 days vs the 30 before, the busiest 3-hour window, hotspots (at least 3 reports of a category in one place), a same-weekday 8-week average forecast with a Poisson 90% range, median acknowledgement time, verification shares and duplicate clusters. A "How these figures are worked out" panel lists the method on screen.
- **Precautions** state a pattern ("… (synthetic data).") and point to an existing guide. The app does not invent safety advice.
- **AI summary** (`summary.ts`): only aggregate synthetic figures are sent to the configured model (Groq, server-side). The text is used only if every number in it appears in the facts, it says the data is synthetic, it avoids certainty ("guarantee", "completely safe"), and it is short. Otherwise, or when AI is off, the app writes the summary from a template and says why. One summary per view per day, so the shared AI quota is barely used.
- **Boundaries**: available only in DEMO mode (404 otherwise); nothing describes, ranks or predicts any person; insights never raise alerts or change any record.

## Verification

- API: 9 new tests: determinism and window, built-in patterns found, students get no staff figures, forecast arithmetic, AI text accepted only when it restates facts (invented numbers, missing "synthetic" and certainty rejected), fallbacks, per-role views and 403s, caching, unavailable outside DEMO.
- Web: 2 new tests (student compact view and guide link; AI label and view switching).
- Checked in Chrome against the local API: admin (desktop), student Prepare (390 px, no overflow, guide opens), responder views.

**Not verified:** a real AI-written summary. Locally AI is off, so the app-written summary was shown. On Render it depends on `ASSISTANT_PROVIDER=groq` with a working key; the Groq key exposed earlier must be rotated first.
