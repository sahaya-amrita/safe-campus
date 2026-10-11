import { useState } from 'react';
import type { InsightsResponse, InsightsView } from '@sahaya/contracts';
import type { SahayaApi } from '../api/sahaya';
import { describeProblem } from '../api/client';
import { AppIcon, Card, ErrorNotice, Loading, Pill, useAsync } from '../ui';

/**
 * Insights over synthetic DEMO data. Every figure comes from the API's
 * transparent statistics; the summary is either AI-written and checked
 * against those figures, or written by the app. Patterns describe places,
 * times and categories only. Nothing here is an alert or a risk assessment.
 */

const VIEW_LABEL: Record<InsightsView, string> = {
  student: 'Campus',
  responder: 'Responder',
  verifier: 'Verifier',
  admin: 'Administrator',
};

export function InsightsPanel({
  api,
  initialView,
  compact = false,
  onOpenGuide,
}: {
  api: SahayaApi;
  initialView?: InsightsView;
  /** Student layout: summary, precautions and busiest hours only. */
  compact?: boolean;
  /** Opens a guide by version (student Prepare screen). */
  onOpenGuide?: (version: string) => void;
}) {
  const [view, setView] = useState<InsightsView | undefined>(initialView);
  const data = useAsync(() => api.insights(view), [api, view]);
  const summary = useAsync(() => api.insightsSummary(view), [api, view]);
  const r = data.data;

  if (data.loading && !r) return <Loading label="Working out the patterns…" />;
  if (!r) return <ErrorNotice error={data.error} onRetry={data.reload} />;

  return (
    <div className="as-insights">
      <p className="as-notice as-notice--warn" role="note">
        <strong>Synthetic data.</strong> {r.dataNote}
      </p>

      {!compact && r.availableViews.length > 1 && (
        <div className="as-seg" role="group" aria-label="Insights for">
          {r.availableViews.map((v) => (
            <button key={v} type="button" aria-pressed={r.view === v} onClick={() => setView(v)}>
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
      )}

      <Card title="Summary" icon="info" labelledBy="as-ins-summary">
        {summary.loading && !summary.data ? (
          <Loading label="Writing the summary…" />
        ) : summary.data ? (
          <>
            <p className="as-insights__summary">{summary.data.text}</p>
            <p className="as-small as-muted">
              {summary.data.source === 'AI' ? (
                <>
                  <Pill tone="info">AI summary</Pill> Written by {summary.data.model}, then checked:
                  every number matches the statistics below.
                </>
              ) : (
                <>
                  <Pill tone="neutral">Written by the app</Pill> {summary.data.fallbackReason}
                </>
              )}
            </p>
          </>
        ) : (
          <p className="as-muted as-small">{describeProblem(summary.error)}</p>
        )}
      </Card>

      <div className="as-insights__kpis">
        <Kpi value={r.totals.reports} label="reports, last 30 days" />
        {!compact && <Kpi value={r.totals.helpRequests} label="help requests, last 30 days" />}
        <Kpi value={r.busiestWindow} label="busiest hours (campus time)" />
        {r.acknowledgement && (
          <Kpi
            value={`${r.acknowledgement.medianLast30} s`}
            label={`median time to acknowledge (was ${r.acknowledgement.medianPrevious30} s)`}
          />
        )}
      </div>

      {r.precautions.length > 0 && (
        <Card title="Precautions" icon="shield" labelledBy="as-ins-prec">
          <p className="as-small as-muted">
            Each points to a guide. The app does not invent new safety advice.
          </p>
          <ul className="as-insights__precautions">
            {r.precautions.map((p) => (
              <li key={p.guideVersion + p.pattern}>
                <span>{p.pattern}</span>
                {onOpenGuide ? (
                  <button
                    type="button"
                    className="as-btn as-btn--ghost as-btn--sm"
                    onClick={() => onOpenGuide(p.guideVersion)}
                  >
                    Read “{p.guideTitle}”
                  </button>
                ) : (
                  <small className="as-muted">Guide: {p.guideTitle}</small>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="When reports come in" icon="clock" labelledBy="as-ins-hours">
        <HourChart profile={r.hourProfile} />
      </Card>

      {!compact && (
        <Card title="Trends by category" icon="report" labelledBy="as-ins-trends">
          <TrendBars trends={r.trends} />
        </Card>
      )}

      <Card title="Where reports cluster" icon="pin" labelledBy="as-ins-hot">
        {r.hotspots.length === 0 ? (
          <p className="as-muted">No place stands out in this period.</p>
        ) : (
          <ul className="as-list">
            {(compact ? r.hotspots.slice(0, 3) : r.hotspots).map((h) => (
              <li key={h.place + h.category} className="as-item">
                <div className="as-row as-row--between">
                  <span className="as-item__title">{h.place}</span>
                  <Pill tone="neutral">{h.count}</Pill>
                </div>
                <span className="as-muted as-small">
                  {h.label} · {h.sharePercent}% of that category · mostly {h.busiestHours}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {r.forecast && (
        <Card
          title="Help requests: next 7 days (illustrative)"
          icon="layers"
          labelledBy="as-ins-fc"
        >
          <Forecast forecast={r.forecast} />
        </Card>
      )}

      {r.verification && (
        <Card title="Verification" icon="check" labelledBy="as-ins-ver">
          <div className="as-insights__kpis">
            <Kpi value={`${r.verification.verifiedPercent}%`} label="of decided reports verified" />
            <Kpi value={`${r.verification.dismissedPercent}%`} label="dismissed" />
            <Kpi
              value={r.verification.likelyDuplicateClusters}
              label={`possible duplicate clusters (${r.verification.duplicateRule.toLowerCase()})`}
            />
          </div>
        </Card>
      )}

      <details className="as-card as-details as-fold">
        <summary>
          <AppIcon name="info" size={18} />
          <span className="as-fold__title">How these figures are worked out</span>
        </summary>
        <div className="as-fold__body">
          <ul className="as-small">
            {r.method.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="as-small as-muted">
            Data window {r.window.from} to {r.window.to} ({r.window.days} days). No individual is
            described, ranked or predicted.
          </p>
        </div>
      </details>
    </div>
  );
}

function Kpi({ value, label }: { value: string | number; label: string }) {
  return (
    <p className="as-kpi">
      <strong>{value}</strong>
      <span>{label}</span>
    </p>
  );
}

function HourChart({ profile }: { profile: readonly number[] }) {
  const max = Math.max(1, ...profile);
  return (
    <figure className="as-hours">
      <div className="as-hours__bars" aria-hidden="true">
        {profile.map((v, h) => (
          <span
            key={h}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            title={`${h}:00 · ${v}`}
          />
        ))}
      </div>
      <div className="as-hours__axis" aria-hidden="true">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      <figcaption className="as-sr-only">
        Reports per hour of the day: {profile.map((v, h) => `${h}:00 ${v}`).join(', ')}.
      </figcaption>
    </figure>
  );
}

function TrendBars({ trends }: { trends: InsightsResponse['trends'] }) {
  const max = Math.max(1, ...trends.flatMap((t) => [t.last30, t.previous30]));
  return (
    <ul className="as-trends">
      {trends.map((t) => (
        <li key={t.category}>
          <span className="as-trends__label">{t.label}</span>
          <span className="as-trends__bars" aria-hidden="true">
            <span className="as-trends__prev" style={{ width: `${(t.previous30 / max) * 100}%` }} />
            <span className="as-trends__now" style={{ width: `${(t.last30 / max) * 100}%` }} />
          </span>
          <span className="as-trends__value">
            {t.last30}
            {t.changePercent !== null && (
              <small className={t.changePercent > 0 ? 'as-up' : 'as-down'}>
                {t.changePercent > 0 ? '+' : ''}
                {t.changePercent}%
              </small>
            )}
          </span>
        </li>
      ))}
      <li className="as-trends__legend as-small as-muted">
        Dark: last 30 days · light: the 30 days before
      </li>
    </ul>
  );
}

function Forecast({ forecast }: { forecast: NonNullable<InsightsResponse['forecast']> }) {
  const max = Math.max(1, ...forecast.days.map((d) => d.high));
  return (
    <>
      <ul className="as-forecast">
        {forecast.days.map((d) => (
          <li key={d.date}>
            <span className="as-forecast__day">{d.weekday.slice(0, 3)}</span>
            <span className="as-forecast__track" aria-hidden="true">
              <span
                className="as-forecast__range"
                style={{
                  left: `${(d.low / max) * 100}%`,
                  width: `${((d.high - d.low) / max) * 100}%`,
                }}
              />
              <span
                className="as-forecast__mark"
                style={{ left: `${(d.expected / max) * 100}%` }}
              />
            </span>
            <span className="as-forecast__value">
              ~{d.expected}{' '}
              <small className="as-muted">
                ({d.low}–{d.high})
              </small>
            </span>
          </li>
        ))}
      </ul>
      <p className="as-small as-muted">{forecast.method} Not a staffing plan.</p>
    </>
  );
}
