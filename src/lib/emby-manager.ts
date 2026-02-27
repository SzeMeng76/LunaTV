/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminConfig } from './admin.types';
import { getConfig } from './config';
import { EmbyClient } from './emby.client';
import { dbManager } from './db';

interface EmbySourceConfig {
  key: string;
  name: string;
  enabled: boolean;
  ServerURL: string;
  ApiKey?: string;
  Username?: string;
  Password?: string;
  UserId?: string;
  AuthToken?: string;
  Libraries?: string[];
  LastSyncTime?: number;
  ItemCount?: number;
  isDefault?: boolean;
  isPublic?: boolean; // 管理员公共源，对所有用户可见
  // 高级流媒体选项
  removeEmbyPrefix?: boolean;
  appendMediaSourceId?: boolean;
  transcodeMp4?: boolean;
  proxyPlay?: boolean; // 视频播放代理开关
}

class EmbyManager {
  private static instance: EmbyManager;
  private clients: Map<string, EmbyClient> = new Map();
  // 用户级客户端缓存: username -> Map<key, EmbyClient>
  private userClients: Map<string, Map<string, EmbyClient>> = new Map();

  private constructor() {}

  static getInstance(): EmbyManager {
    if (!EmbyManager.instance) {
      EmbyManager.instance = new EmbyManager();
    }
    return EmbyManager.instance;
  }

  /**
   * 从配置中获取所有Emby源（支持新旧格式）- 已废弃，保留用于向后兼容
   * @deprecated 使用 getSourcesForUser 替代
   */
  private async getSources(): Promise<EmbySourceConfig[]> {
    const config = await getConfig();

    // 如果是新格式（Sources数组）
    if (config.EmbyConfig?.Sources && Array.isArray(config.EmbyConfig.Sources)) {
      return config.EmbyConfig.Sources;
    }

    // 如果是旧格式（单源配置），转换为数组格式
    const embyConfig = config.EmbyConfig as any;
    if (embyConfig?.ServerURL) {
      return [{
        key: 'default',
        name: 'Emby',
        enabled: embyConfig.Enabled ?? false,
        ServerURL: embyConfig.ServerURL,
        ApiKey: embyConfig.ApiKey,
        Username: embyConfig.Username,
        Password: embyConfig.Password,
        UserId: embyConfig.UserId,
        AuthToken: embyConfig.AuthToken,
        Libraries: embyConfig.Libraries,
        LastSyncTime: embyConfig.LastSyncTime,
        ItemCount: embyConfig.ItemCount,
        isDefault: true,
      }];
    }

    return [];
  }

  /**
   * 获取用户的 Emby 源配置
   * 合并策略：用户私人源 + 管理员公共源（isPublic: true）
   * 用户私人源优先（相同 key 时覆盖公共源）
   * @param username 用户名，如果不提供则使用全局配置（向后兼容）
   */
  private async getSourcesForUser(username?: string): Promise<EmbySourceConfig[]> {
    // 获取管理员公共源
    const adminSources = await this.getSources();
    const publicSources = adminSources.filter(s => (s as any).isPublic === true);

    // 如果提供了用户名，合并用户私人源
    if (username) {
      const userConfig = await dbManager.getUserEmbyConfig(username);
      const userSources: EmbySourceConfig[] = (userConfig?.sources && Array.isArray(userConfig.sources))
        ? userConfig.sources
        : [];

      // 合并：用户私人源优先，公共源补充（key 不重复）
      const userKeys = new Set(userSources.map(s => s.key));
      const mergedPublic = publicSources.filter(s => !userKeys.has(s.key));
      const merged = [...userSources, ...mergedPublic];

      if (merged.length > 0) {
        return merged;
      }

      // 用户和公共源都为空，回退到全局配置
      return adminSources;
    }

    // 无用户名：回退到全局配置（向后兼容）
    return adminSources;
  }

  /**
   * 获取指定key的EmbyClient（用户级）
   * @param username 用户名
   * @param key Emby源的key，如果不指定则使用默认源
   */
  async getClientForUser(username: string, key?: string): Promise<EmbyClient> {
    const sources = await this.getSourcesForUser(username);

    if (sources.length === 0) {
      throw new Error('未配置 Emby 源');
    }

    // 如果没有指定key，使用默认源（第一个或标记为default的）
    if (!key) {
      const defaultSource = sources.find(s => s.isDefault) || sources[0];
      key = defaultSource.key;
    }

    // 获取或创建用户的客户端缓存
    if (!this.userClients.has(username)) {
      this.userClients.set(username, new Map());
    }
    const userClientMap = this.userClients.get(username)!;

    // 从缓存获取或创建新实例
    if (!userClientMap.has(key)) {
      const sourceConfig = sources.find(s => s.key === key);
      if (!sourceConfig) {
        throw new Error(`未找到 Emby 源: ${key}`);
      }

      if (!sourceConfig.enabled) {
        throw new Error(`Emby 源已禁用: ${sourceConfig.name}`);
      }

      userClientMap.set(key, new EmbyClient(sourceConfig));
    }

    return userClientMap.get(key)!;
  }

  /**
   * 获取用户所有启用的Emby源配置
   * @param username 用户名
   */
  async getEnabledSourcesForUser(username: string): Promise<EmbySourceConfig[]> {
    const sources = await this.getSourcesForUser(username);
    return sources.filter(s => s.enabled);
  }

  /**
   * 检查用户是否配置了Emby
   * @param username 用户名
   */
  async hasEmbyForUser(username: string): Promise<boolean> {
    const sources = await this.getSourcesForUser(username);
    return sources.some(s => s.enabled && s.ServerURL);
  }

  /**
   * 清除用户的客户端缓存
   * @param username 用户名，如果不提供则清除所有缓存
   */
  clearUserCache(username?: string) {
    if (username) {
      this.userClients.delete(username);
    } else {
      this.userClients.clear();
    }
  }

  /**
   * 获取指定key的EmbyClient（向后兼容，使用全局配置）
   * @param key Emby源的key，如果不指定则使用默认源
   * @deprecated 使用 getClientForUser 替代
   */
  async getClient(key?: string): Promise<EmbyClient> {
    const sources = await this.getSources();

    if (sources.length === 0) {
      throw new Error('未配置 Emby 源');
    }

    // 如果没有指定key，使用默认源（第一个或标记为default的）
    if (!key) {
      const defaultSource = sources.find(s => s.isDefault) || sources[0];
      key = defaultSource.key;
    }

    // 从缓存获取或创建新实例
    if (!this.clients.has(key)) {
      const sourceConfig = sources.find(s => s.key === key);
      if (!sourceConfig) {
        throw new Error(`未找到 Emby 源: ${key}`);
      }

      if (!sourceConfig.enabled) {
        throw new Error(`Emby 源已禁用: ${sourceConfig.name}`);
      }

      this.clients.set(key, new EmbyClient(sourceConfig));
    }

    return this.clients.get(key)!;
  }

  /**
   * 获取所有启用的EmbyClient
   */
  async getAllClients(): Promise<Map<string, { client: EmbyClient; config: EmbySourceConfig }>> {
    const sources = await this.getSources();
    const enabledSources = sources.filter(s => s.enabled);
    const result = new Map<string, { client: EmbyClient; config: EmbySourceConfig }>();

    for (const source of enabledSources) {
      if (!this.clients.has(source.key)) {
        this.clients.set(source.key, new EmbyClient(source));
      }
      result.set(source.key, {
        client: this.clients.get(source.key)!,
        config: source,
      });
    }

    return result;
  }

  /**
   * 获取所有启用的Emby源配置
   */
  async getEnabledSources(): Promise<EmbySourceConfig[]> {
    const sources = await this.getSources();
    return sources.filter(s => s.enabled);
  }

  /**
   * 检查是否配置了Emby
   */
  async hasEmby(): Promise<boolean> {
    const sources = await this.getSources();
    return sources.some(s => s.enabled && s.ServerURL);
  }

  /**
   * 清除缓存的客户端实例
   */
  clearCache() {
    this.clients.clear();
  }
}

export const embyManager = EmbyManager.getInstance();

/**
 * 配置迁移函数：将旧格式配置迁移到新格式
 */
export function migrateEmbyConfig(config: AdminConfig): AdminConfig {
  // 如果已经是新格式，直接返回
  if (config.EmbyConfig?.Sources) {
    return config;
  }

  // 如果是旧格式，迁移到新格式
  const embyConfig = config.EmbyConfig as any;
  if (embyConfig && embyConfig.ServerURL) {
    config.EmbyConfig = {
      Sources: [{
        key: 'default',
        name: 'Emby',
        enabled: embyConfig.Enabled ?? false,
        ServerURL: embyConfig.ServerURL || '',
        ApiKey: embyConfig.ApiKey,
        Username: embyConfig.Username,
        Password: embyConfig.Password,
        UserId: embyConfig.UserId,
        AuthToken: embyConfig.AuthToken,
        Libraries: embyConfig.Libraries,
        LastSyncTime: embyConfig.LastSyncTime,
        ItemCount: embyConfig.ItemCount,
        isDefault: true,
        // 高级选项默认值
        removeEmbyPrefix: false,
        appendMediaSourceId: false,
        transcodeMp4: false,
        proxyPlay: false,
      }],
    };
  }

  return config;
}
