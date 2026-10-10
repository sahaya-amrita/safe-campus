import type { DrillScenarioSource } from './timeline.ts';

/** Temporary fixture adapter. No institution-approved data or real-world instructions. */
export const mockDrillScenarioSource: DrillScenarioSource = {
  load() {
    return Promise.resolve({
      id: 'synthetic-playback-example',
      dataSource: 'SYNTHETIC',
      durationMs: 60_000,
      milestones: [
        { id: 'start', atMs: 0, label: 'Synthetic playback starts' },
        { id: 'midpoint', atMs: 30_000, label: 'Synthetic playback midpoint' },
        { id: 'end', atMs: 60_000, label: 'Synthetic playback ends' },
      ],
    });
  },
};
