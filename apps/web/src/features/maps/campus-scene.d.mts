import type { CampusData } from './campus-model.ts';
export interface CampusScene {
  reset(top?: boolean): void;
  zoom(factor: number): void;
  pan(x: number, z: number): void;
  rotate(angle: number): void;
  setSelected(id: string | null, focus?: boolean): void;
  setDecorations(visible: boolean): void;
  filter(ids: string[]): void;
  setLayer(layer: 'buildings' | 'paths' | 'facilities' | 'incidents', visible: boolean): void;
  setIncidents(items: {id: string; buildingId: string; category: string; status: string}[], selected: string | null): void;
  focusIncident(id: string): void;
  snapshot(): { buildings: number; visibleBuildings: number; roads: number; trees: number; selected: string | null; camera: number[]; target: number[]; triangles: number; heightScale: number; incidents: number; drawCalls: number; pixelRatio: number; shadowSize: number; layers: Record<string,boolean> };
  screenPoint(id: string): { x: number; y: number } | null;
  dispose(): void;
}
export function createCampusScene(container: HTMLElement, data: CampusData, onSelect: (id: string) => void, onFailure: (message: string) => void, onIncidentSelect?: (id: string) => void): CampusScene;
