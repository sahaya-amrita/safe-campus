import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CampusContact } from "../../features/responder/campusDirectory";
import { contactsForMode, VERIFICATION_PRESENTATION } from "../../features/responder/campusDirectory";
import type { TomAiAdapter } from "./aiAdapter";
import { disabledTomAi, isAiAvailable, MAX_AI_TEXT } from "./aiAdapter";
import type { AssistantContext, AssistantReply, TomAssistantBackend } from "./assistant";
import { acceptProposal, buildBackendInput, disabledAssistantBackend, interpret } from "./assistant";
import { DEFAULT_TOM_KNOWLEDGE } from "./knowledgeBase";
import type { TomDestination, TomNavigationAdapter, TomNavigationResult } from "./navigation";
import { goBackSafely, navigateSafely } from "./navigation";
import { TomAvatar } from "./TomAvatar";
import type { TomMessages } from "./tomMessages";
import { ACTION_WORDS_EN, TOM_MESSAGES_EN } from "./tomMessages";
import { selectEntries, usableInstructions } from "./tomLogic";
import type { TomStore } from "./tomStorage";
import {
  defaultPersistentStore,
  defaultStore,
  readDismissed,
  readMinimised,
  readOnboarded,
  readShortcutOff,
  writeDismissed,
  writeMinimised,
  writeOnboarded,
  writeShortcutOff,
} from "./tomStorage";
import { TourRunner } from "./TourRunner";
import { useTourTarget } from "./tourTargets";
import type { AppMode, ApprovedInstructionLink, Role, TomContext, TomEntry, TomTour } from "./types";
import "./tom.css";

export interface TomProps {
  /** Role from the authenticated session, used only to choose help content. */
  role: Role;
  /** Current screen id; should match a registered destination id when one applies. */
  context: TomContext;
  mode: AppMode;
  knowledgeBase?: readonly TomEntry[];
  approvedInstructions?: readonly ApprovedInstructionLink[];
  /** Campus contacts; LIVE shows institution-confirmed ones only. */
  contacts?: readonly CampusContact[];
  /** Host navigation. Without it, Tom explains but cannot move the user. */
  navigation?: TomNavigationAdapter;
  /** Optional rephrasing of help entries (disabled by default, never in LIVE). */
  ai?: TomAiAdapter;
  /** Optional backend that routes unmatched questions (disabled by default, never in LIVE). */
  assistant?: TomAssistantBackend;
  /** Show the first-visit welcome. Default true. */
  onboarding?: boolean;
  /** Allow the "?" shortcut (users can still turn it off). Default true. */
  keyboardShortcut?: boolean;
  /** Session-only preferences (sessionStorage by default). */
  store?: TomStore | null;
  /** Long-lived per-viewer flags (localStorage by default). */
  persistentStore?: TomStore | null;
  now?: () => Date;
  /** Translated strings (shared i18n). Defaults to English. */
  messages?: TomMessages;
}

type NavState = "PENDING" | "DONE" | "NOT_REGISTERED" | "NOT_PERMITTED" | "UNAVAILABLE" | "FAILED";
type ThreadItem =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "tom"; reply: AssistantReply; nav?: NavState; viaBackend?: boolean };

const MAX_THREAD = 12;

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

const toNavState = (r: TomNavigationResult): NavState => (r.ok ? "DONE" : r.reason);

/**
 * Tom: an optional, closed-by-default in-app guide. The panel is a non-modal
 * complementary region (no focus trap, no backdrop). Tom can explain screens,
 * move the user between destinations the host registered (through the host's
 * own authorization), and run guided tours. It cannot acknowledge, review,
 * submit, alert or contact anything.
 */
export function Tom({
  role,
  context,
  mode,
  knowledgeBase = DEFAULT_TOM_KNOWLEDGE,
  approvedInstructions,
  contacts = [],
  navigation,
  ai = disabledTomAi,
  assistant = disabledAssistantBackend,
  onboarding = true,
  keyboardShortcut = true,
  store,
  persistentStore,
  now = () => new Date(),
  messages: m = TOM_MESSAGES_EN,
}: TomProps) {
  const session = store === undefined ? defaultStore() : store;
  const persist = persistentStore === undefined ? defaultPersistentStore() : persistentStore;
  const uid = useId();
  const panelId = `${uid}-tom-panel`;
  const [minimised, setMinimised] = useState(() => readMinimised(session));
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => readDismissed(session));
  const [welcome, setWelcome] = useState(() => onboarding && !readOnboarded(persist));
  const [shortcutOn, setShortcutOn] = useState(() => !readShortcutOff(persist));
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [question, setQuestion] = useState("");
  const [tour, setTour] = useState<TomTour | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const tourReturn = useRef<{ focus: Element | null; destination: string | null }>({ focus: null, destination: null });
  const nextId = useRef(1);
  const registerLauncher = useTourTarget("tom.launcher");

  const nowDate = now();
  const { hints, faqs, tours } = selectEntries(knowledgeBase, { role, context, mode, now: nowDate });
  const instructions = usableInstructions(approvedInstructions, nowDate);
  const shownContacts = contactsForMode(contacts, mode).shown;
  const visibleHints = hints.filter((h) => !dismissed.has(h.id));
  const aiOn = isAiAvailable(ai, mode);
  const backendOn = isAiAvailable(assistant, mode);
  const destinations = navigation?.destinations() ?? [];
  const currentDestination = navigation?.current() ?? context;
  const assistantCtx: AssistantContext = { destinations, currentDestination, hints, faqs, tours };
  const workspaceTour = tours.find((t) => t.steps.length > 0) ?? null;

  const launcherRefCallback = useCallback(
    (el: HTMLButtonElement | null) => {
      launcherRef.current = el;
      registerLauncher(el);
    },
    [registerLauncher],
  );

  // A different user: drop the conversation (it is never persisted).
  useEffect(() => setThread([]), [role]);

  useEffect(() => {
    if (open) headingRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      launcherRef.current?.focus();
    }
  }, [open, minimised]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [thread]);

  const markOnboarded = useCallback(() => {
    setWelcome(false);
    writeOnboarded(persist);
  }, [persist]);

  const openPanel = useCallback(() => {
    markOnboarded();
    setOpen(true);
  }, [markOnboarded]);

  function close() {
    returnFocus.current = true;
    setOpen(false);
  }

  function restore() {
    writeMinimised(session, false);
    setMinimised(false);
    openPanel();
  }

  function minimise() {
    writeMinimised(session, true);
    returnFocus.current = true;
    setOpen(false);
    setMinimised(true);
  }

  // Optional "?" shortcut: ignored while typing, with modifiers, or during a tour.
  useEffect(() => {
    if (!keyboardShortcut || !shortcutOn || tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || isEditable(e.target)) return;
      e.preventDefault();
      if (minimised) {
        writeMinimised(session, false);
        setMinimised(false);
      }
      openPanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keyboardShortcut, shortcutOn, tour, minimised, session, openPanel]);

  // ---- tours -------------------------------------------------------------
  function startTour(t: TomTour | null) {
    markOnboarded();
    if (!t) {
      setAnnouncement(m.tourUnavailable);
      return;
    }
    tourReturn.current = { focus: document.activeElement, destination: navigation?.current() ?? null };
    setOpen(false);
    setTour(t);
  }

  const endTour = useCallback(() => {
    setTour(null);
    const { focus, destination } = tourReturn.current;
    const back = destination && navigation && navigation.current() !== destination ? destination : null;
    const label = back ? destinations.find((d) => d.id === back)?.label ?? back : null;
    if (back) void navigateSafely(navigation, back);
    setAnnouncement(label ? `${m.tourEnded} ${m.navDone(label)}` : m.tourEnded);
    requestAnimationFrame(() => {
      const target = focus instanceof HTMLElement && focus.isConnected && focus !== document.body ? focus : launcherRef.current;
      target?.focus();
    });
  }, [navigation, destinations, m]);

  // ---- assistant ---------------------------------------------------------
  function pushTom(reply: AssistantReply, extra: Partial<Extract<ThreadItem, { from: "tom" }>> = {}): number {
    const id = nextId.current++;
    setThread((t) => [...t, { id, from: "tom" as const, reply, ...extra }].slice(-MAX_THREAD));
    return id;
  }

  function setNav(id: number, nav: NavState) {
    setThread((t) => t.map((i) => (i.id === id && i.from === "tom" ? { ...i, nav } : i)));
  }

  async function goTo(destination: TomDestination) {
    const id = pushTom({ kind: "NAVIGATE", destination }, { nav: "PENDING" });
    setNav(id, toNavState(await navigateSafely(navigation, destination.id)));
  }

  async function act(reply: AssistantReply, viaBackend = false) {
    if (reply.kind === "NAVIGATE") {
      const id = pushTom(reply, { nav: "PENDING", viaBackend });
      setNav(id, toNavState(await navigateSafely(navigation, reply.destination.id)));
    } else if (reply.kind === "BACK") {
      const id = pushTom(reply, { nav: "PENDING", viaBackend });
      setNav(id, toNavState(await goBackSafely(navigation)));
    } else {
      pushTom(reply, { viaBackend });
    }
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q) return;
    markOnboarded();
    setThread((t) => [...t, { id: nextId.current++, from: "user" as const, text: q }].slice(-MAX_THREAD));
    setQuestion("");
    let reply = interpret(q, assistantCtx);
    let viaBackend = false;
    if (reply.kind === "UNKNOWN" && backendOn) {
      try {
        const proposal = await assistant.interpret(buildBackendInput(q, role, context, assistantCtx));
        const accepted = acceptProposal(proposal, assistantCtx);
        if (accepted.kind !== "UNKNOWN") {
          reply = accepted;
          viaBackend = true;
        }
      } catch {
        /* keep the deterministic UNKNOWN reply */
      }
    }
    await act(reply, viaBackend);
  }

  // ---- render ------------------------------------------------------------
  function dismissHint(id: string) {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    writeDismissed(session, next);
  }

  function restoreHints() {
    const next = new Set([...dismissed].filter((id) => !hints.some((h) => h.id === id)));
    setDismissed(next);
    writeDismissed(session, next);
  }

  const otherDestination = destinations.find((d) => d.id !== currentDestination) ?? null;
  const suggestions = [
    "What can I do here?",
    workspaceTour ? "Give me a tour" : null,
    otherDestination ? `Take me to ${otherDestination.label}` : null,
    faqs[0]?.title ?? null,
  ].filter((s): s is string => Boolean(s));

  const liveRegion = (
    <div className="sc-tom__sr" role="status" aria-live="polite">
      {announcement}
    </div>
  );

  if (minimised && !tour) {
    return (
      <div className="sc-tom sc-tom--minimised" data-mode={mode}>
        {liveRegion}
        <button
          ref={launcherRefCallback}
          type="button"
          className="sc-tom__launcher sc-tom__launcher--compact"
          aria-label={m.restoreLauncher}
          title={m.restoreLauncher}
          onClick={restore}
        >
          <TomAvatar size={26} />
        </button>
      </div>
    );
  }

  return (
    <div className="sc-tom" data-mode={mode}>
      {liveRegion}
      {tour && <TourRunner tour={tour} navigation={navigation} messages={m} onEnd={endTour} />}

      {welcome && !open && !tour && (
        <section
          className="sc-tom__welcome"
          aria-labelledby={`${uid}-welcome`}
          onKeyDown={(e) => {
            if (e.key === "Escape") markOnboarded();
          }}
        >
          <TomAvatar size={34} />
          <div className="sc-tom__welcome-text">
            <h2 id={`${uid}-welcome`}>{m.welcomeTitle}</h2>
            <p>{m.welcomeBody}</p>
            <div className="sc-tom__row">
              {workspaceTour && (
                <button type="button" className="sc-tom__primary" onClick={() => startTour(workspaceTour)}>
                  {m.welcomeTour}
                </button>
              )}
              <button type="button" onClick={markOnboarded}>
                {m.welcomeLater}
              </button>
            </div>
          </div>
        </section>
      )}

      {open && !tour && (
        <aside
          id={panelId}
          className="sc-tom__panel"
          aria-labelledby={`${uid}-tom-title`}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="sc-tom__head">
            <TomAvatar size={36} />
            <h2 id={`${uid}-tom-title`} tabIndex={-1} ref={headingRef}>
              {m.panelTitle}
            </h2>
            <button type="button" className="sc-tom__close" onClick={close} aria-label={m.closePanel}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="sc-tom__body">
            <p className="sc-tom__scope">{m.scope}</p>
            {mode !== "LIVE" && <p className="sc-tom__draft">{m.draftNotice(mode)}</p>}

            <section aria-label="Ask Tom" className="sc-tom__section sc-tom__ask-section">
              <div className="sc-tom__thread" role="log" aria-label={m.threadLabel}>
                {thread.map((item) =>
                  item.from === "user" ? (
                    <p key={item.id} className="sc-tom__msg sc-tom__msg--user">
                      <span className="sc-tom__sr">{m.you}: </span>
                      {item.text}
                    </p>
                  ) : (
                    <div key={item.id} className="sc-tom__msg sc-tom__msg--tom" data-reply={item.reply.kind}>
                      <ReplyView
                        item={item}
                        m={m}
                        role={role}
                        instructions={instructions}
                        contacts={shownContacts}
                        onGo={goTo}
                        onTour={startTour}
                      />
                    </div>
                  ),
                )}
                <div ref={threadEndRef} />
              </div>
              {thread.length === 0 && (
                <div className="sc-tom__suggest">
                  <p className="sc-tom__muted">{m.suggestionsLabel}</p>
                  <div className="sc-tom__chips">
                    {suggestions.map((s) => (
                      <button key={s} type="button" className="sc-tom__chip" onClick={() => void ask(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <form
                className="sc-tom__ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(question);
                }}
              >
                <label htmlFor={`${uid}-q`}>{m.askLabel}</label>
                <div className="sc-tom__row">
                  <input
                    id={`${uid}-q`}
                    type="text"
                    autoComplete="off"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  <button type="submit" className="sc-tom__primary">
                    {m.askButton}
                  </button>
                </div>
              </form>
              <p className="sc-tom__muted sc-tom__proto">{m.prototypeNotice}</p>
            </section>

            <section aria-label={m.tipsHeading} className="sc-tom__section">
              <h3>{m.tipsHeading}</h3>
              {visibleHints.length === 0 ? (
                <p className="sc-tom__muted">{m.noTips}</p>
              ) : (
                <ul className="sc-tom__tips">
                  {visibleHints.map((h) => (
                    <li key={h.id}>
                      <p>
                        <strong>{h.title}.</strong> {h.body}
                      </p>
                      <button type="button" className="sc-tom__link" onClick={() => dismissHint(h.id)} aria-label={m.dismissTip(h.title)}>
                        {m.dismissTipButton}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {hints.some((h) => dismissed.has(h.id)) && (
                <button type="button" className="sc-tom__link" onClick={restoreHints}>
                  {m.showDismissedTips}
                </button>
              )}
              {workspaceTour && (
                <button type="button" className="sc-tom__primary sc-tom__tour-start" onClick={() => startTour(workspaceTour)}>
                  {m.tourStart(workspaceTour.steps.length)}
                </button>
              )}
            </section>

            <section aria-label={m.faqHeading} className="sc-tom__section">
              <h3>{m.faqHeading}</h3>
              {faqs.length === 0 ? (
                <p className="sc-tom__muted">{m.noFaqs}</p>
              ) : (
                faqs.map((f) => <FaqItem key={f.id} entry={f} role={role} ai={aiOn ? ai : null} m={m} />)
              )}
            </section>

            <section aria-label={m.officialHeading} className="sc-tom__section">
              <h3>{m.officialHeading}</h3>
              <InstructionLinks instructions={instructions} m={m} />
            </section>
          </div>
          <div className="sc-tom__foot">
            {keyboardShortcut && (
              <label className="sc-tom__toggle">
                <input
                  type="checkbox"
                  checked={shortcutOn}
                  onChange={(e) => {
                    setShortcutOn(e.target.checked);
                    writeShortcutOff(persist, !e.target.checked);
                  }}
                />{" "}
                {m.shortcutToggle}
              </label>
            )}
            <button type="button" className="sc-tom__link" onClick={minimise}>
              {m.minimise}
            </button>
          </div>
        </aside>
      )}
      <button
        ref={launcherRefCallback}
        type="button"
        className="sc-tom__launcher"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-keyshortcuts={keyboardShortcut && shortcutOn ? "Shift+?" : undefined}
        onClick={() => (open ? close() : openPanel())}
      >
        <TomAvatar size={30} />
        <span className="sc-tom__launcher-label">{open ? m.launcherClose : m.launcherOpen}</span>
      </button>
    </div>
  );
}

function ReplyView({
  item,
  m,
  role,
  instructions,
  contacts,
  onGo,
  onTour,
}: {
  item: Extract<ThreadItem, { from: "tom" }>;
  m: TomMessages;
  role: Role;
  instructions: ApprovedInstructionLink[];
  contacts: CampusContact[];
  onGo: (d: TomDestination) => void;
  onTour: (t: TomTour) => void;
}) {
  const r = item.reply;
  const goButton = (d: TomDestination) => (
    <button key={d.id} type="button" className="sc-tom__chip" onClick={() => onGo(d)}>
      {m.navGoButton(d.label)}
    </button>
  );
  const body = (() => {
    switch (r.kind) {
      case "EMPTY":
        return null;
      case "NAVIGATE": {
        const label = r.destination.label;
        const status =
          item.nav === "PENDING"
            ? "…"
            : item.nav === "DONE"
              ? m.navDone(label)
              : item.nav === "NOT_PERMITTED"
                ? m.navNotPermitted(label)
                : item.nav === "FAILED"
                  ? m.navFailed(label)
                  : m.navUnavailable(label);
        return (
          <>
            <p>{m.navTaking(label, r.destination.description)}</p>
            <p className="sc-tom__navstatus" data-nav={item.nav}>
              {status}
            </p>
          </>
        );
      }
      case "BACK":
        return <p>{item.nav === "PENDING" ? "…" : item.nav === "DONE" ? m.backDone : m.backUnavailable}</p>;
      case "ALREADY_HERE":
        return <p>{m.navAlreadyHere(r.destination.label, r.destination.description)}</p>;
      case "SUGGEST_NAVIGATE":
        return (
          <>
            <p>{m.navSuggest(r.destination.label, r.destination.description)}</p>
            <div className="sc-tom__chips">{goButton(r.destination)}</div>
          </>
        );
      case "AMBIGUOUS":
        return (
          <>
            <p>{m.ambiguous}</p>
            <div className="sc-tom__chips">{r.destinations.map(goButton)}</div>
          </>
        );
      case "EXPLAIN_SCREEN":
        return (
          <>
            <p>{m.screenIntro(r.destination?.label ?? null, r.destination?.description ?? null)}</p>
            {r.entries.length > 0 && (
              <ul className="sc-tom__list">
                {r.entries.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <strong>{e.title}</strong> {e.body}
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      case "EXPLAIN_TOPIC":
        return (
          <>
            <p>{m.matchIntro}</p>
            <ul className="sc-tom__list">
              {r.entries.map((e) => (
                <li key={e.id}>
                  <strong>{e.title}</strong> {e.body}
                </li>
              ))}
            </ul>
          </>
        );
      case "TOUR":
        return (
          <>
            <p>{m.tourOffer(r.tour.title, r.tour.steps.length)}</p>
            <div className="sc-tom__chips">
              <button type="button" className="sc-tom__chip sc-tom__chip--primary" onClick={() => onTour(r.tour)}>
                {m.tourStartButton}
              </button>
            </div>
          </>
        );
      case "NO_TOUR":
        return <p>{m.noTour}</p>;
      case "INSTRUCTIONS":
        return (
          <>
            <p>{m.instructionsIntro}</p>
            <InstructionLinks instructions={instructions} m={m} />
          </>
        );
      case "EMERGENCY_FALLBACK":
        return (
          <div className="sc-tom__fallback">
            <p>
              <strong>{m.emergencyRefusal}</strong> {m.emergencyFollowProcedures}
            </p>
            {role === "STUDENT" || role === "VOLUNTEER" ? <p>{m.emergencyStudentNav}</p> : null}
            <ContactList contacts={contacts} m={m} />
            <InstructionLinks instructions={instructions} m={m} />
          </div>
        );
      case "REFUSE_ACTION":
        return (
          <>
            <p>
              <strong>{m.refuse(ACTION_WORDS_EN[r.action] ?? "do that")}</strong>
              {r.destination ? ` ${m.refuseWhere(r.destination.label)}` : ""}
            </p>
            {r.destination && <div className="sc-tom__chips">{goButton(r.destination)}</div>}
          </>
        );
      case "UNKNOWN":
        return (
          <>
            <p>{m.unknownAnswer}</p>
            <p className="sc-tom__muted">{m.unknownSuggest}</p>
          </>
        );
    }
  })();
  return (
    <>
      {body}
      {item.viaBackend && <p className="sc-tom__muted">{m.backendNotice}</p>}
    </>
  );
}

function InstructionLinks({ instructions, m }: { instructions: ApprovedInstructionLink[]; m: TomMessages }) {
  if (instructions.length === 0) return <p>{m.noInstructions}</p>;
  return (
    <ul className="sc-tom__list">
      {instructions.map((i) => (
        <li key={i.id}>
          <a href={i.href}>{i.title}</a>{" "}
          <span className="sc-tom__muted">{m.instructionMeta(i.sourceLabel, i.version, i.language)}</span>
        </li>
      ))}
    </ul>
  );
}

function ContactList({ contacts, m }: { contacts: CampusContact[]; m: TomMessages }) {
  if (contacts.length === 0) return null;
  return (
    <div className="sc-tom__contacts">
      <p>
        <strong>{m.contactsHeading}</strong>
      </p>
      <ul className="sc-tom__list">
        {contacts.map((c) => (
          <li key={c.id} data-verification={c.verification}>
            {c.label}: <span className="sc-tom__number">{c.phoneDisplay}</span>
            {c.verification !== "INSTITUTION_CONFIRMED" && (
              <span className="sc-tom__muted">
                {" "}
                ({VERIFICATION_PRESENTATION[c.verification].label.toLowerCase()}; {m.contactUnconfirmed})
              </span>
            )}
            {c.source.url && (
              <>
                {" "}
                <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="sc-tom__source">
                  {m.sourceLink}
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FaqItem({ entry, role, ai, m }: { entry: TomEntry; role: Role; ai: TomAiAdapter | null; m: TomMessages }) {
  const [explanation, setExplanation] = useState<
    { phase: "idle" } | { phase: "loading" } | { phase: "done"; text: string } | { phase: "error" }
  >({ phase: "idle" });

  async function explain() {
    if (!ai) return;
    setExplanation({ phase: "loading" });
    try {
      const text = (await ai.explain({ entry, role })).trim();
      setExplanation(text ? { phase: "done", text: text.slice(0, MAX_AI_TEXT) } : { phase: "error" });
    } catch {
      setExplanation({ phase: "error" });
    }
  }

  return (
    <details className="sc-tom__faq">
      <summary>{entry.title}</summary>
      <p>{entry.body}</p>
      {!entry.review.reviewed && <p className="sc-tom__muted">{m.draftEntry}</p>}
      {ai && (
        <div className="sc-tom__ai">
          {explanation.phase !== "done" && (
            <button type="button" onClick={explain} disabled={explanation.phase === "loading"}>
              {explanation.phase === "loading" ? m.explaining : m.explainButton}
            </button>
          )}
          {explanation.phase === "done" && (
            <figure>
              <figcaption>{ai.status === "MOCK" ? m.aiCaptionMock : m.aiCaptionLive}</figcaption>
              <p>{explanation.text}</p>
            </figure>
          )}
          {explanation.phase === "error" && <p>{m.aiUnavailable}</p>}
        </div>
      )}
    </details>
  );
}
