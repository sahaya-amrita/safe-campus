import { z } from 'zod';

/* Phase 7: system settings and descriptive analytics. */

export const settingsSchema = z.object({
  /** Acknowledge a help request within this many seconds (control-room target). */
  ackTargetSeconds: z.number().int().min(30).max(3600),
  /** After this many seconds unacknowledged, staff are prompted to escalate by phone. */
  escalateAfterSeconds: z.number().int().min(60).max(7200),
  /** Responders matched (simulated notice) per new help request. */
  maxMatchedResponders: z.number().int().min(1).max(10),
  /** Uploaded photos never attached to a report are deleted after this many hours. */
  unattachedPhotoHours: z.number().int().min(1).max(168),
});
export type SystemSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: SystemSettings = {
  ackTargetSeconds: 120,
  escalateAfterSeconds: 300,
  maxMatchedResponders: 3,
  unattachedPhotoHours: 24,
};

export const updateSettingsSchema = z
  .object({
    values: settingsSchema.partial(),
    /** Where the values come from, e.g. "ERT memo 2026-10-12". */
    source: z.string().trim().min(3).max(200),
    reason: z.string().trim().min(5).max(300),
  })
  .refine((v) => Object.keys(v.values).length > 0, { message: 'Nothing to update' })
  .refine(
    (v) =>
      v.values.ackTargetSeconds === undefined ||
      v.values.escalateAfterSeconds === undefined ||
      v.values.escalateAfterSeconds > v.values.ackTargetSeconds,
    { message: 'Escalation must come after the acknowledgement target' },
  );

export interface SettingsView {
  values: SystemSettings;
  /** Per key: null while the DEMO default is in use. */
  meta: Record<
    keyof SystemSettings,
    { source: string; updatedAt: string; updatedBy: string } | null
  >;
}

export interface AnalyticsView {
  window: { from: string; to: string; days: number };
  dataNote: string;
  reports: {
    total: number;
    byCategory: Record<string, number>;
    byKind: Record<string, number>;
    byVerification: Record<string, number>;
  };
  helpRequests: {
    total: number;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
    acknowledged: number;
    medianAckSeconds: number | null;
    p90AckSeconds: number | null;
    overAckTarget: number;
    ackTargetSeconds: number;
  };
  drills: { name: string; participants: number; safe: number; needHelp: number }[];
  photos: { uploaded: number; attached: number };
}
