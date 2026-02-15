/**
 * IndexedDB 工具 - 用于持久化下载任务和片段数据
 * 支持断点续传和页面刷新后恢复下载
 * 使用 Storage Buckets API (Chrome 126+) 优化性能
 */

import type { M3U8Task } from './m3u8-downloader';

const DB_NAME = 'LunaTVDownloads';
const DB_VERSION = 1;
const TASKS_STORE = 'tasks';
const SEGMENTS_STORE = 'segments';
const SEGMENTS_BUCKET = 'video-segments';

interface StoredTask {
  id: string;
  task: Omit<M3U8Task, 'downloadedSegments'>;
  status: 'ready' | 'downloading' | 'pause' | 'done' | 'error';
  createdAt: number;
  updatedAt: number;
}

interface StoredSegment {
  taskId: string;
  segmentIndex: number;
  data: Blob;
  createdAt: number;
}

// Storage Buckets API 类型定义
interface StorageBucket {
  indexedDB: IDBFactory;
  name: string;
}

interface StorageBucketManager {
  open(name: string): Promise<StorageBucket>;
  delete(name: string): Promise<void>;
  keys(): Promise<string[]>;
}

declare global {
  interface Navigator {
    storageBuckets?: StorageBucketManager;
  }
}

let segmentsBucket: StorageBucket | null = null;
let supportsStorageBuckets = false;

/**
 * 初始化 Storage Buckets（如果支持）
 */
async function initStorageBuckets(): Promise<void> {
  if ('storageBuckets' in navigator) {
    try {
      segmentsBucket = await navigator.storageBuckets!.open(SEGMENTS_BUCKET);
      supportsStorageBuckets = true;
      console.log('✅ Storage Buckets enabled for video segments');
    } catch (error) {
      console.warn('Storage Buckets not available, using default IndexedDB:', error);
    }
  }
}

// 初始化
initStorageBuckets();

/**
 * 打开任务数据库（主数据库）
 */
function openTasksDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建任务存储
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        const taskStore = db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
        taskStore.createIndex('status', 'status', { unique: false });
        taskStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 如果不支持 Storage Buckets，在主数据库创建片段存储
      if (!supportsStorageBuckets && !db.objectStoreNames.contains(SEGMENTS_STORE)) {
        const segmentStore = db.createObjectStore(SEGMENTS_STORE, {
          keyPath: ['taskId', 'segmentIndex'],
        });
        segmentStore.createIndex('taskId', 'taskId', { unique: false });
      }
    };
  });
}

/**
 * 打开片段数据库（使用 Storage Bucket 或主数据库）
 */
function openSegmentsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idbFactory = segmentsBucket?.indexedDB || indexedDB;
    const dbName = segmentsBucket ? DB_NAME : DB_NAME;

    const request = idbFactory.open(dbName, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建片段存储
      if (!db.objectStoreNames.contains(SEGMENTS_STORE)) {
        const segmentStore = db.createObjectStore(SEGMENTS_STORE, {
          keyPath: ['taskId', 'segmentIndex'],
        });
        segmentStore.createIndex('taskId', 'taskId', { unique: false });
      }
    };
  });
}

/**
 * 保存任务到 IndexedDB
 */
export async function saveTask(
  id: string,
  task: M3U8Task,
  status: StoredTask['status']
): Promise<void> {
  const db = await openTasksDB();
  const transaction = db.transaction([TASKS_STORE], 'readwrite');
  const store = transaction.objectStore(TASKS_STORE);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { downloadedSegments, ...taskWithoutSegments } = task;

  const storedTask: StoredTask = {
    id,
    task: taskWithoutSegments,
    status: status === 'downloading' ? 'pause' : status,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const request = store.put(storedTask);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 保存片段到 IndexedDB（使用 Storage Bucket 隔离）
 */
export async function saveSegment(
  taskId: string,
  segmentIndex: number,
  data: ArrayBuffer
): Promise<void> {
  try {
    const db = await openSegmentsDB();
    const transaction = db.transaction([SEGMENTS_STORE], 'readwrite');
    const store = transaction.objectStore(SEGMENTS_STORE);

    const storedSegment: StoredSegment = {
      taskId,
      segmentIndex,
      data: new Blob([data]),
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(storedSegment);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    // 如果是 QuotaExceededError，忽略（磁盘空间不足）
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('IndexedDB quota exceeded, segment not saved:', taskId, segmentIndex);
      return;
    }
    throw error;
  }
}

/**
 * 批量保存片段（性能优化）
 */
export async function saveSegmentsBatch(
  segments: Array<{ taskId: string; segmentIndex: number; data: ArrayBuffer }>
): Promise<void> {
  if (segments.length === 0) return;

  try {
    const db = await openSegmentsDB();
    const transaction = db.transaction([SEGMENTS_STORE], 'readwrite');
    const store = transaction.objectStore(SEGMENTS_STORE);

    const promises = segments.map(({ taskId, segmentIndex, data }) => {
      const storedSegment: StoredSegment = {
        taskId,
        segmentIndex,
        data: new Blob([data]),
        createdAt: Date.now(),
      };

      return new Promise<void>((resolve, reject) => {
        const request = store.put(storedSegment);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('IndexedDB quota exceeded during batch save');
      return;
    }
    throw error;
  }
}

/**
 * 获取所有任务
 */
export async function getAllTasks(): Promise<StoredTask[]> {
  const db = await openTasksDB();
  const transaction = db.transaction([TASKS_STORE], 'readonly');
  const store = transaction.objectStore(TASKS_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取任务的所有片段（使用批量读取优化）
 */
export async function getTaskSegments(taskId: string): Promise<Map<number, ArrayBuffer>> {
  const db = await openSegmentsDB();
  const transaction = db.transaction([SEGMENTS_STORE], 'readonly');
  const store = transaction.objectStore(SEGMENTS_STORE);
  const index = store.index('taskId');

  return new Promise((resolve, reject) => {
    // 使用 getAll 批量读取，比 cursor 快 40-50%
    const request = index.getAll(taskId);
    request.onsuccess = async () => {
      const segments = request.result as StoredSegment[];
      const map = new Map<number, ArrayBuffer>();

      // 并行转换 Blob 到 ArrayBuffer
      await Promise.all(
        segments.map(async (segment) => {
          const arrayBuffer = await segment.data.arrayBuffer();
          map.set(segment.segmentIndex, arrayBuffer);
        })
      );

      resolve(map);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除任务及其所有片段
 */
export async function deleteTask(taskId: string): Promise<void> {
  // 删除任务元数据
  const tasksDB = await openTasksDB();
  const tasksTransaction = tasksDB.transaction([TASKS_STORE], 'readwrite');
  const taskStore = tasksTransaction.objectStore(TASKS_STORE);
  taskStore.delete(taskId);

  await new Promise<void>((resolve, reject) => {
    tasksTransaction.oncomplete = () => resolve();
    tasksTransaction.onerror = () => reject(tasksTransaction.error);
  });

  // 删除所有片段
  const segmentsDB = await openSegmentsDB();
  const segmentsTransaction = segmentsDB.transaction([SEGMENTS_STORE], 'readwrite');
  const segmentStore = segmentsTransaction.objectStore(SEGMENTS_STORE);
  const index = segmentStore.index('taskId');
  const request = index.openCursor(IDBKeyRange.only(taskId));

  return new Promise((resolve, reject) => {
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
  taskId: string,
  status: StoredTask['status']
): Promise<void> {
  const db = await openTasksDB();
  const transaction = db.transaction([TASKS_STORE], 'readwrite');
  const store = transaction.objectStore(TASKS_STORE);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(taskId);
    getRequest.onsuccess = () => {
      const task = getRequest.result as StoredTask | undefined;
      if (task) {
        task.status = status;
        task.updatedAt = Date.now();
        const putRequest = store.put(task);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        reject(new Error(`Task ${taskId} not found`));
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * 获取存储空间使用情况
 */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  percentage: number;
  usageMB: number;
  quotaMB: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? (usage / quota) * 100 : 0;
    const usageMB = usage / 1024 / 1024;
    const quotaMB = quota / 1024 / 1024;
    return { usage, quota, percentage, usageMB, quotaMB };
  }
  return { usage: 0, quota: 0, percentage: 0, usageMB: 0, quotaMB: 0 };
}

/**
 * 清理已完成的任务（保留元数据，删除片段数据）
 */
export async function cleanupCompletedTasks(): Promise<number> {
  const tasks = await getAllTasks();
  const completedTasks = tasks.filter(t => t.status === 'done');

  for (const task of completedTasks) {
    // 只删除片段，保留任务元数据
    const segmentsDB = await openSegmentsDB();
    const transaction = segmentsDB.transaction([SEGMENTS_STORE], 'readwrite');
    const store = transaction.objectStore(SEGMENTS_STORE);
    const index = store.index('taskId');
    const request = index.openCursor(IDBKeyRange.only(task.id));

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  return completedTasks.length;
}

/**
 * 检查是否支持 Storage Buckets
 */
export function isStorageBucketsSupported(): boolean {
  return supportsStorageBuckets;
}


