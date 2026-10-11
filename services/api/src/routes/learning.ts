import { createHash } from 'node:crypto';
import { Router } from 'express';
import {
  contentReviewSchema,
  drillReviewSchema,
  type AssistantContentView,
  type DrillReviewView,
  type ProgressView,
} from '@sahaya/contracts';
import { APP_KNOWLEDGE } from '../assistant/content.js';
import type { KnowledgeDoc } from '../assistant/knowledge.js';
import { writeAudit } from '../audit.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError, notFound } from '../errors.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);

// ---------------------------------------------------------------------------
// Drill after-action reviews
// ---------------------------------------------------------------------------

/**
 * /api/v1/drills/:drillId/review. Staff read it; DRILL_MANAGER or ADMIN write
 * it once the drill has ended. Saving marks the drill REVIEWED. Audited.
 */
export function drillReviewRouter(pool: DatabasePool) {
  const router = Router({ mergeParams: true });

  async function load(drillId: string): Promise<DrillReviewView | null> {
    const row = (
      await pool.query<{
        drill_id: string;
        summary: string;
        went_well: string;
        to_improve: string;
        actions: DrillReviewView['actions'];
        updated_by: string;
        updated_at: Date;
      }>('SELECT * FROM drill_reviews WHERE drill_id = $1', [drillId])
    ).rows[0];
    if (!row) return null;
    const user = (
      await pool.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [
        row.updated_by,
      ])
    ).rows[0];
    return {
      drillId: row.drill_id,
      summary: row.summary,
      wentWell: row.went_well,
      toImprove: row.to_improve,
      actions: row.actions ?? [],
      updatedBy: row.updated_by,
      updatedByName: user?.display_name ?? null,
      updatedAt: iso(row.updated_at)!,
    };
  }

  router.get(
    '/',
    validateUuidParam('drillId'),
    requireRoles('RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER', 'ADMIN'),
    async (request, response) => {
      const review = await load(request.params.drillId as string);
      if (!review) throw notFound('Drill review');
      response.json(review);
    },
  );

  router.put(
    '/',
    validateUuidParam('drillId'),
    requireRoles('DRILL_MANAGER', 'ADMIN'),
    validateBody(drillReviewSchema),
    async (request, response) => {
      const auth = request.auth!;
      const drillId = request.params.drillId as string;
      const body = drillReviewSchema.parse(request.body);
      await withTransaction(pool, async (client) => {
        const drill = (
          await client.query<{ status: string }>('SELECT status FROM drills WHERE id = $1', [
            drillId,
          ])
        ).rows[0];
        if (!drill) throw notFound('Drill');
        if (drill.status !== 'COMPLETED' && drill.status !== 'REVIEWED')
          throw new ApiError(
            409,
            'DRILL_NOT_ENDED',
            'A drill can be reviewed only after it has ended.',
          );
        const exists = await client.query('SELECT 1 FROM drill_reviews WHERE drill_id = $1', [
          drillId,
        ]);
        if ((exists.rowCount ?? 0) > 0)
          await client.query(
            `UPDATE drill_reviews SET summary = $2, went_well = $3, to_improve = $4,
               actions = $5::jsonb, updated_by = $6, updated_at = now() WHERE drill_id = $1`,
            [
              drillId,
              body.summary,
              body.wentWell,
              body.toImprove,
              JSON.stringify(body.actions),
              auth.id,
            ],
          );
        else
          await client.query(
            `INSERT INTO drill_reviews (drill_id, summary, went_well, to_improve, actions, updated_by)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
            [
              drillId,
              body.summary,
              body.wentWell,
              body.toImprove,
              JSON.stringify(body.actions),
              auth.id,
            ],
          );
        await client.query(`UPDATE drills SET status = 'REVIEWED' WHERE id = $1`, [drillId]);
        await writeAudit(client, {
          actorId: auth.id,
          action: 'DRILL_REVIEW_SAVED',
          entityType: 'DRILL',
          entityId: drillId,
          metadata: {
            actions: body.actions.length,
            openActions: body.actions.filter((a) => a.status === 'OPEN').length,
          },
        });
      });
      response.json(await load(drillId));
    },
  );

  return router;
}

// ---------------------------------------------------------------------------
// Student progress
// ---------------------------------------------------------------------------

/** GET /api/v1/training/progress/mine: practice results and drills the student took part in. */
export function progressRouter(pool: DatabasePool) {
  const router = Router();
  router.get('/progress/mine', async (request, response) => {
    const userId = request.auth!.id;
    const practice = await pool.query<{
      id: string;
      scenario_ref: string;
      score: string | number;
      completed_at: Date;
    }>(
      `SELECT id, scenario_ref, score, completed_at FROM training_results
       WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 50`,
      [userId],
    );
    const checkins = await pool.query<{
      drill_id: string;
      status: 'CONFIRMED_SAFE' | 'HELP_REQUESTED';
      server_received_at: Date;
    }>(
      `SELECT drill_id, status, server_received_at FROM student_checkins
       WHERE student_id = $1 AND drill_id IS NOT NULL`,
      [userId],
    );
    const latest = new Map<string, (typeof checkins.rows)[number]>();
    for (const row of checkins.rows) {
      const current = latest.get(row.drill_id);
      if (!current || new Date(row.server_received_at) > new Date(current.server_received_at))
        latest.set(row.drill_id, row);
    }
    const drillIds = [...latest.keys()];
    const names = drillIds.length
      ? await pool.query<{ id: string; name: string }>(
          `SELECT id, name FROM drills WHERE id IN (${drillIds.map((_, i) => `$${i + 1}`).join(', ')})`,
          drillIds,
        )
      : { rows: [] as { id: string; name: string }[] };
    const name = new Map(names.rows.map((d) => [d.id, d.name]));
    const scores = practice.rows.map((r) => Number(r.score));
    const body: ProgressView = {
      summary: {
        practiceRuns: practice.rows.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        drillsJoined: drillIds.length,
      },
      practice: practice.rows.map((r) => ({
        id: r.id,
        scenarioRef: r.scenario_ref,
        score: Number(r.score),
        completedAt: iso(r.completed_at)!,
      })),
      drills: [...latest.values()]
        .sort((a, b) => +new Date(b.server_received_at) - +new Date(a.server_received_at))
        .map((r) => ({
          drillId: r.drill_id,
          name: name.get(r.drill_id) ?? 'Drill',
          lastStatus: r.status,
          checkedInAt: iso(r.server_received_at)!,
        })),
    };
    response.json(body);
  });
  return router;
}

// ---------------------------------------------------------------------------
// Tom help-content review
// ---------------------------------------------------------------------------

export function contentHash(doc: Pick<KnowledgeDoc, 'title' | 'body' | 'version'>): string {
  return createHash('sha256').update(`${doc.version}\n${doc.title}\n${doc.body}`).digest('hex');
}

interface ReviewRow {
  doc_id: string;
  content_hash: string;
  decision: 'APPROVED' | 'REJECTED';
  notes: string;
  valid_until: Date | null;
  reviewer_id: string;
  reviewed_at: Date;
}

/** The newest review per document (any text version). */
async function latestReviews(pool: DatabasePool): Promise<Map<string, ReviewRow>> {
  const rows = await pool.query<ReviewRow>(
    `SELECT doc_id, content_hash, decision, notes, valid_until, reviewer_id, reviewed_at
     FROM assistant_content_reviews ORDER BY reviewed_at`,
  );
  const latest = new Map<string, ReviewRow>();
  for (const row of rows.rows) latest.set(row.doc_id, row);
  return latest;
}

/**
 * Applies stored reviews to Tom's built-in help content. A document counts as
 * APPROVED only when its newest review approved this exact text and has not
 * expired; anything else stays DRAFT (served only in DEMO when drafts are
 * allowed, and labelled DRAFT).
 */
export async function reviewedKnowledge(
  pool: DatabasePool,
  docs: readonly KnowledgeDoc[] = APP_KNOWLEDGE,
  now = new Date(),
): Promise<KnowledgeDoc[]> {
  const latest = await latestReviews(pool);
  const names = new Map<string, string>();
  const reviewerIds = [...new Set([...latest.values()].map((r) => r.reviewer_id))];
  if (reviewerIds.length) {
    const users = await pool.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM users WHERE id IN (${reviewerIds.map((_, i) => `$${i + 1}`).join(', ')})`,
      reviewerIds,
    );
    for (const u of users.rows) names.set(u.id, u.display_name);
  }
  return docs.map((doc) => {
    const review = latest.get(doc.id);
    const valid =
      review &&
      review.decision === 'APPROVED' &&
      review.content_hash === contentHash(doc) &&
      (!review.valid_until || new Date(review.valid_until) > now);
    if (!valid) return doc;
    return {
      ...doc,
      review: {
        state: 'APPROVED' as const,
        reviewedBy: names.get(review.reviewer_id) ?? review.reviewer_id,
        reviewedAt: iso(review.reviewed_at)!,
        ...(review.valid_until ? { validUntil: iso(review.valid_until)! } : {}),
      },
    };
  });
}

/** /api/v1/admin/assistant-content: named reviewers approve Tom's help text. */
export function assistantContentRouter(pool: DatabasePool) {
  const router = Router();
  router.use(requireRoles('ADMIN', 'INCIDENT_VERIFIER'));

  router.get('/', async (_request, response) => {
    const latest = await latestReviews(pool);
    const reviewed = await reviewedKnowledge(pool);
    const items: AssistantContentView[] = reviewed.map((doc) => {
      const review = latest.get(doc.id);
      const hash = contentHash(doc);
      const sameText = review?.content_hash === hash;
      const state: AssistantContentView['state'] =
        doc.review.state === 'APPROVED'
          ? 'APPROVED'
          : review && sameText && review.decision === 'REJECTED'
            ? 'REJECTED'
            : 'DRAFT';
      return {
        id: doc.id,
        kind: doc.kind,
        title: doc.title,
        body: doc.body,
        audience: doc.audience === 'ALL' ? 'ALL' : [...doc.audience],
        version: doc.version,
        contentHash: hash,
        state,
        reviewedBy: doc.review.reviewedBy ?? null,
        reviewedAt: doc.review.reviewedAt ?? (sameText && review ? iso(review.reviewed_at) : null),
        validUntil: doc.review.validUntil ?? null,
        notes: sameText && review ? review.notes : null,
      };
    });
    response.json({ items });
  });

  router.post('/:docId/review', validateBody(contentReviewSchema), async (request, response) => {
    const auth = request.auth!;
    const docId = request.params.docId as string;
    const doc = APP_KNOWLEDGE.find((d) => d.id === docId);
    if (!doc) throw notFound('Help content');
    const body = contentReviewSchema.parse(request.body);
    await withTransaction(pool, async (client) => {
      await client.query(
        `INSERT INTO assistant_content_reviews (doc_id, content_hash, decision, notes, valid_until, reviewer_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [docId, contentHash(doc), body.decision, body.notes, body.validUntil ?? null, auth.id],
      );
      await writeAudit(client, {
        actorId: auth.id,
        action:
          body.decision === 'APPROVED'
            ? 'ASSISTANT_CONTENT_APPROVED'
            : 'ASSISTANT_CONTENT_REJECTED',
        entityType: 'ASSISTANT_CONTENT',
        metadata: { docId, version: doc.version, contentHash: contentHash(doc) },
      });
    });
    response.status(201).json({ docId, decision: body.decision });
  });

  return router;
}
