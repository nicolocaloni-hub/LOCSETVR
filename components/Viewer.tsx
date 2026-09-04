import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import type { DigitalCloneRecord, MaskVolume, PropKind, SceneEdits, SceneProp, SpatialPanel } from '../types';
import { getModelById, saveModel } from '../services/storage';
import { shareProject } from '../services/share';
import { Brand } from './AppFrame';
import { Icon, type IconName } from './Icon';

const PROP_DEFINITIONS: Array<{ kind: PropKind; label: string; icon: IconName; color: string }> = [
  { kind: 'camera', label: 'Camera', icon: 'camera', color: '#c8ff45' },
  { kind: 'light', label: 'Luce', icon: 'light', color: '#ffb84d' },
  { kind: 'talent', label: 'Talent', icon: 'user', color: '#7dc7ff' },
  { kind: 'dolly', label: 'Dolly', icon: 'move', color: '#ff735e' },
  { kind: 'marker', label: 'Marker', icon: 'plus', color: '#f2f1eb' },
];

const createPhotoTexture = async (image: Blob, renderer: THREE.WebGLRenderer): Promise<THREE.CanvasTexture> => {
  const bitmap = await createImageBitmap(image);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, 1280 / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Impossibile creare le texture.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
};

const createSectorGeometry = (radius: number, centerDegrees: number, spanDegrees: number, height: number) => {
  const angularSegments = 14;
  const radialSegments = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const start = THREE.MathUtils.degToRad(centerDegrees - spanDegrees / 2);
  const span = THREE.MathUtils.degToRad(spanDegrees);

  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const distance = 0.04 + (radius - 0.04) * (radial / radialSegments);
    for (let angular = 0; angular <= angularSegments; angular += 1) {
      const angle = start + span * (angular / angularSegments);
      positions.push(Math.sin(angle) * distance, height, Math.cos(angle) * distance);
      uvs.push(angular / angularSegments, radial / radialSegments);
    }
  }
  for (let radial = 0; radial < radialSegments; radial += 1) {
    for (let angular = 0; angular < angularSegments; angular += 1) {
      const row = angularSegments + 1;
      const first = radial * row + angular;
      const second = first + row;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createProjectionMaterial = (texture: THREE.Texture, mirrored = false) => {
  if (mirrored) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.x = -1;
    texture.offset.x = 1;
  }
  return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
};

const addCapturedEnvironment = async (
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  record: DigitalCloneRecord,
) => {
  const { roomRadius: radius, roomHeight: height, panels } = record.reconstruction;
  const byRole = (roles: SpatialPanel['role'][]) => panels.filter((panel) => roles.includes(panel.role));
  const walls = byRole(['wall']);
  const lower = byRole(['floor', 'ground']);
  const upper = byRole(['ceiling', 'sky']);

  const fallbackFloor = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 72),
    material(record.reconstruction.floorColor, 0.96),
  );
  fallbackFloor.rotation.x = -Math.PI / 2;
  fallbackFloor.receiveShadow = true;
  scene.add(fallbackFloor);

  if (record.spaceKind !== 'outdoor') {
    const fallbackTop = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 72),
      material(record.reconstruction.ceilingColor, 0.98),
    );
    fallbackTop.rotation.x = Math.PI / 2;
    fallbackTop.position.y = height;
    scene.add(fallbackTop);
  }

  for (const panel of walls) {
    const texture = await createPhotoTexture(record.images[panel.imageIndex], renderer);
    const span = 360 / Math.max(1, walls.length);
    const angle = THREE.MathUtils.degToRad(180 + panel.yaw);
    const width = 2 * radius * Math.tan(THREE.MathUtils.degToRad(span / 2)) * 1.025;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      createProjectionMaterial(texture),
    );
    mesh.position.set(Math.sin(angle) * radius, height / 2, Math.cos(angle) * radius);
    mesh.lookAt(0, height / 2, 0);
    scene.add(mesh);
  }

  for (const panel of lower) {
    const texture = await createPhotoTexture(record.images[panel.imageIndex], renderer);
    const span = 360 / Math.max(1, lower.length);
    const mesh = new THREE.Mesh(
      createSectorGeometry(radius, 180 + panel.yaw, span * 1.025, 0.015),
      createProjectionMaterial(texture),
    );
    scene.add(mesh);
  }

  if (record.spaceKind === 'outdoor' && upper.length) {
    for (const panel of upper) {
      const texture = await createPhotoTexture(record.images[panel.imageIndex], renderer);
      const span = 360 / Math.max(1, upper.length);
      const geometry = new THREE.SphereGeometry(
        radius,
        18,
        10,
        Math.PI + THREE.MathUtils.degToRad(panel.yaw - span / 2),
        THREE.MathUtils.degToRad(span * 1.02),
        0,
        Math.PI / 2,
      );
      scene.add(new THREE.Mesh(geometry, createProjectionMaterial(texture, true)));
    }
  } else {
    for (const panel of upper) {
      const texture = await createPhotoTexture(record.images[panel.imageIndex], renderer);
      const span = 360 / Math.max(1, upper.length);
      const mesh = new THREE.Mesh(
        createSectorGeometry(radius, 180 + panel.yaw, span * 1.025, height - 0.015),
        createProjectionMaterial(texture),
      );
      scene.add(mesh);
    }
  }
};

const material = (color: THREE.ColorRepresentation, roughness = 0.72) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04 });

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const disposable = child as THREE.Mesh;
    disposable.geometry?.dispose();
    const materials = Array.isArray(disposable.material) ? disposable.material : [disposable.material];
    materials.filter(Boolean).forEach((entry) => {
      const mapped = entry as THREE.Material & { map?: THREE.Texture };
      mapped.map?.dispose();
      mapped.dispose();
    });
  });
};

const createPropObject = (prop: SceneProp): THREE.Group => {
  const group = new THREE.Group();
  group.userData.objectId = prop.id;
  group.userData.objectType = 'prop';
  const accent = material(prop.color, 0.5);
  const dark = material('#171a18', 0.46);

  const markSelectable = (object: THREE.Object3D) => {
    object.userData.objectId = prop.id;
    object.userData.objectType = 'prop';
    group.add(object);
  };

  if (prop.kind === 'camera') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.34), dark);
    body.position.y = 1.42;
    markSelectable(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.34, 20), accent);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 1.42, -0.32);
    markSelectable(lens);
    for (const x of [-0.24, 0.24]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 1.32, 8), dark);
      leg.position.set(x, 0.66, 0);
      leg.rotation.z = x > 0 ? -0.16 : 0.16;
      markSelectable(leg);
    }
  } else if (prop.kind === 'light') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.8, 10), dark);
    pole.position.y = 0.9;
    markSelectable(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.12), accent);
    lamp.position.set(0, 1.75, 0);
    markSelectable(lamp);
    const glow = new THREE.PointLight(prop.color, 1.4, 5, 1.4);
    glow.position.set(0, 1.65, -0.45);
    group.add(glow);
  } else if (prop.kind === 'talent') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.12, 5, 12), accent);
    body.position.y = 0.79;
    markSelectable(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), material('#e6b797'));
    head.position.y = 1.7;
    markSelectable(head);
  } else if (prop.kind === 'dolly') {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.65), accent);
    deck.position.y = 0.25;
    markSelectable(deck);
    for (const x of [-0.42, 0.42]) for (const z of [-0.26, 0.26]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.12, z);
      markSelectable(wheel);
    }
  } else {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 18), accent);
    pin.position.y = 0.19;
    markSelectable(pin);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.29, 24), new THREE.MeshBasicMaterial({ color: prop.color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    markSelectable(ring);
  }

  group.position.set(...prop.position);
  group.rotation.y = prop.rotationY;
  return group;
};

const createMaskObject = (mask: MaskVolume): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...mask.size),
    new THREE.MeshBasicMaterial({ color: '#ff5b48', transparent: true, opacity: 0.18, depthWrite: false }),
  );
  mesh.position.set(...mask.position);
  mesh.userData.objectId = mask.id;
  mesh.userData.objectType = 'mask';
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#ff735e' }));
  mesh.add(edges);
  return mesh;
};

const Viewer: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const editLayerRef = useRef<THREE.Group | null>(null);
  const selectionHelperRef = useRef<THREE.BoxHelper | null>(null);
  const recordRef = useRef<DigitalCloneRecord | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(-0.04);
  const pointerRef = useRef({ active: false, x: 0, y: 0, moved: 0 });
  const keysRef = useRef(new Set<string>());
  const moveRef = useRef<'forward' | 'back' | null>(null);
  const [record, setRecord] = useState<DigitalCloneRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [vrAvailable, setVrAvailable] = useState(false);
  const editMode = searchParams.get('edit') === 'true';

  const syncEditLayer = (edits: SceneEdits, activeId: string | null = selectedId) => {
    const scene = sceneRef.current;
    const previous = editLayerRef.current;
    if (!scene) return;
    if (previous) {
      scene.remove(previous);
      disposeObject(previous);
    }
    if (selectionHelperRef.current) {
      scene.remove(selectionHelperRef.current);
      disposeObject(selectionHelperRef.current);
    }
    selectionHelperRef.current = null;

    const layer = new THREE.Group();
    edits.objects.forEach((prop) => layer.add(createPropObject(prop)));
    edits.masks.forEach((mask) => layer.add(createMaskObject(mask)));
    scene.add(layer);
    editLayerRef.current = layer;

    if (activeId) {
      const object = layer.children.find((child) => child.userData.objectId === activeId);
      if (object) {
        const helper = new THREE.BoxHelper(object, '#c8ff45');
        scene.add(helper);
        selectionHelperRef.current = helper;
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    getModelById(id).then(async (loadedRecord) => {
      if (cancelled || !loadedRecord || !containerRef.current) {
        if (!loadedRecord) setError('Questa location non è presente sul dispositivo.');
        setLoading(false);
        return;
      }

      recordRef.current = loadedRecord;
      setRecord(loadedRecord);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(loadedRecord.images.length ? loadedRecord.reconstruction.ceilingColor : '#101210');
      scene.fog = loadedRecord.images.length ? null : new THREE.FogExp2('#101210', 0.025);
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(66, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.04, 80);
      camera.position.set(0, 1.62, 2.8);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local-floor');
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      scene.add(new THREE.HemisphereLight('#dbe4ee', '#302e29', 1.35));
      const key = new THREE.DirectionalLight('#fff4d8', 1.25);
      key.position.set(3, 6, 2);
      key.castShadow = true;
      scene.add(key);

      const radius = loadedRecord.reconstruction.roomRadius;
      const height = loadedRecord.reconstruction.roomHeight;
      if (loadedRecord.images.length) {
        await addCapturedEnvironment(scene, renderer, loadedRecord);
        if (cancelled) return;
      } else {
        const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), material(loadedRecord.reconstruction.floorColor, 0.92));
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        const ceiling = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), material(loadedRecord.reconstruction.ceilingColor, 0.96));
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = height;
        scene.add(ceiling);

        const wall = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, height, 96, 1, true),
          new THREE.MeshStandardMaterial({ color: '#343a36', roughness: 0.9, side: THREE.BackSide }),
        );
        wall.position.y = height / 2;
        scene.add(wall);
        const backPanel = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.45, 0.12), material('#545b54', 0.82));
        backPanel.position.set(0, 1.35, -4.55);
        scene.add(backPanel);
        for (let index = -2; index <= 2; index += 1) {
          const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.055, 2.32, 0.08), material('#1c211e'));
          mullion.position.set(index * 1.22, 1.37, -4.45);
          scene.add(mullion);
        }
        const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.28, 36), material('#6f756c', 0.72));
        platform.position.set(0.5, 0.14, -1.75);
        platform.receiveShadow = true;
        scene.add(platform);
        const sideBlock = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 1.2), material('#262b28'));
        sideBlock.position.set(-3.35, 0.625, -1.4);
        scene.add(sideBlock);

        const grid = new THREE.GridHelper(radius * 1.7, 20, '#5e665e', '#313632');
        grid.position.y = 0.008;
        (grid.material as THREE.Material).transparent = true;
        (grid.material as THREE.Material).opacity = 0.3;
        scene.add(grid);
      }
      syncEditLayer(loadedRecord.edits, null);

      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        if (!renderer.xr.isPresenting) {
          const cameraDirection = new THREE.Vector3(-Math.sin(yawRef.current), 0, -Math.cos(yawRef.current));
          const sideDirection = new THREE.Vector3(cameraDirection.z, 0, -cameraDirection.x);
          const delta = Math.min(clock.getDelta(), 0.05);
          const moveSpeed = 2.25 * delta;
          if (keysRef.current.has('w') || keysRef.current.has('arrowup') || moveRef.current === 'forward') camera.position.addScaledVector(cameraDirection, moveSpeed);
          if (keysRef.current.has('s') || keysRef.current.has('arrowdown') || moveRef.current === 'back') camera.position.addScaledVector(cameraDirection, -moveSpeed);
          if (keysRef.current.has('a')) camera.position.addScaledVector(sideDirection, -moveSpeed);
          if (keysRef.current.has('d')) camera.position.addScaledVector(sideDirection, moveSpeed);
          const horizontal = Math.hypot(camera.position.x, camera.position.z);
          if (horizontal > radius - 0.7) {
            camera.position.x *= (radius - 0.7) / horizontal;
            camera.position.z *= (radius - 0.7) / horizontal;
          }
          camera.position.y = 1.62;
          camera.rotation.order = 'YXZ';
          camera.rotation.y = yawRef.current;
          camera.rotation.x = pitchRef.current;
        }
        selectionHelperRef.current?.update();
        renderer.render(scene, camera);
      });

      setLoading(false);
      const xr = (navigator as Navigator & { xr?: { isSessionSupported: (mode: string) => Promise<boolean> } }).xr;
      if (xr) xr.isSessionSupported('immersive-vr').then(setVrAvailable).catch(() => setVrAvailable(false));
    }).catch(() => {
      setError('Non riesco ad aprire questa location.');
      setLoading(false);
    });

    const resize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    const keyDown = (event: KeyboardEvent) => keysRef.current.add(event.key.toLowerCase());
    const keyUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      rendererRef.current?.setAnimationLoop(null);
      if (sceneRef.current) disposeObject(sceneRef.current);
      rendererRef.current?.dispose();
      rendererRef.current?.domElement.remove();
    };
  }, [id]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const updateEdits = async (edits: SceneEdits, activeId: string | null = selectedId) => {
    const current = recordRef.current;
    if (!current) return;
    const next = { ...current, updatedAt: new Date().toISOString(), edits };
    recordRef.current = next;
    setRecord(next);
    syncEditLayer(edits, activeId);
    if (!next.isDemo) await saveModel(next);
  };

  const pointAhead = (distance = 2): [number, number, number] => {
    const camera = cameraRef.current;
    if (!camera) return [0, 0, -2];
    return [
      camera.position.x - Math.sin(yawRef.current) * distance,
      0,
      camera.position.z - Math.cos(yawRef.current) * distance,
    ];
  };

  const addProp = async (definition: typeof PROP_DEFINITIONS[number]) => {
    if (!recordRef.current) return;
    const prop: SceneProp = {
      id: crypto.randomUUID(),
      kind: definition.kind,
      label: `${definition.label} ${recordRef.current.edits.objects.filter((item) => item.kind === definition.kind).length + 1}`,
      position: pointAhead(),
      rotationY: yawRef.current,
      color: definition.color,
    };
    setSelectedId(prop.id);
    setToolboxOpen(false);
    await updateEdits({ ...recordRef.current.edits, objects: [...recordRef.current.edits.objects, prop] }, prop.id);
    setNotice(`${definition.label} aggiunta alla scena`);
  };

  const addMask = async () => {
    if (!recordRef.current) return;
    const position = pointAhead(2.4);
    position[1] = 0.75;
    const mask: MaskVolume = { id: crypto.randomUUID(), position, size: [1.3, 1.5, 1.3] };
    setSelectedId(mask.id);
    setToolboxOpen(false);
    await updateEdits({ ...recordRef.current.edits, masks: [...recordRef.current.edits.masks, mask] }, mask.id);
    setNotice('Volume da escludere aggiunto');
  };

  const deleteSelected = async () => {
    if (!recordRef.current || !selectedId) return;
    await updateEdits({
      objects: recordRef.current.edits.objects.filter((item) => item.id !== selectedId),
      masks: recordRef.current.edits.masks.filter((item) => item.id !== selectedId),
    }, null);
    setSelectedId(null);
    setNotice('Elemento rimosso');
  };

  const transformSelected = async (x: number, z: number, rotation = 0) => {
    if (!recordRef.current || !selectedId) return;
    const edits: SceneEdits = {
      objects: recordRef.current.edits.objects.map((item) => item.id === selectedId ? {
        ...item,
        position: [item.position[0] + x, item.position[1], item.position[2] + z] as [number, number, number],
        rotationY: item.rotationY + rotation,
      } : item),
      masks: recordRef.current.edits.masks.map((item) => item.id === selectedId ? {
        ...item,
        position: [item.position[0] + x, item.position[1], item.position[2] + z] as [number, number, number],
      } : item),
    };
    await updateEdits(edits, selectedId);
  };

  const selectFromPointer = (event: React.PointerEvent) => {
    if (!editMode || pointerRef.current.moved > 8 || !cameraRef.current || !editLayerRef.current || !rendererRef.current) return;
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, cameraRef.current);
    const hit = raycaster.intersectObjects(editLayerRef.current.children, true)[0]?.object;
    const objectId = hit?.userData.objectId || hit?.parent?.userData.objectId || null;
    setSelectedId(objectId);
    if (recordRef.current) syncEditLayer(recordRef.current.edits, objectId);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    pointerRef.current = { active: true, x: event.clientX, y: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const pointer = pointerRef.current;
    if (!pointer.active || rendererRef.current?.xr.isPresenting) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.moved += Math.abs(deltaX) + Math.abs(deltaY);
    yawRef.current -= deltaX * 0.004;
    pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - deltaY * 0.0035, -1.25, 1.25);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };

  const onPointerUp = (event: React.PointerEvent) => {
    selectFromPointer(event);
    pointerRef.current.active = false;
  };

  const enterVr = async () => {
    const renderer = rendererRef.current;
    const xr = (navigator as Navigator & { xr?: { requestSession: (mode: string, options?: object) => Promise<any> } }).xr;
    if (!renderer || !xr || !vrAvailable) {
      setNotice('Collega un visore WebXR compatibile per entrare in VR');
      return;
    }
    try {
      const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await renderer.xr.setSession(session);
    } catch {
      setNotice('Avvio VR annullato o non disponibile');
    }
  };

  const share = async () => {
    if (!recordRef.current) return;
    try {
      const result = await shareProject(recordRef.current);
      setNotice(result === 'shared' ? 'Progetto condiviso' : 'Pacchetto .locset scaricato');
    } catch (shareError) {
      if ((shareError as DOMException)?.name !== 'AbortError') setNotice('Condivisione non riuscita');
    }
  };

  if (error) return <main className="viewer-error"><Icon name="warning" size={34}/><h1>Location non disponibile</h1><p>{error}</p><button className="primary-button" onClick={() => navigate('/library')}>Torna alla libreria</button></main>;

  return (
    <main className={`viewer ${editMode ? 'viewer--edit' : ''}`}>
      <div
        ref={containerRef}
        className="viewer-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="viewer-vignette"/>
      <header className="viewer-header">
        <button className="glass-button" onClick={() => navigate('/library')} aria-label="Torna alla libreria"><Icon name="arrow-left"/></button>
        <div className="viewer-title"><Brand compact/><i/><div><strong>{record?.name || 'Caricamento'}</strong><span>Scala 1:1 · {record?.isDemo ? 'Demo interattiva' : 'Pareti + sopra + sotto'}</span></div></div>
        <div className="viewer-header__actions">
          <button className="glass-button" onClick={share} aria-label="Condividi"><Icon name="share"/></button>
          <button className={`mode-switch ${editMode ? 'mode-switch--active' : ''}`} onClick={() => setSearchParams(editMode ? {} : { edit: 'true' })}>
            <Icon name={editMode ? 'check' : 'edit'} size={17}/><span>{editMode ? 'Fine modifica' : 'Modifica'}</span>
          </button>
        </div>
      </header>

      <div className="viewer-status"><span><i/>NAVIGAZIONE LIBERA</span><b>W A S D</b><span>Trascina per guardarti intorno</span></div>

      {editMode && (
        <aside className="editor-rail">
          <button className={toolboxOpen ? 'active' : ''} onClick={() => setToolboxOpen((open) => !open)}><Icon name="plus"/><span>Aggiungi</span></button>
          <button onClick={() => setNotice('Seleziona un elemento direttamente nello spazio')}><Icon name="move"/><span>Sposta</span></button>
          <button onClick={addMask}><Icon name="layers"/><span>Escludi</span></button>
          <button disabled={!selectedId} onClick={deleteSelected}><Icon name="trash"/><span>Rimuovi</span></button>
        </aside>
      )}

      {editMode && toolboxOpen && (
        <section className="asset-drawer">
          <div className="asset-drawer__head"><div><span className="eyebrow">Oggetti di scena</span><h2>Aggiungi al set</h2></div><button className="icon-button" onClick={() => setToolboxOpen(false)}><Icon name="close"/></button></div>
          <div className="asset-grid">
            {PROP_DEFINITIONS.map((definition) => (
              <button key={definition.kind} onClick={() => addProp(definition)} style={{ '--prop-color': definition.color } as React.CSSProperties}>
                <span><Icon name={definition.icon}/></span><strong>{definition.label}</strong><small>Inserisci a 2 m</small>
              </button>
            ))}
          </div>
          <button className="mask-action" onClick={addMask}><span><Icon name="layers"/></span><div><strong>Volume da escludere</strong><small>Marca una zona da rimuovere dalla scena</small></div><Icon name="chevron-right"/></button>
        </section>
      )}

      {editMode && selectedId && (
        <section className="transform-pad">
          <span>ELEMENTO SELEZIONATO</span>
          <div>
            <button onClick={() => transformSelected(-0.25, 0)} aria-label="Sposta a sinistra">←</button>
            <button onClick={() => transformSelected(0, -0.25)} aria-label="Sposta avanti">↑</button>
            <button onClick={() => transformSelected(0, 0.25)} aria-label="Sposta indietro">↓</button>
            <button onClick={() => transformSelected(0.25, 0)} aria-label="Sposta a destra">→</button>
            <button onClick={() => transformSelected(0, 0, Math.PI / 8)} aria-label="Ruota"><Icon name="rotate" size={17}/></button>
          </div>
        </section>
      )}

      <div className="mobile-movement">
        <button onPointerDown={() => { moveRef.current = 'forward'; }} onPointerUp={() => { moveRef.current = null; }} onPointerCancel={() => { moveRef.current = null; }}>↑<span>Avanti</span></button>
        <button onPointerDown={() => { moveRef.current = 'back'; }} onPointerUp={() => { moveRef.current = null; }} onPointerCancel={() => { moveRef.current = null; }}>↓<span>Indietro</span></button>
      </div>

      <button className="vr-button" onClick={enterVr}><Icon name="headset"/><span>Entra in VR</span><i className={vrAvailable ? 'available' : ''}/></button>
      <div className="viewer-scale"><span/><b>1 m</b><span/></div>

      {loading && <div className="viewer-loading"><div className="processing-visual"><span/><span/><span/><Icon name="cube" size={40}/></div><strong>Apro il gemello digitale</strong><p>Compongo viste, scala e modifiche…</p></div>}
      {notice && <div className="toast toast--dark"><Icon name="check"/>{notice}</div>}
    </main>
  );
};

export default Viewer;
