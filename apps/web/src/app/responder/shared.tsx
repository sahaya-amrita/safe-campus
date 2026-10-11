import { useCallback, useRef, useState } from 'react';
import { newIdempotencyKey } from '../api/client';

/** Runs mutations with one idempotency key per (record, action), reused on retry. */
export function useActions() {
  const keys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const run = useCallback(
    async (id: string, action: (key: string) => Promise<unknown>, onDone?: () => void) => {
      let key = keys.current.get(id);
      if (!key) {
        key = newIdempotencyKey();
        keys.current.set(id, key);
      }
      setBusy(id);
      setErrors((e) => ({ ...e, [id]: null }));
      try {
        await action(key);
        keys.current.delete(id);
        onDone?.();
      } catch (error) {
        setErrors((e) => ({ ...e, [id]: error }));
      } finally {
        setBusy(null);
      }
    },
    [],
  );
  return { run, busy, errors };
}

export function Stat({
  value,
  label,
  onClick,
}: {
  value: string | number;
  label: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="as-stat__value">{value}</span>
      <span className="as-stat__label">{label}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="as-stat as-item--button" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="as-stat">{body}</div>
  );
}

/**
 * One idempotency key per distinct request body: a plain retry reuses the key
 * (so a request that reached the server is not recorded twice), while an
 * edited form gets a fresh key (the server rejects a reused key with a
 * different body).
 */
export function useKeyForBody() {
  const last = useRef<{ body: string; key: string } | null>(null);
  return useCallback((input: unknown) => {
    const body = JSON.stringify(input);
    if (last.current?.body !== body) last.current = { body, key: newIdempotencyKey() };
    return last.current.key;
  }, []);
}
