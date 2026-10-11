# 05. UI design system

Minimal, refined, mobile-first, blue and white. Code lives in `apps/web/src/design-system/`:

- `tokens.css`: design tokens.
- `ds.css`: component styles (`ds-` prefix).
- `components.tsx`: React components.
- `fonts.ts`: self-hosted Inter.

The design system is imported once by `App.tsx`. The existing theme (`app/theme.css`, `as-` prefix) now reads these tokens, so the whole app shares one palette.

> The visual reference screenshot mentioned in the brief was not available in this workspace. The tokens follow the brief's stated values, and the layout follows its written guidance: generous whitespace, soft radii, light borders and outline icons.

## Colour tokens

| Token                        | Value                 | Use                                                            |
| ---------------------------- | --------------------- | -------------------------------------------------------------- |
| `--ds-primary`               | `#1769D2`             | Primary actions, links, selected states                        |
| `--ds-primary-700`           | `#1257B0`             | Hover, text on tinted blue                                     |
| `--ds-deep`                  | `#123B69`             | Staff sidebar, mode banner, hero gradient                      |
| `--ds-bg`                    | `#F6F9FC`             | Page background                                                |
| `--ds-surface`               | `#FFFFFF`             | Cards, bars, sheets                                            |
| `--ds-ink`                   | `#15273B`             | Body text                                                      |
| `--ds-muted`                 | `#5A6B80`             | Secondary text                                                 |
| `--ds-line` / `--ds-control` | `#DCE4EE` / `#8296AE` | Decorative borders / form-control borders                      |
| `--ds-danger`                | `#B42318`             | **Emergency and errors only:** SOS, I Need Help, 112, failures |
| `--ds-warn`, `--ds-ok`       | `#8A4B00`, `#146C43`  | Warnings (e.g. offline) and success                            |

**Red means emergency.** Blue never signals danger, and the SOS, help and 112 controls keep red in every theme.

Measured contrast ratios (WCAG 2.1):

| Pair                                      | Ratio   |
| ----------------------------------------- | ------- |
| White on primary                          | 5.27:1  |
| Primary on white                          | 5.27:1  |
| Primary on background                     | 4.98:1  |
| Primary on primary-50                     | 4.67:1  |
| Muted on background                       | 5.16:1  |
| Ink on background                         | 14.35:1 |
| White on danger                           | 6.57:1  |
| Danger on danger-50                       | 5.75:1  |
| Warn on warn-50                           | 6.24:1  |
| OK on ok-50                               | 5.74:1  |
| White on deep                             | 11.32:1 |
| Sidebar link text on deep                 | 7.8:1   |
| Control border on white (non-text, ≥ 3:1) | 3.03:1  |

## Typography and shape

- **Fonts:** Inter (400, 500, 600 and 700, Latin subset), self-hosted through `@fontsource/inter`, so there are no third-party font requests. Noto Sans covers Tamil, Devanagari, Malayalam, Telugu and Kannada, and each face is downloaded only when its script is on screen.
- **Type scale:** 0.78 / 0.875 / 1 / 1.125 / 1.375 / 1.75 rem. Headings use weights 600–700 with slight negative tracking.
- **Radii:** 10 px (controls), 14 px (cards), 20 px (sheets).
- **Spacing:** 4 px base scale.
- **Shadows:** one soft shadow for raised surfaces.
- **Touch targets:** at least 44 px. Focus rings are a 3 px blue outline offset by 2 px.

## Components

| Component                                               | Accessibility behaviour                                                                                        | Tested     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| `Button` (primary, secondary, ghost, danger; `loading`) | `type="button"` by default; loading sets `aria-busy` and disables the button                                   | Yes        |
| `TextField` + `FormError`                               | Label, hint and error linked via `aria-describedby`; `aria-invalid`; the error is `role="alert"`               | Yes        |
| `Surface` (card)                                        | Labelled `section` when it has a title                                                                         | Indirectly |
| `Sheet` (modal or bottom sheet)                         | `role="dialog"`, `aria-modal`; focuses the title; Tab stays inside; Escape closes; focus returns to the opener | Yes        |
| `Tabs`                                                  | WAI-ARIA tabs with roving tabindex, arrow/Home/End keys                                                        | Yes        |
| `BottomNav`, `TopBar`                                   | `aria-current="page"`; badge counts are labelled                                                               | Yes        |
| `StatusBanner`                                          | Danger is `role="alert"`; the other tones are `role="status"`                                                  | Yes        |
| `Skeleton`                                              | One "Loading …" announcement; the bars are `aria-hidden`                                                       | Yes        |
| `ErrorState`                                            | `role="alert"`, optional retry                                                                                 | Yes        |
| `PermissionNotice`                                      | Explains purpose and state, never asks by itself, offers a fallback                                            | Yes        |
| `OfflineIndicator`                                      | Online / Offline / Server unreachable. It never says "delivered".                                              | Yes        |
| `DevPlaceholder`                                        | "In development · not functional"; lists dependencies; no action buttons                                       | Yes        |

Existing primitives (`Card`, `EmptyState`, `Loading`, `Pill`, `ModeBanner`, `AppIcon`) are re-exported from `design-system/index.ts` until they move there.

## Where it is applied in Phase 1

- **Whole app:** blue tokens through `theme.css` aliases, Inter font, white top bar, deep-blue staff sidebar, and the student module's tokens remapped (I'm Safe → blue, I Need Help and SOS → red).
- **New screens built with it:** the sign-in form, access-denied screens, auth placeholders, the help and legal pages, and the admin dashboard and placeholders.
- **Student top bar:** uses `OfflineIndicator`.

## Known gaps

- **Light only.** `main.tsx` pins `data-theme="light"`. The student module's dark tokens are overridden, and a dark theme is future work.
- **Emergency screen.** The full-screen SOS view keeps its bespoke dark-red styling. It is an emergency surface, not a candidate for blue.
- **Staff on phones.** The staff layout is desktop-first. At 390 px it works with no horizontal scroll, but the sidebar footer is crowded.
- **Existing screens.** Many still use the older `as-*` classes, now on blue tokens. Moving them to `ds-*` components can happen screen by screen as phases touch them.
- **Brand assets.** The emblem is still the interim raster extracted from the brand board, and institutional approval of the branding is **not** confirmed.
