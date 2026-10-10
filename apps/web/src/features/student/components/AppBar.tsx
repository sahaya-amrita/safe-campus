import { BRAND } from '../../../brand';
import { CriticalText } from '../../../i18n/CriticalText';
import { useI18n, type Language } from '../../../i18n';
import type { ConnectionView } from './ConnectionStatus';
import { Icon } from './Icon';
import { LanguageMenu } from './LanguageMenu';

interface Props {
  connection: ConnectionView;
  onLanguageChange: (language: Language) => void;
  updateReady: (() => void) | null;
}

/**
 * Sticky top app bar: brand, a compact connectivity indicator, and language.
 * Below it, a one-line prototype banner that stays on every screen.
 */
export function AppBar({ connection, onLanguageChange, updateReady }: Props) {
  const { t } = useI18n();
  const connectionLabel =
    connection === 'online' ? t.connectionOnline : connection === 'offline' ? t.connectionOffline : t.connectionServerUnreachable;
  return (
    <header className="sc-appbar">
      <div className="sc-appbar-row">
        <span className="sc-brand-tile">
          <img src={BRAND.emblemUrl} alt="" width={30} height={35} />
        </span>
        <span className="sc-wordmark" aria-label={BRAND.name}>
          <span className="sc-wordmark-a">{BRAND.nameParts[0]}</span> <span className="sc-wordmark-b">{BRAND.nameParts[1]}</span>
        </span>
        <span
          className={`sc-net sc-net--${connection}`}
          role="img"
          aria-label={connectionLabel}
          title={connectionLabel}
          data-testid="net-indicator"
        >
          <Icon name={connection === 'online' ? 'wifi' : connection === 'offline' ? 'wifiOff' : 'cloudAlert'} size={18} />
        </span>
        <LanguageMenu onChange={onLanguageChange} />
      </div>
      <div className="sc-proto" role="note">
        <CriticalText k="prototypeBody" as="span" className="sc-proto-text" />
      </div>
      {updateReady && (
        <div className="sc-update" role="status">
          <span>{t.updateReady}</span>
          <button type="button" className="sc-btn sc-btn--small sc-btn--light" onClick={updateReady}>
            {t.updateReload}
          </button>
        </div>
      )}
    </header>
  );
}
