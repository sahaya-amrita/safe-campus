import { Router } from 'express';
import {
  proposeSafePointSchema,
  reviewSchema,
  routeGraphUploadSchema,
  routeQuerySchema,
  type NavigationStatus,
  type RouteGraphView,
  type RouteResponse,
  type SafePointView,
} from '@sahaya/contracts';
import { writeAudit } from '../audit.js';
import type { Config } from '../config.js';
import { withTransaction, type DatabasePool } from '../db.js';
import { ApiError, conflict, notFound } from '../errors.js';
import { requireRoles, validateBody, validateUuidParam } from '../middleware.js';
import {
  aStar,
  floorChanges,
  floorOf,
  nearestNode,
  validateGraph,
  type Graph,
} from '../navigation/graph.js';

/** Snap distance from the walker or a safe point to the approved graph. */
const MAX_SNAP_M = 150;
const WALK_M_PER_S = 1.2;
const STAFF = ['RESPONDER', 'INCIDENT_VERIFIER', 'DRILL_MANAGER', 'ADMIN'] as const;

interface SafePointRow {
  id: string;
  name: string;
  kind: SafePointView['kind'];
  latitude: number;
  longitude: number;
  building_id: string | null;
  notes: string | null;
  status: SafePointView['status'];
  proposed_by: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

interface GraphRow {
  id: string;
  version: string;
  source: string;
  status: RouteGraphView['status'];
  graph?: Graph;
  node_count: number;
  edge_count: number;
  uploaded_by: string;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
}

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);

const safePoint = (r: SafePointRow): SafePointView => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  latitude: Number(r.latitude),
  longitude: Number(r.longitude),
  buildingId: r.building_id,
  notes: r.notes,
  status: r.status,
  proposedBy: r.proposed_by,
  reviewedBy: r.reviewed_by,
  reviewedAt: iso(r.reviewed_at),
  createdAt: iso(r.created_at)!,
});

const graphView = (r: GraphRow): RouteGraphView => ({
  id: r.id,
  version: r.version,
  source: r.source,
  status: r.status,
  nodeCount: Number(r.node_count),
  edgeCount: Number(r.edge_count),
  uploadedBy: r.uploaded_by,
  approvedBy: r.approved_by,
  approvedAt: iso(r.approved_at),
  createdAt: iso(r.created_at)!,
});

const SAFE_POINT_COLUMNS = `id, name, kind, latitude, longitude, building_id, notes, status, proposed_by,
  reviewed_by, reviewed_at, created_at`;
const GRAPH_COLUMNS = `id, version, source, status, node_count, edge_count, uploaded_by, approved_by,
  approved_at, created_at`;

async function approvedGraph(pool: DatabasePool): Promise<GraphRow | null> {
  return (
    (
      await pool.query<GraphRow>(
        `SELECT ${GRAPH_COLUMNS}, graph FROM route_graphs WHERE status = 'APPROVED'
         ORDER BY approved_at DESC LIMIT 1`,
      )
    ).rows[0] ?? null
  );
}

async function approvedSafePoints(pool: DatabasePool): Promise<SafePointView[]> {
  const rows = await pool.query<SafePointRow>(
    `SELECT ${SAFE_POINT_COLUMNS} FROM safe_points WHERE status = 'APPROVED' ORDER BY name`,
  );
  return rows.rows.map(safePoint);
}

const UNAVAILABLE = (reason: string) =>
  new ApiError(409, 'NAVIGATION_UNAVAILABLE', `Navigation unavailable: ${reason}`);

/** /api/v1/maps navigation endpoints (any signed-in user). */
export function navigationRouter(pool: DatabasePool) {
  const router = Router();

  router.get('/navigation', async (_request, response) => {
    const graph = await approvedGraph(pool);
    const points = await approvedSafePoints(pool);
    const reason = !graph
      ? 'no verified route data has been approved.'
      : points.length === 0
        ? 'no safe points have been approved.'
        : null;
    const body: NavigationStatus = {
      available: reason === null,
      reason,
      graph: graph
        ? { id: graph.id, version: graph.version, approvedAt: iso(graph.approved_at) }
        : null,
      safePoints: points,
    };
    response.json(body);
  });

  /** Students see approved safe points only; staff see all, with their status. */
  router.get('/safe-points', async (request, response) => {
    const staff = STAFF.some((r) => request.auth!.roles.includes(r));
    const rows = await pool.query<SafePointRow>(
      `SELECT ${SAFE_POINT_COLUMNS} FROM safe_points
       ${staff ? '' : "WHERE status = 'APPROVED'"} ORDER BY created_at DESC LIMIT 200`,
    );
    response.json({ items: rows.rows.map(safePoint) });
  });

  router.get('/route', async (request, response) => {
    const parsed = routeQuerySchema.safeParse(request.query);
    if (!parsed.success)
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Query parameters are invalid',
        parsed.error.flatten(),
      );
    const query = parsed.data;
    const graphRow = await approvedGraph(pool);
    if (!graphRow?.graph) throw UNAVAILABLE('no verified route data has been approved.');
    const target = (
      await pool.query<SafePointRow>(
        `SELECT ${SAFE_POINT_COLUMNS} FROM safe_points WHERE id = $1`,
        [query.safePointId],
      )
    ).rows[0];
    if (!target || target.status !== 'APPROVED')
      throw UNAVAILABLE('this safe point is not approved.');
    const graph = graphRow.graph;

    const start = nearestNode(graph, { lat: query.fromLat, lng: query.fromLng }, query.fromFloor);
    if (!start || start.distanceM > MAX_SNAP_M)
      throw new ApiError(
        422,
        'START_OFF_NETWORK',
        query.fromFloor === undefined
          ? 'You are too far from any mapped route. Follow staff and signs.'
          : `No approved route is mapped near you on floor ${query.fromFloor}. Follow staff and signs.`,
      );
    // Safe points have no floor: prefer ground-level nodes so a node stacked
    // above the safe point on an upper floor is never taken as the destination.
    const targetPoint = { lat: Number(target.latitude), lng: Number(target.longitude) };
    const groundEnd = nearestNode(graph, targetPoint, 0);
    const end =
      groundEnd && groundEnd.distanceM <= MAX_SNAP_M ? groundEnd : nearestNode(graph, targetPoint);
    if (!end || end.distanceM > MAX_SNAP_M)
      throw UNAVAILABLE('this safe point is not connected to the approved routes.');

    const blocks = await pool.query<{ latitude: number; longitude: number; radius_m: number }>(
      'SELECT latitude, longitude, radius_m FROM route_blocks WHERE cleared_at IS NULL',
    );
    const blocked = blocks.rows.map((b) => ({
      lat: Number(b.latitude),
      lng: Number(b.longitude),
      radiusM: Number(b.radius_m),
    }));
    const found = aStar(graph, start.node.id, end.node.id, {
      blocked,
      accessibleOnly: query.accessible,
    });
    if (!found)
      throw new ApiError(
        409,
        'NO_ROUTE',
        query.accessible
          ? 'No step-free approved route is available (lifts are not used in an evacuation). Use Help now so responders know where you are, and follow staff.'
          : 'No approved route avoids the blocked areas. Follow staff and signs.',
      );
    const node = new Map(graph.nodes.map((n) => [n.id, n]));
    const body: RouteResponse = {
      path: found.nodeIds.map((id) => {
        const n = node.get(id)!;
        return { lat: n.lat, lng: n.lng, floor: floorOf(n) };
      }),
      floorChanges: floorChanges(graph, found.nodeIds),
      distanceM: Math.round(found.distanceM),
      walkSeconds: Math.round(found.distanceM / WALK_M_PER_S),
      graphVersion: graphRow.version,
      safePoint: safePoint(target),
      blocksAvoided: blocked.length,
      startSnapM: Math.round(start.distanceM),
      note: 'Approved route data. Conditions can change: follow alarms, staff and signs first.',
    };
    response.json(body);
  });

  return router;
}

/**
 * /api/v1/admin/navigation (ADMIN): propose and approve safe points and route
 * graphs. Two-person rule: whoever proposed or uploaded something cannot
 * approve it. Every step needs a reason and is audited.
 */
export function adminNavigationRouter(pool: DatabasePool, config: Config) {
  const router = Router();
  router.use(requireRoles('ADMIN'));

  router.post('/safe-points', validateBody(proposeSafePointSchema), async (request, response) => {
    const auth = request.auth!;
    const body = proposeSafePointSchema.parse(request.body);
    const row = await withTransaction(pool, async (client) => {
      const inserted = (
        await client.query<SafePointRow>(
          `INSERT INTO safe_points (name, kind, latitude, longitude, building_id, notes, mode, proposed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${SAFE_POINT_COLUMNS}`,
          [
            body.name,
            body.kind,
            body.latitude,
            body.longitude,
            body.buildingId ?? null,
            body.notes ?? null,
            config.OPERATING_MODE,
            auth.id,
          ],
        )
      ).rows[0]!;
      await writeAudit(client, {
        actorId: auth.id,
        action: 'SAFE_POINT_PROPOSED',
        entityType: 'SAFE_POINT',
        entityId: inserted.id,
        metadata: { name: body.name, kind: body.kind, reason: body.reason },
      });
      return inserted;
    });
    response.status(201).json(safePoint(row));
  });

  router.post(
    '/safe-points/:id/review',
    validateUuidParam('id'),
    validateBody(reviewSchema),
    async (request, response) => {
      const auth = request.auth!;
      const { decision, reason } = reviewSchema.parse(request.body);
      const id = request.params.id as string;
      const row = await withTransaction(pool, async (client) => {
        const current = (
          await client.query<SafePointRow>(
            `SELECT ${SAFE_POINT_COLUMNS} FROM safe_points WHERE id = $1`,
            [id],
          )
        ).rows[0];
        if (!current) throw notFound('Safe point');
        if (decision === 'APPROVE') {
          if (current.status !== 'PROPOSED')
            throw conflict(`Cannot approve a ${current.status} safe point`);
          if (current.proposed_by === auth.id)
            throw new ApiError(409, 'SAME_PERSON', 'A second administrator must approve this.');
        }
        const status = decision === 'APPROVE' ? 'APPROVED' : 'RETIRED';
        const updated = (
          await client.query<SafePointRow>(
            `UPDATE safe_points SET status = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
             WHERE id = $1 RETURNING ${SAFE_POINT_COLUMNS}`,
            [id, status, auth.id],
          )
        ).rows[0]!;
        await writeAudit(client, {
          actorId: auth.id,
          action: decision === 'APPROVE' ? 'SAFE_POINT_APPROVED' : 'SAFE_POINT_RETIRED',
          entityType: 'SAFE_POINT',
          entityId: id,
          metadata: { reason },
        });
        return updated;
      });
      response.json(safePoint(row));
    },
  );

  router.get('/route-graphs', async (_request, response) => {
    const rows = await pool.query<GraphRow>(
      `SELECT ${GRAPH_COLUMNS} FROM route_graphs ORDER BY created_at DESC LIMIT 50`,
    );
    response.json({ items: rows.rows.map(graphView) });
  });

  router.post('/route-graphs', validateBody(routeGraphUploadSchema), async (request, response) => {
    const auth = request.auth!;
    const body = routeGraphUploadSchema.parse(request.body);
    const graph: Graph = { nodes: body.nodes, edges: body.edges };
    const problems = validateGraph(graph);
    if (problems.length > 0)
      throw new ApiError(400, 'INVALID_GRAPH', 'The route graph has problems', { problems });
    const row = await withTransaction(pool, async (client) => {
      const inserted = (
        await client.query<GraphRow>(
          `INSERT INTO route_graphs (version, source, graph, node_count, edge_count, mode, uploaded_by)
           VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7) RETURNING ${GRAPH_COLUMNS}`,
          [
            body.version,
            body.source,
            JSON.stringify(graph),
            graph.nodes.length,
            graph.edges.length,
            config.OPERATING_MODE,
            auth.id,
          ],
        )
      ).rows[0]!;
      await writeAudit(client, {
        actorId: auth.id,
        action: 'ROUTE_GRAPH_UPLOADED',
        entityType: 'ROUTE_GRAPH',
        entityId: inserted.id,
        metadata: {
          version: body.version,
          source: body.source,
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          reason: body.reason,
        },
      });
      return inserted;
    });
    response.status(201).json(graphView(row));
  });

  router.post(
    '/route-graphs/:id/review',
    validateUuidParam('id'),
    validateBody(reviewSchema),
    async (request, response) => {
      const auth = request.auth!;
      const { decision, reason } = reviewSchema.parse(request.body);
      const id = request.params.id as string;
      const row = await withTransaction(pool, async (client) => {
        const current = (
          await client.query<GraphRow>(`SELECT ${GRAPH_COLUMNS} FROM route_graphs WHERE id = $1`, [
            id,
          ])
        ).rows[0];
        if (!current) throw notFound('Route graph');
        if (decision === 'APPROVE') {
          if (current.status !== 'DRAFT')
            throw conflict(`Cannot approve a ${current.status} graph`);
          if (current.uploaded_by === auth.id)
            throw new ApiError(409, 'SAME_PERSON', 'A second administrator must approve this.');
          // One approved graph at a time: the previous one is retired.
          await client.query(
            `UPDATE route_graphs SET status = 'RETIRED' WHERE status = 'APPROVED'`,
          );
        }
        const updated = (
          await client.query<GraphRow>(
            `UPDATE route_graphs SET status = $2,
               approved_by = CASE WHEN $2 = 'APPROVED' THEN $3::uuid ELSE approved_by END,
               approved_at = CASE WHEN $2 = 'APPROVED' THEN now() ELSE approved_at END
             WHERE id = $1 RETURNING ${GRAPH_COLUMNS}`,
            [id, decision === 'APPROVE' ? 'APPROVED' : 'RETIRED', auth.id],
          )
        ).rows[0]!;
        await writeAudit(client, {
          actorId: auth.id,
          action: decision === 'APPROVE' ? 'ROUTE_GRAPH_APPROVED' : 'ROUTE_GRAPH_RETIRED',
          entityType: 'ROUTE_GRAPH',
          entityId: id,
          metadata: { version: current.version, reason },
        });
        return updated;
      });
      response.json(graphView(row));
    },
  );

  return router;
}
