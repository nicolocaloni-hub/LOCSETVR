/**
 * Rear-camera orientation from the W3C intrinsic Z-X'-Y'' device rotation.
 * https://www.w3.org/TR/orientation-event/#deviceorientation
 * Device axes stay in the natural display orientation; screen rotation changes
 * the image's right/up axes, never the rear camera's optical direction (-Z).
 * https://www.w3.org/TR/screen-orientation/#concepts
 */
export type OrientationSample = {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  screenAngle?: number;
};

export type OrientationVector = [number, number, number];

export type CameraPose = {
  /** Clockwise heading, in [0, 360). */
  yaw: number;
  /** Degrees above the gravity horizon; negative values point down. */
  pitch: number;
  /** Clockwise image roll; 0 means the displayed image is upright. */
  roll: number;
  /** Vectors use X=right/east, Y=forward/north, Z=gravity-up. */
  forward: OrientationVector;
  right: OrientationVector;
  up: OrientationVector;
  /** Heading is physically ambiguous when pointing almost straight up/down. */
  headingReliable: boolean;
};

export type OrientationCalibration = {
  heading: number;
  initialPitch: number;
};

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const dot = (a: OrientationVector, b: OrientationVector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: OrientationVector, b: OrientationVector): OrientationVector => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const normalize = (vector: OrientationVector): OrientationVector => {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length) as OrientationVector;
};

export const normalizeHeading = (angle: number) => ((angle % 360) + 360) % 360;

export const shortestAngle = (target: number, current: number) => {
  const difference = (target - current) % 360;
  return difference > 180 ? difference - 360 : difference < -180 ? difference + 360 : difference;
};

export const smoothAngle = (previous: number, next: number, amount = 0.25) =>
  normalizeHeading(previous + shortestAngle(next, previous) * clamp(amount, 0, 1));

function poseFromBasis(forward: OrientationVector, right: OrientationVector, up: OrientationVector): CameraPose {
  const horizontal = Math.hypot(forward[0], forward[1]);
  return {
    yaw: normalizeHeading((horizontal > 1e-7
      ? Math.atan2(forward[0], forward[1])
      : Math.atan2(-right[1], right[0])) * DEG),
    pitch: Math.atan2(forward[2], horizontal) * DEG,
    roll: Math.atan2(-right[2], up[2]) * DEG,
    forward, right, up,
    headingReliable: horizontal > 0.05,
  };
}

export function cameraPose(sample: OrientationSample): CameraPose | null {
  const { alpha, beta, gamma } = sample;
  if (alpha === null || beta === null || gamma === null
    || ![alpha, beta, gamma, sample.screenAngle ?? 0].every(Number.isFinite)) return null;

  const a = alpha * RAD;
  const b = beta * RAD;
  const g = gamma * RAD;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);

  // Columns of Rz(alpha) * Rx(beta) * Ry(gamma).
  const deviceRight: OrientationVector = [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg];
  const deviceUp: OrientationVector = [-sa * cb, ca * cb, sb];
  const forward: OrientationVector = [-ca * sg - sa * sb * cg, -sa * sg + ca * sb * cg, -cb * cg];

  // Undo the display's rotation relative to the natural device frame.
  const screen = (sample.screenAngle ?? 0) * RAD;
  const cs = Math.cos(screen), ss = Math.sin(screen);
  const right = deviceRight.map((value, index) => cs * value - ss * deviceUp[index]) as OrientationVector;
  const up = deviceUp.map((value, index) => cs * value + ss * deviceRight[index]) as OrientationVector;
  return poseFromBasis(forward, right, up);
}

/** Call only for the first accepted frontal photo, using its shutter-time sample. */
export function makeCalibration(sample: OrientationSample): OrientationCalibration | null {
  const pose = cameraPose(sample);
  if (!pose?.headingReliable) return null;
  return { heading: pose.yaw, initialPitch: pose.pitch };
}

/** Calibrate heading only: gravity still identifies the real floor and ceiling. */
export function relativePose(sample: OrientationSample, calibration: OrientationCalibration): CameraPose | null {
  const pose = cameraPose(sample);
  if (!pose || !Number.isFinite(calibration.heading)) return null;
  const c = Math.cos(calibration.heading * RAD), s = Math.sin(calibration.heading * RAD);
  const rotate = ([x, y, z]: OrientationVector): OrientationVector => [c * x - s * y, s * x + c * y, z];
  return poseFromBasis(rotate(pose.forward), rotate(pose.right), rotate(pose.up));
}

/** Smooth for display only. Capture acceptance should always use the raw pose. */
export function smoothPose(previous: CameraPose | null, next: CameraPose, amount = 0.25): CameraPose {
  if (!previous) return next;
  const t = clamp(amount, 0, 1);
  if (t === 0) return previous;
  if (t === 1 || dot(previous.forward, next.forward) < -0.95) return next;
  const mix = (a: OrientationVector, b: OrientationVector) => a.map((value, i) => value * (1 - t) + b[i] * t) as OrientationVector;
  const forward = normalize(mix(previous.forward, next.forward));
  const mixedUp = mix(previous.up, next.up);
  const rightVector = cross(forward, mixedUp);
  if (Math.hypot(...rightVector) < 1e-6) return next;
  const right = normalize(rightVector);
  return poseFromBasis(forward, right, normalize(cross(right, forward)));
}

export type TargetGuidance = {
  yawDelta: number;
  pitchDelta: number;
  angularDistance: number;
  /** Screen coordinates in [-1, 1], positive X=right and positive Y=down. */
  x: number;
  y: number;
  visible: boolean;
  behind: boolean;
};

/** Project a target through the actual camera basis, including display roll. */
export function targetGuidance(
  target: { yaw: number; pitch: number },
  pose: CameraPose,
  fieldOfView: { horizontal?: number; vertical?: number } = {},
): TargetGuidance {
  const yaw = target.yaw * RAD, pitch = target.pitch * RAD;
  const direction: OrientationVector = [Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
  const depth = dot(direction, pose.forward);
  const screenX = dot(direction, pose.right);
  const screenY = -dot(direction, pose.up);
  const yawDelta = shortestAngle(target.yaw, pose.yaw);
  const pitchDelta = target.pitch - pose.pitch;
  const halfWidth = Math.tan(clamp(fieldOfView.horizontal ?? 60, 1, 170) * RAD / 2);
  const halfHeight = Math.tan(clamp(fieldOfView.vertical ?? 75, 1, 170) * RAD / 2);
  let x = screenX / Math.max(depth, 0.05) / halfWidth;
  let y = screenY / Math.max(depth, 0.05) / halfHeight;
  if (depth <= 0 && Math.abs(screenX) < 1e-7 && Math.abs(screenY) < 1e-7) {
    // A target exactly behind must show a turn direction, not a false center dot.
    x = yawDelta < 0 ? -1 : 1;
    y = 0;
  }
  return {
    yawDelta, pitchDelta,
    angularDistance: Math.acos(clamp(depth, -1, 1)) * DEG,
    x: clamp(x, -1, 1), y: clamp(y, -1, 1),
    visible: depth > 0 && Math.abs(x) <= 1 && Math.abs(y) <= 1,
    behind: depth <= 0,
  };
}
