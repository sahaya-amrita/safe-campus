/** Loads metadata (never content) of PUBLISHED, unexpired instruction packs as knowledge docs. */
import type { DatabasePool } from '../db.js';
import type { KnowledgeDoc } from './knowledge.js';

export async function loadPublishedPackDocs(
  pool: DatabasePool,
  locale: 'en' | 'ta',
): Promise<KnowledgeDoc[]> {
  const result = await pool.query<{
    id: string;
    title: string;
    version: string;
    source_label: string;
    language: 'en' | 'ta';
    expires_at: Date | null;
    published_at: Date | null;
  }>(
    `SELECT id, title, version, source_label, language, expires_at, published_at
       FROM instruction_packs
      WHERE approval_state = 'PUBLISHED'
        AND (expires_at IS NULL OR expires_at > now())
        AND language IN ('en', $1)
      ORDER BY published_at DESC NULLS LAST
      LIMIT 20`,
    [locale],
  );
  return result.rows.map((r) => ({
    id: `pack.${r.id}`,
    kind: 'INSTRUCTION_PACK' as const,
    instructionPackId: r.id,
    title: r.title,
    body: `Approved instruction pack "${r.title}" (version ${r.version}, source: ${r.source_label}). Open it in the app to read the official content.`,
    keywords: [
      'instructions',
      'instruction',
      'procedure',
      'procedures',
      'official',
      'pack',
      ...r.title.toLowerCase().split(/\W+/),
    ],
    audience: 'ALL' as const,
    locale: r.language,
    version: r.version,
    source: r.source_label,
    review: {
      state: 'APPROVED' as const,
      ...(r.published_at ? { reviewedAt: r.published_at.toISOString() } : {}),
      ...(r.expires_at ? { validUntil: r.expires_at.toISOString() } : {}),
    },
  }));
}
