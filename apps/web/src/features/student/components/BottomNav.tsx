import { useI18n } from '../../../i18n';
import { Icon, type IconName } from './Icon';

export type Screen = 'home' | 'guides' | 'activity';

const ITEMS: { id: Screen; icon: IconName; label: (t: ReturnType<typeof useI18n>['t']) => string }[] = [
  { id: 'home', icon: 'shield', label: (t) => t.navHome },
  { id: 'guides', icon: 'book', label: (t) => t.navGuides },
  { id: 'activity', icon: 'clock', label: (t) => t.navActivity },
];

/**
 * Feature-local tab bar (no URL routing: the shared router belongs to the
 * integration owner). Fixed to the bottom with the phone's safe-area inset.
 */
export function BottomNav({ current, onChange, badge }: { current: Screen; onChange: (s: Screen) => void; badge: number }) {
  const { t } = useI18n();
  return (
    <nav className="sc-tabbar" aria-label={t.navLabel}>
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="sc-tab"
          aria-current={current === item.id ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          <span className="sc-tab-icon">
            <Icon name={item.icon} size={22} />
            {item.id === 'activity' && badge > 0 && (
              <span className="sc-tab-badge" aria-hidden="true">
                {badge}
              </span>
            )}
          </span>
          <span className="sc-tab-label">{item.label(t)}</span>
        </button>
      ))}
    </nav>
  );
}
