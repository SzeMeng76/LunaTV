/* eslint-disable no-console */

'use client';

import { CURRENT_VERSION } from "@/lib/version";

// 版本检查结果枚举
export enum UpdateStatus {
  HAS_UPDATE = 'has_update', // 有新版本
  NO_UPDATE = 'no_update', // 无新版本
  FETCH_FAILED = 'fetch_failed', // 获取失败
}

// 远程版本检查URL配置
const VERSION_CHECK_URLS = [
  'https://raw.githubusercontent.com/SzeMeng76/LunaTV/refs/heads/main/VERSION.txt',
];

// ========== 缓存机制 ==========

// 缓存配置
const CACHE_TTL = 60 * 60 * 1000; // 1小时缓存时间
const SESSION_STORAGE_KEY = 'lunatv_version_check_cache';

// 内存缓存
interface CacheEntry {
  status: UpdateStatus;
  timestamp: number;
  remoteVersion?: string;
}

let memoryCache: CacheEntry | null = null;
let pendingRequest: Promise<UpdateStatus> | null = null;

/**
 * 从 sessionStorage 读取缓存
 */
function getCacheFromStorage(): CacheEntry | null {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  try {
    const cached = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!cached) return null;

    const entry: CacheEntry = JSON.parse(cached);
    const now = Date.now();

    // 检查缓存是否过期
    if (now - entry.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return entry;
  } catch (error) {
    console.warn('读取版本检查缓存失败:', error);
    return null;
  }
}

/**
 * 保存缓存到 sessionStorage
 */
function saveCacheToStorage(entry: CacheEntry): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(entry));
  } catch (error) {
    console.warn('保存版本检查缓存失败:', error);
  }
}

/**
 * 检查是否有新版本可用（带缓存和去重）
 * @returns Promise<UpdateStatus> - 返回版本检查状态
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const now = Date.now();

  // 1. 检查内存缓存
  if (memoryCache && now - memoryCache.timestamp < CACHE_TTL) {
    console.log('使用内存缓存的版本检查结果');
    return memoryCache.status;
  }

  // 2. 检查 sessionStorage 缓存
  const storageCache = getCacheFromStorage();
  if (storageCache) {
    console.log('使用 sessionStorage 缓存的版本检查结果');
    memoryCache = storageCache; // 同步到内存缓存
    return storageCache.status;
  }

  // 3. 检查是否有正在进行的请求（去重）
  if (pendingRequest) {
    console.log('复用正在进行的版本检查请求');
    return pendingRequest;
  }

  // 4. 发起新的版本检查请求
  console.log('发起新的版本检查请求');
  pendingRequest = performVersionCheck();

  try {
    const status = await pendingRequest;
    return status;
  } finally {
    // 请求完成后清除 pending 状态
    pendingRequest = null;
  }
}

/**
 * 执行实际的版本检查（内部函数）
 */
async function performVersionCheck(): Promise<UpdateStatus> {
  try {
    // 尝试从主要URL获取版本信息
    const primaryVersion = await fetchVersionFromUrl(VERSION_CHECK_URLS[0]);
    if (primaryVersion) {
      const status = compareVersions(primaryVersion);

      // 保存到缓存
      const cacheEntry: CacheEntry = {
        status,
        timestamp: Date.now(),
        remoteVersion: primaryVersion,
      };
      memoryCache = cacheEntry;
      saveCacheToStorage(cacheEntry);

      return status;
    }

    // 如果主要URL失败，尝试备用URL
    const backupVersion = await fetchVersionFromUrl(VERSION_CHECK_URLS[1]);
    if (backupVersion) {
      const status = compareVersions(backupVersion);

      // 保存到缓存
      const cacheEntry: CacheEntry = {
        status,
        timestamp: Date.now(),
        remoteVersion: backupVersion,
      };
      memoryCache = cacheEntry;
      saveCacheToStorage(cacheEntry);

      return status;
    }

    // 如果两个URL都失败，返回获取失败状态（不缓存失败结果）
    return UpdateStatus.FETCH_FAILED;
  } catch (error) {
    console.error('版本检查失败:', error);
    return UpdateStatus.FETCH_FAILED;
  }
}

/**
 * 从指定URL获取版本信息
 * @param url - 版本信息URL
 * @returns Promise<string | null> - 版本字符串或null
 */
async function fetchVersionFromUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

    // 添加时间戳参数以避免缓存
    const timestamp = Date.now();
    const urlWithTimestamp = url.includes('?')
      ? `${url}&_t=${timestamp}`
      : `${url}?_t=${timestamp}`;

    const response = await fetch(urlWithTimestamp, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'text/plain',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const version = await response.text();
    return version.trim();
  } catch (error) {
    console.warn(`从 ${url} 获取版本信息失败:`, error);
    return null;
  }
}

/**
 * 比较版本号
 * @param remoteVersion - 远程版本号
 * @returns UpdateStatus - 返回版本比较结果
 */
export function compareVersions(remoteVersion: string): UpdateStatus {
  // 如果版本号相同，无需更新
  if (remoteVersion === CURRENT_VERSION) {
    return UpdateStatus.NO_UPDATE;
  }

  try {
    // 解析版本号为数字数组 [X, Y, Z]
    const currentParts = CURRENT_VERSION.split('.').map((part) => {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0) {
        throw new Error(`无效的版本号格式: ${CURRENT_VERSION}`);
      }
      return num;
    });

    const remoteParts = remoteVersion.split('.').map((part) => {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0) {
        throw new Error(`无效的版本号格式: ${remoteVersion}`);
      }
      return num;
    });

    // 标准化版本号到3个部分
    const normalizeVersion = (parts: number[]) => {
      if (parts.length >= 3) {
        return parts.slice(0, 3); // 取前三个元素
      } else {
        // 不足3个的部分补0
        const normalized = [...parts];
        while (normalized.length < 3) {
          normalized.push(0);
        }
        return normalized;
      }
    };

    const normalizedCurrent = normalizeVersion(currentParts);
    const normalizedRemote = normalizeVersion(remoteParts);

    // 逐级比较版本号
    for (let i = 0; i < 3; i++) {
      if (normalizedRemote[i] > normalizedCurrent[i]) {
        return UpdateStatus.HAS_UPDATE;
      } else if (normalizedRemote[i] < normalizedCurrent[i]) {
        return UpdateStatus.NO_UPDATE;
      }
      // 如果当前级别相等，继续比较下一级
    }

    // 所有级别都相等，无需更新
    return UpdateStatus.NO_UPDATE;
  } catch (error) {
    console.error('版本号比较失败:', error);
    // 如果版本号格式无效，回退到字符串比较
    return remoteVersion !== CURRENT_VERSION
      ? UpdateStatus.HAS_UPDATE
      : UpdateStatus.NO_UPDATE;
  }
}