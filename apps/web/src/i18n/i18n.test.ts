import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { createI18n, LANGUAGES, loadSavedLanguage, saveLanguage } from './index';
import { ta } from './ta';

afterEach(() => localStorage.clear());

const TAMIL_SCRIPT = /[஀-௿]/;

describe('dictionaries', () => {
  it('Tamil defines exactly the same keys as English', () => {
    expect(Object.keys(ta).sort()).toEqual(Object.keys(en).sort());
  });

  it('every Tamil string except technical placeholders contains Tamil script', () => {
    for (const [key, value] of Object.entries(ta)) {
      const text = typeof value === 'function' ? (value as (...a: unknown[]) => string)('X', 1) : value;
      expect(text, key).toMatch(TAMIL_SCRIPT);
    }
  });

  it('critical safety strings keep the 112 number and NOT-delivered meaning in both languages', () => {
    for (const t of [en, ta]) {
      expect(t.emergencyCall).toContain('112');
      expect(t.helpCallFirst).toContain('112');
      expect(t.detailFailedFallback).toContain('112');
    }
  });

  it('Tamil is marked as an unreviewed draft', () => {
    expect(LANGUAGES.ta.review).toBe('UNREVIEWED_DRAFT');
    expect(en.unreviewedTranslation).toBe('');
  });
});

describe('language preference', () => {
  it('defaults to English and remembers a choice', () => {
    expect(loadSavedLanguage()).toBe('en');
    saveLanguage('ta');
    expect(loadSavedLanguage()).toBe('ta');
  });

  it('ignores unknown saved values', () => {
    localStorage.setItem('safe-campus.student.language', 'fr');
    expect(loadSavedLanguage()).toBe('en');
  });
});

describe('createI18n', () => {
  it('formats invalid timestamps safely', () => {
    expect(createI18n('en').formatTime('not-a-date')).toBe('—');
  });
});
