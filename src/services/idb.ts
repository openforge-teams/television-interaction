/**
 * IndexedDB 服务 - 浏览器端持久化存储
 * 存储内容：素材 Blob（图片/音频/视频）、项目自动保存、最近项目列表
 * 浏览器端应用无法像桌面端那样自由访问本地文件系统，
 * 因此所有素材和项目数据均存储在浏览器 IndexedDB 中。
 */

const DB_NAME = 'yingyou-workshop';
const DB_VERSION = 1;
const STORE_ASSETS = 'assets'; // assetId -> Blob
const STORE_PROJECTS = 'projects'; // projectKey -> ProjectData (JSON)
const STORE_META = 'meta'; // key -> value (recentProjects 等)

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS);
      }
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const os = transaction.objectStore(store);
        const req = fn(os);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        transaction.onabort = () => reject(transaction.error || new Error('事务被中止'));
        transaction.onerror = () => reject(transaction.error || new Error('事务错误'));
      })
  );
}

/** 用于 put/delete/clear 等不需要返回值的操作 */
function txVoid(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest
): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const os = transaction.objectStore(store);
        const req = fn(os);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        transaction.onabort = () => reject(transaction.error || new Error('事务被中止'));
        transaction.onerror = () => reject(transaction.error || new Error('事务错误'));
      })
  );
}

// ============ 素材 Blob 存储 ============

export async function saveAssetBlob(assetId: string, blob: Blob): Promise<void> {
  await txVoid(STORE_ASSETS, 'readwrite', (s) => s.put(blob, assetId));
}

export async function getAssetBlob(assetId: string): Promise<Blob | null> {
  try {
    const result = await tx<Blob>(STORE_ASSETS, 'readonly', (s) => s.get(assetId));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deleteAssetBlob(assetId: string): Promise<void> {
  await txVoid(STORE_ASSETS, 'readwrite', (s) => s.delete(assetId));
  // 同时清理 URL 缓存，防止内存泄漏
  revokeAssetURL(assetId);
}

export async function getAllAssetBlobs(): Promise<Map<string, Blob>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_ASSETS, 'readonly');
    const os = transaction.objectStore(STORE_ASSETS);
    const req = os.openCursor();
    const map = new Map<string, Blob>();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        map.set(cursor.key as string, cursor.value as Blob);
        cursor.continue();
      } else {
        resolve(map);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllAssets(): Promise<void> {
  await txVoid(STORE_ASSETS, 'readwrite', (s) => s.clear());
}

// ============ 项目自动保存 ============

export async function saveProjectToIDB(key: string, data: unknown): Promise<void> {
  await txVoid(STORE_PROJECTS, 'readwrite', (s) =>
    s.put(JSON.stringify(data), key)
  );
}

export async function loadProjectFromIDB<T>(key: string): Promise<T | null> {
  try {
    const result = await tx<string>(STORE_PROJECTS, 'readonly', (s) => s.get(key));
    if (!result) return null;
    try {
      return JSON.parse(result) as T;
    } catch (parseErr) {
      console.error('项目数据解析失败，数据可能已损坏:', parseErr);
      return null;
    }
  } catch {
    return null;
  }
}

export async function getAllProjectKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_PROJECTS, 'readonly');
    const os = transaction.objectStore(STORE_PROJECTS);
    const req = os.getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProjectFromIDB(key: string): Promise<void> {
  await txVoid(STORE_PROJECTS, 'readwrite', (s) => s.delete(key));
}

// ============ 元数据存储 ============

export async function getMeta<T>(key: string): Promise<T | null> {
  try {
    const result = await tx<T>(STORE_META, 'readonly', (s) => s.get(key));
    return result ?? null;
  } catch {
    return null;
  }
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await txVoid(STORE_META, 'readwrite', (s) => s.put(value, key));
}

// ============ Object URL 缓存 ============
// 避免重复创建 Object URL 导致内存泄漏

const urlCache = new Map<string, string>();

export async function getAssetURL(assetId: string): Promise<string | null> {
  if (urlCache.has(assetId)) return urlCache.get(assetId)!;
  const blob = await getAssetBlob(assetId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(assetId, url);
  return url;
}

export function revokeAssetURL(assetId: string): void {
  const url = urlCache.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(assetId);
  }
}

export function clearURLCache(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
