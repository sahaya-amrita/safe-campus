import { DEMO_CATEGORIES, DEMO_ZONES, incidentStage } from './simulation-model.ts';
import type { DemoActor, DemoCommand, DemoSimulationAdapter } from './simulation-model.ts';
import { featureName } from './campus-model.ts';
import type { CampusData } from './campus-model.ts';

export interface SimulationView {
  chooseBuilding(id: string): void;
  chooseIncident(id: string): void;
  dispose(): void;
}
export function mountSimulationView(host: HTMLElement, data: CampusData, adapter: DemoSimulationAdapter,
  onSelect: (id: string | null, focus: boolean) => void,
  onStartDrill?: (incidentId: string, recipientId: string) => void, onFilter?: (value: string) => void): SimulationView {
  const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const button=(label:string,action:()=>void)=>{const node=el('button',label);node.type='button';node.addEventListener('click',action);return node;};
  const select=(label:string,values:readonly (readonly [string,string])[])=>{const wrap=el('label',label);const node=el('select');node.setAttribute('aria-label',label);for(const [value,text] of values){const option=el('option',text);option.value=value;node.append(option);}wrap.append(node);return {wrap,node};};
  const section=el('section');section.className='sc-simulation';section.setAttribute('aria-label','Incident and alert simulation');host.append(section);
  section.append(el('h2','Incident exercise'),el('p','SIMULATION ONLY · LOCAL_ONLY / Not sent · Fictional roles and recipients. No real notifications, SMS, dispatch or physical drill. Reloading campus or leaving this page clears local exercise records.'));
  const settings=el('div');settings.className='sc-sim-settings';
  const role=select('Demonstration role',[['reporter','Reporter'],['reviewer','Reviewer'],['recipient','Recipient']]);
  const recipient=select('Fictional recipient',DEMO_ZONES.flatMap(z=>z.recipients.map(id=>[id,id] as const)));
  settings.append(role.wrap,recipient.wrap);section.append(settings);
  section.append(el('p','Role switching demonstrates permissions; it is not institutional authentication. Severity is unavailable because the provisional contract defines no classification.'));
  const error=el('p');error.setAttribute('role','alert');section.append(error);
  const body=el('div');body.className='sc-sim-body';
  const report=el('div');report.className='sc-sim-report';report.append(el('h3','1 · Report a fictional observation'));
  const location=select('Incident building',[['','Select a mapped building'],...data.features.filter(f=>f.kind==='building').map(f=>[f.id,featureName(f)] as const)]);
  const category=select('Simulation category',DEMO_CATEGORIES.map(c=>[c,c] as const));
  const actor=():DemoActor=>role.node.value==='recipient'?{role:'recipient',recipientId:recipient.node.value}:{role:role.node.value as 'reporter'|'reviewer'};
  let selected:string|null=null;
  function execute(command:DemoCommand){try{error.textContent='';adapter.execute(command,actor());}catch(reason:unknown){error.textContent=reason instanceof Error?reason.message:'Local simulation action failed';}}
  const request=()=>({requestId:crypto.randomUUID(),mode:'DEMO' as const});
  const create=button('Create simulated report',()=>{
    if(!location.node.value){error.textContent='Select a mapped building first.';return;}
    const id=`demo-${crypto.randomUUID()}`;
    execute({...request(),type:'report',incidentId:id,buildingId:location.node.value,category:category.node.value});
    if(adapter.snapshot().incidents.some(i=>i.id===id)){selected=id;onSelect(id,true);render();}
  });
  report.append(location.wrap,category.wrap,create);
  const incidentType=select('Filter incident category',[['all','All incident categories'],...DEMO_CATEGORIES.map(c=>[c,c] as const)]);
  const incidentList=el('div');incidentList.className='sc-sim-incident-list';incidentList.setAttribute('aria-label','Simulated incident list');
  report.append(incidentType.wrap,incidentList);
  const panel=el('div');panel.className='sc-sim-detail';body.append(report,panel);section.append(body);
  const zone=select('Simulated recipient zone',[['','Choose a simulated zone'],...DEMO_ZONES.map(z=>[z.id,`${z.label} · ${z.recipients.length} fictional recipients`] as const)]);
  const outcome=select('Simulated delivery outcome',[['success','Confirm in fictional inboxes'],['failure','Fail without receipt']]);
  const inbox=el('div');inbox.className='sc-sim-inbox';inbox.setAttribute('aria-label','Fictional recipient inbox');section.append(inbox);
  role.node.addEventListener('change',render);recipient.node.addEventListener('change',render);incidentType.node.addEventListener('change',()=>{onFilter?.(incidentType.node.value);render();});
  function render(){
    const state=adapter.snapshot();create.disabled=role.node.value!=='reporter';
    incidentList.replaceChildren();const visible=state.incidents.filter(i=>incidentType.node.value==='all'||i.category===incidentType.node.value);
    if(!visible.length)incidentList.append(el('p','No matching simulated incidents.'));
    for(const incident of visible){const node=button(`SIM · ${incident.category} · ${incidentStage(incident)}`,()=>{selected=incident.id;onSelect(selected,true);render();});node.setAttribute('aria-pressed',String(selected===incident.id));incidentList.append(node);}
    panel.replaceChildren();const incident=state.incidents.find(i=>i.id===selected);
    if(!incident){panel.append(el('h3','Select or create a simulated incident'),el('p','Reports are not automatically verified. No alert is generated merely by creating a report.'));}
    else {
      panel.append(el('h3',`${incident.category} · ${incidentStage(incident)}`),el('p',`SIMULATED · ${incident.id}`),
        el('p',`Location: ${featureName(data.features.find(f=>f.id===incident.buildingId)!)} · Reported ${new Date(incident.reportedAt).toLocaleString()}`),
        el('p',`Source: ${incident.source} / ${incident.reporter} · Contract status: ${incident.status} · Severity: not classified`));
      panel.append(el('p',`Verification: ${incident.verifiedAt?'explicit demo review recorded':'not verified'} · Lifecycle: ${incident.status==='RESOLVED'?'resolved':'open'} · Boundary: illustrative 45 m radius, not a validated hazard extent.`));
      panel.append(button('Focus incident on map',()=>onSelect(incident.id,true)));
      const action=(label:string,command:DemoCommand,enabled:boolean)=>{const node=button(label,()=>execute(command));node.disabled=!enabled;panel.append(node);};
      action('Submit for demonstration review',{...request(),type:'submit',incidentId:incident.id},role.node.value==='reporter'&&incident.status==='PENDING_REVIEW'&&!incident.submittedForReview);
      action('Verify in demonstration',{...request(),type:'verify',incidentId:incident.id},role.node.value==='reviewer'&&incident.status==='PENDING_REVIEW'&&incident.submittedForReview);
      panel.append(el('h4','2 · Prepare a zone-specific test alert'),zone.wrap);
      const prepare=button('Prepare test alert',()=>execute({...request(),type:'prepare',incidentId:incident.id,zoneId:zone.node.value}));
      prepare.disabled=role.node.value!=='reviewer'||incident.status!=='VERIFIED';panel.append(prepare,outcome.wrap);
      for(const alert of state.alerts.filter(a=>a.incidentId===incident.id)){
        panel.append(el('h4',`3 · Test alert · ${DEMO_ZONES.find(z=>z.id===alert.zoneId)!.label}`),el('p','Local simulation receipts only. No external notification was sent.'));
        const table=el('table');const caption=el('caption','Simulated delivery and acknowledgment');table.append(caption);
        const header=el('tr');for(const text of ['Fictional recipient','Delivery','Acknowledgment'])header.append(el('th',text));table.append(header);
        for(const delivery of alert.deliveries){const row=el('tr');row.append(el('td',delivery.recipientId),el('td',`Simulated ${delivery.stage} · attempt ${delivery.attempts}`),el('td',delivery.acknowledgment));table.append(row);}panel.append(table);
        action('Attempt simulated delivery',{...request(),type:'attempt',alertId:alert.id},role.node.value==='reviewer'&&incident.status==='VERIFIED'&&alert.deliveries.some(d=>d.stage==='prepared'||d.stage==='failed')&&!alert.deliveries.some(d=>d.stage==='attempted'));
        const complete=button('Complete simulated delivery',()=>execute({...request(),type:'complete',alertId:alert.id,outcome:outcome.node.value as 'success'|'failure'}));
        complete.disabled=role.node.value!=='reviewer'||!alert.deliveries.some(d=>d.stage==='attempted');panel.append(complete);
      }
      action('Resolve simulated incident',{...request(),type:'resolve',incidentId:incident.id},role.node.value==='reviewer'&&incident.status==='VERIFIED');
      const timeline=el('details');timeline.open=!matchMedia('(max-width:760px)').matches;timeline.append(el('summary','Incident timeline · local records'));
      const list=el('ol');for(const event of incident.timeline)list.append(el('li',`Sim +${event.simulatedSeconds}s · ${new Date(event.at).toLocaleTimeString()} · ${event.actor}: ${event.summary}`));timeline.append(list,el('p','Simulated seconds advance by scripted steps, not measured emergency response time.'));panel.append(timeline);
    }
    inbox.replaceChildren();inbox.append(el('h3',`Fictional inbox · ${recipient.node.value}`),el('p','Messages appear only after simulated delivery confirmation. Acknowledgment is a separate explicit action.'));
    const received=state.alerts.filter(a=>a.deliveries.some(d=>d.recipientId===recipient.node.value&&d.stage==='confirmed'));
    if(!received.length)inbox.append(el('p','No confirmed simulated messages for this recipient.'));
    for(const alert of received){const delivery=alert.deliveries.find(d=>d.recipientId===recipient.node.value)!;const entry=el('article');entry.append(el('h4',`SIMULATED ALERT · ${alert.incidentId}`),el('p',alert.content),el('p',`Simulated delivery confirmed · Acknowledgment ${delivery.acknowledgment} · LOCAL_ONLY / Not sent`));
      const acknowledge=button('Acknowledge simulated alert',()=>execute({...request(),type:'acknowledge',alertId:alert.id,recipientId:recipient.node.value}));acknowledge.disabled=role.node.value!=='recipient'||delivery.acknowledgment==='received';entry.append(acknowledge);
      if(onStartDrill){const start=button('Practice with this alert',()=>onStartDrill(alert.incidentId,recipient.node.value));start.disabled=role.node.value!=='recipient';entry.append(start);}inbox.append(entry);
    }
  }
  const unsubscribe=adapter.subscribe(()=>{onSelect(selected,false);render();});render();
  return { chooseBuilding(id){location.node.value=id;},chooseIncident(id){selected=id;onSelect(id,true);render();},dispose(){unsubscribe();section.remove();} };
}
