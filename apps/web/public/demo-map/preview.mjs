let previewScene;
export function getPreviewScene() { return previewScene; }
try {
  const { mountMapViewer } = await import('./generated/maps/map-view.js');
  const { mountDrillSimulator } = await import('./generated/drills/drill-view.js');
  const host = document.getElementById('map');
  const onSceneReady = (scene) => { previewScene = scene; };
  const { createLinkedDrillStore } = await import('./generated/maps/linked-drill-store.js');
  const { createMemoryDrillStore } = await import('./generated/drills/drill-model.js');
  const drillHost=document.getElementById('drill');
  let cleanupDrill=()=>{};
  const onSimulationReset=()=>{cleanupDrill();cleanupDrill=mountDrillSimulator(drillHost);};
  const onStartDrill=(simulation,incidentId,recipientId)=>{
    cleanupDrill();cleanupDrill=mountDrillSimulator(drillHost,createLinkedDrillStore(createMemoryDrillStore(),simulation,incidentId,recipientId),{contextLabel:`${incidentId} / ${recipientId}`});
    drillHost.scrollIntoView({behavior:'smooth'});
  };
  let cleanup = mountMapViewer(host, { onSceneReady,onSimulationReset,onStartDrill });
  document.getElementById('apply-fixture').addEventListener('click', () => {
    const fixture = document.getElementById('fixture').value;
    cleanup();
    previewScene = undefined;
    cleanup = mountMapViewer(host, {
      onSceneReady,onSimulationReset,onStartDrill,
      adapter: { async load(signal) {
        if (fixture === 'invalid') return { source: 'broken' };
        if (fixture === 'permission') throw { code: 'PERMISSION_DENIED' };
        if (fixture === 'offline') throw new Error('Offline fixture');
        const response=await fetch('./campus-data.json',{signal});
        if(!response.ok)throw new Error('Snapshot unavailable');
        const data=await response.json();
        if(fixture==='empty')data.features=[];
        return data;
      } },
    });
  });
} catch {
  document.getElementById('boot-error').textContent = 'Preview could not load. Build with node apps/web/public/demo-map/build.mjs and serve this directory. The pinned Three.js assets must be present. No operational map is available.';
}
