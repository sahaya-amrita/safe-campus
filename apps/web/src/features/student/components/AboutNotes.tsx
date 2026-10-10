import { useI18n } from '../../../i18n';
import { Icon } from './Icon';

/** Secondary notices: demo server and, for draft languages, why English text appears. */
export function AboutNotes({ usingMockApi }: { usingMockApi: boolean }) {
  const { t, reviewedForSafety } = useI18n();
  if (!usingMockApi && reviewedForSafety) return null;
  return (
    <footer className="sc-about">
      {!reviewedForSafety && (
        <p data-testid="draft-notice">
          <Icon name="globe" size={16} />
          <span>{t.draftNotice}</span>
        </p>
      )}
      {usingMockApi && (
        <p>
          <Icon name="info" size={16} />
          <span>{t.mockServerNotice}</span>
        </p>
      )}
    </footer>
  );
}
