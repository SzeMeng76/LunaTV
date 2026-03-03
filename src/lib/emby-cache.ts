// Emby 缓存模块 - 用于缓存 Emby 媒体库数据

// 缓存条目接口
export interface EmbyCachedEntry<T> {
  expiresAt: number;
  data: T;
}

// 缓存配置
const EMBY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6小时
const EMBY_VIEWS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1天
const EMBY_CACHE: Map<string, EmbyCachedEntry<any>> = new Map();
const EMBY_VIEWS_CACHE_KEY = 'emby:views';

/**
 * 生成 Emby 列表缓存键
 */
function makeListCacheKey(page: number, pageSize: number, parentId?: string, embyKey?: string): string {
  const keyPrefix = embyKey ? `emby:${embyKey}` : 'emby';
  return parentId ? `${keyPrefix}:list:${page}:${pageSize}:${parentId}` : `${keyPrefix}:list:${page}:${pageSize}`;
}

/**
 * 获取缓存的 Emby 列表数据
 */
export function getCachedEmbyList(
  page: number,
  pageSize: number,
  parentId?: string,
  embyKey?: string
): any | null {
  const key = makeListCacheKey(page, pageSize, parentId, embyKey);
  const entry = EMBY_CACHE.get(key);
  if (!entry) return null;

  // 检查是否过期
  if (entry.expiresAt <= Date.now()) {
    EMBY_CACHE.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * 设置缓存的 Emby 列表数据
 */
export function setCachedEmbyList(
  page: number,
  pageSize: number,
  data: any,
  parentId?: string,
  embyKey?: string
): void {
  const now = Date.now();
  const key = makeListCacheKey(page, pageSize, parentId, embyKey);
  EMBY_CACHE.set(key, {
    expiresAt: now + EMBY_CACHE_TTL_MS,
    data,
  });
}

/**
 * 清除所有 Emby 缓存
 */
export function clearEmbyCache(): { cleared: number } {
  const size = EMBY_CACHE.size;
  EMBY_CACHE.clear();
  return { cleared: size };
}

/**
 * 获取缓存的 Emby 媒体库列表
 */
export function getCachedEmbyViews(embyKey = 'default'): any | null {
  const cacheKey = `${EMBY_VIEWS_CACHE_KEY}:${embyKey}`;
  const entry = EMBY_CACHE.get(cacheKey);
  if (!entry) return null;

  // 检查是否过期
  if (entry.expiresAt <= Date.now()) {
    EMBY_CACHE.delete(cacheKey);
    return null;
  }

  return entry.data;
}

/**
 * 设置缓存的 Emby 媒体库列表
 */
export function setCachedEmbyViews(embyKey = 'default', data: any): void {
  const now = Date.now();
  const cacheKey = `${EMBY_VIEWS_CACHE_KEY}:${embyKey}`;
  EMBY_CACHE.set(cacheKey, {
    expiresAt: now + EMBY_VIEWS_CACHE_TTL_MS,
    data,
  });
}

// 搜索索引缓存相关

interface MediaIndexItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  releaseDate?: string;
  overview?: string;
  voteAverage?: number;
  rating?: number;
  mediaType: 'movie' | 'tv';
}

function makeIndexCacheKey(embyKey?: string): string {
  return embyKey ? `emby:${embyKey}:index` : 'emby:index';
}

/**
 * 获取缓存的全量媒体索引
 */
export function getCachedMediaIndex(embyKey?: string): MediaIndexItem[] | null {
  const key = makeIndexCacheKey(embyKey);
  const entry = EMBY_CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    EMBY_CACHE.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * 设置全量媒体索引缓存
 */
export function setCachedMediaIndex(data: MediaIndexItem[], embyKey?: string): void {
  const key = makeIndexCacheKey(embyKey);
  EMBY_CACHE.set(key, {
    expiresAt: Date.now() + EMBY_CACHE_TTL_MS,
    data,
  });
}

/**
 * 获取缓存统计信息
 */
export function getEmbyCacheStats(): {
  size: number;
  keys: string[];
} {
  return {
    size: EMBY_CACHE.size,
    keys: Array.from(EMBY_CACHE.keys()),
  };
}
