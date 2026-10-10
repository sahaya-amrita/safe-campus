/** Temporary module-local contracts; replace through an adapter when shared contracts exist. */
export interface DrillMilestone {
  readonly id: string;
  readonly atMs: number;
  readonly label: string;
}

export interface DrillScenario {
  readonly id: string;
  readonly dataSource: 'SYNTHETIC';
  readonly durationMs: number;
  readonly milestones: readonly DrillMilestone[];
}

export interface DrillScenarioSource {
  load(): Promise<DrillScenario>;
}

export interface DrillFrame {
  readonly scenarioId: string;
  readonly dataSource: 'SYNTHETIC';
  readonly elapsedMs: number;
  readonly progress: number;
  readonly playbackComplete: boolean;
  readonly reached: readonly DrillMilestone[];
  readonly upcoming: readonly DrillMilestone[];
}

function requireId(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function requireTime(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer in milliseconds`);
  }
}

/**
 * Deterministic, seekable playback only. Completion describes the timeline,
 * never student safety, evacuation success, delivery, or incident verification.
 * No timers, network, geolocation, notices, routing, or responder dispatch.
 */
export function createDrillTimeline(scenario: DrillScenario): (elapsedMs: number) => DrillFrame {
  requireId(scenario.id, 'scenario.id');
  if (scenario.dataSource !== 'SYNTHETIC') {
    throw new TypeError('Only explicitly synthetic scenarios are supported');
  }
  requireTime(scenario.durationMs, 'scenario.durationMs');
  if (scenario.durationMs === 0) {
    throw new RangeError('scenario.durationMs must be greater than zero');
  }

  const ids = new Set<string>();
  const milestones = scenario.milestones.map((milestone) => {
    requireId(milestone.id, 'milestone.id');
    requireId(milestone.label, 'milestone.label');
    requireTime(milestone.atMs, 'milestone.atMs');
    if (ids.has(milestone.id)) {
      throw new TypeError(`Duplicate milestone id: ${milestone.id}`);
    }
    if (milestone.atMs > scenario.durationMs) {
      throw new RangeError('Milestones must occur within the timeline duration');
    }
    ids.add(milestone.id);
    return Object.freeze({ id: milestone.id, atMs: milestone.atMs, label: milestone.label });
  }).sort((a, b) => a.atMs - b.atMs);

  // Snapshot input so caller mutation cannot change an active playback.
  const scenarioId = scenario.id;
  const durationMs = scenario.durationMs;

  return (elapsedMs: number): DrillFrame => {
    requireTime(elapsedMs, 'elapsedMs');
    const time = Math.min(elapsedMs, durationMs);
    return Object.freeze({
      scenarioId,
      dataSource: 'SYNTHETIC',
      elapsedMs: time,
      progress: time / durationMs,
      playbackComplete: time === durationMs,
      reached: Object.freeze(milestones.filter((milestone) => milestone.atMs <= time)),
      upcoming: Object.freeze(milestones.filter((milestone) => milestone.atMs > time)),
    });
  };
}
