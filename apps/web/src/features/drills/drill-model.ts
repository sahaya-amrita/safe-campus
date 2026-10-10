/** Local-only simulation adapter; replace with shared contracts after backend coordination. */
export const PHASES = ['Prepare', 'Respond', 'Reflect', 'Improve'] as const;
export type DrillPhase = typeof PHASES[number];
export interface DrillChoice { id: string; label: string; }
export interface DrillStep {
  phase: DrillPhase;
  title: string;
  description: string;
  choices: readonly DrillChoice[];
  correctChoice: string;
  feedback: string;
}
export const STEPS: readonly DrillStep[] = [
  { phase: 'Prepare', title: 'Check the simulation boundary',
    description: 'Fictional scenario: a campus coordination screen is being reviewed. All choices are on screen; this exercise does not direct physical movement. What should you establish first?',
    choices: [{ id: 'boundary', label: 'Confirm demo mode and distinguish synthetic data from approved information.' },
      { id: 'assume', label: 'Assume the sample map is approved campus information.' }],
    correctChoice: 'boundary', feedback: 'Demonstration data cannot establish approved routes or official instructions.' },
  { phase: 'Respond', title: 'Review a fictional hazard report',
    description: 'Fictional event: several synthetic reports describe the same issue. The reports have not been reviewed by an authorized person. Which interpretation is supported?',
    choices: [{ id: 'broadcast', label: 'The number of reports is sufficient to issue an official alert.' },
      { id: 'review', label: 'The reports remain unverified and need authorized human review.' }],
    correctChoice: 'review', feedback: 'Report volume does not verify an incident or authorize a campus-wide notice.' },
  { phase: 'Reflect', title: 'Interpret the submission status',
    description: 'Fictional event: a report was saved on a device while offline. There is no server acknowledgement. What can the interface honestly claim?',
    choices: [{ id: 'local', label: 'Saved locally; not sent to the server or acknowledged by a responder.' },
      { id: 'help', label: 'A responder has received it and is coming.' }],
    correctChoice: 'local', feedback: 'Local storage, server receipt and responder acknowledgement are separate states.' },
  { phase: 'Improve', title: 'Choose a review action',
    description: 'The sample map has no institution-approved geometry. Choose the improvement to record in this digital debrief.',
    choices: [{ id: 'invent', label: 'Estimate a route from the synthetic diagram.' },
      { id: 'provenance', label: 'Request approved map geometry and review its source, version and validity before navigation.' }],
    correctChoice: 'provenance', feedback: 'Operational navigation needs approved, current geometry with authorized provenance.' },
];

export interface DrillEvent {
  id: string;
  sessionId: string;
  scenarioId: 'coordination-screen-review-v1';
  mode: 'DEMO';
  phase: DrillPhase;
  choiceId: string;
  createdAt: string;
}
export interface DrillState {
  sessionId: string;
  events: readonly DrillEvent[];
}
export interface DrillReceipt { eventId: string; storage: 'LOCAL_ONLY'; }
export interface DrillStore {
  /** Never accepts a live mode, recipient, message, alarm, or dispatch operation. */
  append(event: DrillEvent): Promise<DrillReceipt>;
}

export function newDrill(sessionId: string): DrillState {
  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(sessionId)) throw new Error('Invalid simulation session ID');
  return { sessionId, events: [] };
}

export function createEvent(state: DrillState, choiceId: string, now: Date): DrillEvent {
  const step = STEPS[state.events.length];
  if (!step || !step.choices.some((choice) => choice.id === choiceId)) throw new Error('Invalid phase or choice');
  return {
    id: `${state.sessionId}-${state.events.length}`, sessionId: state.sessionId,
    scenarioId: 'coordination-screen-review-v1', mode: 'DEMO', phase: step.phase,
    choiceId, createdAt: now.toISOString(),
  };
}

export function isDrillEvent(value: unknown): value is DrillEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  const step = STEPS.find((item) => item.phase === event.phase);
  if (!step) return false;
  return typeof event.sessionId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(event.sessionId)
    && event.id === `${event.sessionId}-${STEPS.indexOf(step)}`
    && event.scenarioId === 'coordination-screen-review-v1' && event.mode === 'DEMO'
    && step.choices.some((choice) => choice.id === event.choiceId)
    && typeof event.createdAt === 'string' && Number.isFinite(Date.parse(event.createdAt))
    && new Date(event.createdAt).toISOString() === event.createdAt
    && Object.keys(event).sort().join(',') === 'choiceId,createdAt,id,mode,phase,scenarioId,sessionId';
}

export function applyEvent(state: DrillState, event: DrillEvent): DrillState {
  if (!isDrillEvent(event) || event.sessionId !== state.sessionId
    || event.phase !== STEPS[state.events.length]?.phase) throw new Error('Out-of-order or invalid simulation event');
  return { sessionId: state.sessionId, events: [...state.events, { ...event }] };
}

export function summarize(state: DrillState) {
  return {
    completed: state.events.length === STEPS.length,
    score: state.events.filter((event, index) => event.choiceId === STEPS[index]?.correctChoice).length,
    total: STEPS.length,
    meaning: 'Interface-literacy score only; not a measure of emergency readiness or personal safety.',
  };
}

/** In-memory, idempotent storage. Page reload clears it; no network or persistent personal data. */
export function createMemoryDrillStore(): DrillStore {
  const events = new Map<string, DrillEvent>();
  return {
    async append(event) {
      if (!isDrillEvent(event)) throw new Error('Only valid DEMO events can be stored');
      const existing = events.get(event.id);
      if (existing && (Object.keys(existing) as (keyof DrillEvent)[]).some((key) => existing[key] !== event[key])) {
        throw new Error('Conflicting event ID');
      }
      if (!existing) {
        const sessionEvents = [...events.values()].filter((item) => item.sessionId === event.sessionId);
        applyEvent({ sessionId: event.sessionId, events: sessionEvents }, event);
        events.set(event.id, { ...event });
      }
      return { eventId: event.id, storage: 'LOCAL_ONLY' };
    },
  };
}
