import { createContext, useContext } from 'react';
import { en } from './en';
import type { Messages } from './messages';
import { ta } from './ta';

export type { Messages } from './messages';

export type Language = 'en' | 'ta';

export interface LanguageInfo {
  code: Language;
  /** BCP 47 locale used for dates and times. */
  locale: string;
  /** UNREVIEWED strings show a notice while that language is selected. */
  review: 'SOURCE' | 'UNREVIEWED_DRAFT' | 'REVIEWED';
}

export const LANGUAGES: Record<Language, LanguageInfo> = {
  en: { code: 'en', locale: 'en-IN', review: 'SOURCE' },
  ta: { code: 'ta', locale: 'ta-IN', review: 'UNREVIEWED_DRAFT' },
};

const DICTIONARIES: Record<Language, Messages> = { en, ta };

export function getMessages(language: Language): Messages {
  return DICTIONARIES[language];
}

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ta';
}

const LANGUAGE_STORAGE_KEY = 'safe-campus.student.language';

/** Reads the saved language; falls back to English if storage is unavailable. */
export function loadSavedLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(saved) ? saved : 'en';
  } catch {
    // Storage blocked (private mode etc.): use the default.
    return 'en';
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
  formatTime: (iso: string) => string;
  formatDate: (iso: string) => string;
}

export function createI18n(language: Language, now: () => Date = () => new Date()): I18n {
  const { locale } = LANGUAGES[language];
  return {
    language,
    t: getMessages(language),
    formatTime: (iso) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '—';
      const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return date.toDateString() === now().toDateString()
        ? time
        : `${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ${time}`;
    },
    formatDate: (iso) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    },
  };
}

export const I18nContext = createContext<I18n>(createI18n('en'));

export function useI18n(): I18n {
  return useContext(I18nContext);
}
