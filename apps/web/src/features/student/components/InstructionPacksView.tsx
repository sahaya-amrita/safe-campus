import { CriticalText } from '../../../i18n/CriticalText';
import { getLocale, isLanguage, useI18n, type Messages } from '../../../i18n';
import type { DisplayPack, RefreshStatus } from '../instructions/instructionPacks';
import type { PacksDisplay } from '../instructions/useInstructionPacks';
import { Icon } from './Icon';

function refreshNotice(refresh: RefreshStatus, t: Messages): string | null {
  switch (refresh) {
    case 'checking':
    case 'fresh':
      return null;
    case 'OFFLINE':
      return t.packsRefreshOffline;
    case 'TIMEOUT':
      return t.packsRefreshTimeout;
    case 'PERMISSION_DENIED':
      return t.packsRefreshPermission;
    default:
      return t.packsRefreshFailed;
  }
}

function languageName(code: string): string {
  return isLanguage(code) ? getLocale(code).nativeName : code;
}

export function InstructionPacksView({ view }: { view: PacksDisplay | null }) {
  const { t } = useI18n();
  const notice = view ? refreshNotice(view.refresh, t) : null;
  return (
    <section className="sc-section" aria-labelledby="sc-packs-heading" data-testid="instruction-packs">
      <h2 id="sc-packs-heading" className="sc-h2">
        <Icon name="book" />
        {t.packsHeading}
      </h2>
      {!view && (
        <p className="sc-meta-line" role="status">
          {t.packsLoading}
        </p>
      )}
      {view?.fallbackFrom && (
        <p className="sc-callout sc-callout--info" role="status" data-testid="packs-fallback">
          <Icon name="globe" size={18} /> {t.packsFallback(languageName(view.fallbackFrom))}
        </p>
      )}
      {notice && (
        <p className="sc-callout sc-callout--warn" role="status">
          {notice}
        </p>
      )}
      {view?.storageFailed && <p className="sc-callout sc-callout--warn">{t.packsStorageFailed}</p>}
      {view && view.packs.length === 0 && view.refresh !== 'checking' && <p className="sc-empty">{t.packsNone}</p>}
      {view?.packs.map((item) => <PackCard key={item.pack.id} item={item} />)}
    </section>
  );
}

function PackCard({ item }: { item: DisplayPack }) {
  const { t, formatDate, formatTime } = useI18n();
  const { pack } = item;
  const official = item.kind === 'OFFICIAL';
  return (
    <article
      id={`pack-${pack.version}`}
      className={`sc-pack ${official ? 'sc-pack--official' : 'sc-pack--sample'}`}
      data-testid="pack"
    >
      <details className="sc-pack-fold">
        <summary className="sc-pack-summary">
          <span className="sc-pack-summary-title">{pack.title}</span>
          <span className={official ? 'sc-badge sc-badge--official' : 'sc-badge sc-badge--sample'}>
            <Icon name={official ? 'shield' : 'info'} size={16} />
            {official ? t.packOfficial(pack.sourceLabel) : t.packSample}
          </span>
        </summary>
      {!official && <p className="sc-meta-line">{pack.sourceLabel}</p>}
      {item.expired && <CriticalText k="packExpired" role="alert" className="sc-callout sc-callout--danger" />}
      {!item.expired && item.stale && <p className="sc-callout sc-callout--warn">{t.packStale}</p>}
      <div className="sc-pack-body" lang={pack.language}>
        {item.sections ? (
          item.sections.map((section, index) => (
            <div key={`${pack.id}-${index}`} className="sc-pack-section">
              <h4 className="sc-h4">{section.heading}</h4>
              <p>{section.body}</p>
            </div>
          ))
        ) : (
          <p className="sc-callout sc-callout--warn">{t.packUnreadable}</p>
        )}
      </div>
      <ul className="sc-pack-meta">
        <li>{t.packVersion(pack.version)}</li>
        <li>{t.packLanguage(languageName(pack.language))}</li>
        {pack.publishedAt && <li>{t.packPublished(formatDate(pack.publishedAt))}</li>}
        {pack.expiresAt && <li>{t.packExpires(formatDate(pack.expiresAt))}</li>}
        <li>{t.packSavedOnPhone(`${formatDate(item.fetchedAt)} ${formatTime(item.fetchedAt)}`)}</li>
      </ul>
      </details>
    </article>
  );
}
