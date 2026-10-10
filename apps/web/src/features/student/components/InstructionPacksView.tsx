import { useI18n, type Messages } from '../../../i18n';
import type { DisplayPack, PacksView, RefreshStatus } from '../instructions/instructionPacks';

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

export function InstructionPacksView({ view }: { view: PacksView | null }) {
  const { t } = useI18n();
  const notice = view ? refreshNotice(view.refresh, t) : null;
  return (
    <section aria-labelledby="sc-packs-heading" className="sc-section" data-testid="instruction-packs">
      <h2 id="sc-packs-heading">{t.packsHeading}</h2>
      {!view && <p>{t.packsLoading}</p>}
      {notice && (
        <p className="sc-notice" role="status">
          {notice}
        </p>
      )}
      {view?.storageFailed && <p className="sc-notice">{t.packsStorageFailed}</p>}
      {view && view.packs.length === 0 && view.refresh !== 'checking' && <p>{t.packsNone}</p>}
      {view?.packs.map((item) => <PackCard key={item.pack.id} item={item} />)}
    </section>
  );
}

function PackCard({ item }: { item: DisplayPack }) {
  const { t, formatDate, formatTime } = useI18n();
  const { pack } = item;
  return (
    <article className="sc-card sc-pack" lang={pack.language} data-testid="pack">
      <p className={item.kind === 'OFFICIAL' ? 'sc-badge sc-badge--official' : 'sc-badge sc-badge--sample'}>
        {item.kind === 'OFFICIAL' ? t.packOfficial(pack.sourceLabel) : t.packSample}
      </p>
      {item.kind === 'DEMO_SAMPLE' && <p className="sc-small">{pack.sourceLabel}</p>}
      {item.expired && (
        <p className="sc-alert" role="alert">
          {t.packExpired}
        </p>
      )}
      {!item.expired && item.stale && <p className="sc-notice">{t.packStale}</p>}
      <ul className="sc-meta">
        <li>{t.packVersion(pack.version)}</li>
        <li>{t.packLanguage(pack.language)}</li>
        <li>{t.packPublished(formatDate(pack.publishedAt))}</li>
        {pack.expiresAt && <li>{t.packExpires(formatDate(pack.expiresAt))}</li>}
        <li>{t.packSavedOnPhone(`${formatDate(item.fetchedAt)} ${formatTime(item.fetchedAt)}`)}</li>
      </ul>
      {pack.sections.map((section, index) => (
        <div key={`${pack.id}-${index}`} className="sc-pack-section">
          <h3>{section.heading}</h3>
          <p>{section.body}</p>
        </div>
      ))}
    </article>
  );
}
