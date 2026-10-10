import { CriticalText } from '../../../i18n/CriticalText';
import { useI18n, type Messages } from '../../../i18n';
import type { SessionView } from '../checkIn/useActiveSession';
import type { OperatingMode } from '../contracts/studentContract';
import { Icon } from './Icon';

function modeLabel(mode: OperatingMode, t: Messages): string {
  switch (mode) {
    case 'DEMO':
      return t.modeDemo;
    case 'DRILL':
      return t.modeDrill;
    case 'TEST':
      return t.modeTest;
    case 'SIMULATION':
      return t.modeSimulation;
  }
}

/** Which drill or incident a check-in will be attached to — required by the contract. */
export function SessionBar({ view }: { view: SessionView }) {
  const { t, formatTime } = useI18n();
  if (view.kind === 'loading') {
    return (
      <p className="sc-session" role="status">
        {t.sessionLoading}
      </p>
    );
  }
  if (view.kind === 'none') {
    return <CriticalText k="sessionNone" className="sc-session sc-session--none" leading={<Icon name="info" size={18} />} />;
  }
  if (view.kind === 'unknown') {
    return (
      <p className="sc-session sc-session--unknown">
        <Icon name="cloudAlert" size={18} /> <span>{t.sessionUnknown}</span>
      </p>
    );
  }
  return (
    <p className="sc-session" data-testid="session-bar">
      <span className="sc-mode">{modeLabel(view.session.mode, t)}</span>
      <span className="sc-session-text">
        {t.sessionFor(view.session.name)}
        {view.fromCache && <span className="sc-meta-line"> · {t.sessionLastChecked(formatTime(view.checkedAt))}</span>}
      </span>
    </p>
  );
}
