import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSimulation } from './simulation-model.ts';
import { createLinkedDrillStore } from './linked-drill-store.ts';
import { createMemoryDrillStore,createEvent,newDrill } from '../drills/drill-model.ts';
function fixture(){
 const sim=createDemoSimulation(['way/1']);let seq=0;
 const run=(type,fields={},actor={role:'reviewer'})=>sim.execute({mode:'DEMO',requestId:`r${++seq}`,type,...fields},actor);
 const report=()=>run('report',{incidentId:'demo-1',buildingId:'way/1',category:'Smoke observation'},{role:'reporter'});
 const verify=()=>{report();run('submit',{incidentId:'demo-1'},{role:'reporter'});run('verify',{incidentId:'demo-1'});};
 const prepare=()=>{verify();run('prepare',{incidentId:'demo-1',zoneId:'zone-a'});return sim.snapshot().alerts[0].id;};
 return {sim,run,report,verify,prepare};
}
test('report, submission, explicit reviewer verification and resolution stay separate',()=>{
 const {sim,run,report}=fixture();report();assert.equal(sim.snapshot().incidents[0].status,'PENDING_REVIEW');assert.equal(sim.snapshot().alerts.length,0);
 assert.throws(()=>run('verify',{incidentId:'demo-1'}));
 run('submit',{incidentId:'demo-1'},{role:'reporter'});
 assert.throws(()=>run('verify',{incidentId:'demo-1'},{role:'reporter'}));
 run('verify',{incidentId:'demo-1'});run('resolve',{incidentId:'demo-1'});
 assert.equal(sim.snapshot().incidents[0].status,'RESOLVED');assert.equal(sim.snapshot().incidents[0].timeline.length,4);
 assert.throws(()=>run('prepare',{incidentId:'demo-1',zoneId:'zone-a'}));
});
test('unverified reports, unknown zones and arbitrary recipient fields cannot prepare alerts',()=>{
 const {run,report}=fixture();report();assert.throws(()=>run('prepare',{incidentId:'demo-1',zoneId:'zone-a'}));
 run('submit',{incidentId:'demo-1'},{role:'reporter'});run('verify',{incidentId:'demo-1'});
 assert.throws(()=>run('prepare',{incidentId:'demo-1',zoneId:'outside'}));
 assert.throws(()=>run('prepare',{incidentId:'demo-1',zoneId:'zone-a',recipients:['real-person']}));
});
test('attempt is not confirmation; failure has no receipt and retry has explicit confirmation',()=>{
 const {sim,run,prepare}=fixture();const alertId=prepare();run('attempt',{alertId});
 assert.equal(sim.snapshot().alerts[0].deliveries[0].confirmedAt,undefined);
 assert.throws(()=>run('resolve',{incidentId:'demo-1'}));
 assert.throws(()=>run('acknowledge',{alertId,recipientId:'demo-student-a1'},{role:'recipient',recipientId:'demo-student-a1'}));
 run('complete',{alertId,outcome:'failure'});assert.equal(sim.snapshot().alerts[0].deliveries[0].stage,'failed');
 run('attempt',{alertId});run('complete',{alertId,outcome:'success'});
 const d=sim.snapshot().alerts[0].deliveries[0];assert.equal(d.stage,'confirmed');assert.equal(d.attempts,2);assert.ok(d.confirmedAt);assert.equal(d.acknowledgment,'pending');
});
test('recipient acknowledgment is explicit, identity checked and zone isolated',()=>{
 const {sim,run,prepare}=fixture();const alertId=prepare();run('attempt',{alertId});run('complete',{alertId,outcome:'success'});
 assert.deepEqual(sim.snapshot().alerts[0].deliveries.map(d=>d.recipientId),['demo-student-a1','demo-student-a2']);
 assert.throws(()=>run('acknowledge',{alertId,recipientId:'demo-student-a1'},{role:'recipient',recipientId:'demo-student-a2'}));
 assert.throws(()=>run('acknowledge',{alertId,recipientId:'demo-student-b1'},{role:'recipient',recipientId:'demo-student-b1'}));
 run('acknowledge',{alertId,recipientId:'demo-student-a1'},{role:'recipient',recipientId:'demo-student-a1'});
 assert.equal(sim.snapshot().alerts[0].deliveries[0].acknowledgment,'received');assert.equal(sim.snapshot().alerts[0].deliveries[1].acknowledgment,'pending');
});
test('idempotency prevents duplicate records, rejects changed payload or actor, snapshots are isolated',()=>{
 const {sim}=fixture();const cmd={type:'report',mode:'DEMO',requestId:'once',incidentId:'demo-1',buildingId:'way/1',category:'Smoke observation'};
 sim.execute(cmd,{role:'reporter'});sim.execute({...cmd},{role:'reporter'});assert.equal(sim.snapshot().incidents[0].timeline.length,1);
 assert.throws(()=>sim.execute({...cmd,category:'Medical assistance'},{role:'reporter'}));assert.throws(()=>sim.execute(cmd,{role:'reviewer'}));
 const copy=sim.snapshot();copy.incidents[0].status='RESOLVED';assert.equal(sim.snapshot().incidents[0].status,'PENDING_REVIEW');
});
test('rejects live modes, unknown geometry, external fields and categories',()=>{
 for(const change of [{mode:'LIVE'},{buildingId:'unknown'},{category:'Evacuate'},{endpoint:'https://example.com'},{type:'constructor'}]){
  const {sim}=fixture();assert.throws(()=>sim.execute({type:'report',mode:'DEMO',requestId:'once',incidentId:'demo-1',buildingId:'way/1',category:'Smoke observation',...change},{role:'reporter'}));assert.equal(sim.snapshot().incidents.length,0);
 }
});
test('linked drill waits for confirmed local alert, records once and keeps LOCAL_ONLY',async()=>{
 const {sim,run,prepare}=fixture();const alertId=prepare();const store=createLinkedDrillStore(createMemoryDrillStore(),sim,'demo-1','demo-student-a1');const e=createEvent(newDrill('linked'),'boundary',new Date());
 await assert.rejects(store.append(e));run('attempt',{alertId});run('complete',{alertId,outcome:'success'});
 assert.equal((await store.append(e)).storage,'LOCAL_ONLY');await store.append(e);
 assert.equal(sim.snapshot().incidents[0].timeline.filter(e=>e.summary.includes('Linked local drill')).length,1);
});
test('failed underlying drill store cannot append linked responses',async()=>{
 const {sim,run,prepare}=fixture();const alertId=prepare();run('attempt',{alertId});run('complete',{alertId,outcome:'success'});
 const store=createLinkedDrillStore({append:async()=>{throw Error('unavailable');}},sim,'demo-1','demo-student-a1');
 await assert.rejects(store.append(createEvent(newDrill('failed'),'boundary',new Date())));assert.equal(sim.snapshot().incidents[0].timeline.filter(e=>e.summary.includes('Linked local drill')).length,0);
});
