import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampusContact } from '../../features/responder/campusDirectory';
import { CAMPUS_CONTACTS } from '../../features/responder/campusDirectory';
import { disabledTomAi, mockTomAi, type TomAiAdapter } from './aiAdapter';
import {
  AssistantHttpError,
  type AssistantInterpretResponse,
  type TomAssistantBackend,
} from './assistantClient';
import { DEFAULT_TOM_KNOWLEDGE } from './knowledgeBase';
import type { TomDestination, TomNavigationAdapter } from './navigation';
import { Tom } from './Tom';
import { TOM_MESSAGES_EN } from './tomMessages';
import { TourTargetProvider, useTourTarget } from './tourTargets';
import type { ApprovedInstructionLink, TomEntry } from './types';

afterEach(() => {
  for (const s of [window.sessionStorage, window.localStorage]) {
    try {
      s.clear();
    } catch {
      /* storage unavailable */
    }
  }
});

const launcher = () => screen.getByRole('button', { name: /Help \(Tom\)|Close Tom$/ });
const panel = () => screen.getByRole('complementary', { name: 'Tom — app help' });
const log = () => screen.getByRole('log', { name: 'Conversation with Tom' });

async function openTom(user: ReturnType<typeof userEvent.setup>) {
  await user.click(launcher());
  return panel();
}

async function askTom(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(screen.getByLabelText('Ask Tom about this app'), question);
  await user.click(screen.getByRole('button', { name: 'Ask' }));
  return log();
}

const reviewed = (e: TomEntry): TomEntry => ({
  ...e,
  review: { reviewed: true, reviewer: 'test' },
});
/** Tom without the first-visit welcome, for tests about other behaviour. */
const quiet = { onboarding: false } as const;

// ---------------------------------------------------------------------------
// A tiny host with registered destinations, tour targets and history.
// ---------------------------------------------------------------------------
const DESTS: TomDestination[] = [
  {
    id: 'responder.overview',
    label: 'Overview',
    description: 'Control room.',
    keywords: ['overview', 'control room'],
    roles: ['RESPONDER', 'ADMIN'],
  },
  {
    id: 'responder.drills',
    label: 'Drills',
    description: 'Drill console.',
    keywords: ['drills'],
    roles: ['RESPONDER', 'ADMIN'],
  },
  {
    id: 'responder.help-requests',
    label: 'Help requests',
    description: 'Requests by status.',
    keywords: ['help requests', 'requests'],
    roles: ['RESPONDER', 'ADMIN'],
  },
  {
    id: 'responder.hazard-review',
    label: 'Hazard review',
    description: 'Reports awaiting review.',
    keywords: ['hazard review', 'hazards', 'hazard'],
    roles: ['RESPONDER', 'ADMIN'],
  },
  {
    id: 'responder.roll-call',
    label: 'Roll-call summary',
    description: 'Check-ins for a scope.',
    keywords: ['roll call'],
    roles: ['RESPONDER', 'ADMIN'],
  },
  {
    id: 'responder.contacts',
    label: 'Contacts & resources',
    description: 'Campus numbers.',
    keywords: ['contacts', 'phone numbers'],
    roles: ['RESPONDER', 'ADMIN'],
  },
];

function Target({ id, children }: { id: string; children: string }) {
  const ref = useTourTarget(id);
  return <div ref={ref}>{children}</div>;
}

function Host({
  allowed = true,
  extra,
}: {
  allowed?: boolean;
  extra?: Partial<TomNavigationAdapter>;
}) {
  const [view, setView] = useState('responder.help-requests');
  const [history, setHistory] = useState<string[]>([]);
  const stateRef = { view, history };
  const navigation: TomNavigationAdapter = {
    destinations: () => DESTS,
    current: () => stateRef.view,
    canNavigate: () => allowed,
    navigate: (id) => {
      setHistory((h) => [...h, stateRef.view]);
      setView(id);
      return { ok: true };
    },
    canGoBack: () => stateRef.history.length > 0,
    back: () => {
      const prev = stateRef.history[stateRef.history.length - 1];
      if (!prev) return { ok: false, reason: 'UNAVAILABLE' };
      setHistory((h) => h.slice(0, -1));
      setView(prev);
      return { ok: true };
    },
    ...extra,
  };
  return (
    <TourTargetProvider>
      <p data-testid="view">{view}</p>
      <button type="button">Page action</button>
      <Target id="responder.nav">Sections</Target>
      {view === 'responder.overview' && <Target id="control.stats">Stats</Target>}
      {view === 'responder.overview' && <Target id="control.help">Help queue</Target>}
      {view === 'responder.overview' && <Target id="control.hazards">Hazard queue</Target>}
      {view === 'responder.drills' && <Target id="drills.preflight">Preflight</Target>}
      {view === 'responder.help-requests' && <Target id="responder.status-filter">Filter</Target>}
      {view === 'responder.help-requests' && <Target id="responder.request-list">List</Target>}
      {view === 'responder.hazard-review' && (
        <Target id="responder.hazard-filter">Hazard filter</Target>
      )}
      {view === 'responder.contacts' && <Target id="responder.contacts-list">Contacts list</Target>}
      <Tom role="RESPONDER" context={view} mode="DEMO" navigation={navigation} {...quiet} />
    </TourTargetProvider>
  );
}

describe('Tom launcher and panel', () => {
  it('is closed by default and does not block the page', () => {
    render(
      <>
        <button type="button">Page action</button>
        <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />
      </>,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(launcher()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens and closes, moving focus sensibly', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await openTom(user);
    expect(launcher()).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Tom — app help' })).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: 'Close Tom help panel' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await waitFor(() => expect(launcher()).toHaveFocus());
  });

  it('is keyboard accessible: Enter opens, Escape closes and returns focus', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    launcher().focus();
    await user.keyboard('{Enter}');
    expect(panel()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await waitFor(() => expect(launcher()).toHaveFocus());
  });

  it('does not trap focus: page content stays reachable while open', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Page action</button>
        <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />
      </>,
    );
    await openTom(user);
    const pageButton = screen.getByRole('button', { name: 'Page action' });
    await user.click(pageButton);
    expect(pageButton).toHaveFocus();
    expect(panel()).toBeInTheDocument();
  });

  it('dismissed tips stay dismissed for the session and can be restored', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Tom role="RESPONDER" context="responder.incidents" mode="DEMO" {...quiet} />,
    );
    await openTom(user);
    await user.click(screen.getByRole('button', { name: 'Dismiss tip: Counts are not alerts' }));
    expect(screen.queryByText('Counts are not alerts.')).not.toBeInTheDocument();
    unmount();

    render(<Tom role="RESPONDER" context="responder.incidents" mode="DEMO" {...quiet} />);
    await openTom(user);
    expect(screen.queryByText('Counts are not alerts.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show dismissed tips' }));
    expect(screen.getByText('Counts are not alerts.')).toBeInTheDocument();
  });

  it('can be minimised for the session but always offers a way back', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />,
    );
    await openTom(user);
    await user.click(screen.getByRole('button', { name: 'Minimise Tom for this session' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    const compact = screen.getByRole('button', { name: 'Show Tom help' });
    await waitFor(() => expect(compact).toHaveFocus());
    unmount();

    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    expect(screen.queryByRole('button', { name: /Help \(Tom\)/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show Tom help' }));
    expect(panel()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close Tom help panel' }));
    expect(launcher()).toBeInTheDocument();
  });

  it('works when session storage is unavailable', async () => {
    const user = userEvent.setup();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    render(
      <Tom
        role="RESPONDER"
        context="responder.incidents"
        mode="DEMO"
        store={broken}
        persistentStore={broken}
      />,
    );
    // Welcome still shows once (in memory) and can be dismissed.
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    await openTom(user);
    await user.click(screen.getByRole('button', { name: 'Dismiss tip: Counts are not alerts' }));
    expect(screen.queryByText('Counts are not alerts.')).not.toBeInTheDocument();
  });
});

describe('first-visit onboarding', () => {
  it("shows a non-blocking welcome once, and 'Not now' stops it returning", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <>
        <button type="button">Page action</button>
        <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />
      </>,
    );
    const welcome = screen.getByRole('region', { name: "Hi, I'm Tom" });
    expect(within(welcome).getByRole('button', { name: 'Take a tour' })).toBeInTheDocument();
    // It does not steal focus or block the page.
    expect(welcome).not.toContainElement(document.activeElement as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Page action' }));
    expect(screen.getByRole('button', { name: 'Page action' })).toHaveFocus();

    await user.click(within(welcome).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: "Hi, I'm Tom" })).not.toBeInTheDocument();
    expect(launcher()).toBeVisible();
    unmount();

    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    expect(screen.queryByRole('region', { name: "Hi, I'm Tom" })).not.toBeInTheDocument();
  });

  it('opening Tom also counts as seeing the welcome', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />,
    );
    await openTom(user);
    unmount();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    expect(screen.queryByRole('region', { name: "Hi, I'm Tom" })).not.toBeInTheDocument();
  });

  it("'Take a tour' starts the guided tour", async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" />);
    await user.click(screen.getByRole('button', { name: 'Take a tour' }));
    expect(screen.getByRole('dialog', { name: 'Sections' })).toBeInTheDocument();
  });
});

describe('keyboard shortcut', () => {
  it("'?' opens Tom when not typing, and is ignored inside text fields", async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Notes" />
        <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />
      </>,
    );
    await user.click(screen.getByLabelText('Notes'));
    await user.keyboard('?');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveValue('?');

    (document.activeElement as HTMLElement).blur();
    await user.keyboard('?');
    expect(panel()).toBeInTheDocument();
    expect(launcher()).toHaveAttribute('aria-keyshortcuts', 'Shift+?');
  });

  it('ignores Ctrl/Cmd combinations', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await user.keyboard('{Control>}?{/Control}{Meta>}?{/Meta}');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('can be turned off by the user, and stays off', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />,
    );
    await openTom(user);
    await user.click(screen.getByRole('checkbox', { name: 'Open Tom with the ? key' }));
    await user.click(screen.getByRole('button', { name: 'Close Tom help panel' }));
    unmount();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await user.keyboard('?');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(launcher()).not.toHaveAttribute('aria-keyshortcuts');
  });

  it('restores a minimised Tom', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem('safe-campus.tom.minimised', '1');
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await user.keyboard('?');
    expect(panel()).toBeInTheDocument();
  });
});

describe('guided navigation', () => {
  it('takes the user to a registered destination and says where', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openTom(user);
    const thread = await askTom(user, 'take me to hazard review');
    expect(thread).toHaveTextContent('Taking you to Hazard review. Reports awaiting review.');
    await waitFor(() => expect(thread).toHaveTextContent("You're on Hazard review now."));
    expect(screen.getByTestId('view')).toHaveTextContent('responder.hazard-review');
  });

  it('goes back to the previous view', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openTom(user);
    await askTom(user, 'open roll call');
    await waitFor(() =>
      expect(screen.getByTestId('view')).toHaveTextContent('responder.roll-call'),
    );
    const thread = await askTom(user, 'go back');
    await waitFor(() => expect(thread).toHaveTextContent('Back to the previous section.'));
    expect(screen.getByTestId('view')).toHaveTextContent('responder.help-requests');
  });

  it("respects the host's authorization and reports that nothing changed", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(<Host allowed={false} extra={{ navigate }} />);
    await openTom(user);
    const thread = await askTom(user, 'take me to contacts');
    await waitFor(() =>
      expect(thread).toHaveTextContent("your account doesn't have access. Nothing changed."),
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByTestId('view')).toHaveTextContent('responder.help-requests');
  });

  it('only offers (not performs) navigation when no verb is used, and asks when ambiguous', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openTom(user);
    let thread = await askTom(user, 'hazards?');
    expect(thread).toHaveTextContent('Want me to take you there?');
    expect(screen.getByTestId('view')).toHaveTextContent('responder.help-requests');
    await user.click(within(thread).getByRole('button', { name: 'Go to Hazard review' }));
    await waitFor(() =>
      expect(screen.getByTestId('view')).toHaveTextContent('responder.hazard-review'),
    );

    thread = await askTom(user, 'show me requests or hazards');
    expect(thread).toHaveTextContent('Which one did you mean?');
    expect(within(thread).getByRole('button', { name: 'Go to Help requests' })).toBeInTheDocument();
  });

  it('says when you are already there', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openTom(user);
    const thread = await askTom(user, 'go to help requests');
    expect(thread).toHaveTextContent("You're already on Help requests.");
  });

  it('explains it cannot navigate without a host adapter', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await openTom(user);
    const thread = await askTom(user, 'what can I do here?');
    expect(thread).toHaveTextContent('Oldest requests are listed first');
  });
});

describe('refusing consequential actions', () => {
  it.each([
    ['acknowledge DEMO-HR-001', "I can't acknowledge requests for you.", 'Go to Help requests'],
    [
      'please verify hazard DEMO-HZ-001',
      "I can't record hazard decisions for you.",
      'Go to Hazard review',
    ],
    ['send an alert to everyone', "I can't send alerts or notifications for you.", null],
    ['submit a report', "I can't submit reports for you.", null],
    ['resolve DEMO-HR-003', "I can't assign, resolve or cancel records for you.", null],
  ])('%s', async (q, text, button) => {
    const user = userEvent.setup();
    render(<Host />);
    await openTom(user);
    const thread = await askTom(user, q);
    expect(thread).toHaveTextContent(text);
    expect(thread).toHaveTextContent('Tom never takes actions on your behalf.');
    if (button) expect(within(thread).getByRole('button', { name: button })).toBeInTheDocument();
    expect(screen.getByTestId('view')).toHaveTextContent('responder.help-requests');
  });

  it('has no controls that perform consequential actions', async () => {
    const user = userEvent.setup();
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        ai={mockTomAi}
        {...quiet}
      />,
    );
    await openTom(user);
    const names = within(panel())
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    for (const n of names)
      expect(n).not.toMatch(
        /^(acknowledge|verify|reject|send|alert|call|notify|submit|resolve)\b/i,
      );
  });
});

describe('interactive guided tour', () => {
  async function startTour(user: ReturnType<typeof userEvent.setup>) {
    await openTom(user);
    await user.click(screen.getByRole('button', { name: /Take the tour/ }));
    return screen.getByRole('dialog');
  }

  it("highlights registered targets and navigates to each step's destination", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await startTour(user);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Sections' })).toHaveTextContent('Step 1 of 9');
    expect(screen.getByTestId('tour-highlight')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sections' })).toHaveFocus());

    // Demo banner is optional and absent here, so the tour moves on to the overview.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'At a glance' })).toBeInTheDocument(),
    );
    expect(screen.getByTestId('view')).toHaveTextContent('responder.overview');
    await user.click(screen.getByRole('button', { name: 'Next' })); // help queue
    await user.click(screen.getByRole('button', { name: 'Next' })); // hazard queue
    await user.click(screen.getByRole('button', { name: 'Next' })); // drills → navigates
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('responder.drills'));
    expect(screen.getByText('Now showing Drills.')).toBeInTheDocument();
  });

  it('can be completed with the keyboard and restores the starting view and focus', async () => {
    const user = userEvent.setup();
    render(<Host />);
    launcher().focus();
    await user.keyboard('{Enter}');
    screen.getByRole('button', { name: /Take the tour/ }).focus();
    await user.keyboard('{Enter}');
    for (let i = 0; i < 12 && !screen.queryByRole('button', { name: 'Finish tour' }); i++) {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
      screen.getByRole('button', { name: 'Next' }).focus();
      await user.keyboard('{Enter}');
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
    }
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 9 of 9');
    screen.getByRole('button', { name: 'Finish tour' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('view')).toHaveTextContent('responder.help-requests'),
    );
    await waitFor(() => expect(launcher()).toHaveFocus());
    expect(screen.getByText(/Tour ended\. You're on Help requests now\./)).toBeInTheDocument();
  }, 15000);

  it('Back works and Skip ends the tour', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await startTour(user);
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    // The optional demo-banner step is absent, so Next lands on the overview step.
    expect(await screen.findByRole('dialog', { name: 'At a glance' })).toBeInTheDocument();
    // Back skips the absent optional step in the direction of travel.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('dialog', { name: 'Sections' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape ends the tour from anywhere and restores focus', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await startTour(user);
    await user.click(screen.getByRole('button', { name: 'Page action' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Page action' })).toHaveFocus());
  });

  it('keeps the page usable behind the tour', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await startTour(user);
    const page = screen.getByRole('button', { name: 'Page action' });
    await user.click(page);
    expect(page).toHaveFocus();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false');
  });

  it('explains missing required targets instead of breaking', async () => {
    const user = userEvent.setup();
    // No provider/targets at all.
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await startTour(user);
    expect(screen.getByRole('dialog', { name: 'Sections' })).toHaveTextContent(
      "This part of the screen isn't showing right now.",
    );
    expect(screen.queryByTestId('tour-highlight')).not.toBeInTheDocument();
  });

  it('can be started from a question', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openTom(user);
    const thread = await askTom(user, 'give me a tour');
    await user.click(within(thread).getByRole('button', { name: 'Start the tour' }));
    expect(screen.getByRole('dialog', { name: 'Sections' })).toBeInTheDocument();
  });

  it('LIVE hides the unreviewed tour', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="LIVE" {...quiet} />);
    await openTom(user);
    expect(screen.queryByRole('button', { name: /Take the tour/ })).not.toBeInTheDocument();
    const thread = await askTom(user, 'give me a tour');
    expect(thread).toHaveTextContent("There's no tour for this screen yet.");
  });
});

describe('role and context awareness', () => {
  it('shows responder help only to responders', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <Tom role="STUDENT" context="responder.incidents" mode="DEMO" {...quiet} />,
    );
    await openTom(user);
    expect(screen.queryByText(/Does confirming a report alert the campus/)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Common questions' })).getByText(
        'How do I know my check-in was received?',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Take the tour/ })).not.toBeInTheDocument();
    unmount();
    render(<Tom role="RESPONDER" context="responder.incidents" mode="DEMO" {...quiet} />);
    await openTom(user);
    expect(
      within(screen.getByRole('region', { name: 'Common questions' })).getByText(
        /Does confirming a report alert the campus/,
      ),
    ).toBeInTheDocument();
  });

  it('changes tips with the screen context', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />,
    );
    await openTom(user);
    expect(screen.getByText('Oldest requests are listed first.')).toBeInTheDocument();
    rerender(<Tom role="RESPONDER" context="responder.drills" mode="DEMO" {...quiet} />);
    expect(screen.queryByText('Oldest requests are listed first.')).not.toBeInTheDocument();
    expect(screen.getByText('Stopping is always allowed.')).toBeInTheDocument();
  });

  it('in LIVE mode hides unreviewed drafts and says so when nothing reviewed exists', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="LIVE" {...quiet} />);
    await openTom(user);
    expect(screen.getByText('No tips to show here.')).toBeInTheDocument();
    expect(
      screen.getByText('No reviewed questions are available for this screen.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/prototype draft/)).not.toBeInTheDocument();
  });

  it('in LIVE mode shows reviewed entries', async () => {
    const user = userEvent.setup();
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="LIVE"
        knowledgeBase={DEFAULT_TOM_KNOWLEDGE.map(reviewed)}
        {...quiet}
      />,
    );
    await openTom(user);
    expect(screen.getByText('Oldest requests are listed first.')).toBeInTheDocument();
  });
});

describe('questions, missing knowledge and emergency boundary', () => {
  it('answers from the knowledge base', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await openTom(user);
    const thread = await askTom(user, 'what does acknowledge do');
    expect(within(thread).getByText(/What does “Acknowledge” do\?/)).toBeInTheDocument();
  });

  it('says it does not know instead of improvising', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await openTom(user);
    const thread = await askTom(user, 'best pizza on campus');
    expect(thread).toHaveTextContent("I don't know the answer to that.");
    expect(thread).toHaveTextContent(
      'I can explain this screen, take you to a section, or start a tour.',
    );
  });

  it('labels the assistant as a functional prototype, not an AI model', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await openTom(user);
    expect(
      screen.getByText(/Functional prototype: .* It is not an AI model\./),
    ).toBeInTheDocument();
  });

  it('refuses emergency instructions and invents no contacts when none are configured', async () => {
    const user = userEvent.setup();
    render(<Tom role="STUDENT" context="student.check-in" mode="DEMO" {...quiet} />);
    await openTom(user);
    const thread = await askTom(user, 'there is a fire, which exit do I use?');
    const reply = within(thread)
      .getAllByText(/I can't give emergency instructions, routes or contacts\./)[0]!
      .closest('[data-reply]')!;
    expect(reply).toHaveTextContent('No approved instruction pack is configured');
    expect(reply).toHaveTextContent('not a guarantee that someone will respond');
    expect(reply.textContent).not.toMatch(/\d{3,}/); // no phone numbers
    expect(reply.textContent).not.toMatch(/on (the|their) way|coming/i);
    expect(within(reply as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
  });

  it('links only approved, unexpired instruction packs', async () => {
    const user = userEvent.setup();
    const packs: ApprovedInstructionLink[] = [
      {
        id: 'ok',
        title: 'Fire procedure (test pack)',
        href: '/instructions/ok',
        version: '3',
        sourceLabel: 'Test source',
        approvalState: 'PUBLISHED',
        language: 'en',
        expiresAt: '2027-01-01T00:00:00Z',
      },
      {
        id: 'draft',
        title: 'Draft pack',
        href: '/instructions/d',
        version: '1',
        sourceLabel: 'Test',
        approvalState: 'DRAFT',
        language: 'en',
      },
      {
        id: 'old',
        title: 'Expired pack',
        href: '/instructions/o',
        version: '1',
        sourceLabel: 'Test',
        approvalState: 'APPROVED',
        language: 'en',
        expiresAt: '2020-01-01T00:00:00Z',
      },
      {
        id: 'nosrc',
        title: 'No source pack',
        href: '/instructions/n',
        version: '1',
        sourceLabel: '',
        approvalState: 'APPROVED',
        language: 'en',
      },
    ];
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        approvedInstructions={packs}
        now={() => new Date('2026-10-10T00:00:00Z')}
        {...quiet}
      />,
    );
    await openTom(user);
    const section = screen.getByRole('region', { name: 'Official instructions' });
    expect(
      within(section)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Fire procedure (test pack)']);
    expect(within(section).getByText(/Test source, version 3, en/)).toBeInTheDocument();
    // Asking for instructions returns the same approved list, with its source.
    const thread = await askTom(user, 'show me the instructions');
    expect(
      within(thread).getByRole('link', { name: 'Fire procedure (test pack)' }),
    ).toBeInTheDocument();
    expect(thread).toHaveTextContent('Test source, version 3, en');
  });
});

describe('AI adapters', () => {
  it('is disabled by default: no explain controls', async () => {
    const user = userEvent.setup();
    render(<Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" {...quiet} />);
    await openTom(user);
    expect(
      screen.queryByRole('button', { name: 'Explain in simpler words' }),
    ).not.toBeInTheDocument();
  });

  it('never calls AI in LIVE mode even if configured', async () => {
    const user = userEvent.setup();
    const explain = vi.fn().mockResolvedValue('text');
    const interpretFn = vi.fn();
    const ai: TomAiAdapter = { status: 'CONFIGURED', explain };
    const assistant: TomAssistantBackend = { status: 'CONFIGURED', interpret: interpretFn };
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="LIVE"
        ai={ai}
        assistant={assistant}
        knowledgeBase={DEFAULT_TOM_KNOWLEDGE.map(reviewed)}
        {...quiet}
      />,
    );
    await openTom(user);
    expect(
      screen.queryByRole('button', { name: 'Explain in simpler words' }),
    ).not.toBeInTheDocument();
    await askTom(user, 'best pizza on campus');
    expect(explain).not.toHaveBeenCalled();
    expect(interpretFn).not.toHaveBeenCalled();
  });

  it('labels mock explanations as not official and keeps the source text', async () => {
    const user = userEvent.setup();
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        ai={mockTomAi}
        {...quiet}
      />,
    );
    await openTom(user);
    const faqs = screen.getByRole('region', { name: 'Common questions' });
    await user.click(within(faqs).getByText('What does “Acknowledge” do?'));
    await user.click(within(faqs).getAllByRole('button', { name: 'Explain in simpler words' })[0]!);
    expect(
      await screen.findByText(
        /Simulated \(mock\) explanation of the help text above — not an official instruction/,
      ),
    ).toBeInTheDocument();
  });

  it('handles AI failure without changing the reviewed text', async () => {
    const user = userEvent.setup();
    const ai: TomAiAdapter = {
      status: 'CONFIGURED',
      explain: () => Promise.reject(new Error('down')),
    };
    render(
      <Tom role="RESPONDER" context="responder.help-requests" mode="DEMO" ai={ai} {...quiet} />,
    );
    await openTom(user);
    await user.click(screen.getAllByRole('button', { name: 'Explain in simpler words' })[0]!);
    expect(
      await screen.findByText('Explanation unavailable. The help text above is unchanged.'),
    ).toBeInTheDocument();
  });

  it('disabled adapter rejects if called directly', async () => {
    await expect(
      disabledTomAi.explain({ entry: DEFAULT_TOM_KNOWLEDGE[0]!, role: 'RESPONDER' }),
    ).rejects.toThrow();
  });

  const serverReply = (
    over: Partial<AssistantInterpretResponse> = {},
  ): AssistantInterpretResponse => ({
    type: 'navigation_suggestion',
    answer: 'Hazard reports are reviewed in Hazard review.',
    action: { type: 'NAVIGATE', destinationId: 'responder.hazard-review' },
    references: [
      {
        id: 'screen.hazard-review',
        kind: 'SCREEN_GUIDE',
        title: 'Hazard review screen',
        version: '1',
        source: 'SAFE CAMPUS app help (draft v1)',
        reviewState: 'DRAFT',
      },
    ],
    origin: { source: 'AI', provider: 'groq', model: 'test-model', fallbackReason: null },
    generatedAt: '2026-10-10T12:00:00Z',
    ...over,
  });
  const nav = {
    destinations: () => DESTS,
    current: () => 'responder.help-requests',
    canNavigate: () => true,
    navigate: vi.fn(() => ({ ok: true as const })),
  };
  const backend = (impl: TomAssistantBackend['interpret']): TomAssistantBackend => ({
    status: 'CONFIGURED',
    interpret: vi.fn(impl),
  });

  it('shows a labelled, referenced AI answer; its suggestion is a button, never auto-executed', async () => {
    const user = userEvent.setup();
    const b = backend(() => Promise.resolve(serverReply()));
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        assistant={b}
        navigation={nav}
        {...quiet}
      />,
    );
    await openTom(user);
    const thread = await askTom(user, 'where do the unverified things go');
    await waitFor(() =>
      expect(thread).toHaveTextContent(
        'AI answer (groq · test-model) based on SAFE CAMPUS help. Not an official instruction.',
      ),
    );
    expect(thread).toHaveTextContent(
      'Hazard review screen (SAFE CAMPUS app help (draft v1), version 1) — draft, not yet reviewed',
    );
    expect(nav.navigate).not.toHaveBeenCalled();
    await user.click(within(thread).getByRole('button', { name: 'Go to Hazard review' }));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('responder.hazard-review'));
    expect(b.interpret).toHaveBeenCalledWith({
      question: 'where do the unverified things go',
      context: { screen: 'responder.help-requests', locale: 'en' },
      history: [],
    });
  });

  it('sends bounded history of earlier AI exchanges for follow-ups', async () => {
    const user = userEvent.setup();
    const b = backend(() =>
      Promise.resolve(
        serverReply({ type: 'answer', action: null, answer: 'Reviewers record a decision.' }),
      ),
    );
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        assistant={b}
        navigation={nav}
        {...quiet}
      />,
    );
    await openTom(user);
    await askTom(user, 'how are hazard reports reviewed?');
    await waitFor(() => expect(log()).toHaveTextContent('Reviewers record a decision.'));
    await askTom(user, 'and what does rejecting mean?');
    await waitFor(() => expect(b.interpret).toHaveBeenCalledTimes(2));
    expect((b.interpret as ReturnType<typeof vi.fn>).mock.calls[1]![0].history).toEqual([
      { role: 'user', content: 'how are hazard reports reviewed?' },
      { role: 'assistant', content: 'Reviewers record a decision.' },
    ]);
  });

  it('shows a loading state while waiting', async () => {
    const user = userEvent.setup();
    let release!: (r: AssistantInterpretResponse) => void;
    const b = backend(() => new Promise((r) => (release = r)));
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        assistant={b}
        {...quiet}
      />,
    );
    await openTom(user);
    const thread = await askTom(user, 'zebra crossing paint colour');
    expect(thread).toHaveTextContent('Tom is thinking…');
    release(serverReply({ type: 'answer', action: null }));
    await waitFor(() => expect(thread).not.toHaveTextContent('Tom is thinking…'));
  });

  it('drops a server suggestion this client has not registered', async () => {
    const user = userEvent.setup();
    const b = backend(() =>
      Promise.resolve(
        serverReply({ action: { type: 'NAVIGATE', destinationId: 'admin.delete-everything' } }),
      ),
    );
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        assistant={b}
        navigation={nav}
        {...quiet}
      />,
    );
    await openTom(user);
    const thread = await askTom(user, 'zebra crossing paint colour');
    await waitFor(() => expect(thread).toHaveTextContent('Hazard reports are reviewed'));
    expect(within(thread).queryByRole('button', { name: /Go to/ })).not.toBeInTheDocument();
  });

  it('never sends emergencies, action requests or explicit navigation to the server', async () => {
    const user = userEvent.setup();
    const b = backend(() => Promise.resolve(serverReply()));
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        assistant={b}
        navigation={nav}
        {...quiet}
      />,
    );
    await openTom(user);
    await askTom(user, 'there is a fire');
    await askTom(user, 'acknowledge DEMO-HR-001');
    await askTom(user, 'take me to hazard review');
    expect(b.interpret).not.toHaveBeenCalled();
  });

  it.each<[string, () => Promise<AssistantInterpretResponse>, RegExp]>([
    [
      'network error',
      () => Promise.reject(new AssistantHttpError(0, 'NETWORK_ERROR')),
      /Couldn't reach the AI assistant/,
    ],
    [
      'signed out',
      () => Promise.reject(new AssistantHttpError(401, 'UNAUTHORIZED')),
      /Sign in to use the AI assistant/,
    ],
    [
      'rate limited',
      () => Promise.reject(new AssistantHttpError(429, 'RATE_LIMITED', 12)),
      /try again in 12 seconds/,
    ],
    [
      'invalid reply',
      () => Promise.reject(new AssistantHttpError(502, 'INVALID_RESPONSE')),
      /couldn't verify/,
    ],
    [
      'server unavailable',
      () =>
        Promise.resolve(
          serverReply({
            type: 'unavailable',
            action: null,
            references: [],
            origin: {
              source: 'FALLBACK',
              provider: 'rules',
              model: null,
              fallbackReason: 'TIMEOUT',
            },
          }),
        ),
      /AI assistant is unavailable \(the AI took too long\)/,
    ],
  ])('%s → explicit notice plus built-in help', async (_n, impl, notice) => {
    const user = userEvent.setup();
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        assistant={backend(impl)}
        {...quiet}
      />,
    );
    await openTom(user);
    const thread = await askTom(user, 'zebra crossing paint colour');
    await waitFor(() => expect(thread).toHaveTextContent(notice));
    expect(thread).toHaveTextContent("I don't know the answer to that.");
    expect(thread).not.toHaveTextContent('AI answer (');
  });

  it('labels fallback, rules and mock answers honestly', async () => {
    const user = userEvent.setup();
    const replies = [
      serverReply({
        type: 'answer',
        action: null,
        origin: {
          source: 'FALLBACK',
          provider: 'rules',
          model: null,
          fallbackReason: 'INVALID_OUTPUT',
        },
      }),
      serverReply({
        type: 'unsupported',
        action: null,
        origin: { source: 'RULES', provider: 'rules', model: null, fallbackReason: null },
      }),
      serverReply({
        type: 'answer',
        action: null,
        origin: { source: 'AI', provider: 'mock', model: null, fallbackReason: null },
      }),
    ];
    const b = backend(() => Promise.resolve(replies.shift()!));
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        assistant={b}
        {...quiet}
      />,
    );
    await openTom(user);
    const thread = await askTom(user, 'zebra one');
    await waitFor(() =>
      expect(thread).toHaveTextContent(
        "AI unavailable (the AI answer failed safety checks). Answer from Tom's built-in help.",
      ),
    );
    await askTom(user, 'zebra two');
    await waitFor(() => expect(thread).toHaveTextContent("Answer from Tom's fixed safety rules."));
    await askTom(user, 'zebra three');
    await waitFor(() =>
      expect(thread).toHaveTextContent(
        'Simulated (mock) answer for development. Not a real AI model',
      ),
    );
  });

  it('a safety_redirect from the server becomes the local emergency fallback', async () => {
    const user = userEvent.setup();
    const b = backend(() =>
      Promise.resolve(
        serverReply({
          type: 'safety_redirect',
          answer: 'server text',
          action: null,
          origin: { source: 'RULES', provider: 'rules', model: null, fallbackReason: null },
        }),
      ),
    );
    render(<Tom role="STUDENT" context="student.check-in" mode="DEMO" assistant={b} {...quiet} />);
    await openTom(user);
    const thread = await askTom(user, 'my friend feels faint');
    await waitFor(() =>
      expect(thread).toHaveTextContent("I can't give emergency instructions, routes or contacts."),
    );
    expect(thread).not.toHaveTextContent('server text');
  });
});

describe('campus contacts and current content', () => {
  const confirmed: CampusContact = {
    ...CAMPUS_CONTACTS[0]!,
    id: 'test-confirmed',
    label: 'Test confirmed line',
    phoneDisplay: '0422 0000000',
    phoneDial: '+914220000000',
    verification: 'INSTITUTION_CONFIRMED',
    source: { url: 'https://example.test/directory', label: 'Test directory' },
  };

  it('DEMO: lists contacts on record with their unconfirmed state', async () => {
    const user = userEvent.setup();
    render(
      <Tom
        role="STUDENT"
        context="student.check-in"
        mode="DEMO"
        contacts={CAMPUS_CONTACTS}
        {...quiet}
      />,
    );
    await openTom(user);
    const thread = await askTom(user, 'there is a fire');
    expect(thread).toHaveTextContent('Security Office: 0422 2685802');
    expect(thread).toHaveTextContent(
      'unverified, confirm before live; not yet confirmed by the institution',
    );
  });

  it('LIVE: shows only institution-confirmed contacts, with their source', async () => {
    const user = userEvent.setup();
    render(
      <Tom
        role="STUDENT"
        context="student.check-in"
        mode="LIVE"
        contacts={[...CAMPUS_CONTACTS, confirmed]}
        {...quiet}
      />,
    );
    await openTom(user);
    const thread = await askTom(user, 'there is a fire');
    expect(thread).toHaveTextContent('Test confirmed line: 0422 0000000');
    expect(within(thread).getByRole('link', { name: 'source' })).toHaveAttribute(
      'href',
      'https://example.test/directory',
    );
    expect(thread).not.toHaveTextContent('2685802');
    expect(thread).not.toHaveTextContent('2685000');
  });

  it('LIVE: hides reviewed entries whose review has expired', async () => {
    const user = userEvent.setup();
    const kb = DEFAULT_TOM_KNOWLEDGE.map((e) =>
      e.id === 'resp-hr-hint-oldest-first'
        ? { ...e, review: { reviewed: true, validUntil: '2026-01-01T00:00:00Z' } }
        : { ...e, review: { reviewed: true, validUntil: '2027-01-01T00:00:00Z' } },
    );
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="LIVE"
        knowledgeBase={kb}
        now={() => new Date('2026-10-10T00:00:00Z')}
        {...quiet}
      />,
    );
    await openTom(user);
    expect(screen.queryByText('Oldest requests are listed first.')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Common questions' })).getByText(
        'What does “Acknowledge” do?',
      ),
    ).toBeInTheDocument();
  });

  it('uses translated messages when provided', async () => {
    const user = userEvent.setup();
    render(
      <Tom
        role="RESPONDER"
        context="responder.help-requests"
        mode="DEMO"
        messages={{ ...TOM_MESSAGES_EN, launcherOpen: 'உதவி (Tom)', panelTitle: 'Tom — உதவி' }}
        {...quiet}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'உதவி (Tom)' }));
    expect(screen.getByRole('complementary', { name: 'Tom — உதவி' })).toBeInTheDocument();
  });
});
