import { en } from './en';
import { hi } from './hi';
import { kn } from './kn';
import type { Messages } from './messages';
import { ml } from './ml';
import { ta } from './ta';
import { te } from './te';

/**
 * Review status of a locale's UI strings.
 * - SOURCE: the language every other locale is translated from.
 * - REVIEWED: checked by a native speaker and approved for safety-critical use.
 * - UNREVIEWED_DRAFT: shown with a "draft" badge; safety-critical strings also
 *   show the English source (see CriticalText).
 */
export type ReviewStatus = 'SOURCE' | 'REVIEWED' | 'UNREVIEWED_DRAFT';

export type Script = 'latin' | 'tamil' | 'devanagari' | 'malayalam' | 'telugu' | 'kannada';

export interface LocaleDefinition {
  code: string;
  /** Name in its own script, shown in the language menu. */
  nativeName: string;
  englishName: string;
  /** BCP 47 locale for dates and times. */
  intlLocale: string;
  script: Script;
  review: ReviewStatus;
  messages: Messages;
}

/**
 * To add a language: create `<code>.ts` implementing `Messages`, then add one
 * entry here. Keep `review: 'UNREVIEWED_DRAFT'` until a native speaker and the
 * institution have signed it off.
 */
export const LOCALES = [
  { code: 'en', nativeName: 'English', englishName: 'English', intlLocale: 'en-IN', script: 'latin', review: 'SOURCE', messages: en },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', intlLocale: 'ta-IN', script: 'tamil', review: 'UNREVIEWED_DRAFT', messages: ta },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', intlLocale: 'hi-IN', script: 'devanagari', review: 'UNREVIEWED_DRAFT', messages: hi },
  { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam', intlLocale: 'ml-IN', script: 'malayalam', review: 'UNREVIEWED_DRAFT', messages: ml },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', intlLocale: 'te-IN', script: 'telugu', review: 'UNREVIEWED_DRAFT', messages: te },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada', intlLocale: 'kn-IN', script: 'kannada', review: 'UNREVIEWED_DRAFT', messages: kn },
] as const satisfies readonly LocaleDefinition[];

export type Language = (typeof LOCALES)[number]['code'];

/** The approved language used for explicit fallbacks. */
export const FALLBACK_LANGUAGE: Language = 'en';

export function getLocale(code: Language): LocaleDefinition {
  // LOCALES always contains every Language code by construction.
  return LOCALES.find((l) => l.code === code) as LocaleDefinition;
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && LOCALES.some((l) => l.code === value);
}

export function isReviewedForSafety(code: Language): boolean {
  const { review } = getLocale(code);
  return review === 'SOURCE' || review === 'REVIEWED';
}
