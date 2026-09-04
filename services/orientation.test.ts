import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraPose, makeCalibration, relativePose, shortestAngle, smoothAngle, smoothPose, targetGuidance } from './orientation.ts';
import type { CameraPose, OrientationSample, OrientationVector } from './orientation.ts';

const near = (actual: number, expected: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `Expected ${expected}, received ${actual}`);
const pose = (sample: OrientationSample) => {
  const value = cameraPose(sample);
  assert.ok(value);
  return value;
};
const dot = (a: OrientationVector, b: OrientationVector) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const checkBasis = (value: CameraPose) => {
  for (const vector of [value.forward, value.right, value.up]) near(Math.hypot(...vector), 1);
  near(dot(value.forward, value.up), 0);
  near(dot(value.forward, value.right), 0);
  near(dot(value.right, value.up), 0);
};

test('first accepted frontal heading becomes zero; gravity pitch is not reset', () => {
  const first = { alpha: 127, beta: 80, gamma: 0 };
  const calibration = makeCalibration(first)!;
  near(relativePose(first, calibration)!.yaw, 0);
  near(relativePose(first, calibration)!.pitch, -10);
  near(calibration.initialPitch, -10);
  near(relativePose({ ...first, beta: 32 }, calibration)!.pitch, -58);
});

test('portrait front, right, rear and left remain correct around the first photo', () => {
  const calibration = makeCalibration({ alpha: 27, beta: 90, gamma: 0 })!;
  for (const [alpha, expected] of [[27, 0], [297, 90], [207, 180], [117, 270]]) {
    const value = relativePose({ alpha, beta: 90, gamma: 0 }, calibration)!;
    near(value.yaw, expected);
    near(value.pitch, 0);
    checkBasis(value);
  }
});

test('rear camera points down with screen facing sky and up with screen facing ground', () => {
  near(pose({ alpha: 0, beta: 0, gamma: 0 }).pitch, -90);
  near(pose({ alpha: 0, beta: -180, gamma: 0 }).pitch, 90);
  near(pose({ alpha: 0, beta: 32, gamma: 0 }).pitch, -58);
  near(pose({ alpha: 0, beta: 148, gamma: 0 }).pitch, 58);
  assert.equal(makeCalibration({ alpha: 0, beta: 0, gamma: 0 }), null);
});

test('landscape left and right yield the same optical direction and upright screen as portrait', () => {
  // W3C: vertical phone with its natural top to the right has alpha=270-heading,
  // beta=0, gamma=90. A counterclockwise display orientation is 270 in that pose.
  const samples = [
    { alpha: 0, beta: 90, gamma: 0, screenAngle: 0 },
    { alpha: 90, beta: 0, gamma: -90, screenAngle: 90 },
    { alpha: 270, beta: 0, gamma: 90, screenAngle: 270 },
  ];
  for (const sample of samples) {
    const value = pose(sample);
    near(value.yaw, 0);
    near(value.pitch, 0);
    near(value.roll, 0);
    near(value.right[0], 1);
    near(value.up[2], 1);
    checkBasis(value);
    assert.ok(targetGuidance({ yaw: 15, pitch: 0 }, value).x > 0);
    assert.ok(targetGuidance({ yaw: 0, pitch: 15 }, value).y < 0);
  }
});

test('landscape floor is down, including gamma instead of beta tilt', () => {
  const value = pose({ alpha: 90, beta: 0, gamma: -32, screenAngle: 90 });
  near(value.yaw, 0);
  near(value.pitch, -58);
  near(value.roll, 0);
  const onTarget = targetGuidance({ yaw: 0, pitch: -58 }, value);
  near(onTarget.angularDistance, 0);
  near(onTarget.x, 0);
  near(onTarget.y, 0);
});

test('alpha alone does not identify heading at upright Euler singularity', () => {
  const a = pose({ alpha: 0, beta: 90, gamma: 30 });
  const b = pose({ alpha: 30, beta: 90, gamma: 0 });
  near(a.yaw, 330);
  near(a.yaw, b.yaw);
  near(a.pitch, b.pitch);
});

test('screen rotation affects projected direction, never optical yaw or pitch', () => {
  const sample = { alpha: 14, beta: 67, gamma: 21 };
  const upright = pose(sample);
  const rotated = pose({ ...sample, screenAngle: 90 });
  near(upright.yaw, rotated.yaw);
  near(upright.pitch, rotated.pitch);
  checkBasis(rotated);
  const target = { yaw: upright.yaw + 10, pitch: upright.pitch };
  const a = targetGuidance(target, upright, { horizontal: 60, vertical: 60 });
  const b = targetGuidance(target, rotated, { horizontal: 60, vertical: 60 });
  near(b.x, a.y);
  near(b.y, -a.x);
});

test('heading wrap takes the short path across 0/360 and -180/180', () => {
  near(shortestAngle(1, 359), 2);
  near(shortestAngle(359, 1), -2);
  near(shortestAngle(-179, 179), 2);
  near(shortestAngle(179, -179), -2);
  near(smoothAngle(359, 1, 0.5), 0);
  const smoothed = smoothPose(pose({ alpha: 1, beta: 90, gamma: 0 }), pose({ alpha: 359, beta: 90, gamma: 0 }), 0.5);
  near(smoothed.yaw, 0);
  checkBasis(smoothed);
});

test('target behind is offscreen and cannot be mistaken for an aligned center', () => {
  const guidance = targetGuidance({ yaw: 180, pitch: 0 }, pose({ alpha: 0, beta: 90, gamma: 0 }));
  near(guidance.angularDistance, 180);
  assert.equal(guidance.behind, true);
  assert.equal(guidance.visible, false);
  assert.equal(Math.abs(guidance.x), 1);
});

test('missing and invalid sensor fields never become a fabricated valid pose', () => {
  assert.equal(cameraPose({ alpha: null, beta: 90, gamma: 0 }), null);
  assert.equal(cameraPose({ alpha: 0, beta: null, gamma: 0 }), null);
  assert.equal(cameraPose({ alpha: 0, beta: 90, gamma: null }), null);
  assert.equal(cameraPose({ alpha: NaN, beta: 90, gamma: 0 }), null);
  assert.equal(cameraPose({ alpha: 0, beta: 90, gamma: 0, screenAngle: Infinity }), null);
});
