import { useEffect } from 'react';
import type { SahayaApi } from './api/sahaya';
import { useAsync } from './ui';

/** Fired after a drill starts or stops on this device, so banners update at once. */
export const DRILLS_CHANGED = 'sahaya:drills-changed';
export const announceDrillsChanged = () => window.dispatchEvent(new Event(DRILLS_CHANGED));

/**
 * Striped banner while any drill is ACTIVE, for students and staff
 * (blueprint §7.4: DRILL – NOT A REAL EMERGENCY, distinct colour).
 */
export function DrillBanner({ api }: { api: SahayaApi | null }) {
  const drills = useAsync(api ? () => api.drills() : null, [api], 15_000);
  const { reload } = drills;
  useEffect(() => {
    window.addEventListener(DRILLS_CHANGED, reload);
    return () => window.removeEventListener(DRILLS_CHANGED, reload);
  }, [reload]);
  const active = (drills.data?.items ?? []).filter((d) => d.status === 'ACTIVE');
  if (!active.length) return null;
  return (
    <div className="as-drill-banner" role="status">
      <strong>DRILL – NOT A REAL EMERGENCY</strong>
      <span>{active.map((d) => d.name).join(' · ')}</span>
    </div>
  );
}
