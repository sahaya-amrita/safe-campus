import type { DrillStore } from '../drills/drill-model.ts';
import type { DemoSimulationAdapter } from './simulation-model.ts';

/** Compose the existing store with local demo history; no backend or delivery claim. */
export function createLinkedDrillStore(store: DrillStore, simulation: DemoSimulationAdapter,
  incidentId: string, recipientId: string): DrillStore {
  return { async append(event) {
    const receipt = await store.append(event);
    if(receipt.storage!=='LOCAL_ONLY'||receipt.eventId!==event.id)throw new Error('Invalid local drill receipt');
    simulation.execute({ requestId:`drill-${event.id}`,mode:'DEMO',type:'drill-response',incidentId,
      eventId:event.id,phase:event.phase,choiceId:event.choiceId },{role:'recipient',recipientId});
    return receipt;
  } };
}
