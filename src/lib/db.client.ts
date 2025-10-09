/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

/**
 * 仅在浏览器端使用的数据库工具，目前基于 localStorage 实现。
 * 之所以单独拆分文件，是为了避免在客户端 bundle 中引入 `fs`, `path` 等 Node.js 内置模块，
 * 从而解决诸如 "Module not found: Can't resolve 'fs'" 的问题。
 *
 * 功能：
 * 1. 获取全部播放记录（getAllPlayRecords）。
 * 2. 保存播放记录（savePlayRecord）。
 * 3. 数据库存储模式下的混合缓存策略，提升用户体验。
 *
 * 如后续需要在客户端读取收藏等其它数据，可按同样方式在此文件中补充实现。
 */

import { getAuthInfoFromBrowserCookie } from './auth';
import { UserPlayStat, SkipSegment, EpisodeSkipConfig } from './types';
import type { PlayRecord } from './types';
import { forceClearWatchingUpdatesCache } from './watching-updates';

// 重新导出类型以保持API兼容性
export type { PlayRecord, SkipSegment, EpisodeSkipConfig } from './types';

// 全局错误触发函数
function triggerGlobalError(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('globalError', {
        detail: { message },
      })
    );
  }
}

// 为了向后兼容，保留UserStats类型别名
export type UserStats = UserPlayStat;

// ---- 收藏类型 ----
export interface Favorite {
  title: string;
  source_name: string;
  year: string;
  cover: string;
  total_episodes: number;
  save_time: number;
  search_title?: string;
  origin?: 'vod' | 'live';
}

// ---- 缓存数据结构 ----
interface CacheData<T> {
  data: T;
  timestamp: number;
  version: string;
}

interface UserCacheStore {
  playRecords?: CacheData<Record<string, PlayRecord>>;
  favorites?: CacheData<Record<string, Favorite>>;
  searchHistory?: CacheData<string[]>;
  skipConfigs?: CacheData<Record<string, EpisodeSkipConfig>>;
  userStats?: CacheData<UserStats>; // 添加用户统计数据缓存
  // 注意：豆瓣缓存已迁移到统一存储，不再需要这里的缓存结构
}

// ---- 常量 ----
const PLAY_RECORDS_KEY = 'moontv_play_records';
const FAVORITES_KEY = 'moontv_favorites';
const SEARCH_HISTORY_KEY = 'moontv_search_history';
const USER_STATS_KEY = 'moontv_user_stats'; // 添加用户统计数据存储键

// 缓存相关常量
const CACHE_PREFIX = 'moontv_cache_';
const CACHE_VERSION = '1.0.0';
const CACHE_EXPIRE_TIME = 60 * 60 * 1000; // 一小时缓存过期
const PLAY_RECORDS_CACHE_EXPIRE_TIME = 5 * 60 * 1000; // 播放记录5分钟缓存过期，与新集数更新检查保持一致

// 注意：豆瓣缓存配置已迁移到 douban.client.ts

// ---- 环境变量 ----
const STORAGE_TYPE = (() => {
  const raw =
    (typeof window !== 'undefined' &&
      (window as any).RUNTIME_CONFIG?.STORAGE_TYPE) ||
    (process.env.STORAGE_TYPE as
      | 'localstorage'
      | 'redis'
      | 'upstash'
      | 'kvrocks'
      | undefined) ||
    'localstorage';
  return raw;
})();

// ---------------- 搜索历史相关常量 ----------------
// 搜索历史最大保存条数
const SEARCH_HISTORY_LIMIT = 20;

// ---- 内存缓存（用于 Kvrocks/Upstash 模式）----
const memoryCache: Map<string, UserCacheStore> = new Map();

// ---- 缓存管理器 ----
class HybridCacheManager {
  private static instance: HybridCacheManager;

  static getInstance(): HybridCacheManager {
    if (!HybridCacheManager.instance) {
      HybridCacheManager.instance = new HybridCacheManager();
    }
    return HybridCacheManager.instance;
  }

  /**
   * 获取当前用户名
   */
  private getCurrentUsername(): string | null {
    const authInfo = getAuthInfoFromBrowserCookie();
    return authInfo?.username || null;
  }

  /**
   * 生成用户专属的缓存key
   */
  private getUserCacheKey(username: string): string {
    return `${CACHE_PREFIX}${username}`;
  }

  /**
   * 获取用户缓存数据
   */
  private getUserCache(username: string): UserCacheStore {
    if (typeof window === 'undefined') return {};

    // 🔧 优化：Kvrocks/Upstash 模式使用内存缓存
    if (STORAGE_TYPE !== 'localstorage') {
      const cacheKey = this.getUserCacheKey(username);
      return memoryCache.get(cacheKey) || {};
    }

    try {
      const cacheKey = this.getUserCacheKey(username);
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.warn('获取用户缓存失败:', error);
      return {};
    }
  }

  /**
   * 保存用户缓存数据
   */
  private saveUserCache(username: string, cache: UserCacheStore): void {
    if (typeof window === 'undefined') return;

    // 🔧 优化：Kvrocks/Upstash 模式使用内存缓存（不占用 localStorage，避免 QuotaExceededError）
    if (STORAGE_TYPE !== 'localstorage') {
      const cacheKey = this.getUserCacheKey(username);
      memoryCache.set(cacheKey, cache);
      return;
    }

    try {
      // 检查缓存大小，超过15MB时清理旧数据
      const cacheSize = JSON.stringify(cache).length;
      if (cacheSize > 15 * 1024 * 1024) {
        console.warn('缓存过大，清理旧数据');
        this.cleanOldCache(cache);
      }

      const cacheKey = this.getUserCacheKey(username);
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    } catch (error) {
      console.warn('保存用户缓存失败:', error);
      // 存储空间不足时清理缓存后重试
      if (
        error instanceof DOMException &&
        error.name === 'QuotaExceededError'
      ) {
        this.clearAllCache();
        try {
          const cacheKey = this.getUserCacheKey(username);
          localStorage.setItem(cacheKey, JSON.stringify(cache));
        } catch (retryError) {
          console.error('重试保存缓存仍然失败:', retryError);
        }
      }
    }
  }

  /**
   * 清理过期缓存数据
   */
  private cleanOldCache(cache: UserCacheStore): void {
    const now = Date.now();
    const maxAge = 60 * 24 * 60 * 60 * 1000; // 两个月

    // 清理过期的播放记录缓存
    if (cache.playRecords && now - cache.playRecords.timestamp > maxAge) {
      delete cache.playRecords;
    }

    // 清理过期的收藏缓存
    if (cache.favorites && now - cache.favorites.timestamp > maxAge) {
      delete cache.favorites;
    }

    // 注意：豆瓣缓存已迁移到统一存储，不再在这里处理
  }

  /**
   * 清理所有缓存
   */
  private clearAllCache(): void {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith('moontv_cache_')) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid<T>(cache: CacheData<T>, cacheType?: 'playRecords'): boolean {
    const now = Date.now();
    const expireTime = cacheType === 'playRecords' ? PLAY_RECORDS_CACHE_EXPIRE_TIME : CACHE_EXPIRE_TIME;
    return (
      cache.version === CACHE_VERSION &&
      now - cache.timestamp < expireTime
    );
  }

  /**
   * 创建缓存数据
   */
  private createCacheData<T>(data: T): CacheData<T> {
    return {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    };
  }

  /**
   * 获取缓存的播放记录
   */
  getCachedPlayRecords(): Record<string, PlayRecord> | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.playRecords;

    if (cached && this.isCacheValid(cached, 'playRecords')) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存播放记录
   */
  cachePlayRecords(data: Record<string, PlayRecord>): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.playRecords = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 获取缓存的收藏
   */
  getCachedFavorites(): Record<string, Favorite> | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.favorites;

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存收藏
   */
  cacheFavorites(data: Record<string, Favorite>): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.favorites = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 获取缓存的搜索历史
   */
  getCachedSearchHistory(): string[] | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.searchHistory;

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存搜索历史
   */
  cacheSearchHistory(data: string[]): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.searchHistory = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 获取缓存的跳过片头片尾配置
   */
  getCachedSkipConfigs(): Record<string, EpisodeSkipConfig> | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.skipConfigs;

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存跳过片头片尾配置
   */
  cacheSkipConfigs(data: Record<string, EpisodeSkipConfig>): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.skipConfigs = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 获取缓存的用户统计数据
   */
  getCachedUserStats(): UserStats | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.userStats;

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存用户统计数据
   */
  cacheUserStats(data: UserStats): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.userStats = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 清除指定用户的所有缓存
   */
  clearUserCache(username?: string): void {
    const targetUsername = username || this.getCurrentUsername();
    if (!targetUsername) return;

    try {
      const cacheKey = this.getUserCacheKey(targetUsername);
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.warn('清除用户缓存失败:', error);
    }
  }

  /**
   * 强制刷新播放记录缓存
   * 用于新集数检测时确保数据同步
   * @param immediate 是否立即清除缓存（而不是仅标记过期）
   */
  forceRefreshPlayRecordsCache(immediate = false): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    if (userCache.playRecords) {
      if (immediate) {
        // 🔧 优化：立即清除缓存，而不是仅标记过期
        delete userCache.playRecords;
        console.log('✅ 立即清除播放记录缓存');
      } else {
        // 将播放记录缓存时间戳设置为过期
        userCache.playRecords.timestamp = 0;
        console.log('✅ 标记播放记录缓存为过期');
      }
      this.saveUserCache(username, userCache);
    }
  }

  /**
   * 清除所有过期缓存
   */
  clearExpiredCaches(): void {
    if (typeof window === 'undefined') return;

    try {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) {
          try {
            const cache = JSON.parse(localStorage.getItem(key) || '{}');
            // 检查是否有任何缓存数据过期
            let hasValidData = false;
            for (const [, cacheData] of Object.entries(cache)) {
              if (cacheData && this.isCacheValid(cacheData as CacheData<any>)) {
                hasValidData = true;
                break;
              }
            }
            if (!hasValidData) {
              keysToRemove.push(key);
            }
          } catch {
            // 解析失败的缓存也删除
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn('清除过期缓存失败:', error);
    }
  }

  // ---- 豆瓣数据缓存方法 ----

  // 注意：以下豆瓣缓存相关方法已废弃，豆瓣缓存已迁移到统一存储系统
  // 这些方法保留是为了向后兼容，但不再使用

  /**
   * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
   */
  private isDoubanCacheValid<T>(cache: CacheData<T>, type: 'details' | 'lists'): boolean {
    return false; // 始终返回false，强制使用新的缓存系统
  }

  /**
   * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
   */
  /**
   * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
   */
  getDoubanDetails(id: string): any | null {
    return null; // 不再使用本地缓存，返回null强制使用新系统
  }

  /**
   * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
   */
  setDoubanDetails(id: string, data: any): void {
    // 不再使用本地缓存，空实现
  }

  /**
   * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
   */
  getDoubanList(cacheKey: string): any | null {
    return null; // 不再使用本地缓存，返回null强制使用新系统
  }

  /**
   * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
   */
  setDoubanList(cacheKey: string, data: any): void {
    // 不再使用本地缓存，空实现
  }

  /**
   * 生成豆瓣列表缓存键
   */
  static generateDoubanListKey(type: string, tag: string, pageStart: number, pageSize: number): string {
    return `${type}:${tag}:${pageStart}:${pageSize}`;
  }

  /**
   * 清除豆瓣缓存
   */
  /**
   * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
   */
  clearDoubanCache(): void {
    // 不再使用本地缓存，空实现
  }
}

// 获取缓存管理器实例
const cacheManager = HybridCacheManager.getInstance();

// ---- 错误处理辅助函数 ----
/**
 * 数据库操作失败时的通用错误处理
 * 立即从数据库刷新对应类型的缓存以保持数据一致性
 */
async function handleDatabaseOperationFailure(
  dataType: 'playRecords' | 'favorites' | 'searchHistory',
  error: any
): Promise<void> {
  console.error(`数据库操作失败 (${dataType}):`, error);
  triggerGlobalError(`数据库操作失败`);

  try {
    let freshData: any;
    let eventName: string;

    switch (dataType) {
      case 'playRecords':
        freshData = await fetchFromApi<Record<string, PlayRecord>>(
          `/api/playrecords`
        );
        cacheManager.cachePlayRecords(freshData);
        eventName = 'playRecordsUpdated';
        break;
      case 'favorites':
        freshData = await fetchFromApi<Record<string, Favorite>>(
          `/api/favorites`
        );
        cacheManager.cacheFavorites(freshData);
        eventName = 'favoritesUpdated';
        break;
      case 'searchHistory':
        freshData = await fetchFromApi<string[]>(`/api/searchhistory`);
        cacheManager.cacheSearchHistory(freshData);
        eventName = 'searchHistoryUpdated';
        break;
    }

    // 触发更新事件通知组件
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: freshData,
      })
    );
  } catch (refreshErr) {
    console.error(`刷新${dataType}缓存失败:`, refreshErr);
    triggerGlobalError(`刷新${dataType}缓存失败`);
  }
}

// 页面加载时清理过期缓存
if (typeof window !== 'undefined') {
  setTimeout(() => cacheManager.clearExpiredCaches(), 1000);
}

// ---- 工具函数 ----
/**
 * 通用的 fetch 函数，处理 401 状态码自动跳转登录
 */
async function fetchWithAuth(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const res = await fetch(url, options);
  if (!res.ok) {
    // 如果是 401 未授权，跳转到登录页面
    if (res.status === 401) {
      // 调用 logout 接口
      try {
        await fetch('/api/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('注销请求失败:', error);
      }
      const currentUrl = window.location.pathname + window.location.search;
      const loginUrl = new URL('/login', window.location.origin);
      loginUrl.searchParams.set('redirect', currentUrl);
      window.location.href = loginUrl.toString();
      throw new Error('用户未授权，已跳转到登录页面');
    }
    throw new Error(`请求 ${url} 失败: ${res.status}`);
  }
  return res;
}

async function fetchFromApi<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(path);
  return (await res.json()) as T;
}

/**
 * 生成存储key
 */
export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

/**
 * 检查是否应该更新原始集数
 *
 * 设计思路：original_episodes 记录的是"用户上次知道的总集数"
 * 当用户观看了超出原始集数的新集数后，说明用户已经"消费"了这次更新提醒
 * 此时应该更新 original_episodes，这样下次更新才能准确计算新增集数
 *
 * 更新条件（简化版，只需满足以下条件）：
 * 1. 用户观看了超过原始集数的集数（说明看了新更新的内容）
 * 2. 用户观看进度有实质性进展（防止误触）
 *
 * 关键修复：移除了对 newRecord.total_episodes 的依赖，因为前端传入的 total_episodes
 * 可能不是最新的。只要用户看了超过原始集数的集数，就说明用户已经知道了新集数的存在，
 * 应该从数据库/API获取最新的 total_episodes 并更新 original_episodes
 *
 * 例子：
 * - 第一次看到第6集 → original_episodes = 6
 * - 更新到第8集 → 提醒"2集新增"
 * - 用户看第7集 → original_episodes 更新为 8（用户已消费这次更新）
 * - 下次更新到第10集 → 提醒"2集新增"（10-8），而不是"4集新增"（10-6）
 */
async function checkShouldUpdateOriginalEpisodes(existingRecord: PlayRecord, newRecord: PlayRecord, recordKey: string): Promise<{ shouldUpdate: boolean; latestTotalEpisodes: number }> {
  // 🔑 关键修复：从数据库读取最新的 original_episodes，不信任缓存中的值
  let originalEpisodes = existingRecord.original_episodes || existingRecord.total_episodes;
  let freshRecord = existingRecord;

  try {
    console.log(`🔍 从数据库读取最新的 original_episodes (${recordKey})...`);
    const freshRecordsResponse = await fetch('/api/playrecords');
    if (freshRecordsResponse.ok) {
      const freshRecords = await freshRecordsResponse.json();

      // 🔑 关键修复：直接用 recordKey 匹配，确保是同一个 source+id
      if (freshRecords[recordKey]) {
        freshRecord = freshRecords[recordKey];
        originalEpisodes = freshRecord.original_episodes || freshRecord.total_episodes;

        // 🔧 自动修复：如果 original_episodes 大于当前 total_episodes，说明之前存错了
        if (originalEpisodes > freshRecord.total_episodes) {
          console.warn(`⚠️ 检测到错误数据：original_episodes(${originalEpisodes}) > total_episodes(${freshRecord.total_episodes})，自动修正为 ${freshRecord.total_episodes}`);
          originalEpisodes = freshRecord.total_episodes;
          freshRecord.original_episodes = freshRecord.total_episodes;
        }

        console.log(`📚 从数据库读取到最新 original_episodes: ${existingRecord.title} (${recordKey}) = ${originalEpisodes}集`);
      } else {
        console.warn(`⚠️ 数据库中未找到记录: ${recordKey}`);
      }
    }
  } catch (error) {
    console.warn('⚠️ 从数据库读取 original_episodes 失败，使用缓存值', error);
  }

  // 条件1：用户观看进度超过了原始集数（说明用户已经看了新更新的集数）
  const hasWatchedBeyondOriginal = newRecord.index > originalEpisodes;

  // 条件2：用户观看进度有实质性进展（不是刚点进去就退出）
  const hasSignificantProgress = newRecord.play_time > 60; // 观看超过1分钟

  if (!hasWatchedBeyondOriginal || !hasSignificantProgress) {
    console.log(`✗ 不更新原始集数: ${existingRecord.title} - 观看第${newRecord.index}集，原始${originalEpisodes}集 (${hasWatchedBeyondOriginal ? '观看时间不足' : '未超过原始集数'})`);
    return { shouldUpdate: false, latestTotalEpisodes: newRecord.total_episodes };
  }

  // 用户看了超过原始集数的集数，获取最新的 total_episodes
  console.log(`🔍 用户看了第${newRecord.index}集（超过原始${originalEpisodes}集），从数据库获取最新集数...`);

  try {
    const latestTotalEpisodes = Math.max(freshRecord.total_episodes, originalEpisodes);
    console.log(`✓ 应更新原始集数: ${existingRecord.title} - 用户看了第${newRecord.index}集（超过原始${originalEpisodes}集），数据库最新集数${freshRecord.total_episodes}集 → 更新原始集数为${latestTotalEpisodes}集`);

    return { shouldUpdate: true, latestTotalEpisodes };
  } catch (error) {
    console.error('❌ 获取最新集数失败:', error);
    // 失败时仍然更新，使用保守的值
    return { shouldUpdate: true, latestTotalEpisodes: Math.max(newRecord.total_episodes, originalEpisodes) };
  }
}

// ---- API ----
/**
 * 读取全部播放记录。
 * 非本地存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 * 在服务端渲染阶段 (window === undefined) 时返回空对象，避免报错。
 * @param forceRefresh 是否强制从服务器获取最新数据（跳过缓存）
 */
export async function getAllPlayRecords(forceRefresh = false): Promise<Record<string, PlayRecord>> {
  // 服务器端渲染阶段直接返回空，交由客户端 useEffect 再行请求
  if (typeof window === 'undefined') {
    return {};
  }

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 🔧 优化：如果强制刷新，跳过缓存直接获取最新数据
    if (forceRefresh) {
      try {
        console.log('🔄 强制刷新播放记录，跳过缓存直接从API获取');
        const freshData = await fetchFromApi<Record<string, PlayRecord>>(
          `/api/playrecords`
        );
        cacheManager.cachePlayRecords(freshData);
        // 触发数据更新事件
        window.dispatchEvent(
          new CustomEvent('playRecordsUpdated', {
            detail: freshData,
          })
        );
        return freshData;
      } catch (err) {
        console.error('强制刷新播放记录失败:', err);
        triggerGlobalError('获取播放记录失败');
        // 失败时尝试返回缓存数据作为降级
        const cachedData = cacheManager.getCachedPlayRecords();
        return cachedData || {};
      }
    }

    // 优先从缓存获取数据
    const cachedData = cacheManager.getCachedPlayRecords();

    if (cachedData) {
      // 返回缓存数据，同时后台异步更新
      fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`)
        .then((freshData) => {
          // 只有数据真正不同时才更新缓存
          if (JSON.stringify(cachedData) !== JSON.stringify(freshData)) {
            cacheManager.cachePlayRecords(freshData);
            // 触发数据更新事件，供组件监听
            window.dispatchEvent(
              new CustomEvent('playRecordsUpdated', {
                detail: freshData,
              })
            );
          }
        })
        .catch((err) => {
          console.warn('后台同步播放记录失败:', err);
          triggerGlobalError('后台同步播放记录失败');
        });

      return cachedData;
    } else {
      // 缓存为空，直接从 API 获取并缓存
      try {
        const freshData = await fetchFromApi<Record<string, PlayRecord>>(
          `/api/playrecords`
        );
        cacheManager.cachePlayRecords(freshData);
        return freshData;
      } catch (err) {
        console.error('获取播放记录失败:', err);
        triggerGlobalError('获取播放记录失败');
        return {};
      }
    }
  }

  // localstorage 模式
  try {
    const raw = localStorage.getItem(PLAY_RECORDS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PlayRecord>;
  } catch (err) {
    console.error('读取播放记录失败:', err);
    triggerGlobalError('读取播放记录失败');
    return {};
  }
}

/**
 * 保存播放记录。
 * 数据库存储模式下使用乐观更新：先更新缓存（立即生效），再异步同步到数据库。
 */
export async function savePlayRecord(
  source: string,
  id: string,
  record: PlayRecord
): Promise<void> {
  const key = generateStorageKey(source, id);

  // 获取现有播放记录，检查是否需要设置原始集数
  const existingRecords = await getAllPlayRecords();
  const existingRecord = existingRecords[key];

  // 🔑 关键修复：确保 original_episodes 一定有值，否则新集数检测永远失效
  // 优先级：传入值 > 现有记录值 > 当前 total_episodes
  if (!record.original_episodes || record.original_episodes <= 0) {
    if (existingRecord?.original_episodes && existingRecord.original_episodes > 0) {
      // 使用现有记录的 original_episodes
      record.original_episodes = existingRecord.original_episodes;
      console.log(`✓ 使用现有原始集数: ${key} = ${existingRecord.original_episodes}集`);
    } else {
      // 首次保存或旧数据补充：使用当前 total_episodes
      record.original_episodes = record.total_episodes;
      console.log(`✓ 设置原始集数: ${key} = ${record.total_episodes}集 ${existingRecord ? '(补充旧数据)' : '(首次保存)'}`);
    }
  }

  // 检查用户是否观看了超过原始集数的新集数
  if (existingRecord?.original_episodes && existingRecord.original_episodes > 0) {
    const updateResult = await checkShouldUpdateOriginalEpisodes(existingRecord, record, key);
    if (updateResult.shouldUpdate) {
      record.original_episodes = updateResult.latestTotalEpisodes;
      // 🔑 同时更新 total_episodes 为最新值
      record.total_episodes = updateResult.latestTotalEpisodes;
      console.log(`✓ 更新原始集数: ${key} = ${existingRecord.original_episodes}集 -> ${updateResult.latestTotalEpisodes}集（用户已观看新集数）`);

      // 🔑 标记需要清除缓存（在数据库更新成功后执行）
      (record as any)._shouldClearCache = true;
    }
  }

  // 数据库存储模式：乐观更新策略（包括 redis、upstash 和 kvrocks）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    const cachedRecords = cacheManager.getCachedPlayRecords() || {};
    cachedRecords[key] = record;
    cacheManager.cachePlayRecords(cachedRecords);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('playRecordsUpdated', {
        detail: cachedRecords,
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth('/api/playrecords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, record }),
      });

      // 🔑 关键修复：数据库更新成功后，如果更新了 original_episodes，清除相关缓存
      if ((record as any)._shouldClearCache) {
        try {
          // 🔧 优化：使用新函数清除 watching-updates 缓存
          forceClearWatchingUpdatesCache();

          // 🔑 关键：立即清除播放记录缓存，确保下次检查使用最新数据
          cacheManager.forceRefreshPlayRecordsCache(true);

          // 🔧 优化：立即获取最新数据并更新缓存，触发更新事件
          const freshData = await fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`);
          cacheManager.cachePlayRecords(freshData);
          window.dispatchEvent(
            new CustomEvent('playRecordsUpdated', {
              detail: freshData,
            })
          );

          console.log('✅ 数据库更新成功，已清除 watching-updates 和播放记录缓存，并刷新最新数据');
          delete (record as any)._shouldClearCache;
        } catch (cacheError) {
          console.warn('清除缓存失败:', cacheError);
        }
      } else {
        // 🔧 优化：即使没有 _shouldClearCache 标志，也要从服务器同步最新数据以确保缓存一致性
        // 特别是对于 kvrocks 等需要实时同步的场景
        try {
          const freshData = await fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`);
          // 只有数据真正不同时才更新缓存
          if (JSON.stringify(cachedRecords) !== JSON.stringify(freshData)) {
            cacheManager.cachePlayRecords(freshData);
            window.dispatchEvent(
              new CustomEvent('playRecordsUpdated', {
                detail: freshData,
              })
            );
            console.log('✅ 播放记录已同步最新数据');
          }
        } catch (syncError) {
          console.warn('同步最新播放记录失败:', syncError);
        }
      }

      // 异步更新用户统计数据（不阻塞主流程）
      updateUserStats(record).catch(err => {
        console.warn('更新用户统计数据失败:', err);
      });
    } catch (err) {
      await handleDatabaseOperationFailure('playRecords', err);
      triggerGlobalError('保存播放记录失败');
      throw err;
    }
    return;
  }

  // localstorage 模式
  if (typeof window === 'undefined') {
    console.warn('无法在服务端保存播放记录到 localStorage');
    return;
  }

  try {
    const allRecords = await getAllPlayRecords();
    allRecords[key] = record;
    localStorage.setItem(PLAY_RECORDS_KEY, JSON.stringify(allRecords));
    window.dispatchEvent(
      new CustomEvent('playRecordsUpdated', {
        detail: allRecords,
      })
    );

    // 异步更新用户统计数据（不阻塞主流程）
    updateUserStats(record).catch(err => {
      console.warn('更新用户统计数据失败:', err);
    });
  } catch (err) {
    console.error('保存播放记录失败:', err);
    triggerGlobalError('保存播放记录失败');
    throw err;
  }
}

/**
 * 删除播放记录。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deletePlayRecord(
  source: string,
  id: string
): Promise<void> {
  const key = generateStorageKey(source, id);

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    const cachedRecords = cacheManager.getCachedPlayRecords() || {};
    delete cachedRecords[key];
    cacheManager.cachePlayRecords(cachedRecords);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('playRecordsUpdated', {
        detail: cachedRecords,
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth(`/api/playrecords?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      await handleDatabaseOperationFailure('playRecords', err);
      triggerGlobalError('删除播放记录失败');
      throw err;
    }
    return;
  }

  // localstorage 模式
  if (typeof window === 'undefined') {
    console.warn('无法在服务端删除播放记录到 localStorage');
    return;
  }

  try {
    const allRecords = await getAllPlayRecords();
    delete allRecords[key];
    localStorage.setItem(PLAY_RECORDS_KEY, JSON.stringify(allRecords));
    window.dispatchEvent(
      new CustomEvent('playRecordsUpdated', {
        detail: allRecords,
      })
    );
  } catch (err) {
    console.error('删除播放记录失败:', err);
    triggerGlobalError('删除播放记录失败');
    throw err;
  }
}

/* ---------------- 搜索历史相关 API ---------------- */

/**
 * 获取搜索历史。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getSearchHistory(): Promise<string[]> {
  // 服务器端渲染阶段直接返回空
  if (typeof window === 'undefined') {
    return [];
  }

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 优先从缓存获取数据
    const cachedData = cacheManager.getCachedSearchHistory();

    if (cachedData) {
      // 返回缓存数据，同时后台异步更新
      fetchFromApi<string[]>(`/api/searchhistory`)
        .then((freshData) => {
          // 只有数据真正不同时才更新缓存
          if (JSON.stringify(cachedData) !== JSON.stringify(freshData)) {
            cacheManager.cacheSearchHistory(freshData);
            // 触发数据更新事件
            window.dispatchEvent(
              new CustomEvent('searchHistoryUpdated', {
                detail: freshData,
              })
            );
          }
        })
        .catch((err) => {
          console.warn('后台同步搜索历史失败:', err);
          triggerGlobalError('后台同步搜索历史失败');
        });

      return cachedData;
    } else {
      // 缓存为空，直接从 API 获取并缓存
      try {
        const freshData = await fetchFromApi<string[]>(`/api/searchhistory`);
        cacheManager.cacheSearchHistory(freshData);
        return freshData;
      } catch (err) {
        console.error('获取搜索历史失败:', err);
        triggerGlobalError('获取搜索历史失败');
        return [];
      }
    }
  }

  // localStorage 模式
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as string[];
    // 仅返回字符串数组
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.error('读取搜索历史失败:', err);
    triggerGlobalError('读取搜索历史失败');
    return [];
  }
}

/**
 * 将关键字添加到搜索历史。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function addSearchHistory(keyword: string): Promise<void> {
  const trimmed = keyword.trim();
  if (!trimmed) return;

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    const cachedHistory = cacheManager.getCachedSearchHistory() || [];
    const newHistory = [trimmed, ...cachedHistory.filter((k) => k !== trimmed)];
    // 限制长度
    if (newHistory.length > SEARCH_HISTORY_LIMIT) {
      newHistory.length = SEARCH_HISTORY_LIMIT;
    }
    cacheManager.cacheSearchHistory(newHistory);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('searchHistoryUpdated', {
        detail: newHistory,
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth('/api/searchhistory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword: trimmed }),
      });
    } catch (err) {
      await handleDatabaseOperationFailure('searchHistory', err);
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') return;

  try {
    const history = await getSearchHistory();
    const newHistory = [trimmed, ...history.filter((k) => k !== trimmed)];
    // 限制长度
    if (newHistory.length > SEARCH_HISTORY_LIMIT) {
      newHistory.length = SEARCH_HISTORY_LIMIT;
    }
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
    window.dispatchEvent(
      new CustomEvent('searchHistoryUpdated', {
        detail: newHistory,
      })
    );
  } catch (err) {
    console.error('保存搜索历史失败:', err);
    triggerGlobalError('保存搜索历史失败');
  }
}

/**
 * 清空搜索历史。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function clearSearchHistory(): Promise<void> {
  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    cacheManager.cacheSearchHistory([]);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('searchHistoryUpdated', {
        detail: [],
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth(`/api/searchhistory`, {
        method: 'DELETE',
      });
    } catch (err) {
      await handleDatabaseOperationFailure('searchHistory', err);
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SEARCH_HISTORY_KEY);
  window.dispatchEvent(
    new CustomEvent('searchHistoryUpdated', {
      detail: [],
    })
  );
}

/**
 * 删除单条搜索历史。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deleteSearchHistory(keyword: string): Promise<void> {
  const trimmed = keyword.trim();
  if (!trimmed) return;

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    const cachedHistory = cacheManager.getCachedSearchHistory() || [];
    const newHistory = cachedHistory.filter((k) => k !== trimmed);
    cacheManager.cacheSearchHistory(newHistory);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('searchHistoryUpdated', {
        detail: newHistory,
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth(
        `/api/searchhistory?keyword=${encodeURIComponent(trimmed)}`,
        {
          method: 'DELETE',
        }
      );
    } catch (err) {
      await handleDatabaseOperationFailure('searchHistory', err);
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') return;

  try {
    const history = await getSearchHistory();
    const newHistory = history.filter((k) => k !== trimmed);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
    window.dispatchEvent(
      new CustomEvent('searchHistoryUpdated', {
        detail: newHistory,
      })
    );
  } catch (err) {
    console.error('删除搜索历史失败:', err);
    triggerGlobalError('删除搜索历史失败');
  }
}

// ---------------- 收藏相关 API ----------------

/**
 * 获取全部收藏。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getAllFavorites(): Promise<Record<string, Favorite>> {
  // 服务器端渲染阶段直接返回空
  if (typeof window === 'undefined') {
    return {};
  }

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 优先从缓存获取数据
    const cachedData = cacheManager.getCachedFavorites();

    if (cachedData) {
      // 返回缓存数据，同时后台异步更新
      fetchFromApi<Record<string, Favorite>>(`/api/favorites`)
        .then((freshData) => {
          // 只有数据真正不同时才更新缓存
          if (JSON.stringify(cachedData) !== JSON.stringify(freshData)) {
            cacheManager.cacheFavorites(freshData);
            // 触发数据更新事件
            window.dispatchEvent(
              new CustomEvent('favoritesUpdated', {
                detail: freshData,
              })
            );
          }
        })
        .catch((err) => {
          console.warn('后台同步收藏失败:', err);
          triggerGlobalError('后台同步收藏失败');
        });

      return cachedData;
    } else {
      // 缓存为空，直接从 API 获取并缓存
      try {
        const freshData = await fetchFromApi<Record<string, Favorite>>(
          `/api/favorites`
        );
        cacheManager.cacheFavorites(freshData);
        return freshData;
      } catch (err) {
        console.error('获取收藏失败:', err);
        triggerGlobalError('获取收藏失败');
        return {};
      }
    }
  }

  // localStorage 模式
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Favorite>;
  } catch (err) {
    console.error('读取收藏失败:', err);
    triggerGlobalError('读取收藏失败');
    return {};
  }
}

/**
 * 保存收藏。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function saveFavorite(
  source: string,
  id: string,
  favorite: Favorite
): Promise<void> {
  const key = generateStorageKey(source, id);

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    const cachedFavorites = cacheManager.getCachedFavorites() || {};
    cachedFavorites[key] = favorite;
    cacheManager.cacheFavorites(cachedFavorites);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: cachedFavorites,
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth('/api/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, favorite }),
      });
    } catch (err) {
      await handleDatabaseOperationFailure('favorites', err);
      triggerGlobalError('保存收藏失败');
      throw err;
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') {
    console.warn('无法在服务端保存收藏到 localStorage');
    return;
  }

  try {
    const allFavorites = await getAllFavorites();
    allFavorites[key] = favorite;
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(allFavorites));
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: allFavorites,
      })
    );
  } catch (err) {
    console.error('保存收藏失败:', err);
    triggerGlobalError('保存收藏失败');
    throw err;
  }
}

/**
 * 删除收藏。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deleteFavorite(
  source: string,
  id: string
): Promise<void> {
  const key = generateStorageKey(source, id);

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    const cachedFavorites = cacheManager.getCachedFavorites() || {};
    delete cachedFavorites[key];
    cacheManager.cacheFavorites(cachedFavorites);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: cachedFavorites,
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth(`/api/favorites?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      await handleDatabaseOperationFailure('favorites', err);
      triggerGlobalError('删除收藏失败');
      throw err;
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') {
    console.warn('无法在服务端删除收藏到 localStorage');
    return;
  }

  try {
    const allFavorites = await getAllFavorites();
    delete allFavorites[key];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(allFavorites));
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: allFavorites,
      })
    );
  } catch (err) {
    console.error('删除收藏失败:', err);
    triggerGlobalError('删除收藏失败');
    throw err;
  }
}

/**
 * 判断是否已收藏。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function isFavorited(
  source: string,
  id: string
): Promise<boolean> {
  const key = generateStorageKey(source, id);

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    const cachedFavorites = cacheManager.getCachedFavorites();

    if (cachedFavorites) {
      // 返回缓存数据，同时后台异步更新
      fetchFromApi<Record<string, Favorite>>(`/api/favorites`)
        .then((freshData) => {
          // 只有数据真正不同时才更新缓存
          if (JSON.stringify(cachedFavorites) !== JSON.stringify(freshData)) {
            cacheManager.cacheFavorites(freshData);
            // 触发数据更新事件
            window.dispatchEvent(
              new CustomEvent('favoritesUpdated', {
                detail: freshData,
              })
            );
          }
        })
        .catch((err) => {
          console.warn('后台同步收藏失败:', err);
          triggerGlobalError('后台同步收藏失败');
        });

      return !!cachedFavorites[key];
    } else {
      // 缓存为空，直接从 API 获取并缓存
      try {
        const freshData = await fetchFromApi<Record<string, Favorite>>(
          `/api/favorites`
        );
        cacheManager.cacheFavorites(freshData);
        return !!freshData[key];
      } catch (err) {
        console.error('检查收藏状态失败:', err);
        triggerGlobalError('检查收藏状态失败');
        return false;
      }
    }
  }

  // localStorage 模式
  const allFavorites = await getAllFavorites();
  return !!allFavorites[key];
}

/**
 * 清空全部播放记录
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function clearAllPlayRecords(): Promise<void> {
  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    cacheManager.cachePlayRecords({});

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('playRecordsUpdated', {
        detail: {},
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth(`/api/playrecords`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      await handleDatabaseOperationFailure('playRecords', err);
      triggerGlobalError('清空播放记录失败');
      throw err;
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PLAY_RECORDS_KEY);
  window.dispatchEvent(
    new CustomEvent('playRecordsUpdated', {
      detail: {},
    })
  );
}

/**
 * 清空全部收藏
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function clearAllFavorites(): Promise<void> {
  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    cacheManager.cacheFavorites({});

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: {},
      })
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth(`/api/favorites`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      await handleDatabaseOperationFailure('favorites', err);
      triggerGlobalError('清空收藏失败');
      throw err;
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FAVORITES_KEY);
  window.dispatchEvent(
    new CustomEvent('favoritesUpdated', {
      detail: {},
    })
  );
}

// ---------------- 混合缓存辅助函数 ----------------

/**
 * 清除当前用户的所有缓存数据
 * 用于用户登出时清理缓存
 */
export function clearUserCache(): void {
  if (STORAGE_TYPE !== 'localstorage') {
    cacheManager.clearUserCache();
  }
}

/**
 * 强制刷新播放记录缓存
 * 用于新集数检测时确保数据同步
 * @param immediate 是否立即清除缓存（而不是仅标记过期）
 */
export function forceRefreshPlayRecordsCache(immediate = false): void {
  cacheManager.forceRefreshPlayRecordsCache(immediate);
}

/**
 * 强制从服务器获取最新播放记录（同步方法）
 * 用于需要立即获取最新数据的场景
 */
export async function forceGetFreshPlayRecords(): Promise<Record<string, PlayRecord>> {
  // 立即清除缓存
  forceRefreshPlayRecordsCache(true);
  // 强制从服务器获取
  return getAllPlayRecords(true);
}

/**
 * 手动刷新所有缓存数据
 * 强制从服务器重新获取数据并更新缓存
 */
export async function refreshAllCache(): Promise<void> {
  if (STORAGE_TYPE === 'localstorage') return;

  try {
    // 并行刷新所有数据
    const [playRecords, favorites, searchHistory, skipConfigs] =
      await Promise.allSettled([
        fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`),
        fetchFromApi<Record<string, Favorite>>(`/api/favorites`),
        fetchFromApi<string[]>(`/api/searchhistory`),
        fetchFromApi<Record<string, EpisodeSkipConfig>>(`/api/skipconfigs`),
      ]);

    if (playRecords.status === 'fulfilled') {
      cacheManager.cachePlayRecords(playRecords.value);
      window.dispatchEvent(
        new CustomEvent('playRecordsUpdated', {
          detail: playRecords.value,
        })
      );
    }

    if (favorites.status === 'fulfilled') {
      cacheManager.cacheFavorites(favorites.value);
      window.dispatchEvent(
        new CustomEvent('favoritesUpdated', {
          detail: favorites.value,
        })
      );
    }

    if (searchHistory.status === 'fulfilled') {
      cacheManager.cacheSearchHistory(searchHistory.value);
      window.dispatchEvent(
        new CustomEvent('searchHistoryUpdated', {
          detail: searchHistory.value,
        })
      );
    }

    if (skipConfigs.status === 'fulfilled') {
      cacheManager.cacheSkipConfigs(skipConfigs.value);
      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: skipConfigs.value,
        })
      );
    }
  } catch (err) {
    console.error('刷新缓存失败:', err);
    triggerGlobalError('刷新缓存失败');
  }
}

/**
 * 获取缓存状态信息
 * 用于调试和监控缓存健康状态
 */
export function getCacheStatus(): {
  hasPlayRecords: boolean;
  hasFavorites: boolean;
  hasSearchHistory: boolean;
  hasSkipConfigs: boolean;
  hasUserStats: boolean;
  username: string | null;
} {
  if (STORAGE_TYPE === 'localstorage') {
    return {
      hasPlayRecords: false,
      hasFavorites: false,
      hasSearchHistory: false,
      hasSkipConfigs: false,
      hasUserStats: false,
      username: null,
    };
  }

  const authInfo = getAuthInfoFromBrowserCookie();
  return {
    hasPlayRecords: !!cacheManager.getCachedPlayRecords(),
    hasFavorites: !!cacheManager.getCachedFavorites(),
    hasSearchHistory: !!cacheManager.getCachedSearchHistory(),
    hasSkipConfigs: !!cacheManager.getCachedSkipConfigs(),
    hasUserStats: !!cacheManager.getCachedUserStats(),
    username: authInfo?.username || null,
  };
}

// ---------------- React Hook 辅助类型 ----------------

export type CacheUpdateEvent =
  | 'playRecordsUpdated'
  | 'favoritesUpdated'
  | 'searchHistoryUpdated'
  | 'skipConfigsUpdated'
  | 'userStatsUpdated';

/**
 * 用于 React 组件监听数据更新的事件监听器
 * 使用方法：
 *
 * useEffect(() => {
 *   const unsubscribe = subscribeToDataUpdates('playRecordsUpdated', (data) => {
 *     setPlayRecords(data);
 *   });
 *   return unsubscribe;
 * }, []);
 */
export function subscribeToDataUpdates<T>(
  eventType: CacheUpdateEvent,
  callback: (data: T) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => { };
  }

  const handleUpdate = (event: CustomEvent) => {
    callback(event.detail);
  };

  window.addEventListener(eventType, handleUpdate as EventListener);

  return () => {
    window.removeEventListener(eventType, handleUpdate as EventListener);
  };
}

/**
 * 预加载所有用户数据到缓存
 * 适合在应用启动时调用，提升后续访问速度
 */
export async function preloadUserData(): Promise<void> {
  if (STORAGE_TYPE === 'localstorage') return;

  // 检查是否已有有效缓存，避免重复请求
  const status = getCacheStatus();
  if (
    status.hasPlayRecords &&
    status.hasFavorites &&
    status.hasSearchHistory &&
    status.hasSkipConfigs
  ) {
    return;
  }

  // 后台静默预加载，不阻塞界面
  refreshAllCache().catch((err) => {
    console.warn('预加载用户数据失败:', err);
    triggerGlobalError('预加载用户数据失败');
  });
}

// ---------------- 跳过片头片尾配置相关 API ----------------

/**
 * 获取跳过片头片尾配置。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getSkipConfig(
  source: string,
  id: string
): Promise<EpisodeSkipConfig | null> {
  try {
    // 服务器端渲染阶段直接返回空
    if (typeof window === 'undefined') {
      return null;
    }

    const key = generateStorageKey(source, id);

    if (STORAGE_TYPE === 'localstorage') {
      // localStorage 模式
      const raw = localStorage.getItem('moontv_skip_configs');
      if (!raw) return null;
      const allConfigs = JSON.parse(raw) as Record<string, EpisodeSkipConfig>;
      return allConfigs[key] || null;
    } else {
      // 数据库模式：先查缓存
      const cachedConfigs = cacheManager.getCachedSkipConfigs();

      if (cachedConfigs && cachedConfigs[key]) {
        return cachedConfigs[key];
      }

      // 缓存未命中，从服务器获取
      const authInfo = getAuthInfoFromBrowserCookie();
      if (!authInfo?.username) {
        return null;
      }

      const response = await fetch('/api/skipconfigs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get',
          key,
          username: authInfo.username,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const config = data.config;

      // 更新缓存
      if (config) {
        const allConfigs = cachedConfigs || {};
        allConfigs[key] = config;
        cacheManager.cacheSkipConfigs(allConfigs);
      }

      return config;
    }
  } catch (err) {
    console.error('获取跳过配置失败:', err);
    return null;
  }
}

/**
 * 保存跳过片头片尾配置。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function saveSkipConfig(
  source: string,
  id: string,
  config: EpisodeSkipConfig
): Promise<void> {
  try {
    const key = generateStorageKey(source, id);

    if (STORAGE_TYPE === 'localstorage') {
      // localStorage 模式
      if (typeof window === 'undefined') {
        console.warn('无法在服务端保存跳过配置到 localStorage');
        return;
      }
      const raw = localStorage.getItem('moontv_skip_configs');
      const configs = raw ? (JSON.parse(raw) as Record<string, EpisodeSkipConfig>) : {};
      configs[key] = config;
      localStorage.setItem('moontv_skip_configs', JSON.stringify(configs));
      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: configs,
        })
      );
    } else {
      // 数据库模式：乐观更新策略
      const cachedConfigs = cacheManager.getCachedSkipConfigs() || {};
      cachedConfigs[key] = config;
      cacheManager.cacheSkipConfigs(cachedConfigs);

      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: cachedConfigs,
        })
      );

      // 异步同步到数据库
      const authInfo = getAuthInfoFromBrowserCookie();
      if (!authInfo?.username) {
        throw new Error('未登录');
      }

      const response = await fetch('/api/skipconfigs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'set',
          key,
          config,
          username: authInfo.username,
        }),
      });

      if (!response.ok) {
        throw new Error('保存跳过配置失败');
      }
    }
  } catch (err) {
    console.error('保存跳过配置失败:', err);
    triggerGlobalError('保存跳过配置失败');
    throw err;
  }
}

/**
 * 获取所有跳过片头片尾配置。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getAllSkipConfigs(): Promise<Record<string, EpisodeSkipConfig>> {
  // 服务器端渲染阶段直接返回空
  if (typeof window === 'undefined') {
    return {};
  }

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 优先从缓存获取数据
    const cachedData = cacheManager.getCachedSkipConfigs();

    if (cachedData) {
      // 返回缓存数据，同时后台异步更新
      fetchFromApi<Record<string, EpisodeSkipConfig>>(`/api/skipconfigs`)
        .then((freshData) => {
          // 只有数据真正不同时才更新缓存
          if (JSON.stringify(cachedData) !== JSON.stringify(freshData)) {
            cacheManager.cacheSkipConfigs(freshData);
            // 触发数据更新事件
            window.dispatchEvent(
              new CustomEvent('skipConfigsUpdated', {
                detail: freshData,
              })
            );
          }
        })
        .catch((err) => {
          console.warn('后台同步跳过片头片尾配置失败:', err);
          triggerGlobalError('后台同步跳过片头片尾配置失败');
        });

      return cachedData;
    } else {
      // 缓存为空，直接从 API 获取并缓存
      try {
        const freshData = await fetchFromApi<Record<string, EpisodeSkipConfig>>(
          `/api/skipconfigs`
        );
        cacheManager.cacheSkipConfigs(freshData);
        return freshData;
      } catch (err) {
        console.error('获取跳过片头片尾配置失败:', err);
        triggerGlobalError('获取跳过片头片尾配置失败');
        return {};
      }
    }
  }

  // localStorage 模式
  try {
    const raw = localStorage.getItem('moontv_skip_configs');
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, EpisodeSkipConfig>;
  } catch (err) {
    console.error('读取跳过片头片尾配置失败:', err);
    triggerGlobalError('读取跳过片头片尾配置失败');
    return {};
  }
}

/**
 * 删除跳过片头片尾配置。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deleteSkipConfig(
  source: string,
  id: string
): Promise<void> {
  try {
    const key = generateStorageKey(source, id);

    if (STORAGE_TYPE === 'localstorage') {
      // localStorage 模式
      if (typeof window === 'undefined') {
        console.warn('无法在服务端删除跳过配置');
        return;
      }
      const raw = localStorage.getItem('moontv_skip_configs');
      if (raw) {
        const configs = JSON.parse(raw) as Record<string, EpisodeSkipConfig>;
        delete configs[key];
        localStorage.setItem('moontv_skip_configs', JSON.stringify(configs));
        window.dispatchEvent(
          new CustomEvent('skipConfigsUpdated', {
            detail: configs,
          })
        );
      }
    } else {
      // 数据库模式：乐观更新策略
      const cachedConfigs = cacheManager.getCachedSkipConfigs() || {};
      delete cachedConfigs[key];
      cacheManager.cacheSkipConfigs(cachedConfigs);

      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: cachedConfigs,
        })
      );

      // 异步同步到数据库
      const authInfo = getAuthInfoFromBrowserCookie();
      if (!authInfo?.username) {
        throw new Error('未登录');
      }

      const response = await fetch('/api/skipconfigs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          key,
          username: authInfo.username,
        }),
      });

      if (!response.ok) {
        throw new Error('删除跳过配置失败');
      }
    }
  } catch (err) {
    console.error('删除跳过片头片尾配置失败:', err);
    triggerGlobalError('删除跳过片头片尾配置失败');
    throw err;
  }
}

// ---- 豆瓣数据缓存导出函数 ----

/**
 * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
 * @param id 豆瓣ID
 * @returns null
 */
export function getDoubanDetailsCache(id: string): any | null {
  return null; // 不再使用本地缓存
}

/**
 * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
 * @param id 豆瓣ID
 * @param data 详情数据
 */
export function setDoubanDetailsCache(id: string, data: any): void {
  // 不再使用本地缓存
}

/**
 * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
 * @param type 类型 (tv/movie)
 * @param tag 标签
 * @param pageStart 页面起始位置
 * @param pageSize 页面大小
 * @returns null
 */
export function getDoubanListCache(type: string, tag: string, pageStart: number, pageSize: number): any | null {
  return null; // 不再使用本地缓存
}

/**
 * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
 * @param type 类型 (tv/movie) 
 * @param tag 标签
 * @param pageStart 页面起始位置
 * @param pageSize 页面大小
 * @param data 列表数据
 */
export function setDoubanListCache(type: string, tag: string, pageStart: number, pageSize: number, data: any): void {
  // 不再使用本地缓存
}

/**
 * @deprecated 豆瓣缓存已迁移到统一存储，请使用 douban.client.ts 中的方法
 */
export function clearDoubanCache(): void {
  // 不再使用本地缓存
}

// ---------------- 用户统计相关 API ----------------

/**
 * 计算注册天数
 * 基于注册时间或首次观看时间计算用户已注册的自然天数
 */
export function calculateRegistrationDays(startDate: number): number {
  if (!startDate || startDate <= 0) return 0;

  const firstDate = new Date(startDate);
  const currentDate = new Date();

  // 获取自然日（忽略时分秒）
  const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
  const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

  // 计算自然日差值并加1
  const daysDiff = Math.floor((currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
  return daysDiff + 1;
}

/**
 * 获取用户统计数据
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据
 */
export async function getUserStats(forceRefresh = false): Promise<UserStats> {
  try {
    // 如果强制刷新，清除缓存
    if (forceRefresh) {
      const authInfo = getAuthInfoFromBrowserCookie();
      if (authInfo?.username) {
        cacheManager.clearUserCache(authInfo.username);
      }
    }

    // 数据库存储模式：使用混合缓存策略
    if (STORAGE_TYPE !== 'localstorage') {
      // 先尝试从缓存获取
      const cached = cacheManager.getCachedUserStats();
      if (cached && !forceRefresh) {
        // 后台异步更新
        fetchFromApi<UserStats>('/api/user/my-stats')
          .then((freshData) => {
            if (JSON.stringify(cached) !== JSON.stringify(freshData)) {
              cacheManager.cacheUserStats(freshData);
              window.dispatchEvent(new CustomEvent('userStatsUpdated', {
                detail: freshData
              }));
            }
          })
          .catch((err) => {
            console.warn('后台同步用户统计数据失败:', err);
          });

        return cached;
      }

      // 缓存为空或强制刷新，从服务器获取
      try {
        const freshData = await fetchFromApi<UserStats>('/api/user/my-stats');
        cacheManager.cacheUserStats(freshData);
        return freshData;
      } catch (error) {
        console.error('获取用户统计数据失败:', error);

        // 如果服务器请求失败，检查是否有缓存的统计数据
        const cachedStats = cacheManager.getCachedUserStats();
        if (cachedStats) {
          console.log('使用缓存的统计数据:', cachedStats);
          return cachedStats;
        }

        // 基于本地观看记录计算统计数据
        return await calculateStatsFromLocalData();
      }
    }

    // localStorage 模式
    return await calculateStatsFromLocalData();
  } catch (error) {
    console.error('获取用户统计数据失败:', error);
    return await calculateStatsFromLocalData();
  }
}

/**
 * 基于本地观看记录计算统计数据
 */
async function calculateStatsFromLocalData(): Promise<UserStats> {
  try {
    const playRecords = await getAllPlayRecords();
    const records = Object.values(playRecords);

    if (records.length === 0) {
      return {
        username: getAuthInfoFromBrowserCookie()?.username || 'unknown',
        totalWatchTime: 0,
        totalPlays: 0,
        lastPlayTime: 0,
        recentRecords: [],
        avgWatchTime: 0,
        mostWatchedSource: '',
        totalMovies: 0,
        firstWatchDate: Date.now(),
        lastUpdateTime: Date.now()
      };
    }

    const totalWatchTime = records.reduce((sum, record) => sum + record.play_time, 0);
    const totalMovies = new Set(records.map(r => `${r.title}_${r.source_name}_${r.year}`)).size;
    const firstWatchDate = Math.min(...records.map(r => r.save_time));
    const lastPlayTime = Math.max(...records.map(r => r.save_time));
    const totalPlays = records.length;

    // 计算最常观看的来源
    const sourceCounts = records.reduce((acc, record) => {
      acc[record.source_name] = (acc[record.source_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const mostWatchedSource = Object.entries(sourceCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || '';

    // 获取最近的播放记录（最多10条），确保search_title字段存在
    const recentRecords = records
      .sort((a, b) => b.save_time - a.save_time)
      .slice(0, 10)
      .map(record => ({
        ...record,
        search_title: record.search_title || record.title // 确保search_title有值
      }));

    const stats: UserStats = {
      username: getAuthInfoFromBrowserCookie()?.username || 'unknown',
      totalWatchTime,
      totalPlays,
      lastPlayTime,
      recentRecords,
      avgWatchTime: totalPlays > 0 ? totalWatchTime / totalPlays : 0,
      mostWatchedSource,
      totalMovies,
      firstWatchDate,
      lastUpdateTime: Date.now()
    };

    // 缓存计算结果
    if (STORAGE_TYPE !== 'localstorage') {
      cacheManager.cacheUserStats(stats);
    }

    return stats;
  } catch (error) {
    console.error('计算本地统计数据失败:', error);
    return {
      username: getAuthInfoFromBrowserCookie()?.username || 'unknown',
      totalWatchTime: 0,
      totalPlays: 0,
      lastPlayTime: 0,
      recentRecords: [],
      avgWatchTime: 0,
      mostWatchedSource: '',
      totalMovies: 0,
      firstWatchDate: Date.now(),
      lastUpdateTime: Date.now()
    };
  }
}

/**
 * 更新用户统计数据
 * 智能计算观看时间增量，支持防刷机制
 */
export async function updateUserStats(record: PlayRecord): Promise<void> {
  console.log('=== updateUserStats 开始执行 ===', {
    title: record.title,
    source: record.source_name,
    year: record.year,
    index: record.index,
    playTime: record.play_time,
    totalTime: record.total_time,
    saveTime: new Date(record.save_time).toLocaleString()
  });

  try {
    // 统一使用相同的movieKey格式，确保影片数量统计准确
    const movieKey = `${record.title}_${record.source_name}_${record.year}`;
    console.log('生成的movieKey:', movieKey);

    // 使用包含集数信息的键来缓存每一集的播放进度
    const episodeKey = `${record.source_name}+${record.title}-${record.year}+${record.index}`;
    const lastProgressKey = `last_progress_${episodeKey}`;
    const lastUpdateTimeKey = `last_update_time_${episodeKey}`;

    // 获取上次播放进度和更新时间
    const lastProgress = parseInt(localStorage.getItem(lastProgressKey) || '0');
    const lastUpdateTime = parseInt(localStorage.getItem(lastUpdateTimeKey) || '0');

    // 计算观看时间增量
    let watchTimeIncrement = 0;
    const currentTime = Date.now();
    const timeSinceLastUpdate = currentTime - lastUpdateTime;

    // 放宽更新条件：只要有实际播放进度变化就更新
    if (timeSinceLastUpdate < 10 * 1000 && Math.abs(record.play_time - lastProgress) < 1) {
      console.log(`跳过统计数据更新: 时间间隔过短 (${Math.floor(timeSinceLastUpdate / 1000)}s) 且进度无变化`);
      return;
    }

    // 改进的观看时间计算逻辑
    if (record.play_time > lastProgress) {
      // 正常播放进度增加
      watchTimeIncrement = record.play_time - lastProgress;

      // 如果进度增加过大（可能是快进），限制增量
      if (watchTimeIncrement > 300) { // 超过5分钟认为是快进
        watchTimeIncrement = Math.min(watchTimeIncrement, Math.floor(timeSinceLastUpdate / 1000) + 60);
        console.log(`检测到快进操作: ${record.title} 第${record.index}集 - 进度增加: ${record.play_time - lastProgress}s, 限制增量为: ${watchTimeIncrement}s`);
      }
    } else if (record.play_time < lastProgress) {
      // 进度回退的情况（重新观看、跳转等）
      if (timeSinceLastUpdate > 1 * 60 * 1000) { // 1分钟以上认为是重新开始观看
        watchTimeIncrement = Math.min(record.play_time, 60); // 重新观看最多给60秒增量
        console.log(`检测到重新观看: ${record.title} 第${record.index}集 - 当前进度: ${record.play_time}s, 上次进度: ${lastProgress}s`);
      } else {
        // 短时间内的回退，可能是快退操作，不给增量
        watchTimeIncrement = 0;
        console.log(`检测到快退操作: ${record.title} 第${record.index}集 - 不计入观看时间`);
      }
    } else {
      // 进度相同，可能是暂停后继续，给予少量时间增量
      if (timeSinceLastUpdate > 30 * 1000) { // 30秒以上认为有观看时间
        watchTimeIncrement = Math.min(Math.floor(timeSinceLastUpdate / 1000), 60); // 最多1分钟
        console.log(`检测到暂停后继续: ${record.title} 第${record.index}集 - 使用增量: ${watchTimeIncrement}s`);
      }
    }

    console.log(`观看时间增量计算: ${record.title} 第${record.index}集 - 增量: ${watchTimeIncrement}s`);

    // 只要有观看时间增量就更新统计数据
    if (watchTimeIncrement > 0) {
      console.log(`发送统计数据更新请求: 增量 ${watchTimeIncrement}s, movieKey: ${movieKey}`);

      // 数据库存储模式：发送到服务器更新
      if (STORAGE_TYPE !== 'localstorage') {
        try {
          const response = await fetchWithAuth('/api/user/my-stats', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              watchTime: watchTimeIncrement,
              movieKey: movieKey,
              timestamp: currentTime
            }),
          });

          if (response.ok) {
            const responseData = await response.json();
            console.log(`API响应数据:`, responseData);

            // 更新localStorage中的上次播放进度和更新时间
            localStorage.setItem(lastProgressKey, record.play_time.toString());
            localStorage.setItem(lastUpdateTimeKey, currentTime.toString());

            // 立即更新缓存中的用户统计数据
            if (responseData.userStats) {
              cacheManager.cacheUserStats(responseData.userStats);
              console.log(`更新用户统计数据缓存:`, responseData.userStats);

              // 触发用户统计数据更新事件
              window.dispatchEvent(new CustomEvent('userStatsUpdated', {
                detail: responseData.userStats
              }));
            }
          } else {
            console.error(`更新用户统计数据失败: ${response.status}`);
            // API调用失败时，仍然更新本地进度记录
            localStorage.setItem(lastProgressKey, record.play_time.toString());
            localStorage.setItem(lastUpdateTimeKey, currentTime.toString());
          }
        } catch (error) {
          console.error('统计数据更新请求异常:', error);
          // 即使API请求失败，也要更新本地进度记录
          localStorage.setItem(lastProgressKey, record.play_time.toString());
          localStorage.setItem(lastUpdateTimeKey, currentTime.toString());
        }
      } else {
        // localStorage 模式：本地更新统计数据
        try {
          const currentStats = await getUserStats();
          const updatedStats: UserStats = {
            ...currentStats,
            totalWatchTime: currentStats.totalWatchTime + watchTimeIncrement,
            lastUpdateTime: currentTime
          };

          // 检查是否有新的影片
          const playRecords = await getAllPlayRecords();
          const uniqueMovies = new Set(Object.values(playRecords).map(r => `${r.title}_${r.source_name}_${r.year}`));
          updatedStats.totalMovies = uniqueMovies.size;

          // 保存到localStorage
          localStorage.setItem(USER_STATS_KEY, JSON.stringify(updatedStats));

          // 更新进度记录
          localStorage.setItem(lastProgressKey, record.play_time.toString());
          localStorage.setItem(lastUpdateTimeKey, currentTime.toString());

          // 触发更新事件
          window.dispatchEvent(new CustomEvent('userStatsUpdated', {
            detail: updatedStats
          }));

          console.log(`本地统计数据已更新: 增量 ${watchTimeIncrement}s`);
        } catch (error) {
          console.error('本地统计数据更新失败:', error);
        }
      }
    } else {
      console.log(`无需更新用户统计数据: 增量为 ${watchTimeIncrement}s`);
      // 即使没有增量，也要更新时间戳和进度
      localStorage.setItem(lastProgressKey, record.play_time.toString());
      localStorage.setItem(lastUpdateTimeKey, currentTime.toString());
    }
  } catch (error) {
    console.error('更新用户统计数据失败:', error);
    // 静默失败，不影响用户体验
  }
}

/**
 * 清除用户统计数据
 */
export async function clearUserStats(): Promise<void> {
  try {
    if (STORAGE_TYPE !== 'localstorage') {
      // 从服务器清除
      await fetchWithAuth('/api/user/my-stats', {
        method: 'DELETE',
      });

      // 清除本地缓存
      const authInfo = getAuthInfoFromBrowserCookie();
      if (authInfo?.username) {
        cacheManager.clearUserCache(authInfo.username);
      }
    } else {
      // localStorage 模式
      localStorage.removeItem(USER_STATS_KEY);
    }

    // 触发统计数据清除事件
    window.dispatchEvent(new CustomEvent('userStatsUpdated', {
      detail: {
        username: getAuthInfoFromBrowserCookie()?.username || 'unknown',
        totalWatchTime: 0,
        totalPlays: 0,
        lastPlayTime: 0,
        recentRecords: [],
        avgWatchTime: 0,
        mostWatchedSource: '',
        totalMovies: 0,
        firstWatchDate: Date.now(),
        lastUpdateTime: Date.now()
      }
    }));
  } catch (error) {
    console.error('清除用户统计数据失败:', error);
    throw error;
  }
}

// ============================================================================
