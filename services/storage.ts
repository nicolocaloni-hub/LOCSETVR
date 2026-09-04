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
  const validObjects = candidate.edits?.objects?.every((item) => 'kind' in item) ? candidate.edits.objects : [];
  const validMasks = candidate.edits?.masks?.every((item) => 'size' in item) ? candidate.edits.masks : [];
  return {
    id: candidate.id,
    name: candidate.name || 'Location senza nome',
    date,
    updatedAt: candidate.updatedAt || date,
    status: 'ready',
    images: candidate.images,
    thumbnail: candidate.thumbnail || '',
    reconstruction: candidate.reconstruction || {
      version: 1,
      roomRadius: 4.8,
      roomHeight: 3,
      floorColor: '#292b28',
      ceilingColor: '#181b18',
      panels: candidate.images.map((_, imageIndex) => ({
        imageIndex,
        yaw: (imageIndex / candidate.images!.length) * Math.PI * 2,
        brightness: 128,
        sharpness: 10,
      })),
      fidelity: 'local-spatial-preview',
    },
    edits: { objects: validObjects, masks: validMasks },
  };
};

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
