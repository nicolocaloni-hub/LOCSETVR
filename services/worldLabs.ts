
import { DigitalCloneRecord } from '../types';

/**
 * World Labs Client Refactored to use Server Proxy (/api/*)
 */

export interface WorldJobResponse {
  operation_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: {
    world_id: string;
    assets: {
      splats: { spz_urls: { [key: string]: string } };
      mesh: { collider_mesh_url: string };
      preview: { pano_url: string };
    }
  };
}

/**
 * Chiamata al proxy Vercel per generare il World.
 */
export const createWorldJob = async (record: DigitalCloneRecord): Promise<string> => {
  const formData = new FormData();
  record.images.forEach((blob, i) => {
    formData.append('images', blob, `img_${i}.jpg`);
  });

  const response = await fetch('/api/worlds/generate', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Generation request failed');
  }
  
  const data = await response.json();
  return data.operation_id;
};

/**
 * Verifica lo stato dell'operazione tramite il proxy.
 */
export const pollJobStatus = async (operationId: string): Promise<WorldJobResponse> => {
  const response = await fetch(`/api/operations/${operationId}`);
  if (!response.ok) throw new Error('Polling failed');
  return await response.json();
};

/**
 * Scarica un asset tramite URL diretto (o proxy se necessario per CORS).
 */
export const downloadAsset = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to download asset');
  return await response.blob();
};
