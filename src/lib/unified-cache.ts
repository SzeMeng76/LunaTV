/**
 * 统一缓存管理器 - 支持多层缓存策略
 *
 * 缓存层级：
 * 1. 内存缓存 (Map) - ~0ms，页面刷新失效
 * 2. localStorage - ~5ms，持久化存储
 *
 * 特性：
 * - LRU 淘汰策略
 * - 自动过期检测
 * - 智能容量管理
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

class UnifiedCache {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private maxMemoryEntries = 100; // 最大内存缓存条目数
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 启动定期清理（每5分钟）
    this.startAutoCleanup();
  }

  /**
   * 获取缓存数据
   * @param key 缓存键
   * @returns 缓存数据或 null
   */
  get<T>(key: string): T | null {
    const now = Date.now();

    // 1. 优先从内存缓存读取 (~0ms)
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (now < memEntry.expiresAt) {
        return memEntry.data;
      } else {
        // 过期，删除
        this.memoryCache.delete(key);
      }
    }

    // 2. 从 localStorage 读取 (~5ms)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const entry: CacheEntry<T> = JSON.parse(cached);

          if (now < entry.expiresAt) {
            // 回填内存缓存
            this.memoryCache.set(key, entry);
            this.enforceMemoryLimit();
            return entry.data;
          } else {
            // 过期，删除
            localStorage.removeItem(key);
          }
        }
      } catch (error) {
        console.warn('[UnifiedCache] Failed to read from localStorage:', error);
      }
    }

    return null;
  }

  /**
   * 设置缓存数据
   * @param key 缓存键
   * @param data 缓存数据
   * @param ttl 过期时间（秒），默认 3600 秒 (1小时)
   */
  set<T>(key: string, data: T, ttl = 3600): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      data,
      expiresAt: now + ttl * 1000,
      createdAt: now,
    };

    // 1. 写入内存缓存
    this.memoryCache.set(key, entry);
    this.enforceMemoryLimit();

    // 2. 写入 localStorage（持久化）
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(key, JSON.stringify(entry));
      } catch (error) {
        // localStorage 可能已满，尝试清理后重试
        console.warn('[UnifiedCache] localStorage full, attempting cleanup');
        this.cleanupLocalStorage();

        try {
          localStorage.setItem(key, JSON.stringify(entry));
        } catch (retryError) {
          console.error('[UnifiedCache] Failed to write to localStorage after cleanup:', retryError);
        }
      }
    }
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): void {
    this.memoryCache.delete(key);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn('[UnifiedCache] Failed to delete from localStorage:', error);
      }
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.memoryCache.clear();

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        // 只清除缓存相关的 key，保留其他数据
        const keysToDelete: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && this.isCacheKey(key)) {
            keysToDelete.push(key);
          }
        }
        keysToDelete.forEach(key => localStorage.removeItem(key));
      } catch (error) {
        console.warn('[UnifiedCache] Failed to clear localStorage:', error);
      }
    }
  }

  /**
   * 判断是否是缓存键（可自定义规则）
   */
  private isCacheKey(key: string): boolean {
    // 识别常见的缓存键前缀
    return key.startsWith('douban-') ||
           key.startsWith('shortdrama-') ||
           key.startsWith('tmdb-') ||
           key.startsWith('cache:') ||
           key.startsWith('cached-');
  }

  /**
   * 强制执行内存缓存大小限制 (LRU 策略)
   */
  private enforceMemoryLimit(): void {
    if (this.memoryCache.size <= this.maxMemoryEntries) {
      return;
    }

    // 按创建时间排序，删除最老的条目
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].createdAt - b[1].createdAt);

    const toRemove = this.memoryCache.size - this.maxMemoryEntries;
    for (let i = 0; i < toRemove; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }

  /**
   * 清理 localStorage 中过期的缓存
   */
  private cleanupLocalStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    const now = Date.now();
    const keysToDelete: string[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !this.isCacheKey(key)) continue;

        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const entry: CacheEntry<any> = JSON.parse(cached);
            if (now >= entry.expiresAt) {
              keysToDelete.push(key);
            }
          }
        } catch {
          // 解析失败的条目也删除
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => localStorage.removeItem(key));

      if (keysToDelete.length > 0) {
        console.log(`[UnifiedCache] Cleaned up ${keysToDelete.length} expired entries from localStorage`);
      }
    } catch (error) {
      console.warn('[UnifiedCache] Failed to cleanup localStorage:', error);
    }
  }

  /**
   * 启动自动清理
   */
  private startAutoCleanup(): void {
    if (typeof window === 'undefined') return;

    // 每1小时清理一次
    this.cleanupInterval = setInterval(() => {
      this.cleanupLocalStorage();

      // 清理内存中过期的条目
      const now = Date.now();
      for (const [key, entry] of this.memoryCache.entries()) {
        if (now >= entry.expiresAt) {
          this.memoryCache.delete(key);
        }
      }
    }, 60 * 60 * 1000);

    // 避免阻止 Node.js 进程退出
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * 停止自动清理
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    let localStorageCount = 0;
    let localStorageSize = 0;

    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && this.isCacheKey(key)) {
          localStorageCount++;
          const value = localStorage.getItem(key);
          if (value) {
            localStorageSize += value.length;
          }
        }
      }
    }

    return {
      memory: {
        count: this.memoryCache.size,
        maxEntries: this.maxMemoryEntries,
      },
      localStorage: {
        count: localStorageCount,
        size: localStorageSize,
        sizeFormatted: this.formatBytes(localStorageSize),
      },
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// 导出单例
export const globalCache = new UnifiedCache();
