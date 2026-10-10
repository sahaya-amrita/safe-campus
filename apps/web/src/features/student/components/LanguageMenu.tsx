import { useEffect, useId, useRef, useState } from 'react';
import { LOCALES, useI18n, type Language } from '../../../i18n';
import { Icon } from './Icon';

/**
 * Language picker: a disclosure button plus a list of toggle buttons. Each
 * language is named in its own script; drafts carry a visible badge.
 * Escape or an outside click closes it and returns focus to the trigger.
 */
export function LanguageMenu({ onChange }: { onChange: (language: Language) => void }) {
  const { language, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = LOCALES.find((l) => l.code === language) ?? LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (code: Language) => {
    onChange(code);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="sc-lang" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="sc-lang-trigger"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t.languageLabel}: ${current.nativeName}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="globe" size={18} />
        <span lang={current.code}>{current.nativeName}</span>
        <Icon name="chevron" size={16} className={open ? 'sc-rotate' : undefined} />
      </button>
      <div id={listId} className="sc-lang-panel" hidden={!open} role="group" aria-label={t.languageLabel}>
        {LOCALES.map((locale) => (
          <button
            key={locale.code}
            type="button"
            className="sc-lang-option"
            aria-pressed={locale.code === language}
            onClick={() => choose(locale.code)}
          >
            <span className="sc-lang-native" lang={locale.code}>
              {locale.nativeName}
            </span>
            <span className="sc-lang-meta">
              {locale.englishName}
              {locale.review === 'UNREVIEWED_DRAFT' && <span className="sc-lang-draft">{t.languageDraftBadge}</span>}
            </span>
            {locale.code === language && <Icon name="check" size={18} className="sc-lang-tick" />}
          </button>
        ))}
      </div>
    </div>
  );
}
