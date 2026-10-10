import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TomAiAdapter } from "./aiAdapter";
import { disabledTomAi, isAiAvailable, MAX_AI_TEXT } from "./aiAdapter";
import { DEFAULT_TOM_KNOWLEDGE } from "./knowledgeBase";
import { answerQuestion, selectEntries, usableInstructions } from "./tomLogic";
import type { TomAnswer } from "./tomLogic";
import type { TomStore } from "./tomStorage";
import { defaultStore, readDismissed, readHidden, writeDismissed, writeHidden } from "./tomStorage";
import type { AppMode, ApprovedInstructionLink, Role, TomContext, TomEntry } from "./types";
import "./tom.css";

export interface TomProps {
  /** Role from the authenticated session, used only to choose help content. */
  role: Role;
  context: TomContext;
  mode: AppMode;
  knowledgeBase?: readonly TomEntry[];
  approvedInstructions?: readonly ApprovedInstructionLink[];
  ai?: TomAiAdapter;
  store?: TomStore | null;
  now?: () => Date;
}

/**
 * Tom: an optional, closed-by-default help launcher. The panel is a
 * non-modal complementary region (no focus trap, no backdrop), so it never
 * blocks the screen underneath. Tom has no access to any API and cannot take
 * actions on the user's behalf.
 */
export function Tom({
  role,
  context,
  mode,
  knowledgeBase = DEFAULT_TOM_KNOWLEDGE,
  approvedInstructions,
  ai = disabledTomAi,
  store,
  now = () => new Date(),
}: TomProps) {
  const resolvedStore = store === undefined ? defaultStore() : store;
  const uid = useId();
  const panelId = `${uid}-tom-panel`;
  const [hidden, setHidden] = useState(() => readHidden(resolvedStore));
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

  const { hints, faqs, tour } = useMemo(
    () => selectEntries(knowledgeBase, { role, context, mode }),
    [knowledgeBase, role, context, mode],
  );
  const instructions = usableInstructions(approvedInstructions, now());
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
  }, [open]);

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

  if (hidden) return null;

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

  function hideTom() {
    writeHidden(resolvedStore, true);
    setOpen(false);
    setHidden(true);
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
            <h2 id={`${uid}-tom-title`} tabIndex={-1} ref={headingRef}>
              Tom — app help
            </h2>
            <button type="button" onClick={close} aria-label="Close Tom help panel">
              Close
            </button>
          </div>
          <p className="sc-tom__scope">
            Tom explains how to use this app. Tom cannot send alerts, contact anyone, take actions for you, or give
            emergency instructions.
          </p>
          {mode !== "LIVE" && (
            <p className="sc-tom__draft">
              {mode} mode: some help text below is a prototype draft that has not been reviewed.
            </p>
          )}

          {step ? (
            <section aria-label="Guided tour">
              <h3 tabIndex={-1} ref={tourHeadingRef}>
                Tour step {tourIndex! + 1} of {tour.length}: {step.title}
              </h3>
              <p>{step.body}</p>
              <div className="sc-tom__row">
                <button type="button" onClick={() => setTourIndex((i) => (i ?? 0) - 1)} disabled={tourIndex === 0}>
                  Back
                </button>
                {tourIndex! < tour.length - 1 ? (
                  <button type="button" onClick={() => setTourIndex((i) => (i ?? 0) + 1)}>
                    Next
                  </button>
                ) : (
                  <button type="button" onClick={() => setTourIndex(null)}>
                    Finish tour
                  </button>
                )}
                <button type="button" onClick={() => setTourIndex(null)}>
                  Exit tour
                </button>
              </div>
            </section>
          ) : (
            <>
              <section aria-label="Tips for this screen">
                <h3>Tips for this screen</h3>
                {visibleHints.length === 0 ? (
                  <p className="sc-tom__muted">No tips to show here.</p>
                ) : (
                  <ul className="sc-tom__list">
                    {visibleHints.map((h) => (
                      <li key={h.id}>
                        <strong>{h.title}.</strong> {h.body}{" "}
                        <button type="button" onClick={() => dismissHint(h.id)} aria-label={`Dismiss tip: ${h.title}`}>
                          Dismiss
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {hints.some((h) => dismissed.has(h.id)) && (
                  <button type="button" onClick={restoreHints}>
                    Show dismissed tips
                  </button>
                )}
              </section>

              {tour.length > 0 && (
                <button type="button" onClick={() => setTourIndex(0)}>
                  Start guided tour ({tour.length} steps)
                </button>
              )}

              <section aria-label="Common questions">
                <h3>Common questions</h3>
                {faqs.length === 0 ? (
                  <p className="sc-tom__muted">No reviewed questions are available for this screen.</p>
                ) : (
                  faqs.map((f) => <FaqItem key={f.id} entry={f} role={role} ai={aiOn ? ai : null} />)
                )}
              </section>

              <section aria-label="Ask Tom">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setAnswer(answerQuestion(question, faqs));
                  }}
                >
                  <label htmlFor={`${uid}-q`}>Ask about using this screen</label>
                  <div className="sc-tom__row">
                    <input id={`${uid}-q`} type="text" value={question} onChange={(e) => setQuestion(e.target.value)} />
                    <button type="submit">Ask</button>
                  </div>
                </form>
                <div role="status" aria-live="polite">
                  <AnswerView answer={answer} instructions={instructions} role={role} />
                </div>
              </section>

              <section aria-label="Official instructions">
                <h3>Official instructions</h3>
                <InstructionLinks instructions={instructions} />
              </section>
            </>
          )}

          <div className="sc-tom__foot">
            <button type="button" onClick={hideTom}>
              Hide Tom for this session
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
        <span aria-hidden="true" className="sc-tom__avatar">
          ?
        </span>
        <span>{open ? "Close Tom" : "Help (Tom)"}</span>
      </button>
    </div>
  );
}

function InstructionLinks({ instructions }: { instructions: ApprovedInstructionLink[] }) {
  if (instructions.length === 0) {
    return (
      <p>
        No approved instruction pack is configured in this app. Follow your campus's official emergency procedures.
      </p>
    );
  }
  return (
    <ul className="sc-tom__list">
      {instructions.map((i) => (
        <li key={i.id}>
          <a href={i.href}>{i.title}</a>{" "}
          <span className="sc-tom__muted">
            ({i.sourceLabel}, version {i.version}, {i.language})
          </span>
        </li>
      ))}
    </ul>
  );
}

function AnswerView({
  answer,
  instructions,
  role,
}: {
  answer: TomAnswer;
  instructions: ApprovedInstructionLink[];
  role: Role;
}) {
  switch (answer.kind) {
    case "EMPTY":
      return null;
    case "EMERGENCY_FALLBACK":
      return (
        <div className="sc-tom__fallback">
          <p>
            <strong>I can't give emergency instructions, routes or contacts.</strong> If you or someone else is in
            danger, follow your campus's official emergency procedures.
          </p>
          {role === "STUDENT" || role === "VOLUNTEER" ? (
            <p>
              In this app you can use the “I Need Help” check-in. Its screen shows whether it was actually received;
              it is not a guarantee that someone will respond.
            </p>
          ) : null}
          <InstructionLinks instructions={instructions} />
        </div>
      );
    case "UNKNOWN":
      return (
        <p>
          I don't know the answer to that. I only have help about using this screen. For anything else, ask your
          campus team or follow official procedures.
        </p>
      );
    case "MATCH":
      return (
        <div>
          <p>This might help:</p>
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

function FaqItem({ entry, role, ai }: { entry: TomEntry; role: Role; ai: TomAiAdapter | null }) {
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
      {!entry.review.reviewed && <p className="sc-tom__muted">Draft help text (not yet reviewed).</p>}
      {ai && (
        <div className="sc-tom__ai">
          {explanation.phase !== "done" && (
            <button type="button" onClick={explain} disabled={explanation.phase === "loading"}>
              {explanation.phase === "loading" ? "Explaining…" : "Explain in simpler words"}
            </button>
          )}
          {explanation.phase === "done" && (
            <figure>
              <figcaption>
                {ai.status === "MOCK" ? "Simulated (mock) explanation" : "AI-generated explanation"} of the help text
                above — not an official instruction.
              </figcaption>
              <p>{explanation.text}</p>
            </figure>
          )}
          {explanation.phase === "error" && <p>Explanation unavailable. The help text above is unchanged.</p>}
        </div>
      )}
    </details>
  );
}
