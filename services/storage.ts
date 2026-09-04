import type { DigitalCloneRecord, ModelRecord } from '../types';
import { createDemoRecord } from './reconstruction';

const DB_NAME = 'LOCSETVR_DB';
const STORE_NAME = 'models';
const DB_VERSION = 2;

const upgradeRecord = (raw: unknown): DigitalCloneRecord | null => {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<DigitalCloneRecord> & { images?: Blob[]; date?: string; thumbnail?: string };
  if (!Array.isArray(candidate.images) || !candidate.images.length || !candidate.id) return null;
  const date = candidate.date || new Date().toISOString();
  const spaceKind = candidate.spaceKind || candidate.reconstruction?.spaceKind || 'room';
  const validObjects = candidate.edits?.objects?.every((item) => 'kind' in item) ? candidate.edits.objects : [];
  const validMasks = candidate.edits?.masks?.every((item) => 'size' in item) ? candidate.edits.masks : [];
  const legacyPanels = candidate.reconstruction?.panels?.map((panel, imageIndex) => ({
    ...panel,
    imageIndex,
    yaw: Math.abs(panel.yaw) <= Math.PI * 2 + 0.01 ? THREE_RAD_TO_DEG * panel.yaw : panel.yaw,
    pitch: panel.pitch ?? 0,
    role: panel.role ?? 'wall' as const,
  })) || candidate.images.map((_, imageIndex) => ({
    imageIndex,
    yaw: (imageIndex / candidate.images!.length) * 360,
    pitch: 0,
    role: 'wall' as const,
    brightness: 128,
    sharpness: 10,
  }));
  return {
    id: candidate.id,
    name: candidate.name || 'Location senza nome',
    date,
    updatedAt: candidate.updatedAt || date,
    status: 'ready',
    images: candidate.images,
    thumbnail: candidate.thumbnail || '',
    spaceKind,
    reconstruction: {
      version: 1,
      roomRadius: candidate.reconstruction?.roomRadius || 4.8,
      roomHeight: candidate.reconstruction?.roomHeight || 3,
      floorColor: candidate.reconstruction?.floorColor || '#292b28',
      ceilingColor: candidate.reconstruction?.ceilingColor || '#181b18',
      panels: legacyPanels,
      spaceKind,
      fidelity: 'local-spatial-preview',
    },
    edits: { objects: validObjects, masks: validMasks },
  };
};

const THREE_RAD_TO_DEG = 180 / Math.PI;

export const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
};

export const saveModel = async (record: ModelRecord): Promise<void> => {
  await withStore('readwrite', (store) => store.put(record));
};

export const getAllModels = async (): Promise<ModelRecord[]> => {
  const records = await withStore<unknown[]>('readonly', (store) => store.getAll());
  return records.map(upgradeRecord).filter((record): record is DigitalCloneRecord => Boolean(record));
};

export const getModelById = async (id: string): Promise<DigitalCloneRecord | undefined> => {
  if (id === 'demo-studio') return createDemoRecord();
  const record = await withStore<unknown>('readonly', (store) => store.get(id));
  return upgradeRecord(record) || undefined;
};

export const deleteModel = async (id: string): Promise<void> => {
  if (id === 'demo-studio') return;
  await withStore('readwrite', (store) => store.delete(id));
};
