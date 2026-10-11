import { useUpdateReady } from '../lib/offline/appShell';

/** Applies a waiting version only when the user chooses to reload. */
export function AppUpdateNotice() {
  const apply = useUpdateReady();
  if (!apply) return null;
  return (
    <aside className="as-update" aria-label="App update">
      <div role="status">
        <strong>A new version is ready</strong>
        <span>Finish what you are doing, then reload to update.</span>
      </div>
      <button type="button" className="as-btn as-btn--sm" onClick={apply}>
        Reload to update
      </button>
    </aside>
  );
}
