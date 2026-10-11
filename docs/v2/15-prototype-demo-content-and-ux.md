# 15. Prototype: DEMO content and phone UX refresh

The hosted prototype looked empty and was hard to use on a phone. This change fills it with labelled DEMO content and reworks the student screens. Built on `develop-v2` after `1ebcadb`.

## DEMO content (`services/api/src/demo/demoContent.ts`)

Loaded by both `db:seed` (every Render start) and `dev:memory`. It is idempotent and never replaces non-DEMO data.

| Content                                                                                                                  | What students see                                    | Labelling                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Six published guides: fire and smoke, medical help, earthquake, flood and storms, personal security, preparedness basics | Prepare topics open each guide; Tom can link to them | Title starts "DEMO:". Source: "DEMO content written for this prototype. Not reviewed by campus safety staff." The app shows them as **samples**, never "approved". |
| Route network: 363 points and 10 km of community-mapped roads and paths from the DEMO map (OpenStreetMap, ODbL)          | Routes on the Campus map                             | Only added if no route data is approved. Route card: "DEMO practice route · not verified". Note: "Not an evacuation route."                                        |
| Four practice points on open grounds (Amrita Playground, AB1 Lawn, Library Garden, Agastya/Gautama playground)           | Destinations for practice routes                     | "DEMO practice point: …", noted "Not an official assembly point".                                                                                                  |
| One simulated drill alert for the DEMO zone                                                                              | Alert card on Home, Alerts tab                       | "DEMO drill: practise checking in". Precautionary; the text says nothing is happening.                                                                             |

The general safety advice is widely accepted guidance ("drop, cover and hold on", "do not use lifts", "call 112"). It is still DEMO text, and it must be replaced by reviewed institutional packs before any real use. To regenerate the route network: `pnpm --filter @sahaya/api demo:route-graph`.

Route responses now include `practice: true` for DEMO data.

## Phone UX

| Screen     | Before                                                                                                                                          | After                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in    | Disabled email form first, a large "codes not available" warning, DEMO sign-in hidden at the bottom and wrongly saying "local development only" | **Try the prototype**: four role cards that sign in with one tap. Email sign-in sits below with a one-line note when codes cannot be sent. The manual DEMO form is kept under "Developer sign-in".                                                       |
| Home       | About 400 px of banners and greeting pushed I'm Safe and I Need Help below the fold; a floating nav covered content                             | Slim DEMO and drill strips (both always visible). A short greeting and a compact alert card. "Checking in for" on one line. **I'm Safe and I Need Help side by side, above the fold.** Short safety note, a 2×2 shortcut grid, "Who can respond" folded. |
| Navigation | Floating, translucent bar; labels and the SOS text hidden on narrow phones                                                                      | A solid docked bar with labels and a red **SOS** tile, plus safe-area padding. The top bar is solid.                                                                                                                                                     |
| Map        | Pickers squeezed; the new floor picker unstyled; route tiny at campus zoom                                                                      | Stacked pickers on phones. The map zooms to the route. Notice and legend say "DEMO practice route".                                                                                                                                                      |
| Prepare    | Six full guides in one long list                                                                                                                | Topic grid that opens each guide. Guides fold, with a "Sample — not official campus instructions" badge.                                                                                                                                                 |
| Profile    | One long page of cards                                                                                                                          | Name and language visible; seven secondary sections fold (58 px each) above Sign out.                                                                                                                                                                    |

Styles live in `apps/web/src/app/ux-refresh.css`, loaded after `theme.css`, so the shared theme is not rewritten.

## Verification

- API: 160 tests, including new DEMO-content tests: idempotent seeding, six labelled guides, practice routes flagged `practice`, one drill alert per zone member.
- Web: 493 tests, including new tests for one-tap DEMO sign-in and DEMO packs classed as samples.
- Checked by hand at 375×812 in the in-app browser against the local in-memory API: sign-in, Home, Map (route from Academic Block 2 to the Library Garden practice point, 185 m), Prepare, Alerts and Profile.

**Not verified:** real phones, and the Render deployment after this push. The seed runs on the next Render start.
