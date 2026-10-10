import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "./contracts";

export type ListState<T> =
  | { phase: "loading"; items: T[] }
  | { phase: "ready"; items: T[]; nextCursor: string | null; loadingMore: boolean; moreError: unknown }
  | { phase: "error"; items: T[]; error: unknown };

/**
 * Loads one cursor page at a time (never the whole table) and lets callers
 * replace an item with the server's authoritative copy after a mutation.
 */
export function usePagedList<T extends { id: string }>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
  key: string,
) {
  const [state, setState] = useState<ListState<T>>({ phase: "loading", items: [] });
  const generation = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const reload = useCallback(() => {
    const gen = ++generation.current;
    setState({ phase: "loading", items: [] });
    fetchRef.current(null).then(
      (page) => {
        if (gen === generation.current) {
          setState({ phase: "ready", items: page.items, nextCursor: page.nextCursor, loadingMore: false, moreError: null });
        }
      },
      (error: unknown) => {
        if (gen === generation.current) setState({ phase: "error", items: [], error });
      },
    );
  }, []);

  useEffect(() => {
    reload();
  }, [key, reload]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "ready" || !s.nextCursor || s.loadingMore) return;
    const gen = generation.current;
    setState({ ...s, loadingMore: true, moreError: null });
    fetchRef.current(s.nextCursor).then(
      (page) => {
        if (gen !== generation.current) return;
        setState((cur) =>
          cur.phase === "ready"
            ? { ...cur, items: [...cur.items, ...page.items], nextCursor: page.nextCursor, loadingMore: false }
            : cur,
        );
      },
      (error: unknown) => {
        if (gen !== generation.current) return;
        setState((cur) => (cur.phase === "ready" ? { ...cur, loadingMore: false, moreError: error } : cur));
      },
    );
  }, []);

  const replaceItem = useCallback((item: T) => {
    setState((s) => (s.phase === "ready" ? { ...s, items: s.items.map((i) => (i.id === item.id ? item : i)) } : s));
  }, []);

  return { state, reload, loadMore, replaceItem };
}
