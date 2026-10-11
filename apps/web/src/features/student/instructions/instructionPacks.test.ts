import { describe, expect, it } from 'vitest';
import { MemoryPackCacheStore } from '../../../lib/offline';
import type { PackListResult, StudentApi } from '../api/studentApi';
import type { InstructionPackApprovalState, StudentInstructionPack } from '../contracts/studentContract';
import { classifyPack, packSections, readCachedPacks, refreshPacks, STALE_AFTER_MS, toDisplayPacks } from './instructionPacks';

const now = new Date('2026-10-10T09:00:00.000Z');

function pack(overrides: Partial<StudentInstructionPack>): StudentInstructionPack {
  return {
    id: 'p1',
    version: '1.0.0',
    language: 'en',
    title: 'Fire',
    content: { sections: [{ heading: 'H', body: 'B' }] },
    contentHash: 'a'.repeat(64),
    sourceLabel: 'Campus Security Office',
    approvalState: 'PUBLISHED',
    publishedAt: '2026-10-01T00:00:00Z',
    expiresAt: null,
    ...overrides,
  };
}

function apiReturning(result: PackListResult): StudentApi {
  return {
    submitCheckIn: async () => ({ kind: 'retryable', problem: 'OFFLINE' }),
    getActiveSession: async () => ({ kind: 'none' }),
    listInstructionPacks: async () => result,
  };
}

describe('classifyPack', () => {
  it.each<[InstructionPackApprovalState, string | null]>([
    ['PUBLISHED', 'OFFICIAL'],
    ['APPROVED', null],
    ['DRAFT', null],
    ['REJECTED', null],
    ['RETIRED', null],
  ])('%s → %s', (approvalState, expected) => {
    expect(classifyPack({ approvalState })).toBe(expected);
  });

  it('always labels mock samples as samples, whatever their state', () => {
    expect(classifyPack({ approvalState: 'PUBLISHED', demoSample: true })).toBe('DEMO_SAMPLE');
  });

  it('labels DEMO-mode packs from the API as samples, never official', () => {
    expect(classifyPack({ approvalState: 'PUBLISHED', mode: 'DEMO' })).toBe('DEMO_SAMPLE');
    expect(classifyPack({ approvalState: 'DRAFT', mode: 'DEMO' })).toBeNull();
    expect(classifyPack({ approvalState: 'PUBLISHED', mode: 'LIVE' })).toBe('OFFICIAL');
  });
});

describe('packSections', () => {
  it('renders { sections } and { body } content', () => {
    expect(packSections(pack({}))).toEqual([{ heading: 'H', body: 'B' }]);
    expect(packSections(pack({ title: 'T', content: { body: 'Plain text' } }))).toEqual([{ heading: 'T', body: 'Plain text' }]);
  });

  it('refuses unknown or partially invalid content instead of guessing', () => {
    expect(packSections(pack({ content: { steps: ['a'] } }))).toBeNull();
    expect(packSections(pack({ content: { sections: [{ heading: 'ok', body: 'ok' }, { heading: 1 }] } }))).toBeNull();
  });
});

describe('toDisplayPacks', () => {
  it('flags expired packs and stale cached copies', () => {
    const longAgo = new Date(now.getTime() - STALE_AFTER_MS - 1000).toISOString();
    const [expired, stale, fresh] = toDisplayPacks(
      [
        { pack: pack({ id: 'a', expiresAt: '2026-10-09T00:00:00Z' }), group: 'en', fetchedAt: now.toISOString() },
        { pack: pack({ id: 'b' }), group: 'en', fetchedAt: longAgo },
        { pack: pack({ id: 'c', expiresAt: '2027-01-01T00:00:00Z' }), group: 'en', fetchedAt: now.toISOString() },
      ],
      now,
    );
    expect(expired).toMatchObject({ expired: true, stale: false });
    expect(stale).toMatchObject({ expired: false, stale: true });
    expect(fresh).toMatchObject({ expired: false, stale: false });
  });

  it('never displays unpublished packs and puts official ones first', () => {
    const display = toDisplayPacks(
      [
        { pack: pack({ id: 'demo', approvalState: 'DRAFT', demoSample: true }), group: 'en', fetchedAt: now.toISOString() },
        { pack: pack({ id: 'draft', approvalState: 'DRAFT' }), group: 'en', fetchedAt: now.toISOString() },
        { pack: pack({ id: 'official' }), group: 'en', fetchedAt: now.toISOString() },
      ],
      now,
    );
    expect(display.map((d) => d.pack.id)).toEqual(['official', 'demo']);
  });
});

describe('refreshPacks', () => {
  it('caches only displayable packs for the requested language', async () => {
    const store = new MemoryPackCacheStore<StudentInstructionPack>();
    const api = apiReturning({
      kind: 'ok',
      packs: [pack({ id: 'ok' }), pack({ id: 'draft', approvalState: 'DRAFT' }), pack({ id: 'ta', language: 'ta' })],
    });
    const view = await refreshPacks(api, store, 'en', [], now);
    expect(view.refresh).toBe('fresh');
    expect(view.packs.map((p) => p.pack.id)).toEqual(['ok']);
    expect(store.records.map((r) => r.pack.id)).toEqual(['ok']);
  });

  it('keeps the cached copy and reports the reason when refresh fails', async () => {
    const store = new MemoryPackCacheStore<StudentInstructionPack>();
    await store.replaceGroup('en', [{ pack: pack({ id: 'cached' }), group: 'en', fetchedAt: '2026-10-09T00:00:00Z' }]);
    const cached = await readCachedPacks(store, 'en', now);
    const view = await refreshPacks(apiReturning({ kind: 'error', problem: 'TIMEOUT' }), store, 'en', cached.packs, now);
    expect(view.refresh).toBe('TIMEOUT');
    expect(view.packs.map((p) => p.pack.id)).toEqual(['cached']);
  });

  it('reports an unreadable cache instead of throwing', async () => {
    const store = new MemoryPackCacheStore<StudentInstructionPack>();
    store.failReads = true;
    expect(await readCachedPacks(store, 'en', now)).toEqual({ packs: [], storageFailed: true });
  });
});
