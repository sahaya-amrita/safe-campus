import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { InsightsResponse, InsightsSummary } from '@sahaya/contracts';
import type { SahayaApi } from '../api/sahaya';
import { InsightsPanel } from './InsightsPanel';

const base: InsightsResponse = {
  view: 'student',
  availableViews: ['student'],
  dataNote: 'Synthetic DEMO data generated for this prototype.',
  window: { from: '2026-07-13', to: '2026-10-10', days: 90 },
  totals: { reports: 205, helpRequests: 75 },
  trends: [
    { category: 'MEDICAL', label: 'Medical', last30: 67, previous30: 49, changePercent: 37 },
  ],
  hourProfile: Array.from({ length: 24 }, (_, h) => (h >= 10 && h < 13 ? 9 : 1)),
  busiestWindow: '10:00–13:00',
  hotspots: [
    {
      place: 'DEMO Building Beta (Academic Block 1)',
      category: 'MEDICAL',
      label: 'Medical',
      count: 22,
      sharePercent: 33,
      busiestHours: '13:00–16:00',
    },
  ],
  precautions: [
    {
      pattern: 'Medical reports: most often 13:00–16:00 near DEMO Building Beta (synthetic data).',
      guideTitle: 'DEMO: Medical help and first aid',
      guideVersion: 'demo-medical-1',
    },
  ],
  method: ['Counts compare the last 30 days with the 30 days before.'],
};

const summary = (s: Partial<InsightsSummary>): InsightsSummary => ({
  view: 'student',
  source: 'APP',
  model: null,
  text: 'In the last 30 days of synthetic data there were 205 reports.',
  fallbackReason: 'AI summaries are off on this server.',
  generatedAt: '2026-10-11T12:00:00Z',
  ...s,
});

describe('InsightsPanel', () => {
  it('shows students patterns and precautions that open a guide, with no staff figures', async () => {
    const onOpenGuide = vi.fn();
    const api = {
      insights: vi.fn(async () => base),
      insightsSummary: vi.fn(async () => summary({})),
    } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<InsightsPanel api={api} compact onOpenGuide={onOpenGuide} />);
    expect(await screen.findByText(/Synthetic DEMO data generated/)).toBeInTheDocument();
    expect(await screen.findByText('Written by the app')).toBeInTheDocument();
    expect(screen.queryByText('Trends by category')).toBeNull();
    expect(screen.queryByText(/next 7 days/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Insights for' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Read “DEMO: Medical help and first aid”' }),
    );
    expect(onOpenGuide).toHaveBeenCalledWith('demo-medical-1');
  });

  it('labels a checked AI summary and lets staff switch between their views', async () => {
    const insights = vi.fn(async (view?: string) => ({
      ...base,
      view: (view ?? 'responder') as InsightsResponse['view'],
      availableViews: ['student', 'responder'] as InsightsResponse['availableViews'],
      forecast: {
        metric: 'help requests per day' as const,
        method: 'Average of the same weekday over the last 8 weeks.',
        days: [{ date: '2026-10-11', weekday: 'Sunday', expected: 1.8, low: 0, high: 4 }],
      },
    }));
    const api = {
      insights,
      insightsSummary: vi.fn(async () =>
        summary({ source: 'AI', model: 'test-model', fallbackReason: null }),
      ),
    } as unknown as SahayaApi;
    const user = userEvent.setup();
    render(<InsightsPanel api={api} />);
    expect(await screen.findByText('AI summary')).toBeInTheDocument();
    expect(screen.getByText(/every number matches the statistics below/)).toBeInTheDocument();
    expect(screen.getByText('Help requests: next 7 days (illustrative)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Campus' }));
    expect(insights).toHaveBeenLastCalledWith('student');
  });
});
