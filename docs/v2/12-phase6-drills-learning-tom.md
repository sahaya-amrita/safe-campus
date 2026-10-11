# 12. Phase 6: drills, learning and Tom

Built on branch `feat/phase6-learning` (from `develop-v2` at `5dedc84`).

## What changed

| Area                          | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drill after-action review** | `GET/PUT /drills/:id/review`: summary, what went well, what to improve, and follow-up actions (text, owner, due date, open/done). Written by DRILL_MANAGER or ADMIN, only after the drill has ended (`409 DRILL_NOT_ENDED` otherwise); saving marks the drill REVIEWED. Other staff can read it. Audited. Shown under each ended drill in the drill console; the form reminds staff to keep notes aggregate (no student names).             |
| **Student progress**          | `GET /training/progress/mine`: practice runs, best practice score, and the drills the student checked in to (with their last status). The Prepare screen's "My training history" is now **My progress**.                                                                                                                                                                                                                                    |
| **Tom help-content review**   | Tom's help texts can now be approved by a named reviewer (ADMIN or INCIDENT_VERIFIER) in **Admin → Tom help content**. An approval covers the **exact wording** (a content hash): if a release changes the text, it returns to DRAFT automatically. Optional expiry. Tom loads these reviews at answer time, so outside DEMO it can use approved help text; drafts still need DEMO mode plus `ASSISTANT_ALLOW_DRAFT_CONTENT=true`. Audited. |

Migration `008` adds `drill_reviews` and `assistant_content_reviews`.

## Not done in this phase

- **3D floating Tom.** Presentation only and not needed for safety; left for a later design pass.
- **Scenario-based virtual drills beyond the existing practice drill.** New scenarios need approved content.

## Verification performed

| Check     | Result                                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API tests | 144 (3 new in `learning.integration.test.ts`): review only after the drill ends, REVIEWED status, one review per drill, role checks, audit; progress totals; content approval tied to exact text, edits and expiry return to DRAFT, role checks. |
| Web tests | 472 (3 new: review form with actions, read-only view, Tom content approval)                                                                                                                                                                      |

**Not verified:** on real devices or real PostgreSQL.
