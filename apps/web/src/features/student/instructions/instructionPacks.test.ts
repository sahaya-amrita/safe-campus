import { describe, expect, it } from 'vitest';
import { MemoryPackCacheStore } from '../../../lib/offline';
import type { PackListResult, StudentApi } from '../api/studentApi';
import type { InstructionPackWithContent } from '../contracts/provisional';
import { classifyPack, readCachedPacks, refreshPacks, STALE_AFTER_MS, toDisplayPacks } from './instructionPacks';

const now = new Date('2026-10-10T09:00:00.000Z');

function pack(overrides: Partial<InstructionPackWithContent>): InstructionPackWithContent {
  return {
    id: 'p1',
    version: '1.0.0',
    language: 'en',
    publishedAt: '2026-10-01T00:00:00Z',
    contentHash: 'h',
    sourceLabel: 'Campus Security Office',
    approvalState: 'APPROVED',
    sections: [{ heading: 'H', body: 'B' }],
    ...overrides,
  };
}

function apiReturning(result: PackListResult): StudentApi {
  return {
    createCheckIn: async () => ({ kind: 'retryable', problem: 'OFFLINE' }),
    listInstructionPacks: async () => result,
  };
}

describe('classifyPack', () => {
  it.each([
    ['APPROVED', 'OFFICIAL'],
    ['PUBLISHED', 'OFFICIAL'],
    ['DEMO_SAMPLE', 'DEMO_SAMPLE'],
    ['DRAFT', null],
    ['REJECTED', null],
    ['', null],
  ])('%s → %s', (approvalState, expected) => {
    expect(classifyPack({ approvalState })).toBe(expected);
  });
});

describe('toDisplayPacks', () => {
  it('flags expired packs and stale cached copies', () => {
    const fetchedLongAgo = new Date(now.getTime() - STALE_AFTER_MS - 1000).toISOString();
    const [expired, stale, fresh] = toDisplayPacks(
      [
        { pack: pack({ id: 'a', expiresAt: '2026-10-09T00:00:00Z' }), group: 'en', fetchedAt: now.toISOString() },
        { pack: pack({ id: 'b' }), group: 'en', fetchedAt: fetchedLongAgo },
        { pack: pack({ id: 'c', expiresAt: '2027-01-01T00:00:00Z' }), group: 'en', fetchedAt: now.toISOString() },
      ],
      now,
    );
    expect(expired).toMatchObject({ expired: true, stale: false });
    expect(stale).toMatchObject({ expired: false, stale: true });
    expect(fresh).toMatchObject({ expired: false, stale: false });
  });

  it('never displays unapproved packs and puts official ones first', () => {
    const display = toDisplayPacks(
      [
        { pack: pack({ id: 'demo', approvalState: 'DEMO_SAMPLE' }), group: 'en', fetchedAt: now.toISOString() },
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
    const store = new MemoryPackCacheStore<InstructionPackWithContent>();
    const api = apiReturning({
      kind: 'ok',
      packs: [pack({ id: 'ok' }), pack({ id: 'draft', approvalState: 'DRAFT' }), pack({ id: 'wrong-lang', language: 'ta' })],
    });
    const view = await refreshPacks(api, store, 'en', [], now);
    expect(view.refresh).toBe('fresh');
    expect(view.packs.map((p) => p.pack.id)).toEqual(['ok']);
    expect(store.records.map((r) => r.pack.id)).toEqual(['ok']);
  });

  it('keeps the cached copy and reports the reason when refresh fails', async () => {
    const store = new MemoryPackCacheStore<InstructionPackWithContent>();
    await store.replaceGroup('en', [{ pack: pack({ id: 'cached' }), group: 'en', fetchedAt: '2026-10-09T00:00:00Z' }]);
    const cached = await readCachedPacks(store, 'en', now);
    const view = await refreshPacks(apiReturning({ kind: 'error', problem: 'TIMEOUT' }), store, 'en', cached.packs, now);
    expect(view.refresh).toBe('TIMEOUT');
    expect(view.packs.map((p) => p.pack.id)).toEqual(['cached']);
  });

  it('reports an unreadable cache instead of throwing', async () => {
    const store = new MemoryPackCacheStore<InstructionPackWithContent>();
    store.failReads = true;
    expect(await readCachedPacks(store, 'en', now)).toEqual({ packs: [], storageFailed: true });
  });
});
