import { useId, useRef, useState } from "react";
import { newIdempotencyKey } from "../responder/api";
import { describeError } from "../responder/apiError";
import type { HazardReport, HazardReviewApi, HazardReviewDecision } from "./contracts";
import { allowedDecisions, DECISION_LABELS, validateReview } from "./hazardReview";

export interface HazardReviewFormProps {
  report: HazardReport;
  api: Pick<HazardReviewApi, "reviewHazardReport">;
  onReviewed: (report: HazardReport) => void;
}

/**
 * Explicit human review: no decision is pre-selected, and the status shown
 * changes only after the server returns the reviewed record.
 */
export function HazardReviewForm({ report, api, onReviewed }: HazardReviewFormProps) {
  const uid = useId();
  const [decision, setDecision] = useState<HazardReviewDecision | null>(null);
  const [note, setNote] = useState("");
  const [duplicateOfId, setDuplicateOfId] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const decisions = allowedDecisions(report.status);
  if (decisions.length === 0) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "submitting") return;
    const review = {
      decision: decision ?? undefined,
      note: note.trim() || undefined,
      duplicateOfId: decision === "DUPLICATE" ? duplicateOfId.trim() : undefined,
    };
    const check = validateReview(report.status, review);
    if (!check.ok || !review.decision) {
      setMessage(check.message ?? "Choose a review decision.");
      return;
    }
    idempotencyKey.current ??= newIdempotencyKey();
    setPhase("submitting");
    setMessage(null);
    try {
      const updated = await api.reviewHazardReport(
        report.id,
        { decision: review.decision, note: review.note, duplicateOfId: review.duplicateOfId },
        idempotencyKey.current,
      );
      idempotencyKey.current = null;
      onReviewed(updated);
    } catch (error) {
      setMessage(`Review not saved. ${describeError(error)} The report is unchanged.`);
    } finally {
      setPhase("idle");
    }
  }

  function choose(d: HazardReviewDecision) {
    if (d !== decision) idempotencyKey.current = null; // a different decision is a new request
    setDecision(d);
    setMessage(null);
  }

  return (
    <form className="sc-review" onSubmit={submit} aria-label={`Review hazard report ${report.id}`}>
      <fieldset className="sc-review__decisions">
        <legend>Your review decision</legend>
        {decisions.map((d) => (
          <label key={d} className="sc-review__option">
            <input type="radio" name={`${uid}-decision`} value={d} checked={decision === d} onChange={() => choose(d)} />{" "}
            {DECISION_LABELS[d]}
          </label>
        ))}
      </fieldset>
      {decision === "DUPLICATE" && (
        <label className="sc-review__field">
          Duplicate of report ID
          <input type="text" value={duplicateOfId} onChange={(e) => setDuplicateOfId(e.target.value)} />
        </label>
      )}
      <label className="sc-review__field">
        Review note (optional)
        <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>
      {decision === "VERIFIED" && (
        <p className="sc-muted">
          Verifying records your review only. It does not issue a campus alert or notify anyone.
        </p>
      )}
      <button type="submit" className="sc-btn sc-btn--primary" disabled={phase === "submitting"}>
        {phase === "submitting" ? "Saving review…" : "Submit review"}
      </button>
      {phase === "submitting" && (
        <p role="status">Saving review… waiting for server confirmation.</p>
      )}
      {message && (
        <p role="alert" className="sc-notice sc-notice--error">
          {message}
        </p>
      )}
    </form>
  );
}
