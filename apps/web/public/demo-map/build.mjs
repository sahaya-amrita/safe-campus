// Dependency-free development preview build. Native stripping is NOT type-checking.
import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
for (const feature of ['maps', 'drills']) {
  const destination = new URL(`generated/${feature}/`, root);
  await mkdir(destination, { recursive: true });
  for (const file of feature === 'maps' ? ['map-model', 'map-view', 'campus-model', 'verified-map-view', 'simulation-model', 'simulation-view', 'linked-drill-store'] : ['drill-model', 'drill-view']) {
    const source = await readFile(new URL(`../../src/features/${feature}/${file}.ts`, root), 'utf8');
    const js = stripTypeScriptTypes(source).replace(/from '(\.\/[^']+)\.ts'/g, "from '$1.js'");
    await writeFile(new URL(`${file}.js`, destination), js);
  }
}
await copyFile(new URL('../../src/features/maps/maps-drills.css', root), new URL('generated/maps/maps-drills.css', root));
await copyFile(new URL('../../src/features/maps/campus-scene.mjs', root), new URL('generated/maps/campus-scene.mjs', root));
console.log('Built 3D campus/drill preview (9 TypeScript modules, WebGL renderer and scoped CSS). No type-check performed.');
