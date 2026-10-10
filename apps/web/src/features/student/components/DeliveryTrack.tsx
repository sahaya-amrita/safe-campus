import { useI18n } from '../../../i18n';
import type { MessageDeliveryStatus } from '../contracts/studentContract';
import { Icon, type IconName } from './Icon';

type StepStatus = 'done' | 'current' | 'paused' | 'failed' | 'todo' | 'untracked';

/**
 * Where each step stands for a delivery status. The last step is "untracked"
 * unless the server itself reports ACKNOWLEDGED — which the current API never
 * does for students — so the app never claims a responder has seen anything.
 */
export function trackFor(status: MessageDeliveryStatus): [StepStatus, StepStatus, StepStatus, StepStatus] {
  switch (status) {
    case 'LOCAL_ONLY':
    case 'QUEUED':
      return ['done', 'paused', 'todo', 'untracked'];
    case 'SENDING':
      return ['done', 'current', 'todo', 'untracked'];
    case 'SERVER_RECEIVED':
      return ['done', 'done', 'done', 'untracked'];
    case 'ACKNOWLEDGED':
      return ['done', 'done', 'done', 'done'];
    case 'FAILED':
      return ['done', 'failed', 'todo', 'untracked'];
  }
}

const MARK: Partial<Record<StepStatus, IconName>> = { done: 'check', paused: 'pause', failed: 'x' };

export function DeliveryTrack({ status }: { status: MessageDeliveryStatus }) {
  const { t } = useI18n();
  const statuses = trackFor(status);
  const labels = [t.stepSaved, t.stepSent, t.stepReceived, t.stepResponder];
  const reached = statuses.reduce((last, s, i) => (s === 'todo' || s === 'untracked' ? last : i), 0);

  return (
    <ol className="sc-track" aria-label={t.trackLabel} data-testid="delivery-track">
      {labels.map((label, index) => {
        const step = statuses[index] ?? 'todo';
        const mark = MARK[step];
        return (
          <li key={label} className={`sc-step sc-step--${step}`} data-step-status={step} aria-current={index === reached ? 'step' : undefined}>
            <span className="sc-step-dot">{mark ? <Icon name={mark} size={14} /> : <span>{index + 1}</span>}</span>
            <span className="sc-step-label">
              {label}
              {step === 'untracked' && <span className="sc-step-note">{t.stepResponderUntracked}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
