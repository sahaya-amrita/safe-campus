import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const importMap = '{"imports":{"three":"./vendor/three/three.module.js","three/addons/controls/OrbitControls.js":"./vendor/three/OrbitControls.js"}}';
const importMapHash = createHash('sha256').update(importMap).digest('base64');
const files = new Set(['index.html', 'preview.mjs', 'generated/maps/map-model.js', 'generated/maps/map-view.js',
  'generated/maps/maps-drills.css', 'generated/drills/drill-model.js', 'generated/drills/drill-view.js',
  'generated/maps/campus-model.js', 'generated/maps/campus-scene.mjs', 'generated/maps/verified-map-view.js',
  'generated/maps/simulation-model.js', 'generated/maps/simulation-view.js', 'generated/maps/linked-drill-store.js',
  'campus-data.json', 'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/OrbitControls.js']);
const types = { html: 'text/html; charset=utf-8', mjs: 'text/javascript', js: 'text/javascript', css: 'text/css', json:'application/json' };
export function createPreviewServer() { return createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!files.has(file)) { response.writeHead(404).end('Not found'); return; }
  try {
    const contents = await readFile(new URL(file, import.meta.url));
    response.writeHead(200, { 'Content-Type': types[file.split('.').pop()], 'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'self'; connect-src 'self'; script-src 'self' 'sha256-${importMapHash}'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'` });
    response.end(contents);
  } catch { response.writeHead(404).end('Build the preview first.'); }
}); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 4174);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Specify a port between 1024 and 65535');
  createPreviewServer().listen(port, '127.0.0.1', () => console.log(`Isolated preview: http://127.0.0.1:${port}`));
}
