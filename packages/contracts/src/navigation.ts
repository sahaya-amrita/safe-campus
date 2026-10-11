import { z } from 'zod';
import { uuidSchema } from './primitives.js';

/*
 * Phase 5: approved navigation data (safe points and route graphs, both
 * approved by a second administrator) and routes computed only over them.
 */

const reason = z.string().trim().min(5).max(300);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const safePointKindSchema = z.enum(['ASSEMBLY_POINT', 'SHELTER', 'EXIT']);
export type SafePointKind = z.infer<typeof safePointKindSchema>;

export const proposeSafePointSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: safePointKindSchema,
  latitude,
  longitude,
  buildingId: uuidSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  reason,
});

export const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'RETIRE']),
  reason,
});

export const routeGraphUploadSchema = z.object({
  version: z.string().trim().min(1).max(40),
  source: z.string().trim().min(3).max(200),
  nodes: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        lat: latitude,
        lng: longitude,
        label: z.string().trim().max(120).optional(),
        /** Floor number; ground = 0, basements negative. Missing means 0. */
        floor: z.number().int().min(-10).max(60).optional(),
      }),
    )
    .min(2)
    .max(5000),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).max(60),
        to: z.string().min(1).max(60),
        accessible: z.boolean().optional(),
        /** Missing means PATH. LIFT edges are stored but never used for evacuation routes. */
        kind: z.enum(['PATH', 'STAIRS', 'RAMP', 'LIFT']).optional(),
      }),
    )
    .min(1)
    .max(20000),
  reason,
});
export type RouteGraphUpload = z.infer<typeof routeGraphUploadSchema>;

export const routeQuerySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  safePointId: uuidSchema,
  /** The floor the person is on; routes start from a node on that floor. */
  fromFloor: z.coerce.number().int().min(-10).max(60).optional(),
  accessible: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export interface SafePointView {
  id: string;
  name: string;
  kind: SafePointKind;
  latitude: number;
  longitude: number;
  buildingId: string | null;
  notes: string | null;
  status: 'PROPOSED' | 'APPROVED' | 'RETIRED';
  proposedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface RouteGraphView {
  id: string;
  version: string;
  source: string;
  status: 'DRAFT' | 'APPROVED' | 'RETIRED';
  nodeCount: number;
  edgeCount: number;
  uploadedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface NavigationStatus {
  available: boolean;
  /** Why navigation is unavailable, in plain words; null when available. */
  reason: string | null;
  graph: Pick<RouteGraphView, 'id' | 'version' | 'approvedAt'> | null;
  safePoints: SafePointView[];
}

export interface FloorChangeView {
  /** Index in `path` where the change begins. */
  atStep: number;
  from: number;
  to: number;
  via: 'STAIRS' | 'RAMP';
}

export interface RouteResponse {
  path: { lat: number; lng: number; floor: number }[];
  /** Floor changes along the path, in order. Lifts are never used. */
  floorChanges: FloorChangeView[];
  distanceM: number;
  walkSeconds: number;
  graphVersion: string;
  safePoint: SafePointView;
  blocksAvoided: number;
  startSnapM: number;
  note: string;
}
