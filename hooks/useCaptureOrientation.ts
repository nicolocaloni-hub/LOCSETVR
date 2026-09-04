import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { cameraPose, makeCalibration, relativePose, smoothPose } from '../services/orientation';
import type { CameraPose, OrientationCalibration, OrientationSample } from '../services/orientation';

type SensorPermission = 'waiting' | 'enabled' | 'denied';
type TimedSample = { sample: OrientationSample; time: number };
type PermissionConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

export type CaptureOrientation = {
  pose: CameraPose | null;
  rawRef: MutableRefObject<TimedSample | null>;
  calibrationRef: MutableRefObject<OrientationCalibration | null>;
  fresh: boolean;
  permission: SensorPermission;
  calibrated: boolean;
  requestAndReset: () => void;
  calibrate: (sample: OrientationSample) => CameraPose | null;
  reset: () => void;
};

const STALE_AFTER_MS = 1800;
const DISPLAY_INTERVAL_MS = 40;

function screenAngle() {
  const current = window.screen.orientation?.angle;
  if (Number.isFinite(current)) return current;
  const legacy = (window as Window & { orientation?: number }).orientation;
  return typeof legacy === 'number' && Number.isFinite(legacy) ? legacy : 0;
}

export function useCaptureOrientation(active: boolean): CaptureOrientation {
  const [pose, setPose] = useState<CameraPose | null>(null);
  const [fresh, setFresh] = useState(false);
  const [permission, setPermission] = useState<SensorPermission>('waiting');
  const [calibrated, setCalibrated] = useState(false);
  const rawRef = useRef<TimedSample | null>(null);
  const calibrationRef = useRef<OrientationCalibration | null>(null);
  const displayRef = useRef<CameraPose | null>(null);
  const lastDisplayRef = useRef(0);
  const permissionRef = useRef<SensorPermission>('waiting');
  const generationRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    rawRef.current = null;
    calibrationRef.current = null;
    displayRef.current = null;
    lastDisplayRef.current = 0;
    permissionRef.current = 'waiting';
    setPose(null);
    setFresh(false);
    setCalibrated(false);
    setPermission('waiting');
  }, []);

  const requestAndReset = useCallback(() => {
    reset();
    const generation = generationRef.current;
    const finish = (nextPermission: SensorPermission) => {
      if (!mountedRef.current || generationRef.current !== generation) return;
      permissionRef.current = nextPermission;
      setPermission(nextPermission);
    };
    const constructor = window.DeviceOrientationEvent as PermissionConstructor | undefined;
    if (!constructor) {
      finish('denied');
      return;
    }
    try {
      // Invoke directly in the click handler: iOS requires transient user activation.
      const pending = constructor.requestPermission?.();
      if (!pending) {
        finish('enabled');
        return;
      }
      void pending.then((result) => finish(result === 'granted' ? 'enabled' : 'denied'), () => finish('denied'));
    } catch {
      finish('denied');
    }
  }, [reset]);

  const calibrate = useCallback((sample: OrientationSample) => {
    const calibration = makeCalibration(sample);
    if (!calibration) return null;
    const nextPose = relativePose(sample, calibration);
    if (!nextPose) return null;
    calibrationRef.current = calibration;
    displayRef.current = nextPose;
    lastDisplayRef.current = performance.now();
    setCalibrated(true);
    setPose(nextPose);
    return nextPose;
  }, []);

  useEffect(() => {
    if (!active || permission !== 'enabled') {
      setFresh(false);
      return;
    }
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (permissionRef.current !== 'enabled' || document.visibilityState === 'hidden') return;
      const sample: OrientationSample = {
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
        screenAngle: screenAngle(),
      };
      const calibration = calibrationRef.current;
      const nextPose = calibration ? relativePose(sample, calibration) : cameraPose(sample);
      if (!nextPose) return;
      const time = performance.now();
      rawRef.current = { sample, time };
      setFresh(true);
      if (displayRef.current && time - lastDisplayRef.current < DISPLAY_INTERVAL_MS) return;
      const displayed = smoothPose(displayRef.current, nextPose, 0.4);
      displayRef.current = displayed;
      lastDisplayRef.current = time;
      setPose(displayed);
    };
    const checkFreshness = () => {
      const latest = rawRef.current;
      setFresh(!!latest && performance.now() - latest.time <= STALE_AFTER_MS);
    };
    const handleVisibility = () => {
      // A backgrounded page must get a new reading before accepting another shot.
      rawRef.current = null;
      displayRef.current = null;
      setFresh(false);
    };
    window.addEventListener('deviceorientation', handleOrientation);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(checkFreshness, 400);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [active, permission]);

  return { pose, rawRef, calibrationRef, fresh, permission, calibrated, requestAndReset, calibrate, reset };
}
