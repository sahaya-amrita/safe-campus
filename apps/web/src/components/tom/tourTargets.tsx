/**
 * Explicit, stable registry of elements a guided tour may highlight.
 * Components opt in with useTourTarget("stable.id"); the tour looks targets
 * up by id only. No CSS selectors, no querying arbitrary DOM.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export class TourTargetRegistry {
  private readonly elements = new Map<string, HTMLElement>();
  private readonly listeners = new Set<() => void>();

  set(id: string, el: HTMLElement | null): void {
    if (el) this.elements.set(id, el);
    else this.elements.delete(id);
    this.listeners.forEach((l) => l());
  }

  get(id: string): HTMLElement | null {
    const el = this.elements.get(id);
    return el && el.isConnected ? el : null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const RegistryContext = createContext<TourTargetRegistry | null>(null);

export function TourTargetProvider({
  children,
  registry,
}: {
  children: ReactNode;
  registry?: TourTargetRegistry;
}) {
  const [value] = useState(() => registry ?? new TourTargetRegistry());
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

export function useTourRegistry(): TourTargetRegistry | null {
  return useContext(RegistryContext);
}

/** Returns a ref callback that registers the element under `id`. No-op without a provider. */
export function useTourTarget(id: string): (el: HTMLElement | null) => void {
  const registry = useContext(RegistryContext);
  return useCallback((el: HTMLElement | null) => registry?.set(id, el), [registry, id]);
}

/** Re-renders when targets register or unregister; returns the element for `id`. */
export function useRegisteredTarget(id: string | undefined): HTMLElement | null {
  const registry = useContext(RegistryContext);
  const [, bump] = useState(0);
  useEffect(() => registry?.subscribe(() => bump((n) => n + 1)), [registry]);
  return id && registry ? registry.get(id) : null;
}
