import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { categoryOf, heightOf, projectCoordinate } from './campus-model.js';

const palette = { academic: 0xc89273, residential: 0x799799, dining: 0xcead70, facilities: 0x9a90ad, other: 0xafa99a };
const HEIGHT_SCALE = 1.6;
/** Real mesh extrusion from OSM polygons. Decoration is separately labelled and switchable. */
export function createCampusScene(container, data, onSelect, onFailure, onIncidentSelect) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, container.clientWidth<650?1.25:1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D Amrita campus. Drag to orbit, right-drag or two fingers to pan, scroll or pinch to zoom. Keyboard controls are above the scene.');
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe1e9df);
  scene.fog = new THREE.Fog(0xe1e9df, 2500, 6500);
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI * .46;
  controls.minPolarAngle = .015;
  controls.minDistance = 90;
  controls.maxDistance = 2700;
  controls.screenSpacePanning = false;
  controls.target.set(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xfff8e8, 0x70816a, 2.1));
  const sun = new THREE.DirectionalLight(0xfff0d6, 3.8);
  sun.position.set(-500, 900, 350);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -1100, right: 1100, top: 1100, bottom: -1100, near: 1, far: 2400 });
  const shadowSize=container.clientWidth<650?1024:2048;
  sun.shadow.mapSize.set(shadowSize,shadowSize);
  sun.shadow.bias = -.0002;
  sun.shadow.normalBias = 1;
  scene.add(sun);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xb5c6a1, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -8;
  ground.receiveShadow = true;
  scene.add(ground);

  const projected = new Map(data.features.map((f) => [f.id, f.coordinates.map((p) => projectCoordinate(p, data.bounds))]));
  const buildings = new Map();
  const features = new Map(data.features.map((f) => [f.id, f]));
  const decorations = new THREE.Group();
  const roads = new THREE.Group();
  const landscape = new THREE.Group();
  scene.add(decorations, roads, landscape);
  const incidentLayer=new THREE.Group();scene.add(incidentLayer);
  const layers={buildings:true,paths:true,facilities:true,incidents:true};
  const incidentMarkers=new Map();

  function polygon(points, height, topColor, sideColor, bottom = 0) {
    const shape = new THREE.Shape();
    points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, [new THREE.MeshStandardMaterial({ color: topColor, roughness: .85 }),
      new THREE.MeshStandardMaterial({ color: sideColor, roughness: .95 })]);
    mesh.position.y = bottom;
    mesh.receiveShadow = true; mesh.castShadow = true;
    return mesh;
  }

  const boundary = data.features.find((f) => f.kind === 'boundary');
  if (boundary) {
    const base = polygon(projected.get(boundary.id), 8, 0xc9d2af, 0x829577, -8);
    scene.add(base);
    const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(projected.get(boundary.id).map(([x,z]) => new THREE.Vector3(x, .5, z))),
      new THREE.LineDashedMaterial({ color: 0x637f68, dashSize: 10, gapSize: 7 }));
    outline.computeLineDistances(); scene.add(outline);
  }
  const windows = [];
  for (const feature of data.features) {
    const points = projected.get(feature.id);
    if (feature.kind === 'building') {
      const height = heightOf(feature).metres * HEIGHT_SCALE;
      const color = palette[categoryOf(feature)];
      const mesh = polygon(points, height, color, 0xe5dfcd, .5);
      mesh.userData.featureId = feature.id;
      mesh.userData.baseColor = color;
      const box = new THREE.Box3().setFromObject(mesh);
      mesh.userData.center = box.getCenter(new THREE.Vector3());
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: 0x847666, transparent: true, opacity: .38 }));
      mesh.add(edges);
      buildings.set(feature.id, mesh); scene.add(mesh);
      // Stylized window ribbons communicate depth; no façade survey is implied.
      for (let i = 0; i < points.length - 1; i++) {
        const [x1,z1] = points[i], [x2,z2] = points[i+1];
        const length = Math.hypot(x2-x1,z2-z1);
        if (length < 9 || length > 200) continue;
        for (let y = 4; y < height - 2; y += 5.1) windows.push({ x: (x1+x2)/2, z: (z1+z2)/2, y, length: length*.82, angle: -Math.atan2(z2-z1,x2-x1), id: feature.id });
      }
    } else if (feature.kind === 'road') {
      const foot = ['footway','path','steps','pedestrian'].includes(feature.tags.highway);
      const widthTag = Number(feature.tags.width);
      const width = widthTag > 0 && widthTag < 30 ? widthTag : foot ? 2.8 : 6;
      for (let i=0;i<points.length-1;i++) {
        const [x1,z1]=points[i], [x2,z2]=points[i+1];
        const length=Math.hypot(x2-x1,z2-z1);
        if (!length) continue;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(width+1.6,.35,length+width*.4),new THREE.MeshStandardMaterial({color:0xded9c6,roughness:1}));
        slab.position.set((x1+x2)/2,.22,(z1+z2)/2);slab.rotation.y=Math.atan2(x2-x1,z2-z1);slab.receiveShadow=true;
        roads.add(slab);
        const surface=new THREE.Mesh(new THREE.BoxGeometry(width,.22,length+width*.3),new THREE.MeshStandardMaterial({color:foot?0xc5b699:0x88928b,roughness:1}));
        surface.position.copy(slab.position);surface.position.y=.47;surface.rotation.y=slab.rotation.y;surface.receiveShadow=true; roads.add(surface);
      }
    } else if (['green','sport','water'].includes(feature.kind)) {
      const color = feature.kind === 'water' ? 0x79b3b5 : feature.kind === 'sport' ? (feature.tags.surface === 'dirt' ? 0xc7a87d : 0x8fa874) : 0x9db888;
      const area=polygon(points,.25,color,color,.04);area.castShadow=false;landscape.add(area);
      if(feature.kind === 'sport') {
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,.55,z))),new THREE.LineBasicMaterial({color:0xe1e1c5}));landscape.add(line);
      }
    }
  }
  const windowGeometry=new THREE.BoxGeometry(1,1.7,.28);
  const windowMaterial=new THREE.MeshStandardMaterial({color:0x586c6a,roughness:.65});
  const windowMesh=new THREE.InstancedMesh(windowGeometry,windowMaterial,windows.length);
  const dummy=new THREE.Object3D();
  windows.forEach((w,i)=>{dummy.position.set(w.x,w.y,w.z);dummy.rotation.set(0,w.angle,0);dummy.scale.set(w.length,1,1);dummy.updateMatrix();windowMesh.setMatrixAt(i,dummy.matrix);});
  decorations.add(windowMesh);

  // Illustrative trees: deterministic scenery, never source-provided tree locations.
  const treePoints=[];
  let seed=1487;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
  const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1];const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
  const obstaclePolygons=data.features.filter(f=>['building','sport','water'].includes(f.kind)).map(f=>projected.get(f.id));
  const roadLines=data.features.filter(f=>f.kind==='road').map(f=>projected.get(f.id));
  const ring=boundary?projected.get(boundary.id):[];
  for(let attempt=0;attempt<4500&&treePoints.length<560;attempt++) {
    const p=[(random()-.5)*1465,(random()-.5)*1340];
    if(!inside(p,ring)||obstaclePolygons.some(poly=>inside(p,poly)||poly.some((a,i)=>i&&distance(p,poly[i-1],a)<7))
      ||roadLines.some(line=>line.some((a,i)=>i&&distance(p,line[i-1],a)<8)))continue;
    treePoints.push([p[0],p[1],7+random()*5]);
  }
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.7,1,1,5),new THREE.MeshStandardMaterial({color:0x7c7250}),treePoints.length);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x597c52,roughness:1}),treePoints.length);
  trunks.castShadow=true;crowns.castShadow=true;crowns.receiveShadow=true;
  treePoints.forEach(([x,z,h],i)=>{
    dummy.rotation.set(0,0,0);dummy.position.set(x,h*.3,z);dummy.scale.set(1,h*.6,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x,h*.82,z);dummy.scale.set(h*.42,h*.62,h*.42);dummy.rotation.y=i;dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
    crowns.setColorAt(i,new THREE.Color().setHSL(.24+(i%5)*.007,.23,.29+(i%7)*.025));
  });
  decorations.add(trunks,crowns);

  const buildingBounds=new THREE.Box3();
  buildings.forEach(mesh=>buildingBounds.expandByObject(mesh));
  const center=buildingBounds.isEmpty()?new THREE.Vector3():buildingBounds.getCenter(new THREE.Vector3());center.y=0;
  const span=buildingBounds.isEmpty()?1100:Math.max(buildingBounds.max.x-buildingBounds.min.x,buildingBounds.max.z-buildingBounds.min.z);
  let selected=null;
  let visibleIds=new Set(buildings.keys());
  let disposed=false;
  function applyBuildingVisibility(){
    buildings.forEach((mesh,id)=>{mesh.visible=visibleIds.has(id)&&layers.buildings&&(layers.facilities||categoryOf(features.get(id))!=='facilities');});
    windows.forEach((w,i)=>{dummy.position.set(w.x,w.y,w.z);dummy.rotation.set(0,w.angle,0);dummy.scale.set(buildings.get(w.id).visible?w.length:0,1,1);dummy.updateMatrix();windowMesh.setMatrixAt(i,dummy.matrix);});windowMesh.instanceMatrix.needsUpdate=true;
  }
  function setIncidents(items,selectedId){
    incidentLayer.traverse(object=>{object.geometry?.dispose();if(object.material)object.material.dispose();});incidentLayer.clear();incidentMarkers.clear();
    for(const item of items){const building=buildings.get(item.buildingId);if(!building)continue;const center=building.userData.center;
      const color=item.status==='RESOLVED'?0x597e67:item.status==='VERIFIED'?0xb15166:0xc48b28;
      const group=new THREE.Group();group.position.set(center.x,0,center.z);
      const area=new THREE.Mesh(new THREE.CircleGeometry(45,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:item.id===selectedId?.22:.1,depthWrite:false,side:THREE.DoubleSide}));area.rotation.x=-Math.PI/2;area.position.y=.9;group.add(area);
      const ring=new THREE.Mesh(new THREE.RingGeometry(44,46,48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.8}));ring.rotation.x=-Math.PI/2;ring.position.y=1;group.add(ring);
      const height=heightOf(features.get(item.buildingId)).metres*HEIGHT_SCALE+30;
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,height,6),new THREE.MeshBasicMaterial({color}));pole.position.y=height/2;group.add(pole);
      const marker=new THREE.Mesh(new THREE.OctahedronGeometry(item.id===selectedId?12:9),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.2}));marker.position.y=height;marker.userData.incidentId=item.id;group.add(marker);
      incidentLayer.add(group);incidentMarkers.set(item.id,{group,marker,buildingId:item.buildingId});
    }
  }
  function reset(top=false){
    // Perspective makes foreground footprints occupy more pixels: aim slightly forward
    // so the projected campus, rather than its world bounding-box midpoint, is centred.
    const target=center.clone();if(!top)target.add(new THREE.Vector3(span*.12,0,span*.16));
    controls.target.copy(target);const radius=span*(container.clientWidth<650?1.95:.88);
    camera.position.copy(target).add(top?new THREE.Vector3(0,radius*1.5,1):new THREE.Vector3(radius*.62,radius*.72,radius*.84));controls.update();
  }
  function setSelected(id,focus=false){
    selected=id;
    buildings.forEach((mesh,key)=>{mesh.material[0].color.setHex(key===id?0xf2bf64:mesh.userData.baseColor);mesh.material[1].emissive.setHex(key===id?0x725325:0x000000);mesh.material[1].emissiveIntensity=key===id?.25:0;});
    if(focus&&buildings.has(id)){const target=buildings.get(id).userData.center;const delta=target.clone().sub(controls.target);controls.target.copy(target);camera.position.add(delta);controls.update();}
  }
  const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let down=null;
  const pointerDown=e=>{down=[e.clientX,e.clientY];};
  const pointerUp=e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const markers=layers.incidents?[...incidentMarkers.values()].map(item=>item.marker):[];
    const hit=raycaster.intersectObjects([...markers,...buildings.values()].filter(mesh=>mesh.visible),false)[0];if(hit){if(hit.object.userData.incidentId)onIncidentSelect?.(hit.object.userData.incidentId);else{setSelected(hit.object.userData.featureId);onSelect(hit.object.userData.featureId);}}};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
  const contextLost=e=>{e.preventDefault();renderer.setAnimationLoop(null);onFailure('The 3D graphics context was lost. Reload the map to recover. The directory remains available.');};
  renderer.domElement.addEventListener('webglcontextlost',contextLost);
  const key=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')reset();else if(e.key==='+'||e.key==='-')zoom(e.key==='+'?.8:1.25);else pan(e.key==='ArrowLeft'?-50:e.key==='ArrowRight'?50:0,e.key==='ArrowUp'?-50:e.key==='ArrowDown'?50:0);}};
  renderer.domElement.addEventListener('keydown',key);
  function zoom(factor){const offset=camera.position.clone().sub(controls.target);offset.setLength(Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length()*factor)));camera.position.copy(controls.target).add(offset);controls.update();}
  function pan(x,z){const delta=new THREE.Vector3(x,0,z);camera.position.add(delta);controls.target.add(delta);controls.update();}
  function rotate(angle){const offset=camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),angle);camera.position.copy(controls.target).add(offset);controls.update();}
  function resize(){if(disposed)return;const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(container);resize();reset();
  renderer.setAnimationLoop(()=>{if(disposed||document.hidden)return;controls.update();renderer.render(scene,camera);});
  return {
    reset,zoom,pan,rotate,setSelected,
    setDecorations(visible){decorations.visible=visible;},
    filter(ids){visibleIds=new Set(ids);applyBuildingVisibility();},
    setLayer(layer,visible){if(!(layer in layers))return;layers[layer]=visible;roads.visible=layers.paths;incidentLayer.visible=layers.incidents;applyBuildingVisibility();},
    setIncidents,
    focusIncident(id){const incident=incidentMarkers.get(id);if(!incident)return;setSelected(incident.buildingId,true);const offset=new THREE.Vector3(200,230,260);camera.position.copy(controls.target).add(offset);controls.update();},
    snapshot(){return { buildings:buildings.size, visibleBuildings:[...buildings.values()].filter(mesh=>mesh.visible).length, roads:roads.children.length/2, trees:treePoints.length,
      selected, camera:camera.position.toArray(),target:controls.target.toArray(),triangles:renderer.info.render.triangles, heightScale:HEIGHT_SCALE,incidents:incidentMarkers.size,drawCalls:renderer.info.render.calls,pixelRatio:renderer.getPixelRatio(),shadowSize,layers:{...layers} };},
    screenPoint(id){const mesh=buildings.get(id);if(!mesh)return null;const p=mesh.userData.center.clone();p.y=mesh.geometry.boundingBox?.max.y??heightOf(features.get(id)).metres*HEIGHT_SCALE;p.project(camera);return {x:(p.x+1)*container.clientWidth/2,y:(1-p.y)*container.clientHeight/2};},
    dispose(){disposed=true;observer.disconnect();renderer.setAnimationLoop(null);controls.dispose();renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('keydown',key);renderer.domElement.removeEventListener('webglcontextlost',contextLost);
      const geometries=new Set(),materials=new Set();scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
  };
}
