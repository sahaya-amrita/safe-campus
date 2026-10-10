import { createContext, useContext } from 'react';
import { FALLBACK_LANGUAGE, getLocale, isLanguage, isReviewedForSafety, type Language } from './locales';
import type { Messages } from './messages';

export type { Messages, SafetyCriticalKey } from './messages';
export { SAFETY_CRITICAL_KEYS } from './messages';
export {
  FALLBACK_LANGUAGE,
  getLocale,
  isLanguage,
  isReviewedForSafety,
  LOCALES,
  type Language,
  type LocaleDefinition,
  type ReviewStatus,
  type Script,
} from './locales';

export function getMessages(language: Language): Messages {
  return getLocale(language).messages;
}

const LANGUAGE_STORAGE_KEY = 'safe-campus.student.language';

/** Reads the saved language; falls back to English if storage is unavailable or the value is unknown. */
export function loadSavedLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(saved) ? saved : FALLBACK_LANGUAGE;
  } catch {
    // Storage blocked (private mode etc.): use the default.
    return FALLBACK_LANGUAGE;
  }
}

export function saveLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Non-critical preference; the choice still applies for this session.
  }
}

export interface I18n {
  language: Language;
  t: Messages;
  /** English source strings, for explicit fallbacks next to unreviewed drafts. */
  source: Messages;
  /** False for draft locales: safety-critical text must also show the English source. */
  reviewedForSafety: boolean;
  formatTime: (iso: string) => string;
  formatDate: (iso: string) => string;
}

export function createI18n(language: Language, now: () => Date = () => new Date()): I18n {
  const { intlLocale, messages } = getLocale(language);
  return {
    language,
    t: messages,
    source: getMessages(FALLBACK_LANGUAGE),
    reviewedForSafety: isReviewedForSafety(language),
    formatTime: (iso) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '—';
      const time = date.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' });
      return date.toDateString() === now().toDateString()
        ? time
        : `${date.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' })} ${time}`;
    },
    formatDate: (iso) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short', year: 'numeric' });
    },
  };
}

export const I18nContext = createContext<I18n>(createI18n(FALLBACK_LANGUAGE));

export function useI18n(): I18n {
  return useContext(I18nContext);
}
