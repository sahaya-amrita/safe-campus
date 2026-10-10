import { forwardRef } from 'react';
import { BRAND } from '../../../brand';
import { CriticalText } from '../../../i18n/CriticalText';
import { useI18n } from '../../../i18n';
import type { CheckInEntry } from '../checkIn/checkInQueue';
import type { SessionView } from '../checkIn/useActiveSession';
import { EmergencyCard } from './EmergencyCard';
import { Icon } from './Icon';
import { SessionBar } from './SessionBar';
import { SubmissionCard } from './SubmissionCard';

interface Props {
  ready: boolean;
  submitting: boolean;
  session: SessionView;
  latest: CheckInEntry | undefined;
  repeatOf: CheckInEntry | null;
  storageFailed: boolean;
  onSafe: () => void;
  onHelp: () => void;
  onRetry: (key: string) => void;
  photoCount: (key: string) => number;
  onDeletePhotos: (key: string) => void;
}

/** Home: brand welcome, the two primary actions above the fold, latest result and 112. */
export const HomeScreen = forwardRef<HTMLElement, Props>(function HomeScreen(props, latestRef) {
  const { t, formatTime } = useI18n();
  const { ready, submitting, session, latest, repeatOf, storageFailed } = props;
  return (
    <div className="sc-screen">
      <section className="sc-welcome" aria-labelledby="sc-checkin-heading">
        <div className="sc-welcome-brand">
          <span className="sc-brand-tile sc-brand-tile--lg">
            <img src={BRAND.emblemUrl} alt="" width={34} height={39} />
          </span>
          <p className="sc-welcome-tagline" lang="en">
            {BRAND.tagline}
          </p>
        </div>
        <h1 id="sc-checkin-heading" className="sc-hero-title">
          {t.checkInHeading}
        </h1>
        {!ready && (
          <p className="sc-meta-line" role="status">
            {t.checkInLoading}
          </p>
        )}

        <div className="sc-actions">
          <button type="button" className="sc-action sc-action--safe" disabled={submitting || !ready} onClick={props.onSafe}>
            <span className="sc-action-disc">
              <Icon name="check" size={28} />
            </span>
            <span className="sc-action-text">
              <span className="sc-action-label">{t.checkInSafe}</span>
              <span className="sc-action-hint">{t.checkInSafeHint}</span>
            </span>
          </button>
          <button type="button" className="sc-action sc-action--help" disabled={!ready} onClick={props.onHelp}>
            <span className="sc-action-disc">
              <Icon name="hand" size={28} />
            </span>
            <span className="sc-action-text">
              <span className="sc-action-label">{t.checkInNeedHelp}</span>
              <span className="sc-action-hint">{t.checkInNeedHelpHint}</span>
            </span>
          </button>
        </div>
        {/* Context sits below the actions so both buttons stay above the fold in every language. */}
        <SessionBar view={session} />
        <p className="sc-meta-line">{t.checkInPrivacy}</p>

        {repeatOf && (
          <p className="sc-callout sc-callout--info" role="status">
            <Icon name="info" size={18} /> {t.duplicateIgnored(formatTime(repeatOf.createdAt))}
          </p>
        )}
        {storageFailed && (
          <CriticalText k="storageFailed" role="alert" className="sc-callout sc-callout--danger" leading={<Icon name="x" size={18} />} />
        )}
      </section>

      <section className="sc-section" aria-labelledby="sc-latest-heading" aria-live="polite">
        <h2 id="sc-latest-heading" className="sc-h2">
          {t.latestHeading}
        </h2>
        {latest ? (
          <SubmissionCard
            ref={latestRef}
            entry={latest}
            onRetry={props.onRetry}
            photoCount={props.photoCount(latest.key)}
            onDeletePhotos={props.onDeletePhotos}
          />
        ) : (
          ready && <p className="sc-empty">{t.noCheckInsYet}</p>
        )}
      </section>

      <EmergencyCard />
    </div>
  );
});
