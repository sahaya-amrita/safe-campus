/** Approved-knowledge model, eligibility rules, retrieval, and the action registry. */
import type { Role } from '@sahaya/contracts';

export type KnowledgeKind =
  'SCREEN_GUIDE' | 'STATUS_GLOSSARY' | 'WORKFLOW' | 'TOUR' | 'CAMPUS_CONTACT' | 'INSTRUCTION_PACK';

export interface KnowledgeDoc {
  id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  keywords?: readonly string[];
  /** Screen ids this doc describes; used to always include the current screen's guide. */
  screens?: readonly string[];
  audience: readonly Role[] | 'ALL';
  locale: 'en' | 'ta';
  version: string;
  source: string;
  review: {
    state: 'APPROVED' | 'DRAFT';
    reviewedBy?: string;
    reviewedAt?: string;
    validUntil?: string;
  };
  /** INSTRUCTION_PACK docs: the published pack's id. */
  instructionPackId?: string;
}

export interface Eligibility {
  roles: readonly Role[];
  locale: 'en' | 'ta';
  now: Date;
  /** DEMO-only. Drafts are labelled DRAFT; contacts and packs are never drafts. */
  allowDraftContent: boolean;
}

/** Filters to what this caller may see. Runs BEFORE retrieval, so ineligible text never reaches a model. */
export function eligibleDocs(docs: readonly KnowledgeDoc[], e: Eligibility): KnowledgeDoc[] {
  return docs.filter((d) => {
    if (d.audience !== 'ALL' && !d.audience.some((r) => e.roles.includes(r))) return false;
    if (d.locale !== e.locale && d.locale !== 'en') return false;
    const official = d.kind === 'CAMPUS_CONTACT' || d.kind === 'INSTRUCTION_PACK';
    if (d.review.state !== 'APPROVED' && (official || !e.allowDraftContent)) return false;
    if (d.review.validUntil) {
      const t = Date.parse(d.review.validUntil);
      if (Number.isNaN(t) || t <= e.now.getTime()) return false;
    }
    return true;
  });
}

const STOP = new Set(
  'a an and are be can could do does for from how i if in is it its me my of on or should the this that to was what when where which who why will with would you your'.split(
    ' ',
  ),
);
export const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/**
 * Simple, dependency-free keyword retrieval (keywords > title > body). Only
 * documents that share words with the query are returned; being about the
 * current screen only breaks ties. Swap for BM25/embeddings later without
 * changing callers.
 */
export function retrieve(
  query: string,
  docs: readonly KnowledgeDoc[],
  screen: string,
  k: number,
): KnowledgeDoc[] {
  const q = new Set(tokens(query));
  const scored = docs
    .map((d) => {
      const kw = (d.keywords ?? []).flatMap(tokens);
      const title = tokens(d.title);
      const body = tokens(d.body);
      let score = 0;
      for (const t of q) {
        if (kw.includes(t)) score += 3;
        if (title.includes(t)) score += 2;
        if (body.includes(t)) score += 1;
      }
      return { d, score, onScreen: d.screens?.includes(screen) ? 1 : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.onScreen - a.onScreen || a.d.id.localeCompare(b.d.id));
  return scored.slice(0, k).map((x) => x.d);
}

/** Guide and status glossary for the screen the user is on, so the model can always explain it. */
export function screenGuides(docs: readonly KnowledgeDoc[], screen: string): KnowledgeDoc[] {
  return docs.filter(
    (d) =>
      (d.kind === 'SCREEN_GUIDE' || d.kind === 'STATUS_GLOSSARY') && d.screens?.includes(screen),
  );
}

export interface RegisteredDestination {
  id: string;
  label: string;
  roles: readonly Role[];
}
export interface RegisteredTour {
  id: string;
  title: string;
  roles: readonly Role[];
}

/**
 * Server-side registry. Must match the destinations the web app registers with
 * Tom's navigation adapter. Student screens are added once Claude Code 1
 * registers them in the shared app.
 */
export const DESTINATIONS: readonly RegisteredDestination[] = [
  { id: 'responder.help-requests', label: 'Help requests', roles: ['RESPONDER', 'ADMIN'] },
  {
    id: 'responder.hazard-review',
    label: 'Hazard review',
    roles: ['RESPONDER', 'INCIDENT_VERIFIER', 'ADMIN'],
  },
  { id: 'responder.roll-call', label: 'Roll-call summary', roles: ['RESPONDER', 'ADMIN'] },
  { id: 'responder.contacts', label: 'Contacts & resources', roles: ['RESPONDER', 'ADMIN'] },
];

export const TOURS: readonly RegisteredTour[] = [
  { id: 'responder.workspace', title: 'Responder workspace tour', roles: ['RESPONDER', 'ADMIN'] },
];

export const permittedFor = <T extends { roles: readonly Role[] }>(
  items: readonly T[],
  roles: readonly Role[],
) => items.filter((i) => i.roles.some((r) => roles.includes(r)));
