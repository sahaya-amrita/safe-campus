import { useEffect, useRef, useState } from 'react';
import type { CampusScene } from '../../features/maps/campus-scene.mjs';
import { ErrorNotice, Loading } from '../ui';

export interface TwinIncident {
  id: string;
  /** OSM footprint id the incident is drawn on (illustrative placement only). */
  buildingFeatureId: string;
  category: string;
  status: string;
}

/**
 * React host for the existing Three.js campus explorer (features/maps). The
 * 3D module and three.js are loaded lazily on first use. The explorer's own
 * DEMO / NOT FOR NAVIGATION guards stay in place; server incidents are drawn
 * as illustrative circles on mapped footprints, never as hazard boundaries.
 */
export function CampusTwin({
  incidents,
  selectedId,
}: {
  incidents: readonly TwinIncident[];
  selectedId?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CampusScene | null>(null);
  const incidentsRef = useRef({ incidents, selectedId });
  incidentsRef.current = { incidents, selectedId };
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    setStatus('loading');
    Promise.all([
      import('../../features/maps/map-view.ts'),
      import('../../features/maps/maps-drills.css'),
    ])
      .then(([module]) => {
        if (cancelled) return;
        dispose = module.mountMapViewer(host, {
          localSimulation: false,
          adapter: {
            async load(signal: AbortSignal) {
              const response = await fetch(`${import.meta.env.BASE_URL}demo-map/campus-data.json`, {
                signal,
              });
              if (!response.ok) throw new Error('Campus snapshot unavailable');
              return response.json() as Promise<unknown>;
            },
          },
          onSceneReady: (scene) => {
            sceneRef.current = scene;
            const current = incidentsRef.current;
            scene.setIncidents(toScene(current.incidents), current.selectedId ?? null);
          },
        });
        setStatus('ready');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason);
        setStatus('failed');
      });
    return () => {
      cancelled = true;
      sceneRef.current = null;
      dispose?.();
    };
  }, [attempt]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setIncidents(toScene(incidents), selectedId ?? null);
    if (selectedId) scene.focusIncident(selectedId);
  }, [incidents, selectedId]);

  return (
    <div className="as-twin">
      {status === 'loading' && (
        <div style={{ padding: 12 }}>
          <Loading label="Loading 3D campus…" />
        </div>
      )}
      {status === 'failed' && (
        <div style={{ padding: 12 }}>
          <ErrorNotice error={error} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      )}
      <div ref={hostRef} />
    </div>
  );
}

function toScene(incidents: readonly TwinIncident[]) {
  return incidents.map((i) => ({
    id: i.id,
    buildingId: i.buildingFeatureId,
    category: i.category,
    status: i.status,
  }));
}
