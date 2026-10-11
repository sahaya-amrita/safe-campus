import { describe, expect, it } from 'vitest';
import { RESPONDER_DESTINATIONS } from '../../features/responder/navigation';
import { interpret, LOCAL_ONLY_REPLIES, type AssistantContext } from './assistant';
import { DEFAULT_TOM_KNOWLEDGE } from './knowledgeBase';
import { navigateSafely, type TomNavigationAdapter } from './navigation';
import { selectEntries } from './tomLogic';

const { hints, faqs, tours } = selectEntries(DEFAULT_TOM_KNOWLEDGE, {
  role: 'RESPONDER',
  context: 'responder.help-requests',
  mode: 'DEMO',
});
const ctx: AssistantContext = {
  destinations: RESPONDER_DESTINATIONS,
  currentDestination: 'responder.help-requests',
  hints,
  faqs,
  tours,
};
const kind = (q: string) => interpret(q, ctx).kind;
const dest = (q: string) => {
  const r = interpret(q, ctx);
  return 'destination' in r && r.destination ? r.destination.id : null;
};

describe('deterministic intent registry', () => {
  it.each([
    ['take me to hazard review', 'responder.hazard-review'],
    ['open roll call', 'responder.roll-call'],
    ['where are the phone numbers?', 'responder.contacts'],
    ['show campus contacts', 'responder.contacts'],
    ['navigate to the hazards', 'responder.hazard-review'],
  ])('navigates: %s', (q, id) => {
    expect(kind(q)).toBe('NAVIGATE');
    expect(dest(q)).toBe(id);
  });

  it('leaves real questions that merely mention a screen to the assistant', () => {
    const drills = {
      id: 'responder.drills',
      label: 'Drills',
      description: 'Drill console',
      keywords: ['drill', 'stop', 'kill switch'],
      roles: ['RESPONDER' as const],
    };
    const here: AssistantContext = {
      ...ctx,
      destinations: [...ctx.destinations, drills],
      currentDestination: 'responder.drills',
    };
    // A follow-up starting with "and" is still a question, not an action or navigation.
    const reply = interpret('and who is allowed to press the stop button?', here);
    expect(reply.kind).toBe('UNKNOWN');
    expect(LOCAL_ONLY_REPLIES.has(reply.kind)).toBe(false);
    // Just the name, or an explicit "go to", still navigates locally.
    expect(interpret('drills', here).kind).toBe('ALREADY_HERE');
    expect(interpret('go to drills', here).kind).toBe('ALREADY_HERE');
  });

  it("knows when you're already there", () =>
    expect(kind('go to help requests')).toBe('ALREADY_HERE'));
  it('asks when two destinations match', () =>
    expect(kind('show requests and hazards')).toBe('AMBIGUOUS'));
  it('offers, but does not perform, navigation without a verb', () =>
    expect(kind('roll call')).toBe('SUGGEST_NAVIGATE'));
  it('describes a section when asked what it is', () =>
    expect(kind('what is hazard review?')).toBe('SUGGEST_NAVIGATE'));
  it('goes back', () => expect(kind('go back')).toBe('BACK'));
  it('offers a tour', () => expect(kind('can you show me around')).toBe('TOUR'));
  it('explains the current screen', () =>
    expect(kind('what can I do here?')).toBe('EXPLAIN_SCREEN'));
  it('answers from approved help', () =>
    expect(kind('what does acknowledge do')).toBe('EXPLAIN_TOPIC'));
  it('returns approved instructions', () =>
    expect(kind('where are the official procedures')).toBe('INSTRUCTIONS'));
  it('falls back safely', () => expect(kind('best pizza near campus')).toBe('UNKNOWN'));

  it.each([
    ['acknowledge DEMO-HR-001', 'ACKNOWLEDGE'],
    ['Tom, please acknowledge the oldest request', 'ACKNOWLEDGE'],
    ['verify DEMO-HZ-004', 'HAZARD_DECISION'],
    ['mark it as duplicate', 'HAZARD_DECISION'],
    ['send an alert', 'SEND_ALERT'],
    ['notify all students', 'SEND_ALERT'],
    ['can you submit a hazard report', 'SUBMIT'],
    ['resolve the request', 'ASSIGN_OR_CLOSE'],
  ])('refuses: %s', (q, action) => {
    const r = interpret(q, ctx);
    expect(r.kind).toBe('REFUSE_ACTION');
    if (r.kind === 'REFUSE_ACTION') expect(r.action).toBe(action);
  });

  it('treats questions about an action as questions, not commands', () => {
    expect(kind('how do I acknowledge a request?')).toBe('EXPLAIN_TOPIC');
    expect(kind('how do I mark a duplicate?')).not.toBe('REFUSE_ACTION');
  });

  it.each([
    'there is a fire',
    'someone is injured',
    'call security now',
    'which exit should I use',
    'I need help',
  ])('emergency fallback: %s', (q) => expect(kind(q)).toBe('EMERGENCY_FALLBACK'));

  it('regression: section names are not emergency words', () => {
    expect(kind('roll call')).toBe('SUGGEST_NAVIGATE');
    expect(kind('roll call please')).toBe('SUGGEST_NAVIGATE');
    expect(kind('what is the security office?')).toBe('SUGGEST_NAVIGATE');
    // Asking for a number is treated as possibly urgent: the safe fallback lists contacts with their status.
    expect(kind('what is the security office number')).toBe('EMERGENCY_FALLBACK');
    expect(kind('call the security office')).toBe('EMERGENCY_FALLBACK');
  });

  it('an emergency word never routes to a destination by itself', () => {
    expect(kind('where is the assembly point')).toBe('EMERGENCY_FALLBACK');
    expect(kind('take me to the fire exit')).toBe('EMERGENCY_FALLBACK');
  });
});

describe('what may reach the assistant server', () => {
  it('safety-critical and explicit intents always stay local', () => {
    for (const q of [
      'there is a fire',
      'acknowledge DEMO-HR-001',
      'take me to hazard review',
      'go back',
      'give me a tour',
      'show me the official procedures',
    ]) {
      expect(LOCAL_ONLY_REPLIES.has(interpret(q, ctx).kind)).toBe(true);
    }
  });
  it('open questions may go to the server', () => {
    for (const q of ['best pizza near campus', 'what does acknowledge do', 'roll call']) {
      expect(LOCAL_ONLY_REPLIES.has(interpret(q, ctx).kind)).toBe(false);
    }
  });
});

describe('navigateSafely', () => {
  const base: TomNavigationAdapter = {
    destinations: () => RESPONDER_DESTINATIONS,
    current: () => null,
    canNavigate: () => true,
    navigate: () => ({ ok: true }),
  };
  it('refuses unregistered ids before asking the host', async () => {
    let asked = false;
    const r = await navigateSafely(
      { ...base, canNavigate: () => ((asked = true), true) },
      '/admin',
    );
    expect(r).toEqual({ ok: false, reason: 'NOT_REGISTERED' });
    expect(asked).toBe(false);
  });
  it('reports denial and errors honestly', async () => {
    expect(
      await navigateSafely({ ...base, canNavigate: () => false }, 'responder.contacts'),
    ).toEqual({ ok: false, reason: 'NOT_PERMITTED' });
    expect(
      await navigateSafely(
        {
          ...base,
          navigate: () => {
            throw new Error('router');
          },
        },
        'responder.contacts',
      ),
    ).toEqual({ ok: false, reason: 'FAILED' });
    expect(await navigateSafely(undefined, 'responder.contacts')).toEqual({
      ok: false,
      reason: 'UNAVAILABLE',
    });
  });
});
