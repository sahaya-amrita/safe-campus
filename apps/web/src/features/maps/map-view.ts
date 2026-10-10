import { campusDirectory, campusNavigation, categoryOf, featureName, heightOf, parseCampusData } from './campus-model.ts';
import type { CampusAdapter, CampusData } from './campus-model.ts';
import { createCampusScene } from './campus-scene.mjs';
import type { CampusScene } from './campus-scene.mjs';
import { DEMO_NOTICE } from './map-model.ts';
import { createDemoSimulation } from './simulation-model.ts';
import type { DemoSimulationAdapter } from './simulation-model.ts';
import { mountSimulationView } from './simulation-view.ts';
import type { SimulationView } from './simulation-view.ts';

export interface MapViewerOptions {
  adapter?: CampusAdapter;
  onSimulationReset?: () => void;
  onStartDrill?: (simulation: DemoSimulationAdapter, incidentId: string, recipientId: string) => void;
  /** Optional integration/QA hook; exposes no operational actions. */
  onSceneReady?: (scene: CampusScene) => void;
  /**
   * The standalone preview runs a page-memory incident simulation. The app shell
   * sets this to false and overlays server incidents through onSceneReady instead.
   */
  localSimulation?: boolean;
}

/** Read-only OSM exploration. The retained verified viewer owns operational guards. */
export function mountMapViewer(host: HTMLElement, options: MapViewerOptions = {}): () => void {
  const adapter = options.adapter ?? { async load(signal: AbortSignal) {
    const response = await fetch(new URL('campus-data.json', document.baseURI), { signal });
    if (!response.ok) throw new Error('Campus snapshot unavailable');
    return response.json() as Promise<unknown>;
  } };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
    if (className) node.className = className; return node;
  };
  const button = (label: string, action: () => void, className?: string) => {
    const node = el('button', label, className); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const link = (label: string, href: string) => { const node = el('a', label); node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node; };
  const section = el('section', undefined, 'sc-map'); section.setAttribute('aria-label', 'Amrita 3D campus explorer');
  host.append(section);
  let disposed = false;
  let simulationView: SimulationView | undefined;
  let scene: CampusScene | undefined;
  let data: CampusData | undefined;
  let controller: AbortController | undefined;
  let revision = 0;
  let selected: string | null = null;
  const head = el('div', undefined, 'sc-map-heading');
  const titles = el('div'); titles.append(el('p', 'ETTIMADAI / COIMBATORE', 'sc-map-eyebrow'), el('h1', 'Explore Amrita', 'sc-map-title'));
  const metrics = el('p', 'Campus geometry · loading', 'sc-map-metrics'); head.append(titles, metrics);
  const warning = el('p', DEMO_NOTICE, 'sc-map-warning');
  const status = el('p', 'Loading campus geometry…', 'sc-map-status'); status.setAttribute('role', 'status');
  const layout = el('div', undefined, 'sc-map-layout');
  const directory = el('aside', undefined, 'sc-map-directory'); directory.setAttribute('aria-label', 'Campus directory');
  directory.append(el('h2', 'Find a place'));
  const searchLabel = el('label', 'Search mapped buildings'); const search = el('input'); search.type = 'search';
  search.placeholder = 'Library, hostel, OSM ID…'; searchLabel.append(search);
  const categoryLabel = el('label', 'Building category'); const category = el('select');
  for (const [value, label] of [['all','All buildings'],['academic','Academic'],['residential','Residential'],['dining','Dining'],['facilities','Facilities'],['other','Other / unspecified']]) {
    const option = el('option', label); option.value = value!; category.append(option);
  }
  categoryLabel.append(category);
  const resultCount = el('p', '', 'sc-map-result-count'); resultCount.setAttribute('role','status');
  const results = el('div', undefined, 'sc-map-results'); results.setAttribute('role', 'group'); results.setAttribute('aria-label', 'Matching buildings');
  const info = el('div', undefined, 'sc-map-info'); info.setAttribute('aria-label', 'Selected building information');
  directory.append(searchLabel, categoryLabel, resultCount, results, info);
  const world = el('div', undefined, 'sc-map-world');
  const viewport = el('div', undefined, 'sc-map-viewport');
  const toolbar = el('div', undefined, 'sc-map-view-switch'); toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Camera view');
  const angled = button('3D perspective', () => { scene?.reset(false); angled.setAttribute('aria-pressed','true'); top.setAttribute('aria-pressed','false'); });
  const top = button('Top-down', () => { scene?.reset(true); top.setAttribute('aria-pressed','true'); angled.setAttribute('aria-pressed','false'); });
  angled.setAttribute('aria-pressed','true');top.setAttribute('aria-pressed','false');toolbar.append(angled,top);
  const controls = el('div', undefined, 'sc-map-camera-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label','Camera controls');
  for (const [label, action] of [
    ['Zoom in',()=>scene?.zoom(.8)],['Zoom out',()=>scene?.zoom(1.25)],
    ['Rotate left',()=>scene?.rotate(.3)],['Rotate right',()=>scene?.rotate(-.3)],
    ['Pan left',()=>scene?.pan(-70,0)],['Pan right',()=>scene?.pan(70,0)],
    ['Pan north',()=>scene?.pan(0,-70)],['Pan south',()=>scene?.pan(0,70)],
    ['Reset camera',()=>angled.click()],
  ] as const) {
    const icons: Record<string,string> = { 'Zoom in':'+','Zoom out':'−','Rotate left':'↶','Rotate right':'↷','Pan left':'←','Pan right':'→','Pan north':'↑','Pan south':'↓','Reset camera':'Reset' };
    const control=button(icons[label]!,action);control.setAttribute('aria-label',label);control.title=label;controls.append(control);
  }
  const caption = el('p','Drag to orbit · Scroll to zoom · Right-drag / two fingers to pan','sc-map-gesture');
  const legend = el('div',undefined,'sc-map-legend');legend.setAttribute('aria-label','Map legend');
  for(const [label,color] of [['Academic','#c89273'],['Residential','#799799'],['Dining','#cead70'],['Facilities','#9a90ad'],['Roads / paths','#88928b'],['Green space','#729561']]) {
    const item=el('span',label);const dot=el('i');dot.style.backgroundColor=color!;item.prepend(dot);legend.append(item);
  }
  const graphicsMessage=el('p','','sc-map-graphics-message');graphicsMessage.setAttribute('role','alert');graphicsMessage.hidden=true;
  const incidentBadge=el('p','','sc-map-incident-badge');incidentBadge.hidden=true;incidentBadge.setAttribute('role','status');
  world.append(viewport,toolbar,controls,caption,legend,graphicsMessage,incidentBadge);layout.append(directory,world);
  const footer=el('div',undefined,'sc-map-footer');
  const attribution=el('p');attribution.append(link('© OpenStreetMap contributors','https://www.openstreetmap.org/copyright'),document.createTextNode(' · ODbL · Community data, not institution-verified'));
  const styling=el('label',undefined,'sc-map-decoration-toggle');const scenery=el('input');scenery.type='checkbox';scenery.checked=true;
  styling.append(scenery,document.createTextNode('Illustrative trees & façade detail'));
  scenery.addEventListener('change',()=>scene?.setDecorations(scenery.checked));
  footer.append(attribution,styling);
  const explanation=el('details',undefined,'sc-map-provenance');explanation.append(el('summary','Data sources, estimates & navigation restrictions'));
  const provenanceText=el('p');
  explanation.append(provenanceText,el('p','Footprints, road centerlines, mapped lawns, grounds and water come from OSM. Heights are estimated where source measurements are absent, with 1.6× vertical exaggeration for legibility. Road widths, flat terrain, façade styling and individual tree positions are illustrative. This is not a surveyed digital twin.'),
    el('p',campusNavigation.reason+' No directions, safe-route claims or emergency locations are provided.'),
    link('View the mapped campus boundary','https://www.openstreetmap.org/way/128964693'),document.createTextNode(' · '),link('Official campus reference','https://www.amrita.edu/campus/coimbatore/'));
  const routeNotice=el('p','Route guidance disabled · No approved operational geometry supplied.','sc-map-route-notice');
  const reload=button('Reload campus',()=>{void load();},'sc-map-reload');
  const layers=el('fieldset');layers.className='sc-map-layers';layers.append(el('legend','Map layers'));
  for(const [key,label] of [['buildings','Buildings'],['paths','Roads / paths'],['facilities','OSM facility buildings'],['incidents','Simulated incidents']] as const){
    const wrap=el('label',label);const check=el('input');check.type='checkbox';check.checked=true;
    check.addEventListener('change',()=>scene?.setLayer(key,check.checked));wrap.prepend(check);layers.append(wrap);
  }
  const references=el('details');references.className='sc-map-provenance';references.append(el('summary','Official public campus information'));
  references.append(el('p','Public sources checked 10 October 2026. These references do not establish emergency readiness, approved routes or verified facility coordinates.'),
    link('Amrita Coimbatore campus','https://www.amrita.edu/campus/coimbatore/'),
    el('p','The official infrastructure page describes Amrita Dispensary. Its location and current service availability have not been operationally verified; no medical marker is invented.'),
    link('Official infrastructure reference','https://www.amrita.edu/campus/coimbatore/infrastructure/'),
    el('p','General campus contact: +91 (422) 2685 000. Public institutional contact, not a verified emergency dispatch number.'),
    link('Official contact reference','https://www.amrita.edu/contact/'),
    el('p','Approved emergency procedures and emergency contact data: unavailable. No redistribution license or institutional operational approval is inferred from public page summaries.'));
  const simulationHost=el('div');
  section.append(head,warning,status,layers,layout,footer,routeNotice,explanation,references,reload,simulationHost);

  function showInfo(id: string | null, focus = false) {
    selected=id;scene?.setSelected(id,focus);if(id)simulationView?.chooseBuilding(id);info.replaceChildren();
    const feature=data?.features.find((item)=>item.id===id);
    if(!feature){info.append(el('h3','Select a building'),el('p','Click a footprint in the scene or choose a directory result to inspect its source.'));return;}
    const heading=el('h3',featureName(feature));heading.tabIndex=-1;
    const height=heightOf(feature);
    const list=el('dl');
    for(const [key,value] of [['Category',`${categoryOf(feature)} (inferred from OSM tags)`],['Footprint','OSM mapped · institution unverified'],['Height',`${height.metres.toFixed(1)} m ${height.estimated?'estimated':'OSM-tagged'}`],['Height basis',height.basis],['Source revision',`v${feature.version} · ${feature.updatedAt.slice(0,10)}`]])list.append(el('dt',key),el('dd',value));
    info.append(el('p','SOURCE INFORMATION','sc-map-eyebrow'),heading,list,link(`Open OSM way ${feature.osmId}`,`https://www.openstreetmap.org/way/${feature.osmId}`));
    if(focus)heading.focus({preventScroll:true});
    results.querySelectorAll('button').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.id===id)));
  }
  function filter() {
    results.replaceChildren();if(!data)return;
    const entries=campusDirectory(data,search.value,category.value);scene?.filter(entries.map(f=>f.id));
    resultCount.textContent=`${entries.length} building${entries.length===1?'':'s'} shown`;
    if(selected&&!entries.some(f=>f.id===selected))showInfo(null);
    if(!entries.length)results.append(el('p','No buildings match. Try a different name, OSM ID or category.'));
    for(const feature of entries){const node=button('',()=>showInfo(feature.id,true),'sc-map-result');node.dataset.id=feature.id;node.setAttribute('aria-pressed',String(selected===feature.id));node.append(el('span',featureName(feature)),el('small',`${categoryOf(feature)} · ${feature.tags.name?'OSM name':'Name unavailable'}`));results.append(node);}
  }
  search.addEventListener('input',filter);category.addEventListener('change',filter);
  function graphicsFailure(message: string){graphicsMessage.hidden=false;graphicsMessage.textContent=message;status.textContent='3D unavailable. Source directory remains available; navigation is disabled.';controls.querySelectorAll('button').forEach(b=>b.disabled=true);toolbar.querySelectorAll('button').forEach(b=>b.disabled=true);}
  async function load() {
    simulationView?.dispose();simulationView=undefined;options.onSimulationReset?.();
    incidentBadge.hidden=true;
    layers.querySelectorAll<HTMLInputElement>('input').forEach(n=>n.checked=true);
    const request=++revision;controller?.abort();controller=new AbortController();scene?.dispose();scene=undefined;data=undefined;selected=null;
    graphicsMessage.hidden=true;viewport.replaceChildren();results.replaceChildren();showInfo(null);search.value='';category.value='all';scenery.checked=true;
    section.setAttribute('aria-busy','true');status.textContent='Loading the OSM campus snapshot…';reload.disabled=true;resultCount.textContent='Loading directory…';
    controls.querySelectorAll('button').forEach(b=>b.disabled=true);toolbar.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      const input=await adapter.load(controller.signal);if(disposed||request!==revision)return;
      data=parseCampusData(input);
      if(!data.features.length){status.textContent='No campus geometry is available. Reload or supply a valid snapshot; navigation remains disabled.';resultCount.textContent='No data';metrics.textContent='No geometry';return;}
      metrics.textContent=`${data.features.filter(f=>f.kind==='building').length} footprints · ${data.features.filter(f=>f.kind==='road').length} path segments`;
      provenanceText.textContent=`OSM snapshot retrieved ${data.source.retrievedAt.slice(0,10)}. Each feature retains its OSM ID, version and edit timestamp. No feature is institution-approved.`;
      filter();
      try {
        scene=createCampusScene(viewport,data,(id)=>showInfo(id),graphicsFailure,(id)=>simulationView?.chooseIncident(id));
        options.onSceneReady?.(scene);
        status.textContent='3D ready · OSM footprints unverified · Heights estimated · 1.6× vertical scale';
        controls.querySelectorAll('button').forEach(b=>b.disabled=false);toolbar.querySelectorAll('button').forEach(b=>b.disabled=false);
      } catch {graphicsFailure('WebGL 3D could not start. Try a browser with WebGL2 enabled. The source directory remains available; no substitute geometry is shown.');}
      if(options.localSimulation===false)return;
      const simulation=createDemoSimulation(data.features.filter(f=>f.kind==='building').map(f=>f.id));
      let incidentFilter='all';let selectedIncident:string|null=null;
      const updateIncidents=()=>{
        const items=simulation.snapshot().incidents.filter(i=>incidentFilter==='all'||i.category===incidentFilter);
        scene?.setIncidents(items,selectedIncident);incidentBadge.hidden=items.length===0;
        const item=items.find(i=>i.id===selectedIncident);
        incidentBadge.textContent=`SIMULATED ${item?`${item.category} · ${item.status}`:'incidents'} · 45 m circles illustrative, not validated hazard boundaries`;
      };
      simulationView=mountSimulationView(simulationHost,data,simulation,(id,focus)=>{
        selectedIncident=id;updateIncidents();if(id&&focus){
          const incident=simulation.snapshot().incidents.find(i=>i.id===id);if(incident)showInfo(incident.buildingId);
          scene?.focusIncident(id);angled.setAttribute('aria-pressed','true');top.setAttribute('aria-pressed','false');
        }
      },(id,recipient)=>options.onStartDrill?.(simulation,id,recipient),(value)=>{incidentFilter=value;updateIncidents();});
    } catch(error: unknown) {
      if(disposed||request!==revision)return;
      const denied=typeof error==='object'&&error!==null&&'code' in error&&error.code==='PERMISSION_DENIED';
      status.textContent=denied?'Campus snapshot permission denied. No geometry displayed.':'Campus geometry could not load or validate. Check the local snapshot and reload. No geometry displayed.';
      graphicsMessage.textContent='3D campus unavailable · Navigation disabled';graphicsMessage.hidden=false;resultCount.textContent='Directory unavailable';metrics.textContent='No geometry';
    } finally {if(!disposed&&request===revision){section.setAttribute('aria-busy','false');reload.disabled=false;}}
  }
  void load();
  return()=>{simulationView?.dispose();disposed=true;controller?.abort();scene?.dispose();section.remove();};
}
