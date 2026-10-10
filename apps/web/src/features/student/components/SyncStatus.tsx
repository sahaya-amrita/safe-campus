import { useI18n } from '../../../i18n';
import type { CheckInEntry } from '../checkIn/checkInQueue';
import { ConnectionStatus, type ConnectionView } from './ConnectionStatus';
import { Icon } from './Icon';

interface Props {
  connection: ConnectionView;
  entries: readonly CheckInEntry[];
  offlineReady: boolean;
  storagePersisted: boolean | null;
}

/** Device-level truth: connection, what is waiting, last server receipt, offline and storage readiness. */
export function SyncStatus({ connection, entries, offlineReady, storagePersisted }: Props) {
  const { t, formatTime } = useI18n();
  const waiting = entries.filter((e) => e.lifecycle === 'QUEUED' || e.lifecycle === 'SENDING').length;
  const lastReceived = entries
    .map((e) => e.result?.serverReceivedAt)
    .filter((v): v is string => typeof v === 'string')
    .sort()
    .at(-1);
  return (
    <section className="sc-section" aria-labelledby="sc-sync-heading" data-testid="sync-status">
      <h2 id="sc-sync-heading" className="sc-h2">
        <Icon name="retry" />
        {t.syncHeading}
      </h2>
      <ConnectionStatus view={connection} waiting={waiting} />
      <ul className="sc-facts">
        <li>{lastReceived ? t.syncLastReceived(formatTime(lastReceived)) : t.syncNever}</li>
        <li data-testid="offline-ready">{offlineReady ? t.offlineReady : t.offlineNotReady}</li>
        {storagePersisted !== null && <li>{storagePersisted ? t.storagePersisted : t.storageNotPersisted}</li>}
      </ul>
    </section>
  );
}
