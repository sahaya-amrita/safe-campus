import { assessMap, createDemoMap, demoMapAdapter, DEMO_NOTICE } from './map-model.ts';
import type { MapAdapter, MapFeature, Point } from './map-model.ts';

export interface MapViewerOptions {
  adapter?: MapAdapter;
  authorizedSourceIds?: readonly string[];
}

/** Mount inside a shell-owned element; returns cleanup for React useEffect or other hosts. */
export function mountMapViewer(host: HTMLElement, options: MapViewerOptions = {}): () => void {
  const adapter = options.adapter ?? demoMapAdapter;
  const sources = [...(options.authorizedSourceIds ?? [])];
  const section = document.createElement('section');
  section.className = 'sc-map';
  section.setAttribute('aria-label', 'Map viewer');
  host.append(section);
  let raw: unknown = null;
  let disposed = false;
  let controller: AbortController | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let zoom = 1;
  let x = 0;
  let y = 0;
  let raised = false;
  let showRoutes = false;
  let requestNumber = 0;

  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, action: () => void) => {
    const node = element('button', label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };

  const title = element('h2', 'Map & source confidence');
  const status = element('p');
  status.setAttribute('role', 'status');
  const banner = element('p', DEMO_NOTICE);
  banner.className = 'sc-map-warning';
  const attribution = element('p');
  const controls = element('div');
  controls.className = 'sc-map-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Map controls');
  const canvas = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  canvas.setAttribute('viewBox', '0 0 1000 1000');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Abstract demo diagram. Not for navigation.');
  canvas.classList.add('sc-map-canvas');
  const viewport = element('div');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'group');
  viewport.setAttribute('aria-label', 'Map viewport. Arrow keys pan, plus and minus zoom, Home resets.');
  viewport.append(canvas);
  const description = element('p', 'Use the buttons or focus the map and use arrow keys to pan, +/− to zoom, and Home to reset.');
  const routeStatus = element('p');
  const legend = element('p', 'Legend: teal shapes = diagram areas; dashed violet lines = approved route geometry when available.');
  const featureList = element('ul');
  featureList.setAttribute('aria-label', 'Visible map features and provenance');
  const details = element('details');
  details.append(element('summary', 'Feature list & provenance'), featureList);
  const cameraStatus = element('output');
  cameraStatus.setAttribute('aria-label', 'Map zoom');
  const routeButton = button('Show approved route geometry', () => { showRoutes = !showRoutes; render(); });
  const raisedButton = button('2.5D demo view', () => { raised = !raised; render(); });
  const reloadButton = button('Reload map', () => { void load(); });

  function move(dx: number, dy: number) {
    x = Math.max(-450, Math.min(450, x + dx / zoom));
    y = Math.max(-450, Math.min(450, y + dy / zoom));
    drawCamera();
  }
  function drawCamera() {
    const size = 1000 / zoom;
    canvas.setAttribute('viewBox', `${500 - size / 2 + x} ${500 - size / 2 + y} ${size} ${size}`);
    cameraStatus.textContent = `Zoom ${zoom.toFixed(1)}×`;
  }
  function changeZoom(factor: number) { zoom = Math.min(4, Math.max(1, zoom * factor)); drawCamera(); }
  function reset() { zoom = 1; x = 0; y = 0; drawCamera(); }
  controls.append(button('Zoom in', () => changeZoom(1.25)), button('Zoom out', () => changeZoom(0.8)),
    button('Pan left', () => move(-100, 0)), button('Pan right', () => move(100, 0)),
    button('Pan up', () => move(0, -100)), button('Pan down', () => move(0, 100)),
    button('Reset view', reset), raisedButton, routeButton, reloadButton, cameraStatus);
  viewport.addEventListener('keydown', (event) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => move(-100, 0), ArrowRight: () => move(100, 0),
      ArrowUp: () => move(0, -100), ArrowDown: () => move(0, 100),
      '+': () => changeZoom(1.25), '=': () => changeZoom(1.25), '-': () => changeZoom(0.8), Home: reset,
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key]!(); }
  });
  section.append(title, status, banner, attribution, controls, description, viewport, legend, routeStatus, details);

  function drawFeature(feature: MapFeature, demo: boolean) {
    const project = ([a, b]: Point): Point => raised && demo
      ? [500 + (a - b) * 0.65, 180 + (a + b) * 0.32] : [a, b];
    const points = feature.points.map(project);
    const pointsText = (values: readonly Point[]) => values.map((point) => point.join(',')).join(' ');
    if (raised && demo) {
      const shadow = document.createElementNS(canvas.namespaceURI, 'polygon');
      shadow.setAttribute('points', pointsText(points.map(([a, b]) => [a, b + 28])));
      shadow.setAttribute('fill', '#31636b');
      canvas.append(shadow);
    }
    const shape = document.createElementNS(canvas.namespaceURI, feature.kind === 'AREA' ? 'polygon' : 'polyline');
    shape.setAttribute('points', pointsText(points));
    shape.setAttribute('fill', feature.kind === 'AREA' ? '#b9e1df' : 'none');
    shape.setAttribute('stroke', feature.kind === 'AREA' ? '#235962' : '#7033a4');
    shape.setAttribute('stroke-width', feature.kind === 'AREA' ? '4' : '9');
    if (feature.kind === 'ROUTE') shape.setAttribute('stroke-dasharray', '16 8');
    const shapeTitle = document.createElementNS(canvas.namespaceURI, 'title');
    shapeTitle.textContent = feature.label;
    shape.append(shapeTitle);
    canvas.append(shape);
    const label = document.createElementNS(canvas.namespaceURI, 'text');
    label.setAttribute('x', String(points.reduce((sum, point) => sum + point[0], 0) / points.length));
    label.setAttribute('y', String(points.reduce((sum, point) => sum + point[1], 0) / points.length));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '22');
    label.setAttribute('fill', '#123a42');
    label.textContent = feature.label;
    canvas.append(label);
  }

  function render(failure?: string) {
    if (disposed) return;
    clearTimeout(expiryTimer);
    const assessment = assessMap(raw, { authorizedSourceIds: sources, now: Date.now() });
    const fallback = assessment.document === null;
    const source = assessment.document?.source ?? createDemoMap().source;
    const demo = fallback || assessment.trust === 'DEMO';
    const areas = fallback ? createDemoMap().features : assessment.areas;
    status.textContent = failure ?? `${assessment.trust}: ${assessment.message}`;
    banner.hidden = !demo;
    banner.textContent = DEMO_NOTICE;
    attribution.textContent = `${source.label} · Version ${source.version} · ${source.attribution}`;
    canvas.setAttribute('aria-label', demo ? DEMO_NOTICE : 'Verified map geometry. See feature list for provenance.');
    raisedButton.disabled = !demo;
    if (!demo) raised = false;
    raisedButton.setAttribute('aria-pressed', String(raised));
    routeButton.disabled = !assessment.routeEnabled;
    if (!assessment.routeEnabled) showRoutes = false;
    routeButton.setAttribute('aria-pressed', String(showRoutes));
    routeButton.textContent = showRoutes ? 'Hide approved route geometry' : 'Show approved route geometry';
    routeStatus.textContent = assessment.routeEnabled
      ? `${assessment.routes.length} approved route(s) available. Geometry display only; no turn-by-turn directions.`
      : 'Route guidance disabled. No current, authorized route and campus geometry are available.';
    if (assessment.withheld) routeStatus.textContent += ` ${assessment.withheld} feature(s) withheld.`;
    canvas.replaceChildren();
    featureList.replaceChildren();
    const visible = [...areas, ...(showRoutes ? assessment.routes : [])];
    for (const feature of visible) {
      drawFeature(feature, demo);
      featureList.append(element('li', `${feature.label} — ${demo ? 'SYNTHETIC / NOT FOR NAVIGATION' : 'APPROVED'} · Source ${feature.provenance.sourceId} · Version ${feature.provenance.version} · Updated ${feature.provenance.updatedAt} · Valid until ${feature.provenance.expiresAt}`));
    }
    if (!visible.length) featureList.append(element('li', 'No approved features available.'));
    drawCamera();
    // Revoke displayed geometry when provenance expires, including while the viewer sits idle.
    if (assessment.document && !demo) {
      const expiry = Math.min(Date.parse(source.expiresAt), ...[...assessment.areas, ...assessment.routes].map((feature) => Date.parse(feature.provenance.expiresAt)));
      const remaining = expiry - Date.now();
      if (remaining > 0) expiryTimer = setTimeout(() => render(), Math.min(remaining + 1, 2_147_483_647));
    }
  }

  async function load() {
    const request = ++requestNumber;
    controller?.abort();
    controller = new AbortController();
    raw = null;
    render('Loading map data. Route guidance is disabled.');
    section.setAttribute('aria-busy', 'true');
    reloadButton.disabled = true;
    try {
      const data = await adapter.load(controller.signal);
      if (disposed || request !== requestNumber) return;
      raw = data;
      render();
    } catch (error: unknown) {
      if (disposed || request !== requestNumber) return;
      const denied = typeof error === 'object' && error !== null && 'code' in error && error.code === 'PERMISSION_DENIED';
      render(denied ? 'Map permission denied. Synthetic fallback only; route guidance is disabled.'
        : 'Map unavailable or offline. Synthetic fallback only; route guidance is disabled.');
    } finally {
      if (!disposed && request === requestNumber) {
        section.setAttribute('aria-busy', 'false');
        reloadButton.disabled = false;
      }
    }
  }
  void load();
  return () => { disposed = true; controller?.abort(); clearTimeout(expiryTimer); section.remove(); };
}
