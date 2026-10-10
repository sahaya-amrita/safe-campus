import { useI18n } from '../../../i18n';

export type ConnectionView = 'online' | 'offline' | 'server-unreachable';

/** Text + icon, never colour alone, so online and offline cannot be confused. */
export function ConnectionStatus({ view }: { view: ConnectionView }) {
  const { t } = useI18n();
  const text =
    view === 'online' ? t.connectionOnline : view === 'offline' ? t.connectionOffline : t.connectionServerUnreachable;
  const icon = view === 'online' ? '●' : '⚠';
  return (
    <p className={`sc-connection sc-connection--${view}`} role="status" data-testid="connection-status">
      <span aria-hidden="true">{icon}</span> {text}
    </p>
  );
}
