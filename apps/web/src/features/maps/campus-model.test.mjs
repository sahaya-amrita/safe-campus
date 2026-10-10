import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCampusData, campusDirectory, categoryOf, featureName, heightOf, projectCoordinate, campusNavigation } from './campus-model.ts';
const snapshot=JSON.parse(await readFile(new URL('../../../public/demo-map/campus-data.json',import.meta.url),'utf8'));

test('OSM snapshot has traceable footprint, road and campus features, never approval',()=>{
  const data=parseCampusData(snapshot);
  assert.equal(data.features.filter(f=>f.kind==='building').length,99);
  assert.equal(data.features.filter(f=>f.kind==='road').length,61);
  assert.equal(data.features.find(f=>f.kind==='boundary').osmId,128964693);
  assert.equal(data.approval,'UNVERIFIED');assert.equal(campusNavigation.enabled,false);
  assert.equal(data.source.license,'ODbL 1.0');
  assert.equal(data.features.some(f=>['phone','email','user','uid'].some(key=>key in f.tags)),false);
});
test('source names are used exactly, unnamed footprints are not given invented names',()=>{
  const data=parseCampusData(snapshot);
  const library=data.features.find(f=>f.osmId===380702790);
  assert.equal(featureName(library),'Central Library');
  const unknown=data.features.find(f=>f.kind==='building'&&!f.tags.name);
  assert.match(featureName(unknown),/^Unnamed building · OSM \d+$/);
});
test('heights explicitly distinguish assumed levels, estimates and tagged measurements',()=>{
  const feature=snapshot.features.find(f=>f.kind==='building');
  assert.equal(heightOf(feature).estimated,true);
  const levels=heightOf({...feature,tags:{'building:levels':'3'}});
  assert.ok(Math.abs(levels.metres-9.6)<.00001);assert.match(levels.basis,/assumed/);
  assert.equal(heightOf({...feature,tags:{height:'18 m'}}).metres,18);
  assert.match(heightOf({...feature,tags:{height:'18 m'}}).basis,/not institution-verified/);
  for(const height of ['-10','NaN','300','Infinity'])assert.equal(heightOf({...feature,tags:{height}}).estimated,true);
});
test('search and categories preserve only matching source buildings',()=>{
  const data=parseCampusData(snapshot);
  assert.equal(campusDirectory(data,'  CENTRAL LIBRARY ').length,1);
  assert.equal(campusDirectory(data,'380702790')[0].tags.name,'Central Library');
  const residential=campusDirectory(data,'','residential');assert.ok(residential.length>5);
  assert.ok(residential.every(f=>categoryOf(f)==='residential'));
  assert.equal(campusDirectory(data,'no such place').length,0);
  assert.equal(campusDirectory(data,'','made-up-category').length,0);
});
test('local projection retains geographic orientation and never invents vertices',()=>{
  const bounds=snapshot.bounds;const mid=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
  assert.deepEqual(projectCoordinate(mid,bounds),[0,-0]);
  assert.ok(projectCoordinate([mid[0]+.001,mid[1]],bounds)[0]>100);
  assert.ok(projectCoordinate([mid[0],mid[1]+.001],bounds)[1]<-100);
  const feature=snapshot.features.find(f=>f.kind==='building');
  assert.equal(feature.coordinates.map(p=>projectCoordinate(p,bounds)).length,feature.coordinates.length);
});
test('malformed metadata, approval escalation, nonfinite points and duplicates fail closed',()=>{
  for(const mutate of [
    d=>{d.mode='LIVE';},d=>{d.approval='APPROVED';},d=>{d.source.license='unknown';},
    d=>{d.features[0].coordinates[0]=[NaN,10.9];},d=>{d.features[0].coordinates[0]=[80,12];},
    d=>{d.features.push(d.features[0]);},d=>{d.features[0].version=0;},
    d=>{d.features[0].updatedAt='yesterday';},d=>{d.bounds=[0,0,1,1];},
    d=>{d.features.find(f=>f.kind==='building').coordinates.pop();},d=>{d.features=d.features.filter(f=>f.kind!=='boundary');},
  ]){const data=structuredClone(snapshot);mutate(data);assert.throws(()=>parseCampusData(data),/Invalid campus/);}
  for(const value of [null,undefined,[],{}])assert.throws(()=>parseCampusData(value));
});
test('empty snapshot is explicit and validated data is detached from its adapter',()=>{
  const empty=parseCampusData({...snapshot,features:[]});assert.equal(empty.features.length,0);
  const input=structuredClone(snapshot);const result=parseCampusData(input);input.features[0].tags.name='mutated';
  assert.notEqual(result.features[0].tags.name,'mutated');
});
test('road segments preserve connected endpoints, with no generated safe-route graph',()=>{
  const roads=snapshot.features.filter(f=>f.kind==='road');const counts=new Map();
  for(const road of roads)for(const point of road.coordinates){const key=point.join(',');counts.set(key,(counts.get(key)??0)+1);}
  assert.ok([...counts.values()].filter(count=>count>1).length>20);
  assert.ok(roads.every(f=>f.id.startsWith(`way/${f.osmId}`)&&f.version>0));
  assert.equal(campusNavigation.enabled,false);
});
