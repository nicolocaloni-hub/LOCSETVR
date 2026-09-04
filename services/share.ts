import type { DigitalCloneRecord, PortableClone } from '../types';

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

export const createPortableProject = async (record: DigitalCloneRecord): Promise<File> => {
  const payload: PortableClone = {
    ...record,
    format: 'locsetvr-project',
    images: await Promise.all(record.images.map(blobToDataUrl)),
  };
  const safeName = record.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'location';
  return new File([JSON.stringify(payload)], `${safeName}.locset`, { type: 'application/json' });
};

export const parsePortableProject = async (file: File): Promise<DigitalCloneRecord> => {
  const payload = JSON.parse(await file.text()) as PortableClone;
  if (payload.format !== 'locsetvr-project' || !Array.isArray(payload.images) || !payload.reconstruction) {
    throw new Error('Il file non è un progetto LOCSETVR valido.');
  }
  const { format: _format, images, ...record } = payload;
  return {
    ...record,
    id: crypto.randomUUID(),
    name: `${record.name} (importata)`,
    updatedAt: new Date().toISOString(),
    images: await Promise.all(images.map(dataUrlToBlob)),
  };
};

export const shareProject = async (record: DigitalCloneRecord): Promise<'shared' | 'downloaded'> => {
  const file = await createPortableProject(record);
  const shareData = { title: record.name, text: 'Apri questa location con LOCSETVR.', files: [file] };
  if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
    await navigator.share(shareData);
    return 'shared';
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
};
