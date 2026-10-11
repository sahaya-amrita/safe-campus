import { describe, expect, it } from 'vitest';
import { describeFloorChanges, floorName } from './CampusMapPanel';

describe('floor guidance', () => {
  it('names floors plainly', () => {
    expect(floorName(0)).toBe('ground floor');
    expect(floorName(-1, true)).toBe('Basement level 1');
    expect(floorName(3)).toBe('floor 3');
  });

  it('merges flights in the same direction and never mentions lifts', () => {
    expect(
      describeFloorChanges([
        { atStep: 1, from: 3, to: 2, via: 'STAIRS' },
        { atStep: 2, from: 2, to: 1, via: 'STAIRS' },
        { atStep: 3, from: 1, to: 0, via: 'STAIRS' },
        { atStep: 6, from: 0, to: -1, via: 'RAMP' },
      ]),
    ).toEqual([
      'Take the stairs down from floor 3 to the ground floor.',
      'Take the ramp down from the ground floor to basement level 1.',
    ]);
    expect(describeFloorChanges([{ atStep: 0, from: -1, to: 0, via: 'STAIRS' }])).toEqual([
      'Take the stairs up from basement level 1 to the ground floor.',
    ]);
  });
});
