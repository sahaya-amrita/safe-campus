import { classifyError, describeError } from "./apiError";

export interface RequestErrorNoticeProps {
  error: unknown;
  onRetry?: () => void;
  /** What was being loaded, for readable status text. */
  subject: string;
}

export function RequestErrorNotice({ error, onRetry, subject }: RequestErrorNoticeProps) {
  const kind = classifyError(error);
  if (kind === "UNAUTHENTICATED" || kind === "FORBIDDEN") {
    return (
      <section className="sc-notice sc-notice--denied" aria-labelledby="sc-access-denied-title">
        <h3 id="sc-access-denied-title">Responder access required</h3>
        <p>{describeError(error)}</p>
        <p>
          Access is decided by the server, not by this page. If you believe you should have access, contact the
          person who administers responder accounts. If someone needs help now, follow your campus's official
          emergency procedures.
        </p>
      </section>
    );
  }
  return (
    <div className="sc-notice sc-notice--error" role="alert">
      <p>
        Could not load {subject}. {describeError(error)}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
