import { z } from 'zod';

/*
 * Phase 6: drill after-action reviews, student progress, and the review of
 * Tom's help content.
 */

export const drillActionSchema = z.object({
  id: z.string().min(1).max(60),
  text: z.string().trim().min(3).max(300),
  owner: z.string().trim().max(120).default(''),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  status: z.enum(['OPEN', 'DONE']).default('OPEN'),
});
export type DrillAction = z.infer<typeof drillActionSchema>;

export const drillReviewSchema = z.object({
  summary: z.string().trim().min(3).max(2000),
  wentWell: z.string().trim().max(2000).default(''),
  toImprove: z.string().trim().max(2000).default(''),
  actions: z.array(drillActionSchema).max(30).default([]),
});

export interface DrillReviewView {
  drillId: string;
  summary: string;
  wentWell: string;
  toImprove: string;
  actions: DrillAction[];
  updatedBy: string;
  updatedByName: string | null;
  updatedAt: string;
}

export interface ProgressView {
  summary: { practiceRuns: number; bestScore: number | null; drillsJoined: number };
  practice: { id: string; scenarioRef: string; score: number; completedAt: string }[];
  drills: {
    drillId: string;
    name: string;
    lastStatus: 'CONFIRMED_SAFE' | 'HELP_REQUESTED';
    checkedInAt: string;
  }[];
}

export const contentReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().trim().min(5).max(1000),
  validUntil: z.string().datetime({ offset: true }).optional(),
});

export interface AssistantContentView {
  id: string;
  kind: string;
  title: string;
  body: string;
  audience: string[] | 'ALL';
  version: string;
  contentHash: string;
  state: 'APPROVED' | 'DRAFT' | 'REJECTED';
  reviewedBy: string | null;
  reviewedAt: string | null;
  validUntil: string | null;
  notes: string | null;
}
