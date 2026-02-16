import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

// Configuration
const USE_MOCK_API = true; // Set to FALSE if you implement a real backend like Luma AI
// const API_ENDPOINT = 'https://api.lumalabs.ai/dream-machine/v1/generations'; // Example endpoint

/**
 * Creates a simple placeholder GLB model client-side for testing VR without a backend.
 */
const generateMockModel = async (): Promise<Blob> => {
  return new Promise((resolve) => {
    const scene = new THREE.Scene();
    
    // Create a simple room environment
    const floorGeo = new THREE.PlaneGeometry(10, 10);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Add some random cubes to represent scanned objects
    for (let i = 0; i < 5; i++) {
      const size = 0.5 + Math.random() * 0.5;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({ 
        color: Math.random() * 0xffffff,
        roughness: 0.5,
        metalness: 0.1
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 4,
        size / 2,
        (Math.random() - 0.5) * 4
      );
      mesh.rotation.y = Math.random() * Math.PI;
      scene.add(mesh);
    }

    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (gltf) => {
        const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
        resolve(blob);
      },
      (error) => {
        console.error('An error happened during mock export:', error);
        resolve(new Blob());
      },
      { binary: true }
    );
  });
};

/**
 * Simulates processing a batch of photos (SfM/MVS).
 */
export const processPhotosToModel = async (
  photos: Blob[],
  onProgress: (msg: string, percent: number) => void
): Promise<Blob> => {
  if (USE_MOCK_API) {
    onProgress(`Uploading ${photos.length} photos...`, 10);
    await new Promise(r => setTimeout(r, 1000));

    onProgress('Calculating Camera Poses (SfM)...', 40);
    await new Promise(r => setTimeout(r, 1500));

    onProgress('Generating Dense Point Cloud...', 70);
    await new Promise(r => setTimeout(r, 1500));

    onProgress('Meshing and Texturing...', 90);
    await new Promise(r => setTimeout(r, 1000));

    const modelBlob = await generateMockModel();
    onProgress('Reconstruction Ready.', 100);

    return modelBlob;
  } else {
    throw new Error("Real API not configured.");
  }
};

/**
 * Simulates processing a video file (NERF/Gaussian Splatting/Photogrammetry).
 */
export const processVideoToModel = async (
  videoBlob: Blob,
  onProgress: (msg: string, percent: number) => void
): Promise<Blob> => {
  if (USE_MOCK_API) {
    onProgress('Uploading video scan...', 10);
    await new Promise(r => setTimeout(r, 1000));

    onProgress('Extracting Keyframes...', 30);
    await new Promise(r => setTimeout(r, 1500));

    onProgress('Estimating Depth & Pose...', 60);
    await new Promise(r => setTimeout(r, 2000));

    onProgress('Building 3D Mesh...', 85);
    await new Promise(r => setTimeout(r, 1500));

    const modelBlob = await generateMockModel();
    onProgress('Model Ready.', 100);

    return modelBlob;
  } else {
    throw new Error("Real API not configured.");
  }
};