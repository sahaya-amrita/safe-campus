import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { featureName, type CampusData } from '../../features/maps/campus-model.ts';
import {
  featureCentre,
  projectFeature,
  type Point,
  type RiskArea,
  type SafeDestination,
} from '../../features/maps/safe-route.ts';
import { RISK_STYLE } from './safeMapModel';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const toPoints = (pts: readonly Point[]) =>
  pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/**
 * Light 2D campus map (SVG) for routing: footprints, paths, open grounds, risk
 * areas and the current route. Works without WebGL and on low-end phones.
 * Local metres map straight onto SVG units (x east, y = z south).
 */
export function SafeMap2D({
  data,
  risks,
  route,
  start,
  destination,
  grounds,
  highlight,
  onPick,
  pickHint,
}: {
  data: CampusData;
  risks: readonly RiskArea[];
  route: readonly Point[] | null;
  start: Point | null;
  destination: SafeDestination | null;
  grounds: readonly SafeDestination[];
  highlight: readonly string[];
  onPick: (featureId: string) => void;
  pickHint: string;
}) {
  const shapes = useMemo(() => {
    const out = data.features.map((f) => ({ f, pts: projectFeature(f, data) }));
    const all = out.filter((s) => s.f.kind !== 'boundary').flatMap((s) => s.pts);
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const pad = 40;
    const fit: Box = {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + pad * 2,
      h: Math.max(...ys) - Math.min(...ys) + pad * 2,
    };
    const labels = out
      .filter((s) => s.f.kind === 'building' && s.f.tags.name)
      .map((s) => ({ id: s.f.id, name: featureName(s.f), at: featureCentre(s.f, data) }));
    return { out, fit, labels };
  }, [data]);

  const [box, setBox] = useState<Box>(shapes.fit);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const unit = box.w / 100; // ~1% of the visible width, for zoom-independent strokes

  const toWorld = (clientX: number, clientY: number, b: Box = box) => {
    const r = svgRef.current!.getBoundingClientRect();
    // preserveAspectRatio="xMidYMid meet": account for letterboxing.
    const scale = Math.min(r.width / b.w, r.height / b.h);
    const ox = (r.width - b.w * scale) / 2;
    const oy = (r.height - b.h * scale) / 2;
    return {
      x: b.x + (clientX - r.left - ox) / scale,
      y: b.y + (clientY - r.top - oy) / scale,
      scale,
    };
  };
  const zoomAt = (factor: number, cx?: number, cy?: number) =>
    setBox((b) => {
      const w = Math.min(shapes.fit.w * 1.5, Math.max(120, b.w * factor));
      const h = (b.h * w) / b.w;
      const r = svgRef.current?.getBoundingClientRect();
      const c =
        cx !== undefined && cy !== undefined && r
          ? toWorld(cx, cy, b)
          : { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const fx = (c.x - b.x) / b.w;
      const fy = (c.y - b.y) / b.h;
      return { x: c.x - fx * w, y: c.y - fy * h, w, h };
    });

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const all = [...pointers.current.entries()];
    if (all.length === 2) {
      const other = all.find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0 && after > 0)
        zoomAt(before / after, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
    } else {
      const { scale } = toWorld(e.clientX, e.clientY);
      const dx = (e.clientX - prev.x) / scale;
      const dy = (e.clientY - prev.y) / scale;
      setBox((b) => ({ ...b, x: b.x - dx, y: b.y - dy }));
    }
    moved.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (moved.current > 6) svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };
  const pick = (id: string) => {
    if (moved.current <= 6) onPick(id);
  };

  const zoomedIn = box.w < shapes.fit.w * 0.55;
  const fontSize = unit * 1.9;
  const marked = new Set(highlight);

  return (
    <div className="as-safemap">
      <svg
        ref={svgRef}
        className="as-safemap__svg"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Campus map. ${risks.length} risk area${risks.length === 1 ? '' : 's'}${route ? '. Route shown' : ''}. ${pickHint}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern
            id="as-hatch"
            width={unit * 1.6}
            height={unit * 1.6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2={unit * 1.6}
              stroke="currentColor"
              strokeWidth={unit * 0.5}
            />
          </pattern>
        </defs>
        {shapes.out.map(({ f, pts }) => {
          if (f.kind === 'boundary')
            return <polygon key={f.id} points={toPoints(pts)} className="as-safemap__campus" />;
          if (f.kind === 'road')
            return (
              <polyline
                key={f.id}
                points={toPoints(pts)}
                className={`as-safemap__path${['footway', 'path', 'steps'].includes(f.tags.highway ?? '') ? ' as-safemap__path--foot' : ''}`}
                strokeWidth={f.tags.highway === 'footway' ? 2.5 : 5}
              />
            );
          if (f.kind === 'building')
            return (
              <polygon
                key={f.id}
                points={toPoints(pts)}
                className={`as-safemap__building${marked.has(f.id) ? ' is-marked' : ''}`}
                onClick={() => pick(f.id)}
              >
                <title>{featureName(f)}</title>
              </polygon>
            );
          return <polygon key={f.id} points={toPoints(pts)} className={`as-safemap__${f.kind}`} />;
        })}
        {grounds.map((g) => (
          <circle
            key={g.id}
            cx={g.centre[0]}
            cy={g.centre[1]}
            r={unit * 0.9}
            className={`as-safemap__ground${destination?.id === g.id ? ' is-destination' : ''}`}
          />
        ))}
        {risks.map((r) => (
          <g
            key={r.id}
            className={`as-safemap__risk as-safemap__risk--${r.kind}`}
            style={{ color: RISK_STYLE[r.kind].colour }}
          >
            <circle
              cx={r.centre[0]}
              cy={r.centre[1]}
              r={r.radius}
              fill="url(#as-hatch)"
              fillOpacity={0.35}
            />
            <circle
              cx={r.centre[0]}
              cy={r.centre[1]}
              r={r.radius}
              fill="currentColor"
              fillOpacity={0.12}
              stroke="currentColor"
              strokeWidth={unit * 0.35}
              strokeDasharray={
                r.kind === 'VERIFIED_INCIDENT' ? undefined : `${unit * 1.2} ${unit * 0.8}`
              }
            />
            <title>{r.label}</title>
          </g>
        ))}
        {route && (
          <>
            <polyline
              points={toPoints(route)}
              className="as-safemap__route-casing"
              strokeWidth={unit * 1.4}
            />
            <polyline
              points={toPoints(route)}
              className="as-safemap__route"
              strokeWidth={unit * 0.8}
            />
          </>
        )}
        {destination && (
          <g
            transform={`translate(${destination.centre[0]} ${destination.centre[1]})`}
            className="as-safemap__flag"
          >
            <circle r={unit * 1.6} />
            <path
              d={`M ${-unit * 0.4} ${unit * 0.8} V ${-unit * 0.9} L ${unit * 0.8} ${-unit * 0.5} L ${-unit * 0.4} ${-unit * 0.1}`}
            />
          </g>
        )}
        {start && (
          <g transform={`translate(${start[0]} ${start[1]})`} className="as-safemap__you">
            <circle r={unit * 1.5} />
            <circle r={unit * 0.6} className="as-safemap__you-dot" />
          </g>
        )}
        {shapes.labels
          .filter((l) => zoomedIn || marked.has(l.id))
          .map((l) => (
            <text
              key={l.id}
              x={l.at[0]}
              y={l.at[1]}
              fontSize={fontSize}
              className="as-safemap__label"
              textAnchor="middle"
            >
              {l.name.length > 28 ? `${l.name.slice(0, 26)}…` : l.name}
            </text>
          ))}
      </svg>
      <div className="as-safemap__controls" role="group" aria-label="Map zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1 / 1.4)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1.4)}>
          −
        </button>
        <button type="button" aria-label="Show whole campus" onClick={() => setBox(shapes.fit)}>
          ⤢
        </button>
      </div>
      <p className="as-safemap__hint">{pickHint}</p>
    </div>
  );
}
