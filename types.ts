export type CaptureQuality = {
  brightness: number;
  sharpness: number;
  accepted: boolean;
  message: string;
};

export type SpaceKind = 'room' | 'hall' | 'outdoor';

export type SurfaceRole = 'wall' | 'floor' | 'ceiling' | 'ground' | 'sky';

export type CaptureShot = {
  id: string;
  role: SurfaceRole;
  yaw: number;
  pitch: number;
  label: string;
  instruction: string;
};

export type CapturedFrame = {
  blob: Blob;
  shot: CaptureShot;
  quality: CaptureQuality;
};

export type SpatialPanel = {
  imageIndex: number;
  yaw: number;
  pitch: number;
  role: SurfaceRole;
  brightness: number;
  sharpness: number;
};

export type SpatialReconstruction = {
  version: 1;
  roomRadius: number;
  roomHeight: number;
  floorColor: string;
  ceilingColor: string;
  panels: SpatialPanel[];
  spaceKind: SpaceKind;
  fidelity: 'local-spatial-preview';
};

export type PropKind = 'camera' | 'light' | 'talent' | 'dolly' | 'marker';

export type SceneProp = {
  id: string;
  kind: PropKind;
  label: string;
  position: [number, number, number];
  rotationY: number;
  color: string;
};

export type MaskVolume = {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
};

export type SceneEdits = {
  objects: SceneProp[];
  masks: MaskVolume[];
};

export type DigitalCloneRecord = {
  id: string;
  name: string;
  date: string;
  updatedAt: string;
  status: 'ready';
  images: Blob[];
  thumbnail: string;
  spaceKind: SpaceKind;
  reconstruction: SpatialReconstruction;
  edits: SceneEdits;
  isDemo?: boolean;
};

export type ModelRecord = DigitalCloneRecord;

export type ReconstructionProgress = {
  progress: number;
  message: string;
};

export type PortableClone = Omit<DigitalCloneRecord, 'images'> & {
  format: 'locsetvr-project';
  images: string[];
};
