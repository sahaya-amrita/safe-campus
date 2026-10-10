/**
 * Tom assistant service. Order of operations:
 *   deterministic gates → eligible knowledge → retrieval → provider (timeout,
 *   shared budget) → strict output validation → deterministic fallback.
 * It never performs an application action.
 */
import {
  ASSISTANT_LIMITS,
  assistantInterpretResponseSchema,
  type AssistantAction,
  type AssistantInterpretRequest,
  type AssistantInterpretResponse,
  type AssistantResponseType,
  type Role,
} from '@sahaya/contracts';
import { z } from 'zod';
import {
  DESTINATIONS,
  TOURS,
  eligibleDocs,
  permittedFor,
  retrieve,
  screenGuides,
  tokens,
  type KnowledgeDoc,
  type RegisteredDestination,
  type RegisteredTour,
} from './knowledge.js';
import type { AssistantProvider, ProviderFailure } from './provider.js';
import { isActionRequest, isEmergencyQuestion, unsafeTextReason } from './safety.js';

const modelOutputSchema = z
  .object({
    type: z.enum([
      'answer',
      'clarification',
      'navigation_suggestion',
      'guided_tour',
      'unsupported',
    ]),
    answer: z.string(),
    action: z
      .object({
        kind: z.enum(['NONE', 'NAVIGATE', 'START_GUIDED_TOUR', 'OPEN_APPROVED_INSTRUCTIONS']),
        target: z.string(),
      })
      .strict(),
    referenceIds: z.array(z.string()).max(10),
  })
  .strict();

export type AssistantEvent =
  | { kind: 'provider_failure'; reason: ProviderFailure }
  | { kind: 'output_rejected'; reason: string }
  | { kind: 'answered'; source: 'AI' | 'RULES' | 'FALLBACK'; latencyMs: number };

export interface AssistantServiceDeps {
  /** null = provider disabled. */
  provider: AssistantProvider | null;
  knowledge: (locale: 'en' | 'ta') => Promise<readonly KnowledgeDoc[]>;
  timeoutMs: number;
  allowDraftContent: boolean;
  /** Shared provider budget; false → fall back without calling the provider. */
  takeProviderBudget: () => boolean;
  now?: () => Date;
  /** Receives counters and reasons only, never question text. */
  onEvent?: (e: AssistantEvent) => void;
}

export interface Caller {
  userId: string;
  roles: readonly Role[];
}

const TEXT = {
  safety:
    "I can't give emergency instructions, routes or contacts. If you or someone else is in danger, follow your campus's official emergency procedures.",
  safetyContacts:
    ' Campus contact numbers, with their verification status, are on the Contacts & resources screen.',
  action:
    "I can't do that for you. Tom never acknowledges, verifies, sends, contacts, submits or changes anything.",
  actionWhere: (label: string) => ` You can do it yourself in ${label}.`,
  unsupported:
    "I don't have approved help for that yet. I can explain this screen, its statuses, or take you to a section.",
  unavailable:
    "The AI assistant isn't available right now, and I couldn't find built-in help for that.",
  tour: 'The responder workspace tour walks through each section in 9 steps. You can stop it any time.',
  navigate: (label: string) => `That's on the ${label} screen.`,
};

const ACTION_DESTINATION: Array<[RegExp, string]> = [
  [/\b(acknowledge|ack|assign)\b/i, 'responder.help-requests'],
  [/\b(verify|approve|reject|refute|confirm|mark|duplicate)\b/i, 'responder.incidents'],
  [/\bdrills?\b/i, 'responder.drills'],
  [/\b(block|blocked|unblock)\b/i, 'responder.map'],
  [/\b(call|phone|dial|contact|ring)\b/i, 'responder.contacts'],
];

const DEST_WORDS: Record<string, string[]> = {
  'responder.overview': [
    'overview',
    'control room',
    'dashboard',
    'check-ins',
    'roll call',
    'roll-call',
    'headcount',
  ],
  'responder.help-requests': ['help requests', 'help request', 'requests'],
  'responder.incidents': ['incidents', 'incident', 'hazard queue', 'hazards', 'hazard', 'reports'],
  'responder.dispatches': ['dispatches', 'dispatch'],
  'responder.alerts': ['alerts', 'alert'],
  'responder.packs': ['instruction packs', 'packs', 'pack'],
  'responder.drills': ['drill console', 'drills', 'drill'],
  'responder.map': ['campus map', 'map', 'blocked areas', 'routes'],
  'responder.contacts': ['contacts', 'contact numbers', 'phone numbers', 'directory', 'resources'],
  'student.home': ['home'],
  'student.map': ['campus map', 'map', 'routes'],
  'student.alerts': ['alerts', 'alert'],
  'student.prepare': ['prepare', 'instructions', 'practice'],
  'student.profile': ['profile', 'trusted contacts', 'settings'],
  'student.report': ['report an incident', 'report'],
};

export class AssistantService {
  constructor(private readonly deps: AssistantServiceDeps) {}

  async interpret(
    req: AssistantInterpretRequest,
    caller: Caller,
  ): Promise<AssistantInterpretResponse> {
    const started = Date.now();
    const now = (this.deps.now ?? (() => new Date()))();
    const locale = req.context.locale;
    const docs = eligibleDocs(await this.deps.knowledge(locale), {
      roles: caller.roles,
      locale,
      now,
      allowDraftContent: this.deps.allowDraftContent,
    });
    const destinations = permittedFor(DESTINATIONS, caller.roles);
    const tours = permittedFor(TOURS, caller.roles);
    const packs = docs.filter((d) => d.kind === 'INSTRUCTION_PACK' && d.instructionPackId);
    const contacts = docs.filter((d) => d.kind === 'CAMPUS_CONTACT');
    const allowedNumbers = contacts.flatMap((c) => c.body.match(/\+?\d[\d\s-]{6,}\d/g) ?? []);

    const finish = (
      type: AssistantResponseType,
      answer: string,
      refs: readonly KnowledgeDoc[],
      action: AssistantAction | null,
      origin: AssistantInterpretResponse['origin'],
    ) => {
      this.deps.onEvent?.({
        kind: 'answered',
        source: origin.source,
        latencyMs: Date.now() - started,
      });
      return assistantInterpretResponseSchema.parse({
        type,
        answer: answer.slice(0, ASSISTANT_LIMITS.answerMaxChars),
        action,
        references: dedupe(refs)
          .slice(0, ASSISTANT_LIMITS.maxReferences)
          .map((d) => ({
            id: d.id,
            kind: d.kind,
            title: d.title,
            version: d.version,
            source: d.source,
            reviewState: d.review.state,
          })),
        origin,
        generatedAt: now.toISOString(),
      });
    };
    const RULES = {
      source: 'RULES' as const,
      provider: 'rules' as const,
      model: null,
      fallbackReason: null,
    };
    const nav = (id: string): AssistantAction | null =>
      destinations.some((d) => d.id === id) ? { type: 'NAVIGATE', destinationId: id } : null;

    // 1. Emergencies never reach a model.
    if (isEmergencyQuestion(req.question)) {
      const toContacts = nav('responder.contacts');
      return finish(
        'safety_redirect',
        TEXT.safety + (toContacts ? TEXT.safetyContacts : ''),
        [...contacts, ...packs],
        toContacts,
        RULES,
      );
    }
    // 2. Requests to perform consequential actions are refused by rules.
    if (isActionRequest(req.question)) {
      const target = ACTION_DESTINATION.find(([re]) => re.test(req.question))?.[1];
      const action = target ? nav(target) : null;
      const label = action ? destinations.find((d) => d.id === target)!.label : null;
      return finish(
        'unsupported',
        TEXT.action + (label ? TEXT.actionWhere(label) : ''),
        [],
        action,
        RULES,
      );
    }

    // 3. Retrieval: question + the previous user turn, so follow-ups stay on topic.
    const prevUser = [...req.history].reverse().find((t) => t.role === 'user')?.content ?? '';
    const retrieved = retrieve(`${req.question} ${prevUser}`, docs, req.context.screen, 6);
    // The model also always sees the current screen's guide; rules use only real matches.
    const modelDocs = dedupe([...retrieved, ...screenGuides(docs, req.context.screen)]).slice(0, 7);
    const screenLabel = destinations.find((d) => d.id === req.context.screen)?.label ?? null;

    const fallback = (
      reason: ProviderFailure | 'PROVIDER_DISABLED',
    ): AssistantInterpretResponse => {
      const origin = {
        source: 'FALLBACK' as const,
        provider: 'rules' as const,
        model: null,
        fallbackReason: reason,
      };
      const r = this.rules(req.question, retrieved, destinations, tours, allowedNumbers);
      if (r) return finish(r.type, r.answer, r.refs, r.action, origin);
      return reason === 'PROVIDER_DISABLED'
        ? finish('unsupported', TEXT.unsupported, [], null, origin)
        : finish('unavailable', TEXT.unavailable, [], null, origin);
    };

    const provider = this.deps.provider;
    if (!provider) return fallback('PROVIDER_DISABLED');
    if (!this.deps.takeProviderBudget()) {
      this.deps.onEvent?.({ kind: 'provider_failure', reason: 'RATE_LIMITED' });
      return fallback('RATE_LIMITED');
    }

    // 4. Provider call with a hard timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs);
    let result: Awaited<ReturnType<AssistantProvider['generate']>>;
    try {
      result = await Promise.race([
        provider.generate(
          {
            question: req.question,
            history: req.history,
            screen: req.context.screen,
            screenLabel,
            locale,
            documents: modelDocs.map((d) => ({
              id: d.id,
              kind: d.kind,
              title: d.title,
              body: d.body,
            })),
            destinations: destinations.map((d) => ({ id: d.id, label: d.label })),
            tours: tours.map((t) => ({ id: t.id, title: t.title })),
            instructionPacks: packs.map((p) => ({ id: p.instructionPackId!, title: p.title })),
          },
          controller.signal,
        ),
        new Promise<{ ok: false; reason: 'TIMEOUT' }>((resolve) =>
          controller.signal.addEventListener('abort', () =>
            resolve({ ok: false, reason: 'TIMEOUT' }),
          ),
        ),
      ]);
    } catch {
      result = { ok: false, reason: 'UNAVAILABLE' };
    } finally {
      clearTimeout(timer);
    }
    if (!result.ok) {
      this.deps.onEvent?.({ kind: 'provider_failure', reason: result.reason });
      return fallback(result.reason);
    }

    // 5. Validate everything the model said.
    const checked = this.validate(
      result.output,
      modelDocs,
      destinations,
      tours,
      packs,
      allowedNumbers,
    );
    if ('rejected' in checked) {
      this.deps.onEvent?.({ kind: 'output_rejected', reason: checked.rejected });
      return fallback('INVALID_OUTPUT');
    }
    return finish(checked.type, checked.answer, checked.refs, checked.action, {
      source: 'AI',
      provider: provider.name,
      model: provider.model,
      fallbackReason: null,
    });
  }

  /** Deterministic answer from registered data only. Quoted text gets the same post-checks as model text. */
  private rules(
    question: string,
    retrieved: readonly KnowledgeDoc[],
    destinations: readonly RegisteredDestination[],
    tours: readonly RegisteredTour[],
    allowedNumbers: readonly string[],
  ): {
    type: AssistantResponseType;
    answer: string;
    refs: KnowledgeDoc[];
    action: AssistantAction | null;
  } | null {
    const q = question.toLowerCase();
    if (
      /\b(tour|walk ?me ?through|show me around|guide me|getting started)\b/.test(q) &&
      tours[0]
    ) {
      const tourDoc = retrieved.filter((d) => d.kind === 'TOUR');
      return {
        type: 'guided_tour',
        answer: TEXT.tour,
        refs: tourDoc,
        action: { type: 'START_GUIDED_TOUR', tourId: tours[0].id },
      };
    }
    const qt = new Set(tokens(q));
    const named = destinations.filter((d) =>
      (DEST_WORDS[d.id] ?? []).some((w) => (w.includes(' ') ? q.includes(w) : qt.has(w))),
    );
    if (named.length === 1 && /\b(go|take|open|show|where|navigate|find|switch)\b/.test(q)) {
      const d = named[0]!;
      const guide = retrieved.filter((r) => r.screens?.includes(d.id)).slice(0, 1);
      return {
        type: 'navigation_suggestion',
        answer: TEXT.navigate(d.label),
        refs: guide,
        action: { type: 'NAVIGATE', destinationId: d.id },
      };
    }
    const top = retrieved.find(
      (d) => unsafeTextReason(`${d.title}: ${d.body}`, allowedNumbers) === null,
    );
    if (top)
      return { type: 'answer', answer: `${top.title}: ${top.body}`, refs: [top], action: null };
    return null;
  }

  private validate(
    raw: unknown,
    retrieved: readonly KnowledgeDoc[],
    destinations: readonly RegisteredDestination[],
    tours: readonly RegisteredTour[],
    packs: readonly KnowledgeDoc[],
    allowedNumbers: readonly string[],
  ):
    | { rejected: string }
    | {
        type: AssistantResponseType;
        answer: string;
        refs: KnowledgeDoc[];
        action: AssistantAction | null;
      } {
    const parsed = modelOutputSchema.safeParse(raw);
    if (!parsed.success) return { rejected: 'SCHEMA' };
    const out = parsed.data;
    const answer = out.answer.trim();
    if (!answer || answer.length > ASSISTANT_LIMITS.answerMaxChars)
      return { rejected: 'ANSWER_LENGTH' };
    const unsafe = unsafeTextReason(answer, allowedNumbers);
    if (unsafe) return { rejected: unsafe };

    const supplied = new Map(retrieved.map((d) => [d.id, d]));
    if (out.referenceIds.some((id) => !supplied.has(id))) return { rejected: 'UNKNOWN_REFERENCE' };
    const refs = [...new Set(out.referenceIds)].map((id) => supplied.get(id)!);
    if (out.type === 'answer' && refs.length === 0) return { rejected: 'UNGROUNDED' };

    const target = out.action.target.trim();
    let action: AssistantAction | null = null;
    switch (out.action.kind) {
      case 'NONE':
        break;
      case 'NAVIGATE':
        if (!destinations.some((d) => d.id === target)) return { rejected: 'ACTION_TARGET' };
        action = { type: 'NAVIGATE', destinationId: target };
        break;
      case 'START_GUIDED_TOUR':
        if (!tours.some((t) => t.id === target)) return { rejected: 'ACTION_TARGET' };
        action = { type: 'START_GUIDED_TOUR', tourId: target };
        break;
      case 'OPEN_APPROVED_INSTRUCTIONS':
        if (!packs.some((p) => p.instructionPackId === target))
          return { rejected: 'ACTION_TARGET' };
        action = { type: 'OPEN_APPROVED_INSTRUCTIONS', instructionPackId: target };
        break;
    }
    if (out.type === 'navigation_suggestion' && action?.type !== 'NAVIGATE')
      return { rejected: 'TYPE_ACTION_MISMATCH' };
    if (out.type === 'guided_tour' && action?.type !== 'START_GUIDED_TOUR')
      return { rejected: 'TYPE_ACTION_MISMATCH' };
    if (out.type === 'unsupported') action = null;
    return { type: out.type, answer, refs, action };
  }
}

function dedupe(docs: readonly KnowledgeDoc[]): KnowledgeDoc[] {
  const seen = new Set<string>();
  return docs.filter((d) => !seen.has(d.id) && (seen.add(d.id), true));
}
