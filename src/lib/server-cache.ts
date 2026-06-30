/**
 * 服务端内存缓存层
 * 用于减少 cron 任务中的重复数据库查询
 *
 * 注意：这是进程内缓存，仅在单个 Node.js 进程中有效
 * 适用于 cron 任务等短期批量操作场景
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // 毫秒
}

interface CacheOptions {
  /**
   * 是否克隆数据（防止外部修改影响缓存）
   * 默认 true，适合缓存对象/数组
   * 设为 false 可提升性能，但需确保不会修改缓存数据
   */
  useClones?: boolean;
}

class ServerCache {
  private cache = new Map<string, CacheEntry<any>>();
  private options: CacheOptions;

  constructor(options: CacheOptions = {}) {
    this.options = {
      useClones: true,
      ...options,
    };
  }

  /**
   * 深度克隆对象（简单实现，适合JSON可序列化的数据）
   */
  private clone<T>(data: T): T {
    if (!this.options.useClones) return data;

    // 对于基本类型，直接返回
    if (data === null || typeof data !== 'object') {
      return data;
    }

    // 使用 JSON 序列化进行深拷贝（简单高效）
    // 注意：不支持 Date、RegExp、Function 等特殊类型
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      // 如果序列化失败，返回原数据
      return data;
    }
  }

  /**
   * 获取缓存数据
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // 返回克隆的数据，防止外部修改
    return this.clone(entry.data) as T;
  }

  /**
   * 设置缓存数据
   */
  set<T>(key: string, data: T, ttl: number = 60000): void {
    // 存储克隆的数据，防止外部修改影响缓存
    this.cache.set(key, {
      data: this.clone(data),
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 包装函数：自动缓存异步操作结果
   */
  async wrap<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 60000
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttl);
    // 返回克隆的数据
    return this.clone(data) as T;
  }
}

// 导出单例实例（用于 cron 任务等场景）
// 默认开启克隆，确保数据安全
export const cronCache = new ServerCache({ useClones: true });
