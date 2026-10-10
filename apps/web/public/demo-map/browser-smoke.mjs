import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPreviewServer } from './serve.mjs';
const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
const server = createPreviewServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const baseURL = process.argv[3] ?? `http://127.0.0.1:${server.address().port}/`;
if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(baseURL)) throw new Error('Browser QA only targets a loopback preview');
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const failures = []; const requests=[];
page.on('pageerror', (error) => failures.push(error.message));
page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
let passed=0;
async function check(name, action) { await action(); passed++; console.log(`PASS ${name}`); }
const state=()=>page.evaluate(async()=> (await import('./preview.mjs')).getPreviewScene()?.snapshot());
async function ready(){await page.locator('.sc-map[aria-busy="false"]').waitFor();await page.waitForFunction(async()=>((await import('./preview.mjs')).getPreviewScene()?.snapshot().triangles??0)>0);}
try {
  await page.goto(baseURL);await ready();
  await page.screenshot({path:fileURLToPath(new URL('generated/preview-desktop.png',import.meta.url)),fullPage:true});
  await check('genuine WebGL mesh scene, source footprints and persistent warning',async()=>{
    const s=await state();assert.equal(s.buildings,99);assert.ok(s.roads>50);assert.ok(s.triangles>10000);assert.equal(s.heightScale,1.6);
    assert.equal(await page.locator('.sc-map canvas').count(),1);assert.equal(await page.locator('.sc-map svg').count(),0);
    assert.equal(await page.getByText('DEMO MAP — NOT FOR NAVIGATION',{exact:true}).isVisible(),true);
    assert.match(await page.locator('.sc-map-route-notice').textContent(),/disabled/);
    assert.match(await page.locator('.sc-map-status').textContent(),/unverified.*estimated/);
  });
  await check('camera rotation, pan, zoom, top-down and reset',async()=>{
    const initial=await state();
    await page.getByRole('button',{name:'Rotate left',exact:true}).click();assert.notDeepEqual((await state()).camera,initial.camera);
    await page.getByRole('button',{name:'Pan right',exact:true}).click();assert.notDeepEqual((await state()).target,initial.target);
    const before=await state();await page.getByRole('button',{name:'Zoom in',exact:true}).click();assert.notDeepEqual((await state()).camera,before.camera);
    await page.getByRole('button',{name:'Top-down',exact:true}).click();const top=await state();assert.ok(Math.abs(top.camera[0]-top.target[0])<1);
    await page.getByRole('button',{name:'Reset camera'}).click();
    const reset=await state();assert.ok(reset.camera.every((v,i)=>Math.abs(v-initial.camera[i])<1));
  });
  await check('real pointer orbit and wheel zoom',async()=>{
    const canvas=page.locator('.sc-map canvas');const box=await canvas.boundingBox();const before=await state();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.62,box.y+box.height*.48,{steps:8});await page.mouse.up();
    assert.notDeepEqual((await state()).camera,before.camera);await page.mouse.wheel(0,-200);
    await page.getByRole('button',{name:'Reset camera'}).click();
  });
  await check('source-name search, empty search and category filtering',async()=>{
    await page.getByRole('searchbox',{name:'Search mapped buildings'}).fill('Central Library');
    assert.equal(await page.locator('.sc-map-result').count(),1);assert.equal((await state()).visibleBuildings,1);
    await page.locator('.sc-map-result').click();assert.match(await page.locator('.sc-map-info').textContent(),/Central Library.*estimated/s);
    assert.equal((await state()).selected,'way/380702790');
    await page.getByRole('searchbox').fill('no-such-campus-building');assert.equal((await state()).visibleBuildings,0);
    assert.match(await page.locator('.sc-map-results').textContent(),/No buildings match/);
    await page.getByRole('searchbox').fill('');await page.getByLabel('Building category').selectOption('residential');
    assert.ok((await state()).visibleBuildings>5 && (await state()).visibleBuildings<99);
    await page.getByLabel('Building category').selectOption('all');await page.getByRole('button',{name:'Reset camera'}).click();
  });
  await check('raycast building selection changes highlight and information panel',async()=>{
    // Top-down gives an unobstructed source polygon interior for a real canvas click.
    await page.getByRole('button',{name:'Top-down',exact:true}).click();
    const id='way/380702790';
    const point=await page.evaluate(async(id)=>(await import('./preview.mjs')).getPreviewScene().screenPoint(id),id);
    const box=await page.locator('.sc-map canvas').boundingBox();
    await page.mouse.click(box.x+point.x,box.y+point.y);
    assert.equal((await state()).selected,id);assert.match(await page.locator('.sc-map-info').textContent(),/Central Library/);
    await page.screenshot({path:fileURLToPath(new URL('generated/preview-selected.png',import.meta.url)),fullPage:false});
    await page.getByRole('button',{name:'Reset camera'}).click();
  });
  await check('drill still completes offline with local-only score and restart',async()=>{
    await page.context().setOffline(true);const before=requests.length;
    for(const choice of ['boundary','review','local','provenance']){await page.locator(`.sc-drill input[value="${choice}"]`).check();await page.getByRole('button',{name:'Record choice & continue'}).click();}
    assert.match(await page.locator('.sc-drill').textContent(),/Review score: 4\/4/);
    assert.match(await page.locator('.sc-drill [role="status"]').textContent(),/LOCAL_ONLY.*Not sent/);assert.equal(requests.length,before);
    await page.getByRole('button',{name:'Start a new digital simulation'}).click();assert.match(await page.locator('.sc-drill h3').textContent(),/Prepare/);
    await page.context().setOffline(false);
  });
  await check('drill save-retry preserves event and advances once',async()=>{
    await page.evaluate(async()=>{
      const {mountDrillSimulator}=await import('./generated/drills/drill-view.js');const {createMemoryDrillStore}=await import('./generated/drills/drill-model.js');
      const memory=createMemoryDrillStore();document.querySelector('#drill').replaceChildren();window.retryEvents=[];
      mountDrillSimulator(document.querySelector('#drill'),{async append(event){window.retryEvents.push(structuredClone(event));const receipt=await memory.append(event);if(window.retryEvents.length===1)throw new Error('Receipt failure');return receipt;}});
    });
    await page.locator('.sc-drill input[value="boundary"]').check();await page.getByRole('button',{name:'Record choice & continue'}).click();
    assert.match(await page.locator('.sc-drill [role="alert"]').textContent(),/phase has not advanced/);
    await page.getByRole('button',{name:'Retry saving the same choice'}).click();assert.match(await page.locator('.sc-drill h3').textContent(),/Respond/);
    const events=await page.evaluate(()=>window.retryEvents);assert.equal(events.length,2);assert.deepEqual(events[0],events[1]);
  });
  await page.locator('.preview-tools summary').click();
  for(const [fixture,message] of [['empty','No campus geometry'],['invalid','could not load or validate'],['permission','permission denied'],['offline','could not load or validate']]) {
    await check(`${fixture} state has no invented substitute geometry`,async()=>{
      await page.locator('#fixture').selectOption(fixture);await page.getByRole('button',{name:'Load fixture'}).click();await page.locator('.sc-map[aria-busy="false"]').waitFor();
      assert.ok((await page.locator('.sc-map-status').textContent()).includes(message));assert.equal(await page.locator('.sc-map canvas').count(),0);
      assert.equal(await page.getByText('DEMO MAP — NOT FOR NAVIGATION',{exact:true}).isVisible(),true);
    });
  }
  await check('loading cleanup ignores late data',async()=>{
    assert.equal(await page.evaluate(async()=>{
      const {mountMapViewer}=await import('./generated/maps/map-view.js');const host=document.createElement('div');document.body.append(host);let resolve;
      const cleanup=mountMapViewer(host,{adapter:{load:()=>new Promise(done=>{resolve=done;})}});const loading=host.textContent.includes('Loading the OSM');
      cleanup();resolve({});await Promise.resolve();const empty=host.childElementCount===0;host.remove();return loading&&empty;
    }),true);
  });
  await check('retained approved-data viewer still revokes expired routes',async()=>{
    await page.clock.install({time:new Date('2026-10-10T12:00:00Z')});
    await page.evaluate(async()=>{
      const {mountMapViewer}=await import('./generated/maps/verified-map-view.js');const {createDemoMap}=await import('./generated/maps/map-model.js');
      const map=createDemoMap();map.source.kind='OPERATIONAL';map.source.approval='APPROVED';map.source.expiresAt=new Date(Date.now()+10000).toISOString();
      for(const f of map.features)f.provenance={...map.source};map.features.push({id:'route',label:'TEST ONLY',kind:'ROUTE',points:[[100,100],[800,800]],provenance:{...map.source}});
      document.querySelector('#map').replaceChildren();mountMapViewer(document.querySelector('#map'),{authorizedSourceIds:['synthetic-diagram'],adapter:{async load(){return map;}}});
    });
    await page.getByRole('button',{name:'Show approved route geometry'}).click();assert.equal(await page.locator('.sc-map polyline').count(),1);
    await page.clock.fastForward(10001);assert.equal(await page.locator('.sc-map polyline').count(),0);assert.equal(await page.getByRole('button',{name:'Show approved route geometry'}).isDisabled(),true);
    await page.clock.uninstall?.();
  });
  // A fresh page also restores the real clock after the expiry test.
  const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await check('mobile WebGL, reduced motion and readable layout',async()=>{
    await mobile.goto(baseURL);await mobile.locator('.sc-map[aria-busy="false"]').waitFor();
    await mobile.waitForFunction(async()=>((await import('./preview.mjs')).getPreviewScene()?.snapshot().triangles??0)>0);
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await mobile.getByText('DEMO MAP — NOT FOR NAVIGATION',{exact:true}).isVisible(),true);
    await mobile.screenshot({path:fileURLToPath(new URL('generated/preview-mobile.png',import.meta.url)),fullPage:true});
  });
  await check('missing WebGL keeps the source directory and explicit error',async()=>{
    const fallback=await browser.newPage({viewport:{width:1200,height:800}});
    await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args);};});
    await fallback.goto(baseURL);await fallback.locator('.sc-map[aria-busy="false"]').waitFor();
    assert.match(await fallback.locator('.sc-map-graphics-message').textContent(),/WebGL 3D could not start/);
    assert.equal(await fallback.locator('.sc-map-result').count(),99);
    assert.equal(await fallback.getByRole('button',{name:'Zoom in',exact:true}).isDisabled(),true);
    assert.equal(await fallback.locator('.sc-map svg').count(),0);await fallback.close();
  });
  await check('no uncaught browser errors or external/state-changing network requests',async()=>{
    assert.deepEqual(failures,[]);assert.equal(requests.some(r=>r.method!=='GET'||!r.url.startsWith(baseURL)),false);
  });
  console.log(`${passed} browser checks passed.`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
