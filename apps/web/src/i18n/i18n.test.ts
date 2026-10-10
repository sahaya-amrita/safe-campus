import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import {
  createI18n,
  getMessages,
  isReviewedForSafety,
  loadSavedLanguage,
  LOCALES,
  SAFETY_CRITICAL_KEYS,
  saveLanguage,
  type Language,
} from './index';

afterEach(() => localStorage.clear());

const SCRIPT_RANGES: Record<string, RegExp> = {
  tamil: /[஀-௿]/,
  devanagari: /[ऀ-ॿ]/,
  malayalam: /[ഀ-ൿ]/,
  telugu: /[ఀ-౿]/,
  kannada: /[ಀ-೿]/,
};

const render = (value: unknown): string =>
  typeof value === 'function' ? (value as (...a: unknown[]) => string)('X', 1) : String(value);

const translated = LOCALES.filter((l) => l.code !== 'en');

describe('locale registry', () => {
  it('offers the six target languages', () => {
    expect(LOCALES.map((l) => l.code)).toEqual(['en', 'ta', 'hi', 'ml', 'te', 'kn']);
  });

  it('marks every non-English locale as an unreviewed draft', () => {
    for (const locale of translated) {
      expect(locale.review, locale.code).toBe('UNREVIEWED_DRAFT');
      expect(isReviewedForSafety(locale.code), locale.code).toBe(false);
    }
    expect(isReviewedForSafety('en')).toBe(true);
  });

  it('uses the native script for each language name', () => {
    for (const locale of translated) {
      expect(locale.nativeName, locale.code).toMatch(SCRIPT_RANGES[locale.script]!);
      expect(locale.messages.languageName).toBe(locale.nativeName);
    }
  });
});

describe.each(translated.map((l) => [l.code, l] as const))('%s dictionary', (_code, locale) => {
  it('defines exactly the same keys as English', () => {
    expect(Object.keys(locale.messages).sort()).toEqual(Object.keys(en).sort());
  });

  it('has a non-empty string in its own script for every key', () => {
    for (const [key, value] of Object.entries(locale.messages)) {
      const text = render(value);
      expect(text.trim().length, key).toBeGreaterThan(0);
      expect(text, key).toMatch(SCRIPT_RANGES[locale.script]!);
    }
  });

  it('keeps 112 in every string that mentions calling for help', () => {
    for (const key of ['helpCallFirst', 'detailFailedFallback', 'emergencyCall'] as const) {
      expect(locale.messages[key], key).toContain('112');
    }
  });

  it('does not change interpolated values', () => {
    expect(locale.messages.detailReceived('09:41')).toContain('09:41');
    expect(locale.messages.helpNoteCount(12, 500)).toMatch(/12[\s\S]*500|500[\s\S]*12/);
    expect(locale.messages.locationAccuracy(24)).toContain('24');
    expect(locale.messages.locationLowAccuracy(180)).toContain('180');
    expect(locale.messages.photosCount(2, 3)).toMatch(/2[\s\S]*3|3[\s\S]*2/);
    expect(locale.messages.photoErrTooMany(3)).toContain('3');
    expect(locale.messages.sessionFor('Drill X')).toContain('Drill X');
  });

  it('keeps 112 in the no-session warning', () => {
    expect(locale.messages.sessionNone).toContain('112');
  });
});

describe('safety-critical keys', () => {
  it('are all plain strings so the English source can be shown alongside', () => {
    for (const key of SAFETY_CRITICAL_KEYS) expect(typeof en[key], key).toBe('string');
  });

  it('expose English source and reviewed flag through createI18n', () => {
    const i18n = createI18n('hi');
    expect(i18n.reviewedForSafety).toBe(false);
    expect(i18n.source.helpCallFirst).toBe(en.helpCallFirst);
    expect(i18n.t.helpCallFirst).toBe(getMessages('hi').helpCallFirst);
  });
});

describe('language preference', () => {
  it('defaults to English and remembers each choice', () => {
    expect(loadSavedLanguage()).toBe('en');
    for (const code of ['ta', 'hi', 'ml', 'te', 'kn'] as Language[]) {
      saveLanguage(code);
      expect(loadSavedLanguage()).toBe(code);
    }
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
