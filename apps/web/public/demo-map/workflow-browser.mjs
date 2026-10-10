import assert from 'node:assert/strict';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { createPreviewServer } from './serve.mjs';
const {chromium}=await import(process.argv[2]?pathToFileURL(process.argv[2]).href:'playwright');
const server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-unsafe-swiftshader']});
let passed=0;
try{
 for(const [width,height] of [[1440,1050],[360,800],[390,844],[430,932],[768,1024]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<800,deviceScaleFactor:2});const page=await context.newPage();const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('.sc-map[aria-busy="false"]').waitFor();await page.waitForFunction(async()=>((await import('./preview.mjs')).getPreviewScene()?.snapshot().triangles??0)>0);
  const state=()=>page.evaluate(async()=>(await import('./preview.mjs')).getPreviewScene().snapshot());
  const click=async(name)=>page.getByRole('button',{name,exact:true}).tap();
  const before=await state();await click('Rotate left');assert.notDeepEqual((await state()).camera,before.camera);await click('Reset camera');
  const canvas=page.locator('.sc-map canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();const cdp=await context.newCDPSession(page);
  const start=await state();const x=box.x+box.width*.42,y=box.y+box.height*.4;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let n=1;n<=6;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+n*8,y:y+n*2,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notDeepEqual((await state()).camera,start.camera);
  await click('Top-down');const point=await page.evaluate(async()=>(await import('./preview.mjs')).getPreviewScene().screenPoint('way/380702790'));await canvas.scrollIntoViewIfNeeded();const bounds=await canvas.boundingBox();await page.touchscreen.tap(bounds.x+point.x,bounds.y+point.y);assert.equal((await state()).selected,'way/380702790');
  await page.getByRole('searchbox').fill('Central Library');assert.equal((await state()).visibleBuildings,1);await page.locator('.sc-map-result').tap();assert.equal(await page.getByLabel('Incident building').inputValue(),'way/380702790');
  await page.getByLabel('Buildings',{exact:true}).uncheck();assert.equal((await state()).visibleBuildings,0);await page.getByLabel('Buildings',{exact:true}).check();
  for(const label of ['Roads / paths','OSM facility buildings','Simulated incidents']){await page.getByLabel(label,{exact:true}).uncheck();await page.getByLabel(label,{exact:true}).check();}
  await page.getByRole('searchbox').fill('');await page.getByLabel('Building category').selectOption('residential');assert.ok((await state()).visibleBuildings<99);await page.getByLabel('Building category').selectOption('all');
  await click('Create simulated report');assert.equal((await state()).incidents,1);assert.ok(await page.getByRole('button',{name:'Verify in demonstration',exact:true}).isDisabled());
  await page.getByLabel('Filter incident category').selectOption('Medical assistance');assert.equal((await state()).incidents,0);await page.getByLabel('Filter incident category').selectOption('all');assert.equal((await state()).incidents,1);
  await click('Focus incident on map');await canvas.scrollIntoViewIfNeeded();await page.screenshot({path:fileURLToPath(new URL(`generated/workflow-map-${width}.png`,import.meta.url))});await click('Submit for demonstration review');await page.getByLabel('Demonstration role').selectOption('reviewer');await click('Verify in demonstration');await page.getByLabel('Simulated recipient zone').selectOption('zone-a');await click('Prepare test alert');
  await click('Attempt simulated delivery');assert.match(await page.locator('.sc-sim-inbox').textContent(),/No confirmed/);await page.getByLabel('Simulated delivery outcome').selectOption('failure');await click('Complete simulated delivery');assert.match(await page.locator('.sc-sim-detail table').textContent(),/failed/);assert.match(await page.locator('.sc-sim-inbox').textContent(),/No confirmed/);
  await click('Attempt simulated delivery');await page.getByLabel('Simulated delivery outcome').selectOption('success');await click('Complete simulated delivery');assert.match(await page.locator('.sc-sim-inbox').textContent(),/confirmed/);
  await page.getByLabel('Fictional recipient',{exact:true}).selectOption('demo-student-b1');assert.match(await page.locator('.sc-sim-inbox').textContent(),/No confirmed/);await page.getByLabel('Fictional recipient',{exact:true}).selectOption('demo-student-a1');await page.getByLabel('Demonstration role').selectOption('recipient');await click('Acknowledge simulated alert');assert.match(await page.locator('.sc-sim-inbox').textContent(),/Acknowledgment received/);
  await click('Practice with this alert');
  for(const choice of ['boundary','review','local','provenance']){await page.locator(`.sc-drill input[value="${choice}"]`).check();await click('Record choice & continue');}
  assert.match(await page.locator('.sc-drill').textContent(),/Review score: 4\/4/);assert.match(await page.locator('.sc-sim-detail').textContent(),/Linked local drill.*Improve/s);await click('Start a new digital simulation');assert.match(await page.locator('.sc-drill h3').textContent(),/Prepare/);
  await page.getByLabel('Demonstration role').selectOption('reviewer');await click('Resolve simulated incident');assert.match(await page.locator('.sc-sim-detail h3').textContent(),/Resolved/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
  await page.setViewportSize({width:width+15,height:height-20});await page.waitForTimeout(100);assert.ok((await state()).triangles>0);await page.setViewportSize({width,height});
  await page.locator('.sc-sim-detail').evaluate(n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:fileURLToPath(new URL(`generated/workflow-${width}.png`,import.meta.url))});
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith(`http://127.0.0.1:${server.address().port}/`)));
  const metrics=await state();console.log(`PASS ${width}x${height}: touch gesture, raycast, layers, filters, failed/retried delivery, zone isolation, acknowledgment, linked 4-stage drill, resolution, overflow and resize; DPR ${metrics.pixelRatio}, shadow ${metrics.shadowSize}, draw calls ${metrics.drawCalls}`);passed++;
  await click('Reload campus');await page.locator('.sc-map[aria-busy="false"]').waitFor();assert.match(await page.locator('.sc-sim-inbox').textContent(),/No confirmed/);await context.close();
 }
 console.log(`${passed} complete viewport workflows passed (browser emulation, not physical devices).`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
