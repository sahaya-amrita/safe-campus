import { useState } from 'react';
import { InstructionPacksView } from '../../features/student/components/InstructionPacksView';
import { useInstructionPacks } from '../../features/student/instructions/useInstructionPacks';
import { Card, EmptyState, ErrorNotice, Loading, Pill, formatWhen, useAsync } from '../ui';
import { useStudent } from './core';
import { DrillPractice } from './DrillPractice';
import { InsightsPanel } from '../insights/InsightsPanel';

const TOPICS = [
  { id: 'fire', label: 'Fire & smoke', keywords: ['fire', 'smoke'] },
  { id: 'medical', label: 'Medical help', keywords: ['medical', 'first aid'] },
  { id: 'earthquake', label: 'Earthquake', keywords: ['earthquake'] },
  { id: 'flood', label: 'Flood & storms', keywords: ['flood', 'storm', 'rain'] },
  { id: 'security', label: 'Personal security', keywords: ['security', 'threat'] },
  { id: 'basics', label: 'Preparedness basics', keywords: ['prepared', 'basics'] },
];

export function PrepareScreen() {
  const s = useStudent();
  const packs = useInstructionPacks(s.deps.api, s.deps.packStore, s.language, s.deps.now);
  const progress = useAsync(s.api ? () => s.api!.myProgress() : null, [s.api]);
  const drills = useAsync(s.api ? () => s.api!.drills() : null, [s.api]);
  const [practice, setPractice] = useState(false);
  const titles = (packs?.packs ?? []).map((p) => p.pack.title.toLowerCase());
  const openGuide = (keywords: readonly string[]) => {
    const match = (packs?.packs ?? []).find((p) =>
      keywords.some((k) => p.pack.title.toLowerCase().includes(k)),
    );
    if (!match) return;
    const article = document.getElementById(`pack-${match.pack.version}`);
    const fold = article?.querySelector('details');
    if (fold) fold.open = true;
    article?.scrollIntoView({ block: 'start' });
  };

  return (
    <>
      <h1 className="as-screen-title">Prepare</h1>
      <p className="as-muted">
        Short guides for emergencies, saved on this phone for offline use. In this DEMO they are
        samples, not official campus instructions.
      </p>

      <Card title="Safety topics" icon="book" labelledBy="as-prep-topics">
        <p className="as-muted as-small">
          Questions? Ask Tom (the guide button). Tom answers only from these guides.
        </p>
        <ul className="as-topics">
          {TOPICS.map((topic) => {
            const count = titles.filter((t) => topic.keywords.some((k) => t.includes(k))).length;
            return (
              <li key={topic.id}>
                <button
                  type="button"
                  className="as-topic"
                  disabled={count === 0}
                  onClick={() => openGuide(topic.keywords)}
                >
                  <span className="as-topic__label">{topic.label}</span>
                  <span className="as-topic__meta">
                    {count ? `${count} guide${count === 1 ? '' : 's'} · open` : 'No guide yet'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {s.api && (
        <section className="as-insights-section" aria-labelledby="as-prep-insights">
          <h2 id="as-prep-insights" className="as-section-title">
            Patterns and precautions
          </h2>
          <InsightsPanel
            api={s.api}
            compact
            onOpenGuide={(version) => {
              const article = document.getElementById(`pack-${version}`);
              const fold = article?.querySelector('details');
              if (fold) fold.open = true;
              article?.scrollIntoView({ block: 'start' });
            }}
          />
        </section>
      )}

      <div className="as-card">
        <InstructionPacksView view={packs} />
      </div>

      <Card
        title="Practice drill"
        icon="clock"
        labelledBy="as-prep-drill"
        action={
          <button
            type="button"
            className="as-btn as-btn--ghost as-btn--sm"
            aria-expanded={practice}
            onClick={() => setPractice((v) => !v)}
          >
            {practice ? 'Close' : 'Start'}
          </button>
        }
      >
        <p className="as-muted">
          A short screen-only exercise. No alarms, alerts or contacts are triggered.
        </p>
        {practice && <DrillPractice api={s.api} onSaved={progress.reload} />}
      </Card>

      <Card title="Scheduled drills" icon="users" labelledBy="as-prep-drills">
        {!s.api ? (
          <p className="as-muted">Needs a signed-in API session.</p>
        ) : drills.loading && !drills.data ? (
          <Loading />
        ) : drills.error ? (
          <ErrorNotice error={drills.error} onRetry={drills.reload} />
        ) : drills.data?.items.length ? (
          <ul className="as-list">
            {drills.data.items.map((d) => (
              <li key={d.id} className="as-item">
                <div className="as-row as-row--between">
                  <span className="as-item__title">{d.name}</span>
                  <Pill tone={d.status === 'ACTIVE' ? 'info' : 'neutral'}>{d.status}</Pill>
                </div>
                <span className="as-muted as-small">
                  {d.mode} ·{' '}
                  {d.status === 'ACTIVE'
                    ? 'Choose it on Home to practise “I’m safe” / “Need help”.'
                    : 'Not active.'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No drills are scheduled." />
        )}
      </Card>

      <Card title="My progress" icon="check" labelledBy="as-prep-history">
        {!s.api ? (
          <p className="as-muted">Needs a signed-in API session.</p>
        ) : progress.loading && !progress.data ? (
          <Loading />
        ) : progress.error ? (
          <ErrorNotice error={progress.error} onRetry={progress.reload} />
        ) : progress.data ? (
          <>
            <div className="as-grid2 as-progress">
              <p>
                <strong>{progress.data.summary.practiceRuns}</strong>
                <span className="as-muted as-small">practice runs</span>
              </p>
              <p>
                <strong>
                  {progress.data.summary.bestScore === null
                    ? '—'
                    : `${Math.round(progress.data.summary.bestScore)}%`}
                </strong>
                <span className="as-muted as-small">best practice score</span>
              </p>
              <p>
                <strong>{progress.data.summary.drillsJoined}</strong>
                <span className="as-muted as-small">drills you checked in to</span>
              </p>
            </div>
            {progress.data.drills.length > 0 && (
              <ul className="as-list" aria-label="Drills you took part in">
                {progress.data.drills.map((d) => (
                  <li key={d.drillId} className="as-item">
                    <div className="as-row as-row--between">
                      <span className="as-item__title">{d.name}</span>
                      <Pill tone={d.lastStatus === 'CONFIRMED_SAFE' ? 'ok' : 'warn'}>
                        {d.lastStatus === 'CONFIRMED_SAFE' ? 'Checked in safe' : 'Asked for help'}
                      </Pill>
                    </div>
                    <span className="as-muted as-small">{formatWhen(d.checkedInAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {progress.data.practice.length > 0 ? (
              <ul className="as-list" aria-label="Practice results">
                {progress.data.practice.map((r) => (
                  <li key={r.id} className="as-item">
                    <div className="as-row as-row--between">
                      <span className="as-item__title">{r.scenarioRef}</span>
                      <Pill tone="info">{Math.round(r.score)}%</Pill>
                    </div>
                    <span className="as-muted as-small">{formatWhen(r.completedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No practice results yet." />
            )}
          </>
        ) : null}
      </Card>
    </>
  );
}
