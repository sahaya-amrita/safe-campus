/** Isolated DEMO adapter. No API endpoint, live recipient, message transport or dispatch. */
export const DEMO_CATEGORIES = ['Smoke observation', 'Medical assistance', 'Access obstruction'] as const;
export const DEMO_ZONES = [
  { id: 'zone-a', label: 'Simulated zone A', recipients: ['demo-student-a1', 'demo-student-a2'] },
  { id: 'zone-b', label: 'Simulated zone B', recipients: ['demo-student-b1'] },
] as const;
export interface DemoActor { role: 'reporter' | 'reviewer' | 'recipient'; recipientId?: string; }
export interface DemoTimelineEvent { id: string; at: string; simulatedSeconds: number; actor: string; summary: string; }
export interface DemoIncident {
  id: string;
  category: string;
  buildingId: string;
  reportedAt: string;
  source: 'LOCAL_SCENARIO';
  mode: 'DEMO';
  reporter: 'Fictional campus reporter';
  /** Exact provisional hazard vocabulary; not a replacement shared contract. */
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'RESOLVED';
  submittedForReview: boolean;
  verifiedAt?: string;
  severity: null;
  timeline: DemoTimelineEvent[];
}
export interface DemoDelivery {
  recipientId: string;
  /** Simulation stages only: never transport receipts or shared deliveryState values. */
  stage: 'prepared' | 'attempted' | 'confirmed' | 'failed';
  acknowledgment: 'pending' | 'received';
  attempts: number;
  confirmedAt?: string;
  acknowledgedAt?: string;
}
export interface DemoAlert {
  id: string;
  incidentId: string;
  zoneId: string;
  mode: 'DEMO';
  storage: 'LOCAL_ONLY';
  content: 'SIMULATION ONLY: a fictional incident has been verified in this digital exercise. No physical action is requested.';
  deliveries: DemoDelivery[];
}
export interface DemoSnapshot { incidents: DemoIncident[]; alerts: DemoAlert[]; storage: 'LOCAL_ONLY'; }
export type DemoCommand = { requestId: string; mode: 'DEMO' } & (
  | { type: 'report'; incidentId: string; buildingId: string; category: string }
  | { type: 'submit' | 'verify' | 'resolve'; incidentId: string }
  | { type: 'prepare'; incidentId: string; zoneId: string }
  | { type: 'attempt'; alertId: string }
  | { type: 'complete'; alertId: string; outcome: 'success' | 'failure' }
  | { type: 'acknowledge'; alertId: string; recipientId: string }
  | { type: 'drill-response'; incidentId: string; eventId: string; phase: string; choiceId: string }
);
export interface DemoSimulationAdapter {
  snapshot(): DemoSnapshot;
  execute(command: DemoCommand, actor: DemoActor): DemoSnapshot;
  subscribe(listener: () => void): () => void;
}
const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const identifier = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9:/_-]{1,140}$/.test(x);
function parseCommand(value: unknown): DemoCommand {
  if (!record(value) || value.mode !== 'DEMO' || !identifier(value.requestId)) throw new Error('Only valid DEMO commands are accepted');
  const fields: Record<string, string[]> = {
    report: ['incidentId','buildingId','category'], submit: ['incidentId'], verify: ['incidentId'], resolve: ['incidentId'],
    prepare: ['incidentId','zoneId'], attempt: ['alertId'], complete: ['alertId','outcome'], acknowledge: ['alertId','recipientId'],
    'drill-response': ['incidentId','eventId','phase','choiceId'],
  };
  const extra = typeof value.type === 'string' && Object.hasOwn(fields,value.type) ? fields[value.type] : undefined;
  if (!extra || Object.keys(value).sort().join() !== ['requestId','mode','type',...extra].sort().join()) throw new Error('Unsupported simulation command or extra fields');
  for (const key of extra) {
    if (key === 'category') { if (!DEMO_CATEGORIES.some(c => c === value[key])) throw new Error('Unsupported demo category'); }
    else if (!identifier(value[key])) throw new Error(`Invalid ${key}`);
  }
  if (value.type === 'complete' && !['success','failure'].includes(String(value.outcome))) throw new Error('Invalid simulated outcome');
  return structuredClone(value) as unknown as DemoCommand;
}
export function incidentStage(incident: DemoIncident): string {
  return incident.status === 'PENDING_REVIEW' ? incident.submittedForReview ? 'Awaiting verification' : 'Reported'
    : incident.status === 'VERIFIED' ? 'Verified in simulation' : 'Resolved in simulation';
}
const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b))));

export function createDemoSimulation(buildingIds: readonly string[], now: () => Date = () => new Date()): DemoSimulationAdapter {
  const buildings = new Set(buildingIds);
  let state: DemoSnapshot = { incidents: [], alerts: [], storage: 'LOCAL_ONLY' };
  const requests = new Map<string,string>();
  const listeners = new Set<() => void>();
  let tick = 0;
  const snapshot = () => structuredClone(state);
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    execute(input, actor) {
      const command = parseCommand(input);
      if (!record(actor) || !['reporter','reviewer','recipient'].includes(String(actor.role))
        || Object.keys(actor).some(key => !['role','recipientId'].includes(key))) throw new Error('Invalid demonstration role');
      const fingerprint = canonical(command) + canonical(actor);
      const previous = requests.get(command.requestId);
      if (previous) { if (previous !== fingerprint) throw new Error('Conflicting retry'); return snapshot(); }
      const next = structuredClone(state);
      const at = now().toISOString();
      const reviewer = () => { if (actor.role !== 'reviewer') throw new Error('Select the demonstration reviewer role for this action'); };
      const event = (incident: DemoIncident, summary: string) => incident.timeline.push({
        id: command.requestId, at, simulatedSeconds: tick * 15, actor: `Demo ${actor.role}`, summary,
      });
      let incident = 'incidentId' in command ? next.incidents.find(i => i.id === command.incidentId) : undefined;
      let alert = 'alertId' in command ? next.alerts.find(a => a.id === command.alertId) : undefined;
      if (alert) incident = next.incidents.find(i => i.id === alert!.incidentId);
      if (command.type === 'report') {
        if (actor.role !== 'reporter') throw new Error('Reports require the demonstration reporter role');
        if (incident || !buildings.has(command.buildingId) || next.incidents.length >= 100) throw new Error('Duplicate incident, unknown building or simulation limit reached');
        incident = { id: command.incidentId, category: command.category, buildingId: command.buildingId, reportedAt: at,
          source: 'LOCAL_SCENARIO', mode: 'DEMO', reporter: 'Fictional campus reporter', status: 'PENDING_REVIEW',
          submittedForReview: false, severity: null, timeline: [] };
        next.incidents.push(incident);event(incident,'Simulated report created locally; not verified or sent.');
      } else {
        if (!incident) throw new Error('Unknown simulation incident');
        switch (command.type) {
          case 'submit':
            if (actor.role !== 'reporter' || incident.status !== 'PENDING_REVIEW' || incident.submittedForReview) throw new Error('Cannot submit this report for review');
            incident.submittedForReview = true;event(incident,'Awaiting demonstration reviewer verification.');break;
          case 'verify':
            reviewer();if (incident.status !== 'PENDING_REVIEW' || !incident.submittedForReview) throw new Error('The report must be awaiting verification');
            incident.status = 'VERIFIED';incident.verifiedAt = at;event(incident,'Explicit demonstration review completed. This is not real incident verification.');break;
          case 'resolve':
            reviewer();if (incident.status !== 'VERIFIED') throw new Error('Only verified demo incidents can be resolved');
            if (next.alerts.some(a=>a.incidentId===incident!.id&&a.deliveries.some(d=>d.stage==='attempted'))) throw new Error('Complete pending simulated delivery attempts before resolution');
            incident.status='RESOLVED';event(incident,'Simulated incident resolved. No real operational action occurred.');break;
          case 'prepare': {
            reviewer();if (incident.status !== 'VERIFIED') throw new Error('Verify the demo incident before preparing an alert');
            const zone=DEMO_ZONES.find(z=>z.id===command.zoneId);if(!zone)throw new Error('Explicitly select a known simulated zone');
            if(next.alerts.some(a=>a.incidentId===incident!.id&&a.zoneId===zone.id))throw new Error('An alert already exists for this incident and zone');
            next.alerts.push({id:`alert-${command.requestId}`,incidentId:incident.id,zoneId:zone.id,mode:'DEMO',storage:'LOCAL_ONLY',
              content:'SIMULATION ONLY: a fictional incident has been verified in this digital exercise. No physical action is requested.',
              deliveries:zone.recipients.map(recipientId=>({recipientId,stage:'prepared',acknowledgment:'pending',attempts:0}))});
            event(incident,`Test alert prepared for ${zone.label}; no delivery attempted.`);break;
          }
          case 'attempt':
            reviewer();if(!alert||incident.status!=='VERIFIED')throw new Error('No active verified demo alert');
            if(alert.deliveries.some(d=>d.stage==='attempted'))throw new Error('An attempt is already pending');
            if(!alert.deliveries.some(d=>d.stage==='prepared'||d.stage==='failed'))throw new Error('No pending or failed recipients');
            for(const delivery of alert.deliveries)if(delivery.stage==='prepared'||delivery.stage==='failed'){delivery.stage='attempted';delivery.attempts++;}
            event(incident,'Delivery attempted in the local simulator; confirmation is pending.');break;
          case 'complete':
            reviewer();if(!alert||incident.status!=='VERIFIED'||!alert.deliveries.some(d=>d.stage==='attempted'))throw new Error('No simulated attempt to complete');
            for(const delivery of alert.deliveries)if(delivery.stage==='attempted'){
              delivery.stage=command.outcome==='success'?'confirmed':'failed';if(command.outcome==='success')delivery.confirmedAt=at;
            }
            event(incident,command.outcome==='success'?'Simulated delivery confirmed to the selected fictional inboxes only.':'Simulated delivery failed; inboxes did not receive the test alert.');break;
          case 'acknowledge': {
            if(!alert||actor.role!=='recipient'||actor.recipientId!==command.recipientId)throw new Error('Only that fictional recipient can acknowledge');
            const delivery=alert.deliveries.find(d=>d.recipientId===command.recipientId);
            if(!delivery||delivery.stage!=='confirmed'||delivery.acknowledgment==='received')throw new Error('A confirmed, unacknowledged simulated delivery is required');
            delivery.acknowledgment='received';delivery.acknowledgedAt=at;event(incident,`Simulated acknowledgment from ${delivery.recipientId}.`);break;
          }
          case 'drill-response':
            if(actor.role!=='recipient'||!actor.recipientId)throw new Error('A fictional recipient response is required');
            if(!next.alerts.some(a=>a.incidentId===incident!.id&&a.deliveries.some(d=>d.recipientId===actor.recipientId&&d.stage==='confirmed')))throw new Error('The fictional recipient has no confirmed demo alert');
            if(!['Prepare','Respond','Reflect','Improve'].includes(command.phase))throw new Error('Invalid drill phase');
            event(incident,`Linked local drill ${command.eventId}: ${command.phase} response ${command.choiceId}. Not sent.`);break;
        }
      }
      state=next;requests.set(command.requestId,fingerprint);tick++;
      listeners.forEach(listener=>listener());
      return snapshot();
    },
  };
}
