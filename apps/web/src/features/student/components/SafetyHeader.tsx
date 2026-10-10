import { useI18n } from '../../../i18n';

/**
 * Always visible: prototype status and the independent emergency path.
 * 112 is India's public national emergency number, not a campus contact;
 * campus contacts are intentionally absent until the institution provides them.
 */
export function SafetyHeader({ usingMockApi }: { usingMockApi: boolean }) {
  const { t } = useI18n();
  return (
    <header className="sc-header">
      <p className="sc-prototype" role="note">
        <strong>{t.prototypeTitle}</strong> {t.prototypeBody}
      </p>
      <div className="sc-emergency">
        <a className="sc-call" href="tel:112">
          {t.emergencyCall}
        </a>
        <span className="sc-small">{t.emergencyCallSource}</span>
        <p className="sc-small">{t.campusContactsMissing}</p>
      </div>
      {usingMockApi && <p className="sc-mock">{t.mockServerNotice}</p>}
    </header>
  );
}
