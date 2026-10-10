import { CriticalText } from '../../../i18n/CriticalText';
import { useI18n } from '../../../i18n';
import { Icon, type IconName } from './Icon';

export type ConnectionView = 'online' | 'offline' | 'server-unreachable';

const ICON: Record<ConnectionView, IconName> = {
  online: 'wifi',
  offline: 'wifiOff',
  'server-unreachable': 'cloudAlert',
};

/**
 * Connection plus a count of check-ins not yet confirmed. Text and icon,
 * never colour alone, so online and offline cannot be confused.
 */
export function ConnectionStatus({ view, waiting }: { view: ConnectionView; waiting: number }) {
  const { t } = useI18n();
  return (
    <div className={`sc-conn sc-conn--${view}`} role="status" data-testid="connection-status">
      <Icon name={ICON[view]} size={20} />
      <div className="sc-conn-text">
        {view === 'online' ? (
          <p className="sc-conn-main">{t.connectionOnline}</p>
        ) : (
          <CriticalText k={view === 'offline' ? 'connectionOffline' : 'connectionServerUnreachable'} className="sc-conn-main" />
        )}
        {waiting > 0 && <p className="sc-conn-sub">{t.waitingToSend(waiting)}</p>}
      </div>
    </div>
  );
}
