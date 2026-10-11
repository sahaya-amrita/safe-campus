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

export const PLANNED_ADMIN_SECTIONS: readonly PlannedSection[] = [];
