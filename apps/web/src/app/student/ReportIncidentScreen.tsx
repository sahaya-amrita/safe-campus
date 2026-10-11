import { ReportForm } from './ReportForm';
import { useRoute } from '../router';
import { ROUTES } from '../routes';
import { AppIcon, Card, EmptyState } from '../ui';
import { useStudent } from './core';

export function ReportIncidentScreen() {
  const s = useStudent();
  const { navigate } = useRoute();
  return (
    <>
      <button
        type="button"
        className="as-btn as-btn--ghost as-btn--sm"
        style={{ justifySelf: 'start' }}
        onClick={() => navigate(ROUTES.student.home)}
      >
        <AppIcon name="back" size={16} /> Back
      </button>
      <h1 className="as-screen-title">Report a problem</h1>
      <p className="as-notice as-notice--warn">
        If anyone is in danger, call <a href="tel:112">112</a> first. You do not need to report
        before asking for help.
      </p>
      <Card>
        {s.api ? (
          <ReportForm
            api={s.api}
            online={s.online}
            {...(s.deps.locationEnv ? { locationEnv: s.deps.locationEnv } : {})}
            onDone={() => {
              s.incidents?.reload();
              s.refreshSessions();
            }}
          />
        ) : (
          <EmptyState title="Reporting needs a signed-in API session." />
        )}
      </Card>
    </>
  );
}
