import { CriticalText } from '../../../i18n/CriticalText';
import { useI18n } from '../../../i18n';
import { Icon } from './Icon';

/**
 * India's national emergency number. It is not a campus or Amrita number,
 * and a call depends on mobile network coverage — the card says both.
 */
export function EmergencyCard() {
  const { t } = useI18n();
  return (
    <section className="sc-emergency" aria-labelledby="sc-emergency-heading">
      <h2 id="sc-emergency-heading" className="sc-emergency-title">
        {t.emergencyHeading}
      </h2>
      <a className="sc-call" href="tel:112">
        <span className="sc-call-icon">
          <Icon name="phone" size={22} />
        </span>
        <span className="sc-call-text">{t.emergencyCall}</span>
      </a>
      <p className="sc-emergency-source">{t.emergencyCallSource}</p>
      <CriticalText k="emergencyLimitation" className="sc-emergency-limit" leading={<Icon name="info" size={16} />} />
    </section>
  );
}
