import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { TomNavigationAdapter } from "./navigation";
import { navigateSafely } from "./navigation";
import type { TomMessages } from "./tomMessages";
import { useRegisteredTarget } from "./tourTargets";
import type { TomTour } from "./types";

export interface TourRunnerProps {
  tour: TomTour;
  navigation?: TomNavigationAdapter;
  messages: TomMessages;
  /** Called when the tour ends (finished, skipped or Escape). */
  onEnd: (how: "FINISHED" | "SKIPPED") => void;
}

type Rect = { top: number; left: number; width: number; height: number };

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;

/**
 * Runs one guided tour. The page stays fully usable: the highlight ignores
 * pointer events and the step card is a non-modal dialog with no backdrop.
 * Destinations are opened only through the host's navigation adapter.
 */
export function TourRunner({ tour, navigation, messages: m, onEnd }: TourRunnerProps) {
  const [index, setIndex] = useState(0);
  // Direction of travel, so skipping an absent optional step never traps Back.
  const [direction, setDirection] = useState<1 | -1>(1);
  const [navNote, setNavNote] = useState<string | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = tour.steps[index]!;
  const target = useRegisteredTarget(step.targetId);
  const isLast = index === tour.steps.length - 1;

  // Open the step's destination (if any) through the adapter.
  useEffect(() => {
    let active = true;
    setNavNote(null);
    if (step.destination && navigation && navigation.current() !== step.destination) {
      const label = navigation.destinations().find((d) => d.id === step.destination)?.label ?? step.destination;
      setNavNote(m.tourOpening(label));
      void navigateSafely(navigation, step.destination).then((r) => {
        if (!active) return;
        setNavNote(r.ok ? m.tourOpened(label) : m.tourCannotOpen(label));
      });
    }
    return () => {
      active = false;
    };
    // Runs once per step; navigation and messages are stable for a tour.
  }, [step.id]);

  // Optional steps whose target is absent are skipped (in the direction of
  // travel) once the step settles. At either end the step is shown instead.
  const canSkip = direction === 1 ? index < tour.steps.length - 1 : index > 0;
  useEffect(() => {
    if (!step.optional || target || !canSkip) return;
    const t = setTimeout(() => setIndex((i) => (i === index ? i + direction : i)), 250);
    return () => clearTimeout(t);
  }, [step.optional, target, index, direction, canSkip]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  // Track the target's position.
  const measure = useCallback(() => {
    if (!target) return setRect(null);
    const r = target.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [target]);

  useLayoutEffect(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
    if (window.innerWidth < 720) {
      // Phones: the card docks at the bottom, so bring the target near the top,
      // below a sticky header, where the card cannot cover it.
      const top = target.getBoundingClientRect().top;
      if (top < 80 || top > window.innerHeight * 0.35) window.scrollBy?.({ top: top - 88, behavior });
    } else {
      target.scrollIntoView?.({ block: "center", inline: "nearest", behavior });
    }
    measure();
    // Measure directly on scroll/resize (one rect read), plus two settle checks
    // for smooth scrolling, so the highlight never lags behind its target.
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const settle = [setTimeout(measure, 350), setTimeout(measure, 900)];
    return () => {
      settle.forEach(clearTimeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target, measure]);

  // Escape ends the tour from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEnd("SKIPPED");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onEnd]);

  const missing = !target && (!step.optional || !canSkip);
  const cardStyle = placeCard(rect);

  return (
    <>
      {rect && (
        <div
          className="sc-tour__highlight"
          aria-hidden="true"
          data-testid="tour-highlight"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div
        ref={cardRef}
        className="sc-tour__card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="sc-tour-title"
        aria-describedby="sc-tour-body"
        style={cardStyle}
        data-placement={cardStyle ? "anchored" : "docked"}
      >
        <p className="sc-tour__progress">
          {tour.title} · {m.tourProgress(index + 1, tour.steps.length)}
        </p>
        <h2 id="sc-tour-title" tabIndex={-1} ref={headingRef}>
          {step.title}
        </h2>
        <p id="sc-tour-body">{step.body}</p>
        {navNote && (
          <p className="sc-tour__note" role="status">
            {navNote}
          </p>
        )}
        {missing && <p className="sc-tour__note">{m.tourTargetMissing}</p>}
        <div className="sc-tour__dots" aria-hidden="true">
          {tour.steps.map((s, i) => (
            <span key={s.id} className={i === index ? "is-active" : undefined} />
          ))}
        </div>
        <div className="sc-tour__controls">
          <button
            type="button"
            onClick={() => {
              setDirection(-1);
              setIndex((i) => Math.max(0, i - 1));
            }}
            disabled={index === 0}
          >
            {m.tourBack}
          </button>
          <button type="button" onClick={() => onEnd("SKIPPED")}>
            {m.tourSkip}
          </button>
          {isLast ? (
            <button type="button" className="sc-tour__primary" onClick={() => onEnd("FINISHED")}>
              {m.tourFinish}
            </button>
          ) : (
            <button
              type="button"
              className="sc-tour__primary"
              onClick={() => {
                setDirection(1);
                setIndex((i) => i + 1);
              }}
            >
              {m.tourNext}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Anchors the card beside the target on wide screens; docks it on phones. */
function placeCard(rect: Rect | null): CSSProperties | undefined {
  if (!rect || typeof window === "undefined" || window.innerWidth < 720) return undefined;
  const cardW = 340;
  const gap = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(Math.max(16, rect.left), vw - cardW - 16);
  const below = rect.top + rect.height + gap;
  if (below + 220 < vh) return { top: below, left, width: cardW };
  const right = rect.left + rect.width + gap;
  if (right + cardW + 16 < vw) return { top: Math.max(16, Math.min(rect.top, vh - 260)), left: right, width: cardW };
  return { top: Math.max(16, rect.top - 230), left, width: cardW };
}
