import type { CampusContact, OfficialResource } from "./campusDirectory";
import { contactsForMode, VERIFICATION_PRESENTATION } from "./campusDirectory";
import type { AppMode } from "./contracts";
import { Icon } from "./Icon";
import { StatusBadge } from "./StatusBadge";

export interface ContactsViewProps {
  contacts: readonly CampusContact[];
  resources: readonly OfficialResource[];
  mode: AppMode;
}

function formatChecked(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t)
    ? date
    : new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function ContactsView({ contacts, resources, mode }: ContactsViewProps) {
  const { shown, withheld } = contactsForMode(contacts, mode);
  return (
    <section aria-labelledby="sc-ct-title" className="sc-view">
      <div className="sc-view__head">
        <h2 id="sc-ct-title">Campus contacts</h2>
        <p className="sc-muted">
          Office and service lines only. Each number shows where it came from and whether the institution has
          confirmed it. Unconfirmed numbers must be confirmed by the institution before a LIVE deployment.
        </p>
      </div>

      {withheld > 0 && (
        <p className="sc-notice sc-notice--warn">
          {withheld} contact{withheld === 1 ? " is" : "s are"} withheld because the institution has not confirmed{" "}
          {withheld === 1 ? "it" : "them"} for LIVE use.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="sc-empty">
          <Icon name="phone" size={28} />
          <p className="sc-empty__title">No confirmed campus contacts are configured</p>
          <p className="sc-muted">Follow your campus's official emergency procedures.</p>
        </div>
      ) : (
        <ul className="sc-contacts" aria-label="Campus contacts">
          {shown.map((c) => {
            const v = VERIFICATION_PRESENTATION[c.verification];
            return (
              <li key={c.id} className={`sc-contact sc-contact--${v.tone}`} data-verification={c.verification}>
                <div className="sc-contact__top">
                  <h3>{c.label}</h3>
                  <StatusBadge label={v.label} icon={v.icon} tone={v.tone} />
                </div>
                <p className="sc-contact__number">
                  <span className="sc-mono">{c.phoneDisplay}</span>
                  <a className="sc-btn sc-btn--ghost" href={`tel:${c.phoneDial}`} aria-label={`Call ${c.label}, ${c.phoneDisplay}`}>
                    <Icon name="phone" size={16} /> Call
                  </a>
                </p>
                <dl className="sc-fields sc-fields--compact">
                  <dt>Source</dt>
                  <dd>
                    {c.source.url ? (
                      <a href={c.source.url} target="_blank" rel="noopener noreferrer">
                        {c.source.label}
                      </a>
                    ) : (
                      c.source.label
                    )}
                  </dd>
                  <dt>Last checked</dt>
                  <dd>{formatChecked(c.lastChecked)}</dd>
                </dl>
                <p className="sc-contact__note">{c.verificationNote}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sc-view__head">
        <h2 id="sc-res-title">Official campus resources</h2>
        <p className="sc-muted">
          General institution pages. No approved emergency instruction pack, evacuation route or assembly point is
          configured in this prototype, so none is shown.
        </p>
      </div>
      <ul className="sc-resources" aria-labelledby="sc-res-title">
        {resources.map((r) => (
          <li key={r.id}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="sc-resource">
              <Icon name="link" size={18} />
              <span>
                <span className="sc-resource__title">{r.title}</span>
                <span className="sc-muted sc-resource__meta">
                  {r.description} {r.publisher}. Last checked {formatChecked(r.lastChecked)}.
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
