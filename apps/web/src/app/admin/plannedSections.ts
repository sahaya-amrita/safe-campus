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
