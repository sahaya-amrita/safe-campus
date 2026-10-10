import { useEffect, useId, useRef, useState } from "react";
import type { CampusContact } from "../../features/responder/campusDirectory";
import { contactsForMode, VERIFICATION_PRESENTATION } from "../../features/responder/campusDirectory";
import type { TomAiAdapter } from "./aiAdapter";
import { disabledTomAi, isAiAvailable, MAX_AI_TEXT } from "./aiAdapter";
import { DEFAULT_TOM_KNOWLEDGE } from "./knowledgeBase";
import { TomAvatar } from "./TomAvatar";
import type { TomMessages } from "./tomMessages";
import { TOM_MESSAGES_EN } from "./tomMessages";
import { answerQuestion, selectEntries, usableInstructions } from "./tomLogic";
import type { TomAnswer } from "./tomLogic";
import type { TomStore } from "./tomStorage";
import { defaultStore, readDismissed, readMinimised, writeDismissed, writeMinimised } from "./tomStorage";
import type { AppMode, ApprovedInstructionLink, Role, TomContext, TomEntry } from "./types";
import "./tom.css";

export interface TomProps {
  /** Role from the authenticated session, used only to choose help content. */
  role: Role;
  context: TomContext;
  mode: AppMode;
  knowledgeBase?: readonly TomEntry[];
  approvedInstructions?: readonly ApprovedInstructionLink[];
  /** Campus contacts; LIVE shows institution-confirmed ones only. */
  contacts?: readonly CampusContact[];
  ai?: TomAiAdapter;
  store?: TomStore | null;
  now?: () => Date;
  /** Translated strings (shared i18n). Defaults to English. */
  messages?: TomMessages;
}

/**
 * Tom: an optional, closed-by-default help launcher. The panel is a
 * non-modal complementary region (no focus trap, no backdrop), so it never
 * blocks the screen underneath. Tom has no access to any API and cannot take
 * actions on the user's behalf. Minimising shrinks the launcher to an icon;
 * Tom never disappears without a way back.
 */
export function Tom({
  role,
  context,
  mode,
  knowledgeBase = DEFAULT_TOM_KNOWLEDGE,
  approvedInstructions,
  contacts = [],
  ai = disabledTomAi,
  store,
  now = () => new Date(),
  messages: m = TOM_MESSAGES_EN,
}: TomProps) {
  const resolvedStore = store === undefined ? defaultStore() : store;
  const uid = useId();
  const panelId = `${uid}-tom-panel`;
  const [minimised, setMinimised] = useState(() => readMinimised(resolvedStore));
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => readDismissed(resolvedStore));
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TomAnswer>({ kind: "EMPTY" });
  const launcherRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tourHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef(false);
  const tourWasActive = useRef(false);

  const nowDate = now();
  const { hints, faqs, tour } = selectEntries(knowledgeBase, { role, context, mode, now: nowDate });
  const instructions = usableInstructions(approvedInstructions, nowDate);
  const shownContacts = contactsForMode(contacts, mode).shown;
  const visibleHints = hints.filter((h) => !dismissed.has(h.id));
  const aiOn = isAiAvailable(ai, mode);

  // Context change: reset transient state but keep the panel open/closed as is.
  useEffect(() => {
    setTourIndex(null);
    setAnswer({ kind: "EMPTY" });
    setQuestion("");
  }, [context, role]);

  useEffect(() => {
    if (open) headingRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      launcherRef.current?.focus();
    }
  }, [open, minimised]);

  // Keep focus inside the panel when tour controls mount/unmount, so keyboard
  // users (and Escape) are never stranded on <body>.
  useEffect(() => {
    if (!open) {
      tourWasActive.current = false;
      return;
    }
    if (tourIndex !== null) {
      tourWasActive.current = true;
      tourHeadingRef.current?.focus();
    } else if (tourWasActive.current) {
      tourWasActive.current = false;
      headingRef.current?.focus();
    }
  }, [tourIndex, open]);

  function close() {
    returnFocus.current = true;
    setOpen(false);
    setTourIndex(null);
  }

  function dismissHint(id: string) {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    writeDismissed(resolvedStore, next);
  }

  function restoreHints() {
    const next = new Set([...dismissed].filter((id) => !hints.some((h) => h.id === id)));
    setDismissed(next);
    writeDismissed(resolvedStore, next);
  }

  function minimise() {
    writeMinimised(resolvedStore, true);
    returnFocus.current = true;
    setOpen(false);
    setTourIndex(null);
    setMinimised(true);
  }

  function restore() {
    writeMinimised(resolvedStore, false);
    setMinimised(false);
    setOpen(true);
  }

  if (minimised) {
    return (
      <div className="sc-tom sc-tom--minimised" data-mode={mode}>
        <button
          ref={launcherRef}
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

  const step = tourIndex !== null ? tour[tourIndex] : undefined;

  return (
    <div className="sc-tom" data-mode={mode}>
      {open && (
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

            {step ? (
              <section aria-label="Guided tour" className="sc-tom__section">
                <h3 tabIndex={-1} ref={tourHeadingRef}>
                  {m.tourHeading(tourIndex! + 1, tour.length, step.title)}
                </h3>
                <div className="sc-tom__dots" aria-hidden="true">
                  {tour.map((t, i) => (
                    <span key={t.id} className={i === tourIndex ? "is-active" : undefined} />
                  ))}
                </div>
                <p>{step.body}</p>
                <div className="sc-tom__row">
                  <button type="button" onClick={() => setTourIndex((i) => (i ?? 0) - 1)} disabled={tourIndex === 0}>
                    {m.tourBack}
                  </button>
                  {tourIndex! < tour.length - 1 ? (
                    <button type="button" className="sc-tom__primary" onClick={() => setTourIndex((i) => (i ?? 0) + 1)}>
                      {m.tourNext}
                    </button>
                  ) : (
                    <button type="button" className="sc-tom__primary" onClick={() => setTourIndex(null)}>
                      {m.tourFinish}
                    </button>
                  )}
                  <button type="button" onClick={() => setTourIndex(null)}>
                    {m.tourExit}
                  </button>
                </div>
              </section>
            ) : (
              <>
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
                </section>

                {tour.length > 0 && (
                  <button type="button" className="sc-tom__primary sc-tom__tour-start" onClick={() => setTourIndex(0)}>
                    {m.tourStart(tour.length)}
                  </button>
                )}

                <section aria-label={m.faqHeading} className="sc-tom__section">
                  <h3>{m.faqHeading}</h3>
                  {faqs.length === 0 ? (
                    <p className="sc-tom__muted">{m.noFaqs}</p>
                  ) : (
                    faqs.map((f) => <FaqItem key={f.id} entry={f} role={role} ai={aiOn ? ai : null} m={m} />)
                  )}
                </section>

                <section aria-label="Ask Tom" className="sc-tom__section">
                  <form
                    className="sc-tom__ask"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setAnswer(answerQuestion(question, faqs));
                    }}
                  >
                    <label htmlFor={`${uid}-q`}>{m.askLabel}</label>
                    <div className="sc-tom__row">
                      <input id={`${uid}-q`} type="text" value={question} onChange={(e) => setQuestion(e.target.value)} />
                      <button type="submit" className="sc-tom__primary">
                        {m.askButton}
                      </button>
                    </div>
                  </form>
                  <div role="status" aria-live="polite">
                    <AnswerView answer={answer} instructions={instructions} contacts={shownContacts} role={role} m={m} />
                  </div>
                </section>

                <section aria-label={m.officialHeading} className="sc-tom__section">
                  <h3>{m.officialHeading}</h3>
                  <InstructionLinks instructions={instructions} m={m} />
                </section>
              </>
            )}
          </div>
          <div className="sc-tom__foot">
            <button type="button" className="sc-tom__link" onClick={minimise}>
              {m.minimise}
            </button>
          </div>
        </aside>
      )}
      <button
        ref={launcherRef}
        type="button"
        className="sc-tom__launcher"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <TomAvatar size={30} />
        <span className="sc-tom__launcher-label">{open ? m.launcherClose : m.launcherOpen}</span>
      </button>
    </div>
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
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnswerView({
  answer,
  instructions,
  contacts,
  role,
  m,
}: {
  answer: TomAnswer;
  instructions: ApprovedInstructionLink[];
  contacts: CampusContact[];
  role: Role;
  m: TomMessages;
}) {
  switch (answer.kind) {
    case "EMPTY":
      return null;
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
    case "UNKNOWN":
      return <p>{m.unknownAnswer}</p>;
    case "MATCH":
      return (
        <div>
          <p>{m.matchIntro}</p>
          <ul className="sc-tom__list">
            {answer.entries.map((e) => (
              <li key={e.id}>
                <strong>{e.title}</strong> {e.body}
              </li>
            ))}
          </ul>
        </div>
      );
  }
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
