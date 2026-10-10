/** Reproducible OSM extraction. Run only against a downloaded OSM API map.json snapshot. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const raw = await readFile(new URL('./generated/osm-raw.json', import.meta.url), 'utf8');
const source = JSON.parse(raw);
const nodes = new Map(source.elements.filter((item) => item.type === 'node').map((node) => [node.id, node]));
const ways = source.elements.filter((item) => item.type === 'way');
const campus = ways.find((way) => way.id === 128964693);
if (!campus) throw new Error('Missing Amrita campus boundary');
const ring = campus.nodes.map((id) => [nodes.get(id).lon, nodes.get(id).lat]);
function inside([x, y]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i]; const [c, d] = ring[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) result = !result;
  }
  return result;
}
const allowedTags = ['name', 'name:en', 'building', 'building:levels', 'height', 'amenity', 'tourism',
  'leisure', 'landuse', 'natural', 'sport', 'surface', 'highway', 'width', 'description'];
const features = [];
for (const way of ways) {
  const tags = way.tags ?? {};
  let kind = way.id === campus.id ? 'boundary' : tags.building ? 'building' : tags.highway ? 'road'
    : tags.natural === 'water' || tags.leisure === 'swimming_pool' ? 'water'
    : ['pitch', 'playground', 'sports_centre'].includes(tags.leisure) ? 'sport'
    : ['grass', 'forest', 'farmland'].includes(tags.landuse) || tags.leisure === 'garden' ? 'green' : null;
  if (!kind || way.nodes.some((id) => !nodes.has(id))) continue;
  const coordinates = way.nodes.map((id) => [nodes.get(id).lon, nodes.get(id).lat]);
  if (kind !== 'boundary' && !coordinates.some(inside)) continue;
  if (kind !== 'road' && way.nodes[0] !== way.nodes.at(-1)) continue;
  // Road segments are clipped to existing inside vertices, not artificially joined or routed.
  const runs = kind === 'road' ? [[]] : [coordinates];
  if (kind === 'road') for (const coordinate of coordinates) {
    if (inside(coordinate)) runs.at(-1).push(coordinate);
    else if (runs.at(-1).length) runs.push([]);
  }
  for (const [index, run] of runs.entries()) {
    if (run.length < (kind === 'road' ? 2 : 4)) continue;
    features.push({ id: `way/${way.id}${index ? `:${index}` : ''}`, osmId: way.id, kind,
      version: way.version, updatedAt: way.timestamp,
      tags: Object.fromEntries(Object.entries(tags).filter(([key]) => allowedTags.includes(key))), coordinates: run });
  }
}
const data = {
  schema: 'safe-campus-osm-demo-v1', mode: 'DEMO', approval: 'UNVERIFIED',
  source: { name: 'OpenStreetMap contributors', license: 'ODbL 1.0',
    url: 'https://www.openstreetmap.org/way/128964693',
    downloadURL: 'https://api.openstreetmap.org/api/0.6/map.json?bbox=76.8928,10.8973,76.9066,10.9099',
    attributionURL: 'https://www.openstreetmap.org/copyright', retrievedAt: new Date().toISOString(),
    rawSHA256: createHash('sha256').update(raw).digest('hex') },
  bounds: [76.8930111, 10.8975929, 76.906381, 10.9096162],
  features,
};
await writeFile(new URL('./campus-data.json', import.meta.url), JSON.stringify(data));
console.log(JSON.stringify({ features: features.length, kinds: Object.fromEntries(['building','road','green','sport','water','boundary'].map((kind) => [kind, features.filter((f) => f.kind === kind).length])), namedBuildings: features.filter((f) => f.kind === 'building' && f.tags.name).length }));
