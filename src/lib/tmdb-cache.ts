import { ClientCache } from './client-cache';

// TMDB数据缓存配置（秒）
const TMDB_CACHE_EXPIRE = {
  actor_search: 6 * 60 * 60,    // 演员搜索6小时（较稳定）
  person_details: 24 * 60 * 60, // 人物详情24小时（基本不变）
  movie_credits: 12 * 60 * 60,  // 演员电影作品12小时（较稳定）
  tv_credits: 12 * 60 * 60,     // 演员电视剧作品12小时（较稳定）
  movie_details: 24 * 60 * 60,  // 电影详情24小时（基本不变）
  tv_details: 24 * 60 * 60,     // 电视剧详情24小时（基本不变）
  trending: 2 * 60 * 60,        // 热门内容2小时（更新频繁）
  discover: 4 * 60 * 60,        // 发现内容4小时
};

// 缓存工具函数
function getCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return `tmdb-${prefix}-${sortedParams}`;
}

// 统一缓存获取方法
async function getCache(key: string): Promise<any | null> {
  try {
    // 优先从统一存储获取
    const cached = await ClientCache.get(key);
    if (cached) return cached;

    // 兜底：从localStorage获取（兼容性）
    if (typeof localStorage !== 'undefined') {
      const localCached = localStorage.getItem(key);
      if (localCached) {
        try {
          const { data, expire } = JSON.parse(localCached);
          if (Date.now() <= expire) {
            return data;
          }
          localStorage.removeItem(key);
        } catch (e) {
          localStorage.removeItem(key);
        }
      }
    }

    return null;
  } catch (e) {
    console.warn('获取TMDB缓存失败:', e);
    return null;
  }
}

// 统一缓存设置方法
async function setCache(key: string, data: any, expireSeconds: number): Promise<void> {
  try {
    console.log(`🔄 TMDB缓存设置: ${key}`);

    // 主要存储：统一存储
    await ClientCache.set(key, data, expireSeconds);
    console.log(`✅ TMDB缓存已存储到数据库: ${key}`);

    // 兜底存储：localStorage（兼容性，短期缓存）
    if (typeof localStorage !== 'undefined') {
      try {
        const cacheData = {
          data,
          expire: Date.now() + expireSeconds * 1000,
          created: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
        console.log(`✅ TMDB缓存已存储到localStorage: ${key}`);
      } catch (e) {
        console.warn(`⚠️ TMDB缓存localStorage存储失败: ${key}`, e);
        // localStorage可能满了，忽略错误
      }
    }
  } catch (e) {
    console.warn('设置TMDB缓存失败:', key, e);
  }
}

// 清理过期缓存
async function cleanExpiredCache(): Promise<void> {
  try {
    // 清理统一存储中的过期缓存
    await ClientCache.clearExpired('tmdb-');

    // 清理localStorage中的过期缓存
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tmdb-')) {
          try {
            const cached = localStorage.getItem(key);
            if (cached) {
              const { expire } = JSON.parse(cached);
              if (Date.now() > expire) {
                keysToRemove.push(key);
              }
            }
          } catch (e) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      if (keysToRemove.length > 0) {
        console.log(`LocalStorage 清理了 ${keysToRemove.length} 个过期的TMDB缓存项`);
      }
    }
  } catch (e) {
    console.warn('清理TMDB过期缓存失败:', e);
  }
}

// 获取缓存状态信息
export function getTMDBCacheStats(): {
  totalItems: number;
  totalSize: number;
  byType: Record<string, number>;
} {
  if (typeof localStorage === 'undefined') {
    return { totalItems: 0, totalSize: 0, byType: {} };
  }

  const keys = Object.keys(localStorage).filter(key =>
    key.startsWith('tmdb-')
  );
  const byType: Record<string, number> = {};
  let totalSize = 0;

  keys.forEach(key => {
    const type = key.split('-')[1]; // tmdb-{type}-{params}
    byType[type] = (byType[type] || 0) + 1;

    const data = localStorage.getItem(key);
    if (data) {
      totalSize += data.length;
    }
  });

  return {
    totalItems: keys.length,
    totalSize,
    byType
  };
}

// 清理所有TMDB缓存
export function clearTMDBCache(): void {
  if (typeof localStorage === 'undefined') return;

  const keys = Object.keys(localStorage).filter(key =>
    key.startsWith('tmdb-')
  );
  keys.forEach(key => localStorage.removeItem(key));
  console.log(`清理了 ${keys.length} 个TMDB缓存项`);
}

// 初始化缓存系统
async function initTMDBCache(): Promise<void> {
  // 立即清理一次过期缓存
  await cleanExpiredCache();

  // 每10分钟清理一次过期缓存
  setInterval(() => cleanExpiredCache(), 10 * 60 * 1000);

  console.log('TMDB缓存系统已初始化');
}

// 在模块加载时初始化缓存系统
if (typeof window !== 'undefined') {
  initTMDBCache().catch(console.error);
}

export {
  TMDB_CACHE_EXPIRE,
  getCacheKey,
  getCache,
  setCache,
  cleanExpiredCache,
};