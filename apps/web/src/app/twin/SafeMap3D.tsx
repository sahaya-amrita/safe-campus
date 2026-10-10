import { useEffect, useRef, useState } from 'react';
import type { CampusData } from '../../features/maps/campus-model.ts';
import { createCampusScene, type CampusScene } from '../../features/maps/campus-scene.mjs';
import type { Point, RiskArea, SafeDestination } from '../../features/maps/safe-route.ts';
import { RISK_STYLE } from './safeMapModel';

/**
 * 3D view of the same map state as SafeMap2D: OSM footprints with risk areas as
 * translucent columns, the route as a raised line, and start/destination pins.
 * Loaded lazily (three.js); the 2D map stays the default.
 */
export default function SafeMap3D({
  data,
  risks,
  route,
  start,
  destination,
  highlight,
  onPick,
}: {
  data: CampusData;
  risks: readonly RiskArea[];
  route: readonly Point[] | null;
  start: Point | null;
  destination: SafeDestination | null;
  highlight: string | null;
  onPick: (featureId: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CampusScene | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      const scene = createCampusScene(host, data, (id) => pickRef.current(id), setFailure);
      scene.setDecorations(false);
      scene.setLayer('incidents', false);
      sceneRef.current = scene;
    } catch {
      setFailure('3D graphics (WebGL) are not available on this device. Use the 2D map.');
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setOverlays({
      risks: risks.map((r) => ({
        centre: r.centre,
        radius: r.radius,
        colour: RISK_STYLE[r.kind].colour,
      })),
      route,
      start,
      destination: destination?.centre ?? null,
    });
    scene.frame(route ?? (start ? [start] : null));
  }, [risks, route, start, destination]);

  useEffect(() => {
    sceneRef.current?.setSelected(highlight);
  }, [highlight]);

  return (
    <div className="as-safemap as-safemap--3d">
      {failure ? (
        <p className="as-notice as-notice--warn" role="alert">
          {failure}
        </p>
      ) : (
        <div ref={hostRef} className="as-safemap__gl" />
      )}
      <div className="as-safemap__controls" role="group" aria-label="3D camera">
        <button type="button" aria-label="Zoom in" onClick={() => sceneRef.current?.zoom(0.8)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => sceneRef.current?.zoom(1.25)}>
          −
        </button>
        <button type="button" aria-label="Rotate" onClick={() => sceneRef.current?.rotate(0.4)}>
          ↻
        </button>
        <button
          type="button"
          aria-label="Fit route"
          onClick={() => sceneRef.current?.frame(route ?? (start ? [start] : null))}
        >
          ⤢
        </button>
      </div>
      <p className="as-safemap__hint">
        Drag to orbit · two fingers or right-drag to pan · tap a building to choose it
      </p>
    </div>
  );
}
