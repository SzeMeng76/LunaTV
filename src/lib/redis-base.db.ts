/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { createClient, RedisClientType } from 'redis';

import { AdminConfig } from './admin.types';
import { hashPassword as hashPwd, isHashed, verifyPassword } from './password';
import {
  ContentStat,
  EpisodeSkipConfig,
  Favorite,
  IStorage,
  PlayRecord,
  PlayStatsResult,
  UserPlayStat,
} from './types';

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// 数据类型转换辅助函数
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

// 连接配置接口
export interface RedisConnectionConfig {
  url: string;
  clientName: string; // 用于日志显示，如 "Redis" 或 "Pika"
}

// 添加Redis操作重试包装器
function createRetryWrapper(clientName: string, getClient: () => RedisClientType) {
  return async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (err: any) {
        const isLastAttempt = i === maxRetries - 1;
        const isConnectionError =
          err.message?.includes('Connection') ||
          err.message?.includes('ECONNREFUSED') ||
          err.message?.includes('ENOTFOUND') ||
          err.code === 'ECONNRESET' ||
          err.code === 'EPIPE';

        if (isConnectionError && !isLastAttempt) {
          console.log(
            `${clientName} operation failed, retrying... (${i + 1}/${maxRetries})`
          );
          console.error('Error:', err.message);

          // 等待一段时间后重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));

          // 尝试重新连接
          try {
            const client = getClient();
            if (!client.isOpen) {
              await client.connect();
            }
          } catch (reconnectErr) {
            console.error('Failed to reconnect:', reconnectErr);
          }

          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  };
}

// 创建客户端的工厂函数
export function createRedisClient(config: RedisConnectionConfig, globalSymbol: symbol): RedisClientType {
  let client: RedisClientType | undefined = (global as any)[globalSymbol];

  if (!client) {
    if (!config.url) {
      throw new Error(`${config.clientName}_URL env variable not set`);
    }

    // 创建客户端配置
    const clientConfig: any = {
      url: config.url,
      socket: {
        // 重连策略：指数退避，最大30秒
        reconnectStrategy: (retries: number) => {
          console.log(`${config.clientName} reconnection attempt ${retries + 1}`);
          if (retries > 10) {
            console.error(`${config.clientName} max reconnection attempts exceeded`);
            return false; // 停止重连
          }
          return Math.min(1000 * Math.pow(2, retries), 30000); // 指数退避，最大30秒
        },
        connectTimeout: 10000, // 10秒连接超时
        // 设置no delay，减少延迟
        noDelay: true,
      },
      // 添加其他配置
      pingInterval: 30000, // 30秒ping一次，保持连接活跃
      // 添加命令超时，防止命令无限期等待
      commandsQueueMaxLength: 1000, // 命令队列最大长度
      disableOfflineQueue: false, // 允许离线队列
    };

    client = createClient(clientConfig);

    // 添加错误事件监听
    client.on('error', (err) => {
      console.error(`${config.clientName} client error:`, err);
    });

    client.on('connect', () => {
      console.log(`${config.clientName} connected`);
    });

    client.on('reconnecting', () => {
      console.log(`${config.clientName} reconnecting...`);
    });

    client.on('ready', () => {
      console.log(`${config.clientName} ready`);
    });

    // 初始连接，带重试机制
    const connectWithRetry = async () => {
      try {
        await client!.connect();
        console.log(`${config.clientName} connected successfully`);
      } catch (err) {
        console.error(`${config.clientName} initial connection failed:`, err);
        console.log('Will retry in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      }
    };

    connectWithRetry();

    (global as any)[globalSymbol] = client;
  }

  return client;
}

// 抽象基类，包含所有通用的Redis操作逻辑
export abstract class BaseRedisStorage implements IStorage {
  protected client: RedisClientType;
  protected config: RedisConnectionConfig;
  protected withRetry: <T>(operation: () => Promise<T>, maxRetries?: number) => Promise<T>;

  constructor(config: RedisConnectionConfig, globalSymbol: symbol) {
    this.config = config; // 保存配置
    this.client = createRedisClient(config, globalSymbol);
    this.withRetry = createRetryWrapper(config.clientName, () => this.client);
  }

  // 用于迁移的 SCAN 辅助方法（非 public，不用于常规业务）
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys = new Set<string>();
    let cursor = 0;
    do {
      const result = await this.withRetry(() =>
        this.client.scan(cursor, { MATCH: pattern, COUNT: 100 })
      );
      cursor = result.cursor;
      for (const key of result.keys) keys.add(key);
    } while (cursor !== 0);
    return Array.from(keys);
  }

  // ---------- 播放记录 ----------
  private prHashKey(user: string) {
    return `u:${user}:pr`; // 一个用户的所有播放记录存在一个 Hash 中
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await this.withRetry(() =>
      this.client.hGet(this.prHashKey(userName), key)
    );
    return val ? (JSON.parse(val) as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(this.prHashKey(userName), key, JSON.stringify(record))
    );
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const all = await this.withRetry(() =>
      this.client.hGetAll(this.prHashKey(userName))
    );
    const result: Record<string, PlayRecord> = {};
    for (const [field, raw] of Object.entries(all)) {
      if (raw) result[field] = JSON.parse(raw) as PlayRecord;
    }
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await this.withRetry(() => this.client.hDel(this.prHashKey(userName), key));
  }

  async deleteAllPlayRecords(userName: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.prHashKey(userName)));
  }

  // ---------- 收藏 ----------
  private favHashKey(user: string) {
    return `u:${user}:fav`; // 一个用户的所有收藏存在一个 Hash 中
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await this.withRetry(() =>
      this.client.hGet(this.favHashKey(userName), key)
    );
    return val ? (JSON.parse(val) as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(this.favHashKey(userName), key, JSON.stringify(favorite))
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const all = await this.withRetry(() =>
      this.client.hGetAll(this.favHashKey(userName))
    );
    const result: Record<string, Favorite> = {};
    for (const [field, raw] of Object.entries(all)) {
      if (raw) result[field] = JSON.parse(raw) as Favorite;
    }
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await this.withRetry(() => this.client.hDel(this.favHashKey(userName), key));
  }

  async deleteAllFavorites(userName: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.favHashKey(userName)));
  }

  // ---------- 批量写入（hSet 支持多字段，一次命令）----------
  async setPlayRecordsBatch(
    userName: string,
    records: Record<string, PlayRecord>
  ): Promise<void> {
    const entries = Object.entries(records);
    if (entries.length === 0) return;
    const data: Record<string, string> = {};
    for (const [key, record] of entries) data[key] = JSON.stringify(record);
    await this.withRetry(() => this.client.hSet(this.prHashKey(userName), data));
  }

  async setFavoritesBatch(
    userName: string,
    favorites: Record<string, Favorite>
  ): Promise<void> {
    const entries = Object.entries(favorites);
    if (entries.length === 0) return;
    const data: Record<string, string> = {};
    for (const [key, fav] of entries) data[key] = JSON.stringify(fav);
    await this.withRetry(() => this.client.hSet(this.favHashKey(userName), data));
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    const hashed = hashPwd(password);
    await this.withRetry(() => this.client.set(this.userPwdKey(userName), hashed));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await this.withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    const storedStr = ensureString(stored);
    const ok = verifyPassword(password, storedStr);
    // 平滑迁移：明文验证通过时自动升级为加盐哈希
    if (ok && !isHashed(storedStr)) {
      const hashed = hashPwd(password);
      await this.withRetry(() => this.client.set(this.userPwdKey(userName), hashed));
    }
    return ok;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    const exists = await this.withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    const hashed = hashPwd(newPassword);
    await this.withRetry(() =>
      this.client.set(this.userPwdKey(userName), hashed)
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // 删除用户密码 (V1)
    await this.withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 删除用户信息 (V2)
    await this.withRetry(() => this.client.del(this.userInfoKey(userName)));

    // 从用户列表中移除 (V2)
    await this.withRetry(() => this.client.zRem(this.userListKey(), userName));

    // 删除 OIDC 映射（如果存在）
    try {
      const userInfo = await this.getUserInfoV2(userName);
      if (userInfo?.oidcSub) {
        await this.withRetry(() => this.client.del(this.oidcSubKey(userInfo.oidcSub!)));
      }
    } catch (e) {
      // 忽略错误，用户信息可能已被删除
    }

    // 删除搜索历史
    await this.withRetry(() => this.client.del(this.shKey(userName)));

    // 直接删除 Hash key（无需扫描）
    await this.withRetry(() => this.client.del(this.prHashKey(userName)));
    await this.withRetry(() => this.client.del(this.favHashKey(userName)));
    await this.withRetry(() => this.client.del(this.skipHashKey(userName)));
    await this.withRetry(() => this.client.del(this.episodeSkipHashKey(userName)));

    // 删除用户登入统计数据
    const loginStatsKey = `user_login_stats:${userName}`;
    await this.withRetry(() => this.client.del(loginStatsKey));
  }

  // ---------- 用户相关（新版本 V2，支持 OIDC） ----------
  private userInfoKey(user: string) {
    return `u:${user}:info`;
  }

  private userListKey() {
    return 'users:list';
  }

  private oidcSubKey(oidcSub: string) {
    return `oidc:sub:${oidcSub}`;
  }

  // SHA256加密密码
  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 创建新用户（新版本）
  async createUserV2(
    userName: string,
    password: string,
    role: 'owner' | 'admin' | 'user' = 'user',
    tags?: string[],
    oidcSub?: string,
    enabledApis?: string[]
  ): Promise<void> {
    const hashedPassword = await this.hashPassword(password);
    const createdAt = Date.now();

    // 存储用户信息到Hash
    const userInfo: Record<string, string> = {
      role,
      banned: 'false',
      password: hashedPassword,
      created_at: createdAt.toString(),
    };

    if (tags && tags.length > 0) {
      userInfo.tags = JSON.stringify(tags);
    }

    if (enabledApis && enabledApis.length > 0) {
      userInfo.enabledApis = JSON.stringify(enabledApis);
    }

    if (oidcSub) {
      userInfo.oidcSub = oidcSub;
      // 创建OIDC映射
      await this.withRetry(() => this.client.set(this.oidcSubKey(oidcSub), userName));
    }

    await this.withRetry(() => this.client.hSet(this.userInfoKey(userName), userInfo));

    // 添加到用户列表（Sorted Set，按注册时间排序）
    await this.withRetry(() => this.client.zAdd(this.userListKey(), {
      score: createdAt,
      value: userName,
    }));
  }

  // 验证用户密码（新版本）
  async verifyUserV2(userName: string, password: string): Promise<boolean> {
    const userInfo = await this.withRetry(() =>
      this.client.hGetAll(this.userInfoKey(userName))
    );

    if (!userInfo || !userInfo.password) {
      return false;
    }

    const hashedPassword = await this.hashPassword(password);
    return userInfo.password === hashedPassword;
  }

  // 获取用户信息（新版本）
  async getUserInfoV2(userName: string): Promise<{
    username: string;
    role: 'owner' | 'admin' | 'user';
    banned: boolean;
    tags?: string[];
    oidcSub?: string;
    enabledApis?: string[];
    createdAt?: number;
  } | null> {
    const userInfo = await this.withRetry(() =>
      this.client.hGetAll(this.userInfoKey(userName))
    );

    if (!userInfo || Object.keys(userInfo).length === 0) {
      return null;
    }

    // 安全解析 tags 字段
    let parsedTags: string[] | undefined;
    if (userInfo.tags) {
      try {
        // 如果 tags 已经是数组（某些 Redis 客户端行为），直接使用
        if (Array.isArray(userInfo.tags)) {
          parsedTags = userInfo.tags;
        } else {
          // 尝试 JSON 解析
          const parsed = JSON.parse(userInfo.tags);
          parsedTags = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch (e) {
        // JSON 解析失败，可能是单个字符串值
        console.warn(`用户 ${userName} tags 解析失败，原始值:`, userInfo.tags);
        // 如果是逗号分隔的字符串
        if (typeof userInfo.tags === 'string' && userInfo.tags.includes(',')) {
          parsedTags = userInfo.tags.split(',').map(t => t.trim());
        } else if (typeof userInfo.tags === 'string') {
          parsedTags = [userInfo.tags];
        }
      }
    }

    // 安全解析 enabledApis 字段
    let parsedApis: string[] | undefined;
    if (userInfo.enabledApis) {
      try {
        if (Array.isArray(userInfo.enabledApis)) {
          parsedApis = userInfo.enabledApis;
        } else {
          const parsed = JSON.parse(userInfo.enabledApis);
          parsedApis = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch (e) {
        console.warn(`用户 ${userName} enabledApis 解析失败`);
        if (typeof userInfo.enabledApis === 'string' && userInfo.enabledApis.includes(',')) {
          parsedApis = userInfo.enabledApis.split(',').map(t => t.trim());
        } else if (typeof userInfo.enabledApis === 'string') {
          parsedApis = [userInfo.enabledApis];
        }
      }
    }

    return {
      username: userName,
      role: (userInfo.role as 'owner' | 'admin' | 'user') || 'user',
      banned: userInfo.banned === 'true',
      tags: parsedTags,
      oidcSub: userInfo.oidcSub,
      enabledApis: parsedApis,
      createdAt: userInfo.created_at ? parseInt(userInfo.created_at, 10) : undefined,
    };
  }

  // 检查用户是否存在（新版本）
  async checkUserExistV2(userName: string): Promise<boolean> {
    const exists = await this.withRetry(() =>
      this.client.exists(this.userInfoKey(userName))
    );
    return exists === 1;
  }

  // 通过OIDC Sub查找用户名
  async getUserByOidcSub(oidcSub: string): Promise<string | null> {
    const userName = await this.withRetry(() =>
      this.client.get(this.oidcSubKey(oidcSub))
    );
    return userName ? ensureString(userName) : null;
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await this.withRetry(() =>
      this.client.lRange(this.shKey(userName), 0, -1)
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    // 插入到最前
    await this.withRetry(() => this.client.lPush(key, ensureString(keyword)));
    // 限制最大长度
    await this.withRetry(() => this.client.lTrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    } else {
      await this.withRetry(() => this.client.del(key));
    }
  }

  // ---------- 获取全部用户 ----------
  async getAllUsers(): Promise<string[]> {
    // V2：从 Sorted Set 获取（O(N) 但不扫描全库）
    const v2Members = await this.withRetry(() =>
      this.client.zRange(this.userListKey(), 0, -1)
    );
    const v2Users = ensureStringArray(v2Members as any[]);
    if (v2Users.length > 0) return v2Users;

    // V1 兼容：SCAN 扫描（降级兜底）
    const v1Keys = await this.scanKeys('u:*:pwd');
    const v1Users = v1Keys
      .map((k) => { const m = k.match(/^u:(.+?):pwd$/); return m ? ensureString(m[1]) : undefined; })
      .filter((u): u is string => typeof u === 'string');
    const v2Keys = await this.scanKeys('u:*:info');
    const v2KeyUsers = v2Keys
      .map((k) => { const m = k.match(/^u:(.+?):info$/); return m ? ensureString(m[1]) : undefined; })
      .filter((u): u is string => typeof u === 'string');
    return Array.from(new Set([...v2KeyUsers, ...v1Users]));
  }

  // ---------- 管理员配置 ----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await this.withRetry(() => this.client.get(this.adminConfigKey()));
    return val ? (JSON.parse(val) as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.adminConfigKey(), JSON.stringify(config))
    );
  }

  // ---------- 跳过片头片尾配置 ----------
  private skipHashKey(user: string) {
    return `u:${user}:skip`; // 一个用户的所有跳过配置存在一个 Hash 中
  }

  private skipField(source: string, id: string) {
    return `${source}+${id}`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    const val = await this.withRetry(() =>
      this.client.hGet(this.skipHashKey(userName), this.skipField(source, id))
    );
    return val ? (JSON.parse(val) as EpisodeSkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(this.skipHashKey(userName), this.skipField(source, id), JSON.stringify(config))
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hDel(this.skipHashKey(userName), this.skipField(source, id))
    );
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const all = await this.withRetry(() =>
      this.client.hGetAll(this.skipHashKey(userName))
    );
    const configs: { [key: string]: EpisodeSkipConfig } = {};
    for (const [field, raw] of Object.entries(all)) {
      if (raw) configs[field] = JSON.parse(raw) as EpisodeSkipConfig;
    }
    return configs;
  }

  // ---------- 剧集跳过配置（新版，多片段支持）----------
  private episodeSkipHashKey(user: string) {
    return `u:${user}:episodeskip`; // 一个用户的所有剧集跳过配置存在一个 Hash 中
  }

  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    const val = await this.withRetry(() =>
      this.client.hGet(this.episodeSkipHashKey(userName), this.skipField(source, id))
    );
    return val ? (JSON.parse(val) as EpisodeSkipConfig) : null;
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(this.episodeSkipHashKey(userName), this.skipField(source, id), JSON.stringify(config))
    );
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hDel(this.episodeSkipHashKey(userName), this.skipField(source, id))
    );
  }

  async getAllEpisodeSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const all = await this.withRetry(() =>
      this.client.hGetAll(this.episodeSkipHashKey(userName))
    );
    const configs: { [key: string]: EpisodeSkipConfig } = {};
    for (const [field, raw] of Object.entries(all)) {
      if (raw) configs[field] = JSON.parse(raw) as EpisodeSkipConfig;
    }
    return configs;
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();

      // 删除所有用户及其数据
      for (const username of allUsers) {
        await this.deleteUser(username);
      }

      // 删除管理员配置
      await this.withRetry(() => this.client.del(this.adminConfigKey()));

      console.log('所有数据已清空');
    } catch (error) {
      console.error('清空数据失败:', error);
      throw new Error('清空数据失败');
    }
  }

  // ---------- 通用缓存方法 ----------
  private cacheKey(key: string) {
    return `cache:${key}`;
  }

  async getCache(key: string): Promise<any | null> {
    try {
      const cacheKey = this.cacheKey(key);
      const val = await this.withRetry(() => this.client.get(cacheKey));

      // 如果 key 不存在，检查 TTL（调试用）
      if (!val && process.env.NODE_ENV === 'development') {
        const ttl = await this.withRetry(() => this.client.ttl(cacheKey));
        if (ttl === -2) {
          console.log(`${this.config.clientName} getCache: Key ${key} does not exist (TTL: -2)`);
        } else if (ttl === -1) {
          console.warn(`${this.config.clientName} getCache: Key ${key} exists but has no expiration (TTL: -1)`);
        } else if (ttl > 0) {
          console.warn(`${this.config.clientName} getCache: Key ${key} exists with TTL ${ttl}s but returned null value`);
        }
        return null;
      }

      if (!val) return null;

      // 调试：显示剩余 TTL
      if (process.env.NODE_ENV === 'development') {
        const ttl = await this.withRetry(() => this.client.ttl(cacheKey));
        console.log(`${this.config.clientName} getCache: key=${key}, remaining TTL=${ttl}s`);
      }

      // 智能处理返回值：兼容不同Redis客户端的行为
      if (typeof val === 'string') {
        // 检查是否是HTML错误页面
        if (val.trim().startsWith('<!DOCTYPE') || val.trim().startsWith('<html')) {
          console.error(`${this.config.clientName} returned HTML instead of JSON. Connection issue detected.`);
          return null;
        }

        try {
          return JSON.parse(val);
        } catch (parseError) {
          console.warn(`${this.config.clientName} JSON解析失败，返回原字符串 (key: ${key}):`, parseError);
          return val; // 解析失败返回原字符串
        }
      } else {
        // 某些Redis客户端可能直接返回解析后的对象
        return val;
      }
    } catch (error: any) {
      console.error(`${this.config.clientName} getCache error (key: ${key}):`, error);
      return null;
    }
  }

  async setCache(key: string, data: any, expireSeconds?: number): Promise<void> {
    try {
      const cacheKey = this.cacheKey(key);
      const value = JSON.stringify(data);

      if (expireSeconds !== undefined) {
        // 验证 TTL 值的有效性
        if (expireSeconds <= 0) {
          const error = new Error(
            `${this.config.clientName} Invalid TTL: ${expireSeconds} seconds. TTL must be positive.`
          );
          console.error(error.message);
          throw error;
        }

        // Kvrocks 兼容性：确保 TTL 是整数
        const ttl = Math.floor(expireSeconds);

        if (ttl !== expireSeconds) {
          console.warn(
            `${this.config.clientName} TTL rounded from ${expireSeconds} to ${ttl} seconds`
          );
        }

        console.log(`${this.config.clientName} setCache with TTL: key=${key}, ttl=${ttl}s`);
        await this.withRetry(() => this.client.setEx(cacheKey, ttl, value));

        // 验证是否成功设置（可选，仅在调试模式下）
        if (process.env.NODE_ENV === 'development') {
          const setTtl = await this.withRetry(() => this.client.ttl(cacheKey));
          console.log(`${this.config.clientName} Verified TTL for ${key}: ${setTtl}s (expected: ${ttl}s)`);

          if (setTtl < 0) {
            console.warn(`${this.config.clientName} WARNING: TTL not set correctly for ${key}. Got: ${setTtl}`);
          }
        }
      } else {
        console.log(`${this.config.clientName} setCache without TTL: key=${key}`);
        await this.withRetry(() => this.client.set(cacheKey, value));
      }
    } catch (error) {
      console.error(`${this.config.clientName} setCache error (key: ${key}):`, error);
      throw error; // 重新抛出错误以便上层处理
    }
  }

  async deleteCache(key: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.cacheKey(key)));
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    // 仅在有明确前缀时做手动清理，避免全库 SCAN
    if (!prefix) return;
    const pattern = `cache:${prefix}*`;
    const keys = await this.scanKeys(pattern);
    if (keys.length > 0) {
      await this.withRetry(() => this.client.del(keys));
      console.log(`Cleared ${keys.length} cache entries with pattern: ${pattern}`);
    }
  }

  // ---------- 数据迁移：旧扁平 key → Hash 结构 ----------
  private migrationKey() {
    return 'sys:migration:hash_v2';
  }

  async migrateData(): Promise<void> {
    const migrated = await this.withRetry(() => this.client.get(this.migrationKey()));
    if (migrated === 'done') return;

    console.log('开始数据迁移：扁平 key → Hash 结构...');

    try {
      // 迁移播放记录
      const prKeys = await this.scanKeys('u:*:pr:*');
      const oldPrKeys = prKeys.filter(k => { const p = k.split(':'); return p.length >= 4 && p[2] === 'pr' && p[3] !== ''; });
      if (oldPrKeys.length > 0) {
        const values = await this.withRetry(() => this.client.mGet(oldPrKeys));
        for (let i = 0; i < oldPrKeys.length; i++) {
          const raw = values[i]; if (!raw) continue;
          const match = oldPrKeys[i].match(/^u:(.+?):pr:(.+)$/); if (!match) continue;
          const [, userName, field] = match;
          await this.withRetry(() => this.client.hSet(this.prHashKey(userName), field, raw));
        }
        await this.withRetry(() => this.client.del(oldPrKeys));
        console.log(`迁移了 ${oldPrKeys.length} 条播放记录`);
      }

      // 迁移收藏
      const favKeys = await this.scanKeys('u:*:fav:*');
      const oldFavKeys = favKeys.filter(k => { const p = k.split(':'); return p.length >= 4 && p[2] === 'fav' && p[3] !== ''; });
      if (oldFavKeys.length > 0) {
        const values = await this.withRetry(() => this.client.mGet(oldFavKeys));
        for (let i = 0; i < oldFavKeys.length; i++) {
          const raw = values[i]; if (!raw) continue;
          const match = oldFavKeys[i].match(/^u:(.+?):fav:(.+)$/); if (!match) continue;
          const [, userName, field] = match;
          await this.withRetry(() => this.client.hSet(this.favHashKey(userName), field, raw));
        }
        await this.withRetry(() => this.client.del(oldFavKeys));
        console.log(`迁移了 ${oldFavKeys.length} 条收藏`);
      }

      // 迁移 skipConfig
      const skipKeys = await this.scanKeys('u:*:skip:*');
      const oldSkipKeys = skipKeys.filter(k => { const p = k.split(':'); return p.length >= 4 && p[2] === 'skip' && p[3] !== ''; });
      if (oldSkipKeys.length > 0) {
        const values = await this.withRetry(() => this.client.mGet(oldSkipKeys));
        for (let i = 0; i < oldSkipKeys.length; i++) {
          const raw = values[i]; if (!raw) continue;
          const match = oldSkipKeys[i].match(/^u:(.+?):skip:(.+)$/); if (!match) continue;
          const [, userName, field] = match;
          await this.withRetry(() => this.client.hSet(this.skipHashKey(userName), field, raw));
        }
        await this.withRetry(() => this.client.del(oldSkipKeys));
        console.log(`迁移了 ${oldSkipKeys.length} 条跳过配置`);
      }

      // 迁移 episodeSkipConfig
      const esKeys = await this.scanKeys('u:*:episodeskip:*');
      const oldEsKeys = esKeys.filter(k => { const p = k.split(':'); return p.length >= 4 && p[2] === 'episodeskip' && p[3] !== ''; });
      if (oldEsKeys.length > 0) {
        const values = await this.withRetry(() => this.client.mGet(oldEsKeys));
        for (let i = 0; i < oldEsKeys.length; i++) {
          const raw = values[i]; if (!raw) continue;
          const match = oldEsKeys[i].match(/^u:(.+?):episodeskip:(.+)$/); if (!match) continue;
          const [, userName, field] = match;
          await this.withRetry(() => this.client.hSet(this.episodeSkipHashKey(userName), field, raw));
        }
        await this.withRetry(() => this.client.del(oldEsKeys));
        console.log(`迁移了 ${oldEsKeys.length} 条剧集跳过配置`);
      }

      await this.withRetry(() => this.client.set(this.migrationKey(), 'done'));
      console.log('数据迁移完成');
    } catch (error) {
      console.error('数据迁移失败:', error);
    }
  }

  // ---------- 密码迁移：明文 → 加盐哈希 ----------
  private pwdMigrationKey() {
    return 'sys:migration:pwd_hash_v1';
  }

  async migratePasswords(): Promise<void> {
    const migrated = await this.withRetry(() => this.client.get(this.pwdMigrationKey()));
    if (migrated === 'done') return;

    console.log('开始密码迁移：明文 → 加盐哈希...');

    try {
      const pwdKeys = await this.scanKeys('u:*:pwd');
      let count = 0;
      for (const key of pwdKeys) {
        const stored = await this.withRetry(() => this.client.get(key));
        if (stored === null) continue;
        const storedStr = ensureString(stored);
        if (isHashed(storedStr)) continue;
        const hashed = hashPwd(storedStr);
        await this.withRetry(() => this.client.set(key, hashed));
        count++;
      }
      await this.withRetry(() => this.client.set(this.pwdMigrationKey(), 'done'));
      console.log(`密码迁移完成，共迁移 ${count} 个用户`);
    } catch (error) {
      console.error('密码迁移失败:', error);
    }
  }

  // ---------- 播放统计相关 ----------
  private playStatsKey() {
    return 'global:play_stats';
  }

  private userStatsKey(userName: string) {
    return `u:${userName}:stats`;
  }

  private contentStatsKey(source: string, id: string) {
    return `content:stats:${source}+${id}`;
  }

  // 获取全站播放统计
  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      // 尝试从缓存获取
      const cached = await this.getCache('play_stats_summary');
      if (cached) {
        return cached;
      }

      // 重新计算统计数据
      const allUsers = await this.getAllUsers();

      const userStats: Array<{
        username: string;
        totalWatchTime: number;
        totalPlays: number;
        lastPlayTime: number;
        recentRecords: PlayRecord[];
        avgWatchTime: number;
        mostWatchedSource: string;
        registrationDays: number;
        lastLoginTime: number;
        loginCount: number;
        createdAt: number;
      }> = [];
      let totalWatchTime = 0;
      let totalPlays = 0;

      // 用户注册统计
      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      let todayNewUsers = 0;
      const registrationData: Record<string, number> = {};
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      // 收集所有用户统计
      for (const username of allUsers) {
        const userStat = await this.getUserPlayStat(username);

        // 设置项目开始时间，2025年9月14日
        const PROJECT_START_DATE = new Date('2025-09-14').getTime();
        // 模拟用户创建时间（Redis模式下通常没有这个信息，使用首次播放时间或项目开始时间）
        const userCreatedAt = userStat.firstWatchDate || PROJECT_START_DATE;
        const registrationDays = Math.floor((now - userCreatedAt) / (1000 * 60 * 60 * 24)) + 1;

        // 统计今日新增用户
        if (userCreatedAt >= todayStart) {
          todayNewUsers++;
        }

        // 统计注册时间分布（近7天）
        if (userCreatedAt >= sevenDaysAgo) {
          const regDate = new Date(userCreatedAt).toISOString().split('T')[0];
          registrationData[regDate] = (registrationData[regDate] || 0) + 1;
        }

        // 推断最后登录时间（基于最后播放时间）
        const lastLoginTime = userStat.lastPlayTime || userCreatedAt;

        const enhancedUserStat = {
          username: userStat.username,
          totalWatchTime: userStat.totalWatchTime,
          totalPlays: userStat.totalPlays,
          lastPlayTime: userStat.lastPlayTime,
          recentRecords: userStat.recentRecords,
          avgWatchTime: userStat.avgWatchTime,
          mostWatchedSource: userStat.mostWatchedSource,
          registrationDays,
          lastLoginTime,
          loginCount: userStat.loginCount || 0, // 添加登入次数字段
          createdAt: userCreatedAt,
        };

        userStats.push(enhancedUserStat);
        totalWatchTime += userStat.totalWatchTime;
        totalPlays += userStat.totalPlays;
      }

      // 计算热门来源
      const sourceMap = new Map<string, number>();
      for (const user of userStats) {
        for (const record of user.recentRecords) {
          const count = sourceMap.get(record.source_name) || 0;
          sourceMap.set(record.source_name, count + 1);
        }
      }

      const topSources = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 生成近7天统计（简化版本）
      const dailyStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        dailyStats.push({
          date: date.toISOString().split('T')[0],
          watchTime: Math.floor(totalWatchTime / 7), // 简化计算
          plays: Math.floor(totalPlays / 7)
        });
      }

      // 计算注册趋势
      const registrationStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        registrationStats.push({
          date: dateKey,
          newUsers: registrationData[dateKey] || 0,
        });
      }

      // 计算活跃用户统计
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      const activeUsers = {
        daily: userStats.filter(user => user.lastLoginTime >= oneDayAgo).length,
        weekly: userStats.filter(user => user.lastLoginTime >= sevenDaysAgo).length,
        monthly: userStats.filter(user => user.lastLoginTime >= thirtyDaysAgo).length,
      };

      const result: PlayStatsResult = {
        totalUsers: allUsers.length,
        totalWatchTime,
        totalPlays,
        avgWatchTimePerUser: allUsers.length > 0 ? totalWatchTime / allUsers.length : 0,
        avgPlaysPerUser: allUsers.length > 0 ? totalPlays / allUsers.length : 0,
        userStats: userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime),
        topSources,
        dailyStats,
        // 新增：用户注册统计
        registrationStats: {
          todayNewUsers,
          totalRegisteredUsers: allUsers.length,
          registrationTrend: registrationStats,
        },
        // 新增：用户活跃度统计
        activeUsers,
      };

      // 缓存结果1小时
      await this.setCache('play_stats_summary', result, 3600);

      return result;
    } catch (error) {
      console.error('获取播放统计失败:', error);
      return {
        totalUsers: 0,
        totalWatchTime: 0,
        totalPlays: 0,
        avgWatchTimePerUser: 0,
        avgPlaysPerUser: 0,
        userStats: [],
        topSources: [],
        dailyStats: [],
        // 新增：用户注册统计
        registrationStats: {
          todayNewUsers: 0,
          totalRegisteredUsers: 0,
          registrationTrend: [],
        },
        // 新增：用户活跃度统计
        activeUsers: {
          daily: 0,
          weekly: 0,
          monthly: 0,
        },
      };
    }
  }

  // 获取用户播放统计
  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    try {
      // 获取用户所有播放记录
      const playRecords = await this.getAllPlayRecords(userName);
      const records = Object.values(playRecords);

      if (records.length === 0) {
        // 即使没有播放记录，也要获取登入统计
        let loginStats = {
          loginCount: 0,
          firstLoginTime: 0,
          lastLoginTime: 0,
          lastLoginDate: 0
        };

        try {
          const loginStatsKey = `user_login_stats:${userName}`;
          const storedLoginStats = await this.client.get(loginStatsKey);
          if (storedLoginStats) {
            const parsed = JSON.parse(storedLoginStats);
            loginStats = {
              loginCount: parsed.loginCount || 0,
              firstLoginTime: parsed.firstLoginTime || 0,
              lastLoginTime: parsed.lastLoginTime || 0,
              lastLoginDate: parsed.lastLoginDate || parsed.lastLoginTime || 0
            };
          }
        } catch (error) {
          console.error(`获取用户 ${userName} 登入统计失败:`, error);
        }

        return {
          username: userName,
          totalWatchTime: 0,
          totalPlays: 0,
          lastPlayTime: 0,
          recentRecords: [],
          avgWatchTime: 0,
          mostWatchedSource: '',
          // 新增字段
          totalMovies: 0,
          firstWatchDate: Date.now(),
          lastUpdateTime: Date.now(),
          // 登入统计字段
          loginCount: loginStats.loginCount,
          firstLoginTime: loginStats.firstLoginTime,
          lastLoginTime: loginStats.lastLoginTime,
          lastLoginDate: loginStats.lastLoginDate
        };
      }

      // 计算统计数据
      const totalWatchTime = records.reduce((sum, record) => sum + (record.play_time || 0), 0);
      const totalPlays = records.length;
      const lastPlayTime = Math.max(...records.map(r => r.save_time || 0));

      // 计算观看影片总数（去重）
      const totalMovies = new Set(records.map(r => `${r.title}_${r.source_name}_${r.year}`)).size;

      // 计算首次观看时间
      const firstWatchDate = Math.min(...records.map(r => r.save_time || Date.now()));

      // 最近10条记录，按时间排序
      const recentRecords = records
        .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
        .slice(0, 10);

      // 平均观看时长
      const avgWatchTime = totalPlays > 0 ? totalWatchTime / totalPlays : 0;

      // 最常观看的来源
      const sourceMap = new Map<string, number>();
      records.forEach(record => {
        const sourceName = record.source_name || '未知来源';
        const count = sourceMap.get(sourceName) || 0;
        sourceMap.set(sourceName, count + 1);
      });

      const mostWatchedSource = sourceMap.size > 0
        ? Array.from(sourceMap.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0]
        : '';

      // 获取登入统计数据
      let loginStats = {
        loginCount: 0,
        firstLoginTime: 0,
        lastLoginTime: 0,
        lastLoginDate: 0
      };

      try {
        const loginStatsKey = `user_login_stats:${userName}`;
        const storedLoginStats = await this.client.get(loginStatsKey);
        if (storedLoginStats) {
          const parsed = JSON.parse(storedLoginStats);
          loginStats = {
            loginCount: parsed.loginCount || 0,
            firstLoginTime: parsed.firstLoginTime || 0,
            lastLoginTime: parsed.lastLoginTime || 0,
            lastLoginDate: parsed.lastLoginDate || parsed.lastLoginTime || 0
          };
        }
      } catch (error) {
        console.error(`获取用户 ${userName} 登入统计失败:`, error);
      }

      return {
        username: userName,
        totalWatchTime,
        totalPlays,
        lastPlayTime,
        recentRecords,
        avgWatchTime,
        mostWatchedSource,
        // 新增字段
        totalMovies,
        firstWatchDate,
        lastUpdateTime: Date.now(),
        // 登入统计字段
        loginCount: loginStats.loginCount,
        firstLoginTime: loginStats.firstLoginTime,
        lastLoginTime: loginStats.lastLoginTime,
        lastLoginDate: loginStats.lastLoginDate
      };
    } catch (error) {
      console.error(`获取用户 ${userName} 统计失败:`, error);
      return {
        username: userName,
        totalWatchTime: 0,
        totalPlays: 0,
        lastPlayTime: 0,
        recentRecords: [],
        avgWatchTime: 0,
        mostWatchedSource: '',
        // 新增字段
        totalMovies: 0,
        firstWatchDate: Date.now(),
        lastUpdateTime: Date.now(),
        // 登入统计字段
        loginCount: 0,
        firstLoginTime: 0,
        lastLoginTime: 0,
        lastLoginDate: 0
      };
    }
  }

  // 获取内容热度统计
  async getContentStats(limit = 10): Promise<ContentStat[]> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();
      const contentMap = new Map<string, {
        record: PlayRecord;
        playCount: number;
        totalWatchTime: number;
        users: Set<string>;
      }>();

      // 收集所有播放记录
      for (const username of allUsers) {
        const playRecords = await this.getAllPlayRecords(username);

        Object.entries(playRecords).forEach(([key, record]) => {
          const contentKey = key; // source+id

          if (!contentMap.has(contentKey)) {
            contentMap.set(contentKey, {
              record,
              playCount: 0,
              totalWatchTime: 0,
              users: new Set()
            });
          }

          const content = contentMap.get(contentKey)!;
          content.playCount++;
          content.totalWatchTime += record.play_time;
          content.users.add(username);
        });
      }

      // 转换为ContentStat数组并排序
      const contentStats: ContentStat[] = Array.from(contentMap.entries())
        .map(([key, data]) => {
          const [source, id] = key.split('+');
          return {
            source,
            id,
            title: data.record.title,
            source_name: data.record.source_name,
            cover: data.record.cover,
            year: data.record.year,
            playCount: data.playCount,
            totalWatchTime: data.totalWatchTime,
            averageWatchTime: data.playCount > 0 ? data.totalWatchTime / data.playCount : 0,
            lastPlayed: data.record.save_time,
            uniqueUsers: data.users.size
          };
        })
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);

      return contentStats;
    } catch (error) {
      console.error('获取内容统计失败:', error);
      return [];
    }
  }

  // 更新播放统计（当用户播放时调用）
  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number
  ): Promise<void> {
    try {
      // 清除全站统计缓存，下次查询时重新计算
      await this.deleteCache('play_stats_summary');

      // 这里可以添加更多实时统计更新逻辑
      // 比如更新用户统计缓存、内容热度等
      // 暂时只是清除缓存，实际统计在查询时重新计算
    } catch (error) {
      console.error('更新播放统计失败:', error);
    }
  }

  // 更新用户登入统计
  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean
  ): Promise<void> {
    try {
      const loginStatsKey = `user_login_stats:${userName}`;

      // 获取当前登入统计数据
      const currentStats = await this.client.get(loginStatsKey);
      const loginStats = currentStats ? JSON.parse(currentStats) : {
        loginCount: 0,
        firstLoginTime: null,
        lastLoginTime: null,
        lastLoginDate: null
      };

      // 更新统计数据
      loginStats.loginCount = (loginStats.loginCount || 0) + 1;
      loginStats.lastLoginTime = loginTime;
      loginStats.lastLoginDate = loginTime; // 保持兼容性

      // 如果是首次登入，记录首次登入时间
      if (isFirstLogin || !loginStats.firstLoginTime) {
        loginStats.firstLoginTime = loginTime;
      }

      // 保存更新后的统计数据
      await this.client.set(loginStatsKey, JSON.stringify(loginStats));

      console.log(`用户 ${userName} 登入统计已更新:`, loginStats);
    } catch (error) {
      console.error(`更新用户 ${userName} 登入统计失败:`, error);
      throw error;
    }
  }

  // 用户 Emby 配置相关方法
  async getUserEmbyConfig(userName: string): Promise<any | null> {
    try {
      const key = `u:${userName}:emby-config`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`获取用户 ${userName} Emby 配置失败:`, error);
      return null;
    }
  }

  async saveUserEmbyConfig(userName: string, config: any): Promise<void> {
    try {
      const key = `u:${userName}:emby-config`;
      await this.client.set(key, JSON.stringify(config));
      console.log(`用户 ${userName} Emby 配置已保存`);
    } catch (error) {
      console.error(`保存用户 ${userName} Emby 配置失败:`, error);
      throw error;
    }
  }

  async deleteUserEmbyConfig(userName: string): Promise<void> {
    try {
      const key = `u:${userName}:emby-config`;
      await this.client.del(key);
      console.log(`用户 ${userName} Emby 配置已删除`);
    } catch (error) {
      console.error(`删除用户 ${userName} Emby 配置失败:`, error);
      throw error;
    }
  }
}
