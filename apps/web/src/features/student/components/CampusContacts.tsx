import { useI18n } from '../../../i18n';
import { Icon } from './Icon';

/**
 * Campus contacts are intentionally empty: they must come from the
 * institution through an approved source and are never guessed.
 */
export function CampusContacts() {
  const { t } = useI18n();
  return (
    <section className="sc-section" aria-labelledby="sc-contacts-heading">
      <h2 id="sc-contacts-heading" className="sc-h2">
        <Icon name="users" />
        {t.contactsHeading}
      </h2>
      <div className="sc-placeholder" data-testid="campus-contacts">
        <p>{t.contactsNone}</p>
        <p className="sc-meta-line">{t.contactsMeanwhile}</p>
      </div>
    </section>
  );
}
