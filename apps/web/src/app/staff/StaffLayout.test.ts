import { describe, expect, it } from 'vitest';
import { groupNav, phoneTabs, type StaffNavItem } from './StaffLayout';

const item = (id: string, extra: Partial<StaffNavItem> = {}): StaffNavItem => ({
  id,
  section: id,
  path: `/x/${id}`,
  label: id,
  icon: 'grid',
  description: '',
  keywords: [],
  roles: ['ADMIN'],
  ...extra,
});

describe('staff navigation helpers', () => {
  it('picks primary sections for the phone tab bar, then fills in order, up to four', () => {
    const nav = [
      item('a'),
      item('b', { primary: true }),
      item('c'),
      item('d', { primary: true }),
      item('e'),
      item('f'),
    ];
    expect(phoneTabs(nav).map((n) => n.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('lists ungrouped sections first, then the known groups in a fixed order', () => {
    const nav = [
      item('users', { group: 'People' }),
      item('home'),
      item('settings', { group: 'System' }),
      item('drills', { group: 'Operations' }),
      item('audit', { group: 'People' }),
    ];
    expect(groupNav(nav).map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      [null, ['home']],
      ['Operations', ['drills']],
      ['People', ['users', 'audit']],
      ['System', ['settings']],
    ]);
  });
});
