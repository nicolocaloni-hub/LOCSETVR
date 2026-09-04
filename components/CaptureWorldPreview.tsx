import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getSpaceTemplate } from '../services/capturePlan';
import type { CapturedFrame, CaptureShot, SpaceKind } from '../types';
import './CaptureWorldPreview.css';

type CaptureWorldPreviewProps = {
  frames: CapturedFrame[];
  spaceKind: SpaceKind;
  currentShot?: CaptureShot;
  expanded?: boolean;
};

type PhotoPatch = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  outline: THREE.LineSegments<THREE.EdgesGeometry, THREE.LineBasicMaterial>;
  blob?: Blob;
  request: number;
};

type PreviewRuntime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  patches: Map<string, PhotoPatch>;
  render: () => void;
  disposed: boolean;
  lastPhotoId?: string;
};

const radius = 1.5;
const wallHeight = 1.35;

function sectorGeometry(yaw: number, span: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const uv: number[] = [];
  const steps = 8;
  for (let index = 0; index < steps; index += 1) {
    const a = THREE.MathUtils.degToRad(yaw - span / 2 + (span * index) / steps);
    const b = THREE.MathUtils.degToRad(yaw - span / 2 + (span * (index + 1)) / steps);
    vertices.push(0, 0, 0, Math.sin(a) * radius, 0, -Math.cos(a) * radius, Math.sin(b) * radius, 0, -Math.cos(b) * radius);
    uv.push(0.5, 0, index / steps, 1, (index + 1) / steps, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createPatch(shot: CaptureShot, plan: CaptureShot[]): PhotoPatch {
  const roleCount = plan.filter((item) => item.role === shot.role).length;
  const isWall = shot.role === 'wall';
  const isUpper = shot.role === 'ceiling' || shot.role === 'sky';
  const geometry = isWall
    ? new THREE.PlaneGeometry(2 * radius * Math.tan(Math.PI / roleCount), wallHeight)
    : sectorGeometry(shot.yaw, 360 / roleCount);
  const material = new THREE.MeshBasicMaterial({
    color: '#b7d987',
    // Inward-facing walls leave the near side open in the dollhouse view.
    side: isWall ? THREE.FrontSide : THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: !isUpper,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  if (isWall) {
    const angle = THREE.MathUtils.degToRad(shot.yaw);
    mesh.position.set(Math.sin(angle) * radius, wallHeight / 2, -Math.cos(angle) * radius);
    mesh.lookAt(0, wallHeight / 2, 0);
  } else {
    // Lift the ceiling slightly so the upper and lower coverage stay legible.
    mesh.position.y = isUpper ? wallHeight + 0.48 : 0;
  }
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 30),
    new THREE.LineBasicMaterial({ color: '#c5d2be', transparent: true, opacity: 0.13, depthTest: false }),
  );
  outline.position.copy(mesh.position);
  outline.quaternion.copy(mesh.quaternion);
  outline.renderOrder = 2;
  mesh.renderOrder = isUpper ? 1 : 0;
  mesh.userData.upperSurface = isUpper;
  return { mesh, outline, request: 0 };
}

async function photoTexture(blob: Blob): Promise<THREE.CanvasTexture> {
  let source: ImageBitmap | HTMLImageElement;
  let objectUrl: string | undefined;
  try {
    source = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    objectUrl = URL.createObjectURL(blob);
    source = new Image();
    source.src = objectUrl;
    try {
      await source.decode();
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
  try {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 320 / Math.max(source.width, source.height));
    canvas.width = Math.max(1, Math.round(source.width * ratio));
    canvas.height = Math.max(1, Math.round(source.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Anteprima foto non disponibile');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  } finally {
    if ('close' in source) source.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** An incremental coverage model, with photos on their assigned surfaces. */
export default function CaptureWorldPreview({ frames, spaceKind, currentShot, expanded = false }: CaptureWorldPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  const [supported, setSupported] = useState(true);
  const [photoError, setPhotoError] = useState(false);
  const plan = getSpaceTemplate(spaceKind).plan;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      setSupported(false);
      return;
    }
    setSupported(true);
    setPhotoError(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 30);
    camera.position.set(4.6, 3.4, 5.5);
    camera.lookAt(0, 0.85, 0);
    const patches = new Map<string, PhotoPatch>();
    const templatePlan = getSpaceTemplate(spaceKind).plan;
    templatePlan.forEach((shot) => {
      const patch = createPatch(shot, templatePlan);
      patches.set(shot.id, patch);
      scene.add(patch.mesh, patch.outline);
    });
    const center = new THREE.Mesh(
      new THREE.ConeGeometry(0.095, 0.3, 5),
      new THREE.MeshBasicMaterial({ color: '#c7ff31', toneMapped: false }),
    );
    center.position.set(0, 0.18, 0);
    scene.add(center);
    const runtime: PreviewRuntime = {
      renderer, scene, camera, patches, disposed: false,
      render: () => { if (!runtime.disposed) renderer.render(scene, camera); },
    };
    runtimeRef.current = runtime;
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      runtime.render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => {
      runtime.disposed = true;
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      observer.disconnect();
      patches.forEach(({ mesh, outline }) => {
        mesh.material.map?.dispose();
        mesh.material.dispose();
        mesh.geometry.dispose();
        outline.material.dispose();
        outline.geometry.dispose();
      });
      center.geometry.dispose();
      center.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [spaceKind]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const latest = frames[frames.length - 1];
    if (latest && runtime.lastPhotoId !== latest.shot.id) {
      runtime.lastPhotoId = latest.shot.id;
      // Look into the newly acquired side: rear photos must stay visible too.
      const angle = THREE.MathUtils.degToRad(latest.shot.yaw);
      runtime.camera.position.set(
        4.6 * Math.cos(angle) - 5.5 * Math.sin(angle),
        3.4,
        4.6 * Math.sin(angle) + 5.5 * Math.cos(angle),
      );
      runtime.camera.lookAt(0, 0.85, 0);
    }
    const byId = new Map(frames.map((frame) => [frame.shot.id, frame]));
    runtime.patches.forEach((patch, id) => {
      const frame = byId.get(id);
      const active = currentShot?.id === id;
      patch.outline.material.color.set(active ? '#c7ff31' : frame ? '#d0e6bf' : '#c5d2be');
      patch.outline.material.opacity = active ? 0.95 : frame ? 0.33 : 0.13;
      if (patch.blob === frame?.blob) return;
      patch.request += 1;
      const request = patch.request;
      patch.blob = frame?.blob;
      patch.mesh.material.map?.dispose();
      patch.mesh.material.map = null;
      patch.mesh.material.opacity = 0;
      patch.mesh.material.needsUpdate = true;
      if (!frame) return;
      void photoTexture(frame.blob).then((texture) => {
        if (runtime.disposed || patch.request !== request) {
          texture.dispose();
          return;
        }
        patch.mesh.material.map = texture;
        patch.mesh.material.color.set('#ffffff');
        patch.mesh.material.opacity = patch.mesh.userData.upperSurface ? 0.67 : 0.96;
        patch.mesh.material.needsUpdate = true;
        runtime.render();
      }).catch(() => {
        if (!runtime.disposed && patch.request === request) setPhotoError(true);
      });
    });
    runtime.render();
  }, [frames, currentShot?.id, spaceKind]);

  return (
    <section className={`capture-world-preview${expanded ? ' capture-world-preview--expanded' : ''}`} aria-label="Aree acquisite">
      <div className="capture-world-heading">
        <span>Il tuo spazio</span>
        <strong>{frames.length}<span> / {plan.length}</span></strong>
      </div>
      <div ref={hostRef} className="capture-world-canvas" aria-hidden="true" />
      {!supported && <div className="capture-world-fallback">{Math.round((frames.length / plan.length) * 100)}%<span>copertura acquisita</span></div>}
      <p className="capture-world-caption" role="status" aria-live="polite">
        {photoError ? 'Scatti salvati · anteprima parziale' : frames.length ? 'Le foto prendono posizione' : 'La prima foto dà inizio allo spazio'}
      </p>
      <span className="capture-world-note">Anteprima di copertura</span>
    </section>
  );
}
