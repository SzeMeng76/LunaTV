import { db } from './db';

// 日历缓存键
const CALENDAR_DATA_KEY = 'calendar:release_calendar_data';
const CALENDAR_TIME_KEY = 'calendar:release_calendar_time';
const CACHE_DURATION = 8 * 60 * 60 * 1000; // 8小时缓存（参考TMDb API标准）

// 获取存储类型
function getStorageType(): string {
  return process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
}

// 获取数据库存储实例
function getDatabaseStorage(): any {
  try {
    const storage = (db as any).storage;
    return storage && (storage.client || storage) ? storage : null;
  } catch (error) {
    console.warn('获取数据库存储实例失败:', error);
    return null;
  }
}

// 日历数据库缓存管理器
export class CalendarCacheManager {

  // 保存日历数据到数据库
  static async saveCalendarData(data: any): Promise<boolean> {
    const storageType = getStorageType();

    // 如果是localStorage模式，跳过数据库缓存
    if (storageType === 'localstorage') {
      console.log('⚠️ localStorage模式，跳过数据库缓存');
      return false;
    }

    const storage = getDatabaseStorage();
    if (!storage) {
      console.warn('❌ 数据库存储不可用');
      return false;
    }

    try {
      const dataStr = JSON.stringify(data);
      const timestamp = Date.now().toString();
      const sizeKB = Math.round(dataStr.length / 1024);

      console.log(`💾 保存日历数据到数据库缓存，大小: ${sizeKB} KB`);

      if (storageType === 'upstash') {
        // Upstash Redis
        if (storage.client?.set) {
          await storage.client.set(CALENDAR_DATA_KEY, dataStr);
          await storage.client.set(CALENDAR_TIME_KEY, timestamp);
        } else if (storage.set) {
          await storage.set(CALENDAR_DATA_KEY, dataStr);
          await storage.set(CALENDAR_TIME_KEY, timestamp);
        } else {
          throw new Error('Upstash存储没有可用的set方法');
        }
      } else if (storageType === 'kvrocks' || storageType === 'redis') {
        // KVRocks/标准Redis
        if (storage.withRetry && storage.client?.set) {
          await storage.withRetry(() => storage.client.set(CALENDAR_DATA_KEY, dataStr));
          await storage.withRetry(() => storage.client.set(CALENDAR_TIME_KEY, timestamp));
        } else if (storage.client?.set) {
          await storage.client.set(CALENDAR_DATA_KEY, dataStr);
          await storage.client.set(CALENDAR_TIME_KEY, timestamp);
        } else {
          throw new Error('KVRocks/Redis存储没有可用的set方法');
        }
      } else if (storageType === 'sqlite') {
        // SQLite - 使用通用缓存API
        if (typeof storage.setCache === 'function') {
          await storage.setCache(CALENDAR_DATA_KEY, dataStr);
          await storage.setCache(CALENDAR_TIME_KEY, timestamp);
        } else {
          throw new Error('SQLite存储没有可用的setCache方法');
        }
      } else {
        throw new Error(`不支持的存储类型: ${storageType}`);
      }

      console.log('✅ 日历数据已成功保存到数据库缓存');
      return true;
    } catch (error) {
      console.error('❌ 保存日历数据到数据库缓存失败:', error);
      return false;
    }
  }

  // 从数据库获取日历缓存数据
  static async getCalendarData(): Promise<any | null> {
    const storageType = getStorageType();

    // 如果是localStorage模式，跳过数据库缓存
    if (storageType === 'localstorage') {
      return null;
    }

    const storage = getDatabaseStorage();
    if (!storage) {
      console.warn('❌ 数据库存储不可用');
      return null;
    }

    try {
      let dataStr: string | null = null;
      let timeStr: string | null = null;

      if (storageType === 'upstash') {
        // Upstash Redis
        if (storage.client?.get) {
          dataStr = await storage.client.get(CALENDAR_DATA_KEY);
          timeStr = await storage.client.get(CALENDAR_TIME_KEY);
        } else if (storage.get) {
          dataStr = await storage.get(CALENDAR_DATA_KEY);
          timeStr = await storage.get(CALENDAR_TIME_KEY);
        } else {
          throw new Error('Upstash存储没有可用的get方法');
        }
      } else if (storageType === 'kvrocks' || storageType === 'redis') {
        // KVRocks/标准Redis
        if (storage.withRetry && storage.client?.get) {
          dataStr = await storage.withRetry(() => storage.client.get(CALENDAR_DATA_KEY));
          timeStr = await storage.withRetry(() => storage.client.get(CALENDAR_TIME_KEY));
        } else if (storage.client?.get) {
          dataStr = await storage.client.get(CALENDAR_DATA_KEY);
          timeStr = await storage.client.get(CALENDAR_TIME_KEY);
        } else {
          throw new Error('KVRocks/Redis存储没有可用的get方法');
        }
      } else if (storageType === 'sqlite') {
        // SQLite - 使用通用缓存API
        if (typeof storage.getCache === 'function') {
          dataStr = await storage.getCache(CALENDAR_DATA_KEY);
          timeStr = await storage.getCache(CALENDAR_TIME_KEY);
        } else {
          throw new Error('SQLite存储没有可用的getCache方法');
        }
      } else {
        throw new Error(`不支持的存储类型: ${storageType}`);
      }

      if (!dataStr || !timeStr) {
        console.log('📭 数据库中无日历缓存数据');
        return null;
      }

      // 检查缓存是否过期
      const age = Date.now() - parseInt(timeStr);
      if (age >= CACHE_DURATION) {
        console.log(`⏰ 数据库中的日历缓存已过期，年龄: ${Math.round(age / 1000 / 60 / 60)} 小时`);
        await this.clearCalendarData(); // 清理过期数据
        return null;
      }

      // 🔧 修复：Upstash 可能返回对象而不是字符串
      let data;
      if (storageType === 'upstash') {
        // Upstash 特殊处理：可能返回对象或字符串
        if (typeof dataStr === 'string') {
          data = JSON.parse(dataStr);
        } else if (typeof dataStr === 'object' && dataStr !== null) {
          // Upstash 已经返回了对象，直接使用
          data = dataStr;
        } else {
          console.warn('⚠️ Upstash 返回的数据格式不正确:', typeof dataStr);
          return null;
        }
      } else {
        // KVRocks/Redis 正常处理：总是返回字符串
        data = JSON.parse(dataStr);
      }

      console.log(`✅ 从数据库读取日历缓存，缓存年龄: ${Math.round(age / 1000 / 60)} 分钟`);
      return data;
    } catch (error) {
      console.error('❌ 从数据库读取日历缓存失败:', error);
      return null;
    }
  }

  // 清除日历缓存
  static async clearCalendarData(): Promise<void> {
    const storageType = getStorageType();

    if (storageType === 'localstorage') {
      console.log('localStorage模式，跳过数据库缓存清理');
      return;
    }

    const storage = getDatabaseStorage();
    if (!storage) {
      console.warn('❌ 数据库存储不可用，无法清理缓存');
      return;
    }

    try {
      if (storageType === 'upstash') {
        if (storage.client?.del) {
          await storage.client.del(CALENDAR_DATA_KEY);
          await storage.client.del(CALENDAR_TIME_KEY);
        } else if (storage.del) {
          await storage.del(CALENDAR_DATA_KEY);
          await storage.del(CALENDAR_TIME_KEY);
        }
      } else if (storageType === 'kvrocks' || storageType === 'redis') {
        if (storage.withRetry && storage.client?.del) {
          await storage.withRetry(() => storage.client.del(CALENDAR_DATA_KEY));
          await storage.withRetry(() => storage.client.del(CALENDAR_TIME_KEY));
        } else if (storage.client?.del) {
          await storage.client.del(CALENDAR_DATA_KEY);
          await storage.client.del(CALENDAR_TIME_KEY);
        }
      } else if (storageType === 'sqlite') {
        if (typeof storage.deleteCache === 'function') {
          await storage.deleteCache(CALENDAR_DATA_KEY);
          await storage.deleteCache(CALENDAR_TIME_KEY);
        }
      }

      console.log('✅ 已清除数据库中的日历缓存');
    } catch (error) {
      console.error('❌ 清除数据库日历缓存失败:', error);
    }
  }

  // 检查缓存是否有效
  static async isCacheValid(): Promise<boolean> {
    const storageType = getStorageType();

    if (storageType === 'localstorage') {
      return false;
    }

    const storage = getDatabaseStorage();
    if (!storage) {
      return false;
    }

    try {
      let timeStr: string | null = null;

      if (storageType === 'upstash') {
        if (storage.client?.get) {
          timeStr = await storage.client.get(CALENDAR_TIME_KEY);
        } else if (storage.get) {
          timeStr = await storage.get(CALENDAR_TIME_KEY);
        }
      } else if (storageType === 'kvrocks' || storageType === 'redis') {
        if (storage.withRetry && storage.client?.get) {
          timeStr = await storage.withRetry(() => storage.client.get(CALENDAR_TIME_KEY));
        } else if (storage.client?.get) {
          timeStr = await storage.client.get(CALENDAR_TIME_KEY);
        }
      } else if (storageType === 'sqlite') {
        if (typeof storage.getCache === 'function') {
          timeStr = await storage.getCache(CALENDAR_TIME_KEY);
        }
      }

      if (!timeStr) {
        return false;
      }

      const age = Date.now() - parseInt(timeStr);
      return age < CACHE_DURATION;
    } catch (error) {
      console.error('检查缓存有效性失败:', error);
      return false;
    }
  }
}