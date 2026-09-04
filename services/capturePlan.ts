import type { CaptureShot, SpaceKind, SurfaceRole } from '../types';

export type SpaceTemplate = {
  kind: SpaceKind;
  title: string;
  subtitle: string;
  description: string;
  photoCount: number;
  radius: number;
  height: number;
  stayStill: boolean;
  plan: CaptureShot[];
};

const roleText: Record<SurfaceRole, { label: string; instruction: string }> = {
  wall: { label: 'Pareti', instruction: 'Mantieni il telefono verticale e ruota sul posto' },
  floor: { label: 'Pavimento', instruction: 'Inclina il telefono verso il basso senza spostarti' },
  ceiling: { label: 'Soffitto', instruction: 'Inclina il telefono verso l’alto senza spostarti' },
  ground: { label: 'Terreno', instruction: 'Inquadra il terreno fino ai tuoi piedi' },
  sky: { label: 'Cielo e contesto alto', instruction: 'Inclina il telefono verso l’alto e copri l’orizzonte' },
};

export const directionLabel = (yaw: number): string => {
  const directions = ['Davanti', 'Davanti a destra', 'Destra', 'Dietro a destra', 'Dietro', 'Dietro a sinistra', 'Sinistra', 'Davanti a sinistra'];
  return directions[Math.round(((yaw % 360 + 360) % 360) / 45) % 8];
};

export const shotLabel = (shot: CaptureShot): string => shot.role === 'wall'
  ? directionLabel(shot.yaw)
  : `${shot.label} · ${directionLabel(shot.yaw).toLowerCase()}`;

const ring = (role: SurfaceRole, count: number, pitch: number, offset = 0): CaptureShot[] =>
  Array.from({ length: count }, (_, index) => {
    const yaw = offset + (index / count) * 360;
    return {
      id: `${role}-${index}`,
      role,
      yaw,
      pitch,
      label: roleText[role].label,
      instruction: role === 'wall' && index === 0
        ? 'Inquadra davanti a te, con il telefono all’altezza degli occhi'
        : `${roleText[role].instruction}. ${directionLabel(yaw)}`,
    };
  });

const createTemplate = (
  kind: SpaceKind,
  title: string,
  subtitle: string,
  description: string,
  radius: number,
  height: number,
  plan: CaptureShot[],
): SpaceTemplate => ({ kind, title, subtitle, description, radius, height, photoCount: plan.length, stayStill: true, plan });

const roomPlan = [
  ...ring('wall', 8, 0),
  ...ring('floor', 4, -58, 45),
  ...ring('ceiling', 4, 58, 45),
];

const hallPlan = [
  ...ring('wall', 12, 0),
  ...ring('floor', 8, -52, 22.5),
  ...ring('ceiling', 8, 52, 22.5),
];

const outdoorPlan = [
  ...ring('wall', 10, 0),
  ...ring('ground', 5, -55, 36),
  ...ring('sky', 5, 48, 36),
];

export const SPACE_TEMPLATES: Record<SpaceKind, SpaceTemplate> = {
  room: createTemplate(
    'room',
    'Stanza',
    'Interno compatto',
    'Camera, ufficio, cucina o ambiente fino a circa 35 m².',
    4.8,
    3,
    roomPlan,
  ),
  hall: createTemplate(
    'hall',
    'Spazio ampio',
    'Interno esteso',
    'Teatro, loft, capannone o ambiente con soffitto alto.',
    8.5,
    5.2,
    hallPlan,
  ),
  outdoor: createTemplate(
    'outdoor',
    'Spazio aperto',
    'Esterno',
    'Strada, cortile, terrazza o paesaggio con cielo visibile.',
    12,
    8,
    outdoorPlan,
  ),
};

export const getSpaceTemplate = (kind: SpaceKind) => SPACE_TEMPLATES[kind];

export const shortestAngle = (target: number, current: number) => {
  let difference = (target - current) % 360;
  if (difference > 180) difference -= 360;
  if (difference < -180) difference += 360;
  return difference;
};
