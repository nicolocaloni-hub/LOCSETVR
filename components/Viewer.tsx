import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton';
import { getModelById } from '../services/storage';
import { TourRecord, PanoramaNode } from '../types';

const Viewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  
  // Interaction State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState({ yaw: 0, pitch: 0, nodeId: '' });

  // Mouse/Touch Interaction
  const isPointerDown = useRef(false);
  const onPointerDownMouseX = useRef(0);
  const onPointerDownMouseY = useRef(0);
  const onPointerDownLon = useRef(0);
  const onPointerDownLat = useRef(0);
  const lon = useRef(0);
  const lat = useRef(0);
  const phi = useRef(0);
  const theta = useRef(0);

  useEffect(() => {
    if (!id) return;
    initViewer();

    window.addEventListener('resize', onWindowResize);
    return () => {
      window.removeEventListener('resize', onWindowResize);
      if (rendererRef.current) {
        rendererRef.current.setAnimationLoop(null);
        rendererRef.current.dispose();
      }
      const btn = document.getElementById('VRButton');
      if (btn) btn.remove();
    };
  }, [id]);

  const initViewer = async () => {
    if (!containerRef.current || !id) return;

    // 1. Core Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera setup inside the sphere
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.target = new THREE.Vector3(0, 0, 0);
    cameraRef.current = camera;

    // 3. Renderer with WebXR
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // VR UI
    document.body.appendChild(VRButton.createButton(renderer));

    // 4. Geometry: Equirectangular Sphere
    const geometry = new THREE.SphereGeometry(50, 64, 32);
    geometry.scale(-1, 1, 1); // Invert to see from inside

    try {
      // @ts-ignore - Mapping old storage
      const tour = await getModelById(id) as unknown as TourRecord;
      if (!tour) throw new Error("Tour not found");

      const currentNode = tour.nodes.find(n => n.id === tour.startNodeId) || tour.nodes[0];
      setDebugInfo(prev => ({ ...prev, nodeId: currentNode.id }));

      // 5. Load Texture
      const textureLoader = new THREE.TextureLoader();
      const url = URL.createObjectURL(currentNode.imageBlob);
      
      textureLoader.load(url, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        const material = new THREE.MeshBasicMaterial({ map: texture });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);
        sphereRef.current = sphere;

        setLoading(false);
        URL.revokeObjectURL(url);
      }, undefined, (err) => {
        setError("Failed to load panorama texture.");
        setLoading(false);
      });

    } catch (err) {
      setError("Tour initialization failed.");
      setLoading(false);
    }

    renderer.setAnimationLoop(render);
  };

  const onWindowResize = () => {
    if (!cameraRef.current || !rendererRef.current) return;
    cameraRef.current.aspect = window.innerWidth / window.innerHeight;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (rendererRef.current?.xr.isPresenting) return;
    isPointerDown.current = true;
    onPointerDownMouseX.current = event.clientX;
    onPointerDownMouseY.current = event.clientY;
    onPointerDownLon.current = lon.current;
    onPointerDownLat.current = lat.current;
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!isPointerDown.current) return;
    lon.current = (onPointerDownMouseX.current - event.clientX) * 0.1 + onPointerDownLon.current;
    lat.current = (event.clientY - onPointerDownMouseY.current) * 0.1 + onPointerDownLat.current;
  };

  const onPointerUp = () => {
    isPointerDown.current = false;
  };

  const render = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    if (!rendererRef.current.xr.isPresenting) {
        lat.current = Math.max(-85, Math.min(85, lat.current));
        phi.current = THREE.MathUtils.degToRad(90 - lat.current);
        theta.current = THREE.MathUtils.degToRad(lon.current);

        const x = 500 * Math.sin(phi.current) * Math.cos(theta.current);
        const y = 500 * Math.cos(phi.current);
        const z = 500 * Math.sin(phi.current) * Math.sin(theta.current);

        cameraRef.current.lookAt(x, y, z);
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    
    // Update debug info once per frame
    if (showDebug) {
        setDebugInfo(prev => ({ 
            ...prev, 
            yaw: Math.round(lon.current % 360), 
            pitch: Math.round(lat.current) 
        }));
    }
  };

  return (
    <div 
      className="relative w-full h-screen bg-black overflow-hidden touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div ref={containerRef} className="absolute inset-0"></div>

      {/* Overlay UI */}
      <div className="absolute top-0 left-0 p-4 z-10 w-full flex justify-between items-start pointer-events-none">
        <button 
          onClick={() => navigate('/library')} 
          className="pointer-events-auto bg-black/50 text-white p-3 rounded-full backdrop-blur-md"
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        
        <button 
            onClick={() => setShowDebug(!showDebug)}
            className="pointer-events-auto bg-slate-800 text-white px-3 py-1 rounded-lg text-xs font-mono"
        >
            {showDebug ? 'HIDE DEBUG' : 'SHOW DEBUG'}
        </button>
      </div>

      {showDebug && (
        <div className="absolute bottom-20 left-4 z-20 bg-black/80 text-cyan-400 p-3 rounded-lg text-xs font-mono border border-cyan-900/50">
           <p>NODE: {debugInfo.nodeId}</p>
           <p>YAW: {debugInfo.yaw}°</p>
           <p>PITCH: {debugInfo.pitch}°</p>
           <p>MODE: {rendererRef.current?.xr.isPresenting ? 'VR' : 'ORBIT'}</p>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-white font-mono animate-pulse">Initializing Virtual Reality...</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-50 p-6">
           <div className="bg-red-900/30 p-8 rounded-3xl text-center border border-red-500/50">
             <i className="fa-solid fa-circle-exclamation text-4xl mb-4 text-red-500"></i>
             <p className="text-white font-bold">{error}</p>
             <button onClick={() => navigate('/library')} className="mt-6 bg-white text-black px-6 py-2 rounded-xl font-bold">Return to Library</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default Viewer;