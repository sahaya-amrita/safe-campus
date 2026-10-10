import { useState } from 'react';
import { InstructionPacksView } from '../../features/student/components/InstructionPacksView';
import { useInstructionPacks } from '../../features/student/instructions/useInstructionPacks';
import { Card, EmptyState, ErrorNotice, Loading, Pill, formatWhen, useAsync } from '../ui';
import { useStudent } from './core';
import { DrillPractice } from './DrillPractice';

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
  const training = useAsync(s.api ? () => s.api!.myTraining() : null, [s.api]);
  const drills = useAsync(s.api ? () => s.api!.drills() : null, [s.api]);
  const [practice, setPractice] = useState(false);
  const titles = (packs?.packs ?? []).map((p) => p.pack.title.toLowerCase());

  return (
    <>
      <h1 className="as-screen-title">Prepare</h1>
      <p className="as-muted">
        Only instruction packs approved and published by authorised reviewers appear here. They are
        cached for offline use.
      </p>

      <Card title="Safety topics" icon="book" labelledBy="as-prep-topics">
        <p className="as-muted as-small">
          Questions? Ask Tom (the guide button) — it answers only from approved content.
        </p>
        <ul className="as-list">
          {TOPICS.map((topic) => {
            const count = titles.filter((t) => topic.keywords.some((k) => t.includes(k))).length;
            return (
              <li key={topic.id} className="as-item">
                <div className="as-row as-row--between">
                  <span className="as-item__title">{topic.label}</span>
                  <Pill tone={count ? 'ok' : 'neutral'}>
                    {count
                      ? `${count} approved pack${count === 1 ? '' : 's'}`
                      : 'No approved pack yet'}
                  </Pill>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

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
        {practice && <DrillPractice api={s.api} onSaved={training.reload} />}
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

      <Card title="My training history" icon="check" labelledBy="as-prep-history">
        {!s.api ? (
          <p className="as-muted">Needs a signed-in API session.</p>
        ) : training.loading && !training.data ? (
          <Loading />
        ) : training.error ? (
          <ErrorNotice error={training.error} onRetry={training.reload} />
        ) : training.data?.items.length ? (
          <ul className="as-list">
            {training.data.items.map((r) => (
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
          <EmptyState title="No saved drill results yet." />
        )}
      </Card>
    </>
  );
}
