import { getMessages, LANGUAGES, useI18n, type Language } from '../../../i18n';

export function LanguageSwitcher({ onChange }: { onChange: (language: Language) => void }) {
  const { language, t } = useI18n();
  return (
    <div className="sc-language">
      <div role="group" aria-label={t.languageLabel} className="sc-language-buttons">
        {(Object.keys(LANGUAGES) as Language[]).map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={language === code}
            className="sc-language-button"
            onClick={() => onChange(code)}
          >
            {getMessages(code).languageName}
          </button>
        ))}
      </div>
      {LANGUAGES[language].review === 'UNREVIEWED_DRAFT' && <p className="sc-small">{t.unreviewedTranslation}</p>}
    </div>
  );
}
