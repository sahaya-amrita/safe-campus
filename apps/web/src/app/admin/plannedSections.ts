/**
 * Admin sections that are specified but not built. They are hidden from the
 * admin navigation; their routes show a labelled development placeholder.
 * Phases follow docs/v2/06-phase-roadmap.md.
 */
export interface PlannedSection {
  section: string;
  label: string;
  phase: string;
  summary: string;
  needs: string[];
}

export const PLANNED_ADMIN_SECTIONS: readonly PlannedSection[] = [
  {
    section: 'responders',
    label: 'Responder management',
    phase: 'Phase 4 (responder operations and verification)',
    summary: 'Maintain the responder roster, duty status and zones.',
    needs: [
      'Roster create/update and duty-status endpoints (today GET /responders is read-only)',
      'Institution-confirmed responder list (only synthetic responders exist)',
    ],
  },
  {
    section: 'map-data',
    label: 'Campus map data',
    phase: 'Phase 5 (maps and safe points)',
    summary: 'Manage buildings, floors and approved route geometry.',
    needs: [
      'Verified campus geometry and floor plans from the institution',
      'A versioned map-data model with an approval workflow',
    ],
  },
  {
    section: 'safe-points',
    label: 'Safe-point approvals',
    phase: 'Phase 5 (maps and safe points)',
    summary: 'Approve assembly points and safe destinations before any route uses them.',
    needs: [
      'An approved safe-point model and review endpoint',
      'Institutional sign-off; the app must never invent safe destinations',
    ],
  },
  {
    section: 'settings',
    label: 'System settings',
    phase: 'Phase 7 (administration, analytics and deployment)',
    summary: 'Operating mode, acknowledgement timers and provider configuration.',
    needs: [
      'A server-side settings API with audit events',
      'Approved acknowledgement timers (today they are DEMO placeholders)',
    ],
  },
];
