
export type CloneStatus = 'draft' | 'uploading' | 'processing' | 'ready' | 'error';

export interface SceneObject {
  id: string;
  type: 'gltf' | 'primitive';
  url: string; // URL dell'asset glTF
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface MaskVolume {
  id: string;
  shape: 'box' | 'sphere';
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
  enabled: boolean;
}

export interface SceneEdits {
  objects: SceneObject[];
  masks: MaskVolume[];
}

export interface DigitalCloneRecord {
  id: string;
  name: string;
  date: string;
  status: CloneStatus;
  images: Blob[]; 
  thumbnail: string;
  worldId?: string; 
  operationId?: string; // ID per polling su Vercel/WorldLabs
  spzBlob?: Blob;   
  colliderMeshBlob?: Blob; // Per teleport e staging
  edits?: SceneEdits;
  error?: string;
}

export interface ScanStatus {
  step: 'idle' | 'capturing' | 'processing' | 'saving' | 'complete' | 'error';
  progress: number;
  message: string;
}

export interface PanoramaNode {
  id: string;
  name: string;
  imageBlob: Blob;
  yawOffset: number;
  hotspots: any[];
}

export interface TourRecord {
  id: string;
  name: string;
  date: string;
  thumbnail: string;
  nodes: PanoramaNode[];
  startNodeId: string;
}

export interface VideoScanRecord {
  id: string;
  name: string;
  date: string;
  type: 'video';
  thumbnail: string;
}

export type ModelRecord = DigitalCloneRecord | VideoScanRecord | TourRecord;
