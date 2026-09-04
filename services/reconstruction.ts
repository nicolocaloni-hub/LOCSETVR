import type {
  CaptureQuality,
  DigitalCloneRecord,
  ReconstructionProgress,
  SpatialPanel,
} from '../types';

const ANALYSIS_SIZE = 96;

const canvasToBlob = (canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Impossibile preparare la foto.'))),
      'image/jpeg',
      quality,
    );
  });

export const normalizePhoto = async (source: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(source);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, 1600 / longest);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas non disponibile.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToBlob(canvas);
};

export const analysePhoto = async (photo: Blob): Promise<CaptureQuality> => {
  const bitmap = await createImageBitmap(photo);
  const canvas = document.createElement('canvas');
  canvas.width = ANALYSIS_SIZE;
  canvas.height = ANALYSIS_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas non disponibile.');
  context.drawImage(bitmap, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  bitmap.close();

  const { data } = context.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const luminance = new Float32Array(ANALYSIS_SIZE * ANALYSIS_SIZE);
  let brightness = 0;

  for (let index = 0; index < luminance.length; index += 1) {
    const pixel = index * 4;
    const value = data[pixel] * 0.2126 + data[pixel + 1] * 0.7152 + data[pixel + 2] * 0.0722;
    luminance[index] = value;
    brightness += value;
  }

  brightness /= luminance.length;
  let laplacianMean = 0;
  let laplacianSquared = 0;
  let count = 0;

  for (let y = 1; y < ANALYSIS_SIZE - 1; y += 1) {
    for (let x = 1; x < ANALYSIS_SIZE - 1; x += 1) {
      const index = y * ANALYSIS_SIZE + x;
      const laplacian =
        luminance[index - 1] +
        luminance[index + 1] +
        luminance[index - ANALYSIS_SIZE] +
        luminance[index + ANALYSIS_SIZE] -
        luminance[index] * 4;
      laplacianMean += laplacian;
      laplacianSquared += laplacian * laplacian;
      count += 1;
    }
  }

  laplacianMean /= count;
  const sharpness = Math.sqrt(Math.max(0, laplacianSquared / count - laplacianMean ** 2));
  const accepted = brightness > 24 && brightness < 236 && sharpness > 7;
  const message =
    brightness <= 24
      ? 'Inquadratura troppo scura'
      : brightness >= 236
        ? 'Inquadratura sovraesposta'
        : sharpness <= 7
          ? 'Foto poco nitida: resta fermo e riprova'
          : 'Copertura acquisita';

  return {
    brightness: Math.round(brightness),
    sharpness: Math.round(sharpness * 10) / 10,
    accepted,
    message,
  };
};

const sampleEdgeColor = async (photo: Blob, edge: 'top' | 'bottom'): Promise<string> => {
  const bitmap = await createImageBitmap(photo);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 8;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return edge === 'top' ? '#171b20' : '#262421';
  const sourceY = edge === 'top' ? 0 : bitmap.height * 0.82;
  context.drawImage(bitmap, 0, sourceY, bitmap.width, bitmap.height * 0.18, 0, 0, 32, 8);
  bitmap.close();
  const pixels = context.getImageData(0, 0, 32, 8).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
  }
  const total = pixels.length / 4;
  const soften = (value: number) => Math.round((value / total) * 0.48);
  return `rgb(${soften(red)}, ${soften(green)}, ${soften(blue)})`;
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const reconstructLocally = async (
  name: string,
  rawPhotos: Blob[],
  onProgress: (state: ReconstructionProgress) => void,
): Promise<DigitalCloneRecord> => {
  if (rawPhotos.length < 8) throw new Error('Servono almeno 8 foto per costruire lo spazio.');

  const images: Blob[] = [];
  const panels: SpatialPanel[] = [];

  for (let index = 0; index < rawPhotos.length; index += 1) {
    onProgress({
      progress: 8 + Math.round((index / rawPhotos.length) * 58),
      message: `Ottimizzo il fotogramma ${index + 1} di ${rawPhotos.length}`,
    });
    const normalized = await normalizePhoto(rawPhotos[index]);
    const quality = await analysePhoto(normalized);
    images.push(normalized);
    panels.push({
      imageIndex: index,
      yaw: (index / rawPhotos.length) * Math.PI * 2,
      brightness: quality.brightness,
      sharpness: quality.sharpness,
    });
    await nextFrame();
  }

  onProgress({ progress: 72, message: 'Allineo le viste nello spazio' });
  const [ceilingColor, floorColor] = await Promise.all([
    sampleEdgeColor(images[0], 'top'),
    sampleEdgeColor(images[0], 'bottom'),
  ]);

  const firstImage = await createImageBitmap(images[0]);
  const thumbnailCanvas = document.createElement('canvas');
  thumbnailCanvas.width = 720;
  thumbnailCanvas.height = 480;
  const thumbnailContext = thumbnailCanvas.getContext('2d', { alpha: false });
  if (!thumbnailContext) throw new Error('Impossibile creare l’anteprima.');
  const sourceRatio = firstImage.width / firstImage.height;
  const targetRatio = thumbnailCanvas.width / thumbnailCanvas.height;
  const sourceWidth = sourceRatio > targetRatio ? firstImage.height * targetRatio : firstImage.width;
  const sourceHeight = sourceRatio > targetRatio ? firstImage.height : firstImage.width / targetRatio;
  thumbnailContext.drawImage(
    firstImage,
    (firstImage.width - sourceWidth) / 2,
    (firstImage.height - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    0,
    0,
    thumbnailCanvas.width,
    thumbnailCanvas.height,
  );
  firstImage.close();

  onProgress({ progress: 88, message: 'Genero collisioni e scala ambiente' });
  await nextFrame();

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || `Location ${new Date().toLocaleDateString('it-IT')}`,
    date: now,
    updatedAt: now,
    status: 'ready',
    images,
    thumbnail: thumbnailCanvas.toDataURL('image/jpeg', 0.72),
    reconstruction: {
      version: 1,
      roomRadius: 4.8,
      roomHeight: 3,
      floorColor,
      ceilingColor,
      panels,
      fidelity: 'local-spatial-preview',
    },
    edits: { objects: [], masks: [] },
  };
};

export const createDemoRecord = (): DigitalCloneRecord => {
  const now = new Date().toISOString();
  return {
    id: 'demo-studio',
    name: 'Studio 04 — Demo',
    date: now,
    updatedAt: now,
    status: 'ready',
    images: [],
    thumbnail: '',
    isDemo: true,
    reconstruction: {
      version: 1,
      roomRadius: 5.4,
      roomHeight: 3.2,
      floorColor: '#222522',
      ceilingColor: '#15191a',
      panels: [],
      fidelity: 'local-spatial-preview',
    },
    edits: {
      objects: [
        { id: 'demo-camera', kind: 'camera', label: 'Camera A', position: [-1.3, 0, 1.2], rotationY: -0.4, color: '#c8ff45' },
        { id: 'demo-light', kind: 'light', label: 'Key light', position: [1.8, 0, -0.4], rotationY: 2.1, color: '#ffb84d' },
      ],
      masks: [],
    },
  };
};
