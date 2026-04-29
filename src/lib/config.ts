/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { unstable_noStore } from 'next/cache';

import { db } from '@/lib/db';

import { AdminConfig } from './admin.types';
import { DEFAULT_USER_AGENT } from './user-agent';

export interface ApiSite {
  key: string;
  api: string;
  name: string;
  detail?: string;
}

export interface LiveCfg {
  name: string;
  url: string;
  ua?: string;
  epg?: string; // 节目单
  isTvBox?: boolean;
}

interface ConfigFileStruct {
  cache_time?: number;
  api_site?: {
    [key: string]: ApiSite;
  };
  custom_category?: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
  }[];
  lives?: {
    [key: string]: LiveCfg;
  }
}

export const API_CONFIG = {
  search: {
    path: '?ac=videolist&wd=',
    pagePath: '?ac=videolist&wd={query}&pg={page}',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json',
    },
  },
  detail: {
    path: '?ac=videolist&ids=',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json',
    },
  },
};

// 在模块加载时根据环境决定配置来源
let cachedConfig: AdminConfig;


// 从配置文件补充管理员配置
export function refineConfig(adminConfig: AdminConfig): AdminConfig {
  let fileConfig: ConfigFileStruct;
  try {
    fileConfig = JSON.parse(adminConfig.ConfigFile) as ConfigFileStruct;
  } catch (e) {
    fileConfig = {} as ConfigFileStruct;
  }

  // 合并文件中的源信息
  const apiSitesFromFile = Object.entries(fileConfig.api_site || []);

  // 保留所有现有源（包括 custom 和 config），以便保留用户的手动修改
  const currentApiSites = new Map(
    (adminConfig.SourceConfig || [])
      .map((s) => [s.key, s])
  );

  // 获取配置文件中的所有源 key
  const apiKeysInFile = new Set(apiSitesFromFile.map(([key]) => key));

  // 删除不在配置文件中的 from='config' 的源
  currentApiSites.forEach((source, key) => {
    if (source.from === 'config' && !apiKeysInFile.has(key)) {
      currentApiSites.delete(key);
    }
  });

  // 添加或更新订阅中的所有源
  apiSitesFromFile.forEach(([key, site]) => {
    const existingSource = currentApiSites.get(key);
    if (existingSource) {
      // 如果源已存在，更新基本信息但保留用户手动设置的字段
      existingSource.name = site.name;
      existingSource.api = site.api;
      existingSource.detail = site.detail;
      // 保留用户手动设置的 from、type、is_adult、disabled 等字段
    } else {
      // 添加新的订阅源
      currentApiSites.set(key, {
        key,
        name: site.name,
        api: site.api,
        detail: site.detail,
        from: 'config',
        disabled: false,
        type: 'vod', // 默认为普通视频类型
      });
    }
  });

  // 将 Map 转换回数组
  adminConfig.SourceConfig = Array.from(currentApiSites.values());

  // 覆盖 CustomCategories
  const customCategoriesFromFile = fileConfig.custom_category || [];

  // 保留所有现有自定义分类（包括 custom 和 config），以便保留用户的手动修改
  const currentCustomCategories = new Map(
    (adminConfig.CustomCategories || [])
      .map((c) => [c.query + c.type, c])
  );

  // 获取配置文件中的所有分类 key
  const categoryKeysInFile = new Set(customCategoriesFromFile.map((c) => c.query + c.type));

  // 删除不在配置文件中的 from='config' 的分类
  currentCustomCategories.forEach((category, key) => {
    if (category.from === 'config' && !categoryKeysInFile.has(key)) {
      currentCustomCategories.delete(key);
    }
  });

  // 添加或更新订阅中的所有自定义分类
  customCategoriesFromFile.forEach((category) => {
    const key = category.query + category.type;
    const existedCategory = currentCustomCategories.get(key);
    if (existedCategory) {
      // 如果分类已存在，更新基本信息但保留用户手动设置的字段
      existedCategory.name = category.name;
      existedCategory.query = category.query;
      existedCategory.type = category.type;
      // 保留用户手动设置的 from、disabled 等字段
    } else {
      // 添加新的订阅分类
      currentCustomCategories.set(key, {
        name: category.name,
        type: category.type,
        query: category.query,
        from: 'config',
        disabled: false,
      });
    }
  });

  // 将 Map 转换回数组
  adminConfig.CustomCategories = Array.from(currentCustomCategories.values());

  const livesFromFile = Object.entries(fileConfig.lives || []);

  // 保留所有现有直播源（包括 custom 和 config），以便保留用户的手动修改
  const currentLives = new Map(
    (adminConfig.LiveConfig || [])
      .map((l) => [l.key, l])
  );

  // 获取配置文件中的所有直播源 key
  const liveKeysInFile = new Set(livesFromFile.map(([key]) => key));

  // 删除不在配置文件中的 from='config' 的直播源
  currentLives.forEach((live, key) => {
    if (live.from === 'config' && !liveKeysInFile.has(key)) {
      currentLives.delete(key);
    }
  });

  // 添加或更新订阅中的所有直播源
  livesFromFile.forEach(([key, site]) => {
    const existingLive = currentLives.get(key);
    if (existingLive) {
      // 如果直播源已存在，更新基本信息但保留用户手动设置的字段
      existingLive.name = site.name;
      existingLive.url = site.url;
      existingLive.ua = site.ua;
      existingLive.epg = site.epg;
      // 保留用户手动设置的 from、disabled、channelNumber 等字段
    } else {
      // 添加新的订阅直播源
      currentLives.set(key, {
        key,
        name: site.name,
        url: site.url,
        ua: site.ua,
        epg: site.epg,
        channelNumber: 0,
        from: 'config',
        disabled: false,
      });
    }
  });

  // 将 Map 转换回数组
  adminConfig.LiveConfig = Array.from(currentLives.values());

  return adminConfig;
}

async function getInitConfig(configFile: string, subConfig: {
  URL: string;
  AutoUpdate: boolean;
  LastCheck: string;
} = {
    URL: "",
    AutoUpdate: false,
    LastCheck: "",
  }): Promise<AdminConfig> {
  let cfgFile: ConfigFileStruct;
  try {
    cfgFile = JSON.parse(configFile) as ConfigFileStruct;
  } catch (e) {
    cfgFile = {} as ConfigFileStruct;
  }
  const adminConfig: AdminConfig = {
    ConfigFile: configFile,
    ConfigSubscribtion: subConfig,
    SiteConfig: {
      SiteName: process.env.NEXT_PUBLIC_SITE_NAME || 'MoonTV',
      Announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      SearchDownstreamMaxPage:
        Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
      SiteInterfaceCacheTime: cfgFile.cache_time || 7200,
      DoubanProxyType:
        process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'direct',
      DoubanProxy: process.env.NEXT_PUBLIC_DOUBAN_PROXY || '',
      DoubanImageProxyType:
        process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE || 'server',
      DoubanImageProxy: process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY || '',
      DisableYellowFilter:
        process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true',
      ShowAdultContent: false, // 默认不显示成人内容，可在管理面板修改
      FluidSearch:
        process.env.NEXT_PUBLIC_FLUID_SEARCH !== 'false',
      EnableWebLive: false,
      // TMDB配置默认值
      TMDBApiKey: process.env.TMDB_API_KEY || '',
      TMDBLanguage: 'zh-CN',
      EnableTMDBActorSearch: false, // 默认关闭，需要配置API Key后手动开启
    },
    UserConfig: {
      AllowRegister: true, // 默认允许注册
      Users: [],
    },
    SourceConfig: [],
    CustomCategories: [],
    LiveConfig: [],
  };

  // 补充用户信息
  let userNames: string[] = [];
  try {
    userNames = await db.getAllUsers();
  } catch (e) {
    console.error('获取用户列表失败:', e);
  }
  const allUsers = userNames.filter((u) => u !== process.env.USERNAME).map((u) => ({
    username: u,
    role: 'user',
    banned: false,
  }));
  allUsers.unshift({
    username: process.env.USERNAME!,
    role: 'owner',
    banned: false,
  });
  adminConfig.UserConfig.Users = allUsers as any;

  // 从配置文件中补充源信息
  Object.entries(cfgFile.api_site || []).forEach(([key, site]) => {
    adminConfig.SourceConfig.push({
      key: key,
      name: site.name,
      api: site.api,
      detail: site.detail,
      from: 'config',
      disabled: false,
    });
  });

  // 从配置文件中补充自定义分类信息
  cfgFile.custom_category?.forEach((category) => {
    adminConfig.CustomCategories.push({
      name: category.name || category.query,
      type: category.type,
      query: category.query,
      from: 'config',
      disabled: false,
    });
  });

  // 从配置文件中补充直播源信息
  Object.entries(cfgFile.lives || []).forEach(([key, live]) => {
    if (!adminConfig.LiveConfig) {
      adminConfig.LiveConfig = [];
    }
    adminConfig.LiveConfig.push({
      key,
      name: live.name,
      url: live.url,
      ua: live.ua,
      epg: live.epg,
      isTvBox: live.isTvBox,
      channelNumber: 0,
      from: 'config',
      disabled: false,
    });
  });

  return adminConfig;
}

export async function getConfig(): Promise<AdminConfig> {
  // 🔥 防止 Next.js 在 Docker 环境下缓存配置（解决站点名称更新问题）
  unstable_noStore();

  // 🔥 完全移除内存缓存检查 - Docker 环境下模块级变量不会被清除
  // 参考：https://nextjs.org/docs/app/guides/memory-usage
  // 每次都从数据库读取最新配置，确保动态配置立即生效

  // 读 db
  let adminConfig: AdminConfig | null = null;
  try {
    adminConfig = await db.getAdminConfig();
  } catch (e) {
    console.error('获取管理员配置失败:', e);
  }

  // db 中无配置，执行一次初始化
  if (!adminConfig) {
    adminConfig = await getInitConfig("");
  }
  adminConfig = await configSelfCheck(adminConfig);

  // 🔥 仍然更新 cachedConfig 以保持向后兼容，但不再依赖它
  cachedConfig = adminConfig;

  return adminConfig;
}

// 清除配置缓存，强制重新从数据库读取
export function clearConfigCache(): void {
  cachedConfig = null as any;
}

export async function configSelfCheck(adminConfig: AdminConfig): Promise<AdminConfig> {
  // 确保必要的属性存在和初始化
  if (!adminConfig.UserConfig) {
    adminConfig.UserConfig = { AllowRegister: true, Users: [] };
  }
  if (!adminConfig.UserConfig.Users || !Array.isArray(adminConfig.UserConfig.Users)) {
    adminConfig.UserConfig.Users = [];
  }

  // 🔥 关键修复：每次都从数据库获取最新的用户列表
  try {
    const dbUsers = await db.getAllUsers();
    const ownerUser = process.env.USERNAME;

    // 创建用户列表：保留数据库中存在的用户的配置信息
    const updatedUsers = await Promise.all(dbUsers.map(async username => {
      // 查找现有配置中是否有这个用户
      const existingUserConfig = adminConfig.UserConfig.Users.find(u => u.username === username);

      if (existingUserConfig) {
        // 保留现有配置
        return existingUserConfig;
      } else {
        // 新用户，创建默认配置
        let createdAt = Date.now();
        let oidcSub: string | undefined;
        let tags: string[] | undefined;
        let role: 'owner' | 'admin' | 'user' = username === ownerUser ? 'owner' : 'user';
        let banned = false;
        let enabledApis: string[] | undefined;

        try {
          // 从数据库V2获取用户信息（OIDC/新版用户）
          const userInfoV2 = await db.getUserInfoV2(username);
          console.log(`=== configSelfCheck: 用户 ${username} 数据库信息 ===`, userInfoV2);
          if (userInfoV2) {
            createdAt = userInfoV2.createdAt || Date.now();
            oidcSub = userInfoV2.oidcSub;
            tags = userInfoV2.tags;
            role = userInfoV2.role || role;
            banned = userInfoV2.banned || false;
            enabledApis = userInfoV2.enabledApis;
            console.log(`=== configSelfCheck: 用户 ${username} tags ===`, tags);
          }
        } catch (err) {
          console.warn(`获取用户 ${username} 信息失败:`, err);
        }

        const newUserConfig: any = {
          username,
          role,
          banned,
          createdAt,
        };

        if (oidcSub) {
          newUserConfig.oidcSub = oidcSub;
        }
        if (tags && tags.length > 0) {
          newUserConfig.tags = tags;
          console.log(`=== configSelfCheck: 用户 ${username} 最终配置包含tags ===`, newUserConfig.tags);
        } else {
          console.log(`=== configSelfCheck: 用户 ${username} 没有tags (tags=${tags}) ===`);
        }
        if (enabledApis && enabledApis.length > 0) {
          newUserConfig.enabledApis = enabledApis;
        }

        return newUserConfig;
      }
    }));

    // 更新用户列表
    adminConfig.UserConfig.Users = updatedUsers;
  } catch (e) {
    console.error('获取最新用户列表失败:', e);
    // 失败时继续使用现有配置
  }
  // 确保 AllowRegister 有默认值
  if (adminConfig.UserConfig.AllowRegister === undefined) {
    adminConfig.UserConfig.AllowRegister = true;
  }
  if (!adminConfig.SourceConfig || !Array.isArray(adminConfig.SourceConfig)) {
    adminConfig.SourceConfig = [];
  }
  if (!adminConfig.CustomCategories || !Array.isArray(adminConfig.CustomCategories)) {
    adminConfig.CustomCategories = [];
  }
  if (!adminConfig.LiveConfig || !Array.isArray(adminConfig.LiveConfig)) {
    adminConfig.LiveConfig = [];
  }
  
  // 确保网盘搜索配置有默认值
  if (!adminConfig.NetDiskConfig) {
    adminConfig.NetDiskConfig = {
      enabled: true,                                    // 默认启用
      pansouUrl: 'https://so.252035.xyz',               // 默认公益服务
      timeout: 30,                                      // 默认30秒超时
      enabledCloudTypes: ['baidu', 'aliyun', 'quark'] // 默认只启用百度、阿里、夸克三大主流网盘
    };
  }

  // 确保AI推荐配置有默认值
  if (!adminConfig.AIRecommendConfig) {
    adminConfig.AIRecommendConfig = {
      enabled: false,                                   // 默认关闭
      apiUrl: 'https://api.openai.com/v1',             // 默认OpenAI API
      apiKey: '',                                       // 默认为空，需要管理员配置
      model: 'gpt-3.5-turbo',                          // 默认模型
      temperature: 0.7,                                // 默认温度
      maxTokens: 3000                                  // 默认最大token数
    };
  }

  // 确保YouTube配置有默认值
  if (!adminConfig.YouTubeConfig) {
    adminConfig.YouTubeConfig = {
      enabled: false,                                   // 默认关闭
      apiKey: '',                                       // 默认为空，需要管理员配置
      enableDemo: true,                                 // 默认启用演示模式
      maxResults: 25,                                   // 默认每页25个结果
      enabledRegions: ['US', 'CN', 'JP', 'KR', 'GB', 'DE', 'FR'], // 默认启用的地区
      enabledCategories: ['Film & Animation', 'Music', 'Gaming', 'News & Politics', 'Entertainment'] // 默认启用的分类
    };
  }

  // 确保短剧配置有默认值
  if (!adminConfig.ShortDramaConfig) {
    adminConfig.ShortDramaConfig = {
      primaryApiUrl: 'https://wwzy.tv/api.php/provide/vod',  // 默认主API
      alternativeApiUrl: '',                            // 默认为空，需要管理员配置
      enableAlternative: false,                         // 默认关闭备用API
    };
  }

  // 确保下载配置有默认值
  if (!adminConfig.DownloadConfig) {
    adminConfig.DownloadConfig = {
      enabled: true,                                    // 默认启用下载功能
    };
  }

  // 确保豆瓣配置有默认值
  if (!adminConfig.DoubanConfig) {
    adminConfig.DoubanConfig = {
      enablePuppeteer: false,                           // 默认关闭 Puppeteer（省资源）
    };
  }

  // 确保 Cron 配置有默认值
  if (!adminConfig.CronConfig) {
    adminConfig.CronConfig = {
      enableAutoRefresh: true,                          // 默认启用自动刷新
      maxRecordsPerRun: 100,                            // 每次最多处理 100 条记录
      onlyRefreshRecent: true,                          // 仅刷新最近活跃的记录
      recentDays: 30,                                   // 最近 30 天内活跃
      onlyRefreshOngoing: true,                         // 仅刷新连载中的剧集
    };
  }

  // 确保 Bilibili 配置有默认值
  if (!adminConfig.BilibiliConfig) {
    adminConfig.BilibiliConfig = {
      enabled: true,                                    // 默认启用（无需API Key）
      loginStatus: 'not_logged_in',                     // 默认未登录
    };
  }

  // 🔥 OIDC 配置迁移：从单 Provider 迁移到多 Provider
  if (adminConfig.OIDCAuthConfig && !adminConfig.OIDCProviders) {
    // 自动识别 Provider ID
    let providerId = 'custom';
    const issuer = adminConfig.OIDCAuthConfig.issuer?.toLowerCase() || '';

    if (issuer.includes('google') || issuer.includes('accounts.google.com')) {
      providerId = 'google';
    } else if (issuer.includes('github')) {
      providerId = 'github';
    } else if (issuer.includes('microsoft') || issuer.includes('login.microsoftonline.com')) {
      providerId = 'microsoft';
    } else if (issuer.includes('linux.do') || issuer.includes('connect.linux.do')) {
      providerId = 'linuxdo';
    }

    // 迁移到新格式
    adminConfig.OIDCProviders = [{
      id: providerId,
      name: adminConfig.OIDCAuthConfig.buttonText || providerId.toUpperCase(),
      enabled: adminConfig.OIDCAuthConfig.enabled,
      enableRegistration: adminConfig.OIDCAuthConfig.enableRegistration,
      issuer: adminConfig.OIDCAuthConfig.issuer,
      authorizationEndpoint: adminConfig.OIDCAuthConfig.authorizationEndpoint,
      tokenEndpoint: adminConfig.OIDCAuthConfig.tokenEndpoint,
      userInfoEndpoint: adminConfig.OIDCAuthConfig.userInfoEndpoint,
      clientId: adminConfig.OIDCAuthConfig.clientId,
      clientSecret: adminConfig.OIDCAuthConfig.clientSecret,
      buttonText: adminConfig.OIDCAuthConfig.buttonText,
      minTrustLevel: adminConfig.OIDCAuthConfig.minTrustLevel || 0,
    }];

    console.log(`[Config Migration] Migrated OIDCAuthConfig to OIDCProviders with provider: ${providerId}`);

    // 保留旧配置一段时间以防回滚需要
    // delete adminConfig.OIDCAuthConfig;
  }

  // 站长变更自检
  const ownerUser = process.env.USERNAME;

  // 去重
  const seenUsernames = new Set<string>();
  adminConfig.UserConfig.Users = adminConfig.UserConfig.Users.filter((user) => {
    if (seenUsernames.has(user.username)) {
      return false;
    }
    seenUsernames.add(user.username);
    return true;
  });
  // 过滤站长
  const originOwnerCfg = adminConfig.UserConfig.Users.find((u) => u.username === ownerUser);
  adminConfig.UserConfig.Users = adminConfig.UserConfig.Users.filter((user) => user.username !== ownerUser);
  // 其他用户不得拥有 owner 权限
  adminConfig.UserConfig.Users.forEach((user) => {
    if (user.role === 'owner') {
      user.role = 'user';
    }
  });
  // 重新添加回站长
  adminConfig.UserConfig.Users.unshift({
    username: ownerUser!,
    role: 'owner',
    banned: false,
    enabledApis: originOwnerCfg?.enabledApis || undefined,
    tags: originOwnerCfg?.tags || undefined,
  });

  // 采集源去重
  const seenSourceKeys = new Set<string>();
  adminConfig.SourceConfig = adminConfig.SourceConfig.filter((source) => {
    if (seenSourceKeys.has(source.key)) {
      return false;
    }
    seenSourceKeys.add(source.key);
    return true;
  });

  // 自定义分类去重
  const seenCustomCategoryKeys = new Set<string>();
  adminConfig.CustomCategories = adminConfig.CustomCategories.filter((category) => {
    if (seenCustomCategoryKeys.has(category.query + category.type)) {
      return false;
    }
    seenCustomCategoryKeys.add(category.query + category.type);
    return true;
  });

  // 直播源去重
  const seenLiveKeys = new Set<string>();
  adminConfig.LiveConfig = adminConfig.LiveConfig.filter((live) => {
    if (seenLiveKeys.has(live.key)) {
      return false;
    }
    seenLiveKeys.add(live.key);
    return true;
  });

  return adminConfig;
}

export async function resetConfig() {
  let originConfig: AdminConfig | null = null;
  try {
    originConfig = await db.getAdminConfig();
  } catch (e) {
    console.error('获取管理员配置失败:', e);
  }
  if (!originConfig) {
    originConfig = {} as AdminConfig;
  }
  const adminConfig = await getInitConfig(originConfig.ConfigFile, originConfig.ConfigSubscribtion);
  cachedConfig = adminConfig;
  await db.saveAdminConfig(adminConfig);

  return;
}

export async function getCacheTime(): Promise<number> {
  const config = await getConfig();
  return config.SiteConfig.SiteInterfaceCacheTime || 7200;
}

// Helper function to apply VideoProxyConfig to API sites
function applyVideoProxy(sites: ApiSite[], config: AdminConfig): ApiSite[] {
  const proxyConfig = config.VideoProxyConfig;

  // If proxy is not enabled, return sites as-is
  if (!proxyConfig?.enabled || !proxyConfig.proxyUrl) {
    return sites;
  }

  const proxyBaseUrl = proxyConfig.proxyUrl.replace(/\/$/, ''); // Remove trailing slash

  return sites.map(source => {
    // Extract real API URL (remove old proxy if exists)
    let realApiUrl = source.api;
    const urlMatch = source.api.match(/[?&]url=([^&]+)/);
    if (urlMatch) {
      realApiUrl = decodeURIComponent(urlMatch[1]);
      console.log(`[Video Proxy] ${source.name}: Detected old proxy, replacing with new proxy`);
    }

    // Extract source ID from real API URL
    const extractSourceId = (apiUrl: string): string => {
      try {
        const url = new URL(apiUrl);
        const hostname = url.hostname;
        const parts = hostname.split('.');

        // For caiji.xxx.com or api.xxx.com format, take second-to-last part
        if (parts.length >= 3 && (parts[0] === 'caiji' || parts[0] === 'api' || parts[0] === 'cj' || parts[0] === 'www')) {
          return parts[parts.length - 2].toLowerCase().replace(/[^a-z0-9]/g, '');
        }

        // Otherwise take first part (remove zyapi/zy suffix)
        let name = parts[0].toLowerCase();
        name = name.replace(/zyapi$/, '').replace(/zy$/, '').replace(/api$/, '');
        return name.replace(/[^a-z0-9]/g, '') || 'source';
      } catch {
        return source.key || source.name.replace(/[^a-z0-9]/g, '');
      }
    };

    const sourceId = extractSourceId(realApiUrl);
    const proxiedApi = `${proxyBaseUrl}/p/${sourceId}?url=${encodeURIComponent(realApiUrl)}`;

    console.log(`[Video Proxy] ${source.name}: ✓ Applied proxy`);

    return {
      ...source,
      api: proxiedApi,
    };
  });
}

export async function getAvailableApiSites(user?: string): Promise<ApiSite[]> {
  const config = await getConfig();

  // 确定成人内容显示权限，优先级：用户 > 用户组 > 全局
  let showAdultContent = config.SiteConfig.ShowAdultContent;

  if (user) {
    const userConfig = config.UserConfig.Users.find((u) => u.username === user);

    if (userConfig) {
      // 用户级别优先
      if (userConfig.showAdultContent !== undefined) {
        showAdultContent = userConfig.showAdultContent;
      }
      // 如果用户没有设置，检查用户组设置
      else if (userConfig.tags && userConfig.tags.length > 0 && config.UserConfig.Tags) {
        // 如果用户有多个用户组，只要有一个用户组允许就允许（取并集）
        const hasAnyTagAllowAdult = userConfig.tags.some(tagName => {
          const tagConfig = config.UserConfig.Tags?.find(t => t.name === tagName);
          return tagConfig?.showAdultContent === true;
        });
        if (hasAnyTagAllowAdult) {
          showAdultContent = true;
        } else {
          // 检查是否有任何用户组明确禁止
          const hasAnyTagDenyAdult = userConfig.tags.some(tagName => {
            const tagConfig = config.UserConfig.Tags?.find(t => t.name === tagName);
            return tagConfig?.showAdultContent === false;
          });
          if (hasAnyTagDenyAdult) {
            showAdultContent = false;
          }
        }
      }
    }
  }

  // 过滤掉禁用的源，如果未启用成人内容则同时过滤掉成人资源
  const allApiSites = config.SourceConfig.filter((s) => {
    if (s.disabled) return false;
    if (!showAdultContent && s.is_adult) return false;
    return true;
  });

  if (!user) {
    return applyVideoProxy(allApiSites, config);
  }

  const userConfig = config.UserConfig.Users.find((u) => u.username === user);
  if (!userConfig) {
    return applyVideoProxy(allApiSites, config);
  }

  // 优先根据用户自己的 enabledApis 配置查找
  if (userConfig.enabledApis && userConfig.enabledApis.length > 0) {
    const userApiSitesSet = new Set(userConfig.enabledApis);
    const userSites = allApiSites.filter((s) => userApiSitesSet.has(s.key)).map((s) => ({
      key: s.key,
      name: s.name,
      api: s.api,
      detail: s.detail,
    }));
    return applyVideoProxy(userSites, config);
  }

  // 如果没有 enabledApis 配置，则根据 tags 查找
  if (userConfig.tags && userConfig.tags.length > 0 && config.UserConfig.Tags) {
    const enabledApisFromTags = new Set<string>();

    // 遍历用户的所有 tags，收集对应的 enabledApis
    userConfig.tags.forEach(tagName => {
      const tagConfig = config.UserConfig.Tags?.find(t => t.name === tagName);
      if (tagConfig && tagConfig.enabledApis) {
        tagConfig.enabledApis.forEach(apiKey => enabledApisFromTags.add(apiKey));
      }
    });

    if (enabledApisFromTags.size > 0) {
      const tagSites = allApiSites.filter((s) => enabledApisFromTags.has(s.key)).map((s) => ({
        key: s.key,
        name: s.name,
        api: s.api,
        detail: s.detail,
      }));
      return applyVideoProxy(tagSites, config);
    }
  }

  // 如果都没有配置，返回所有可用的 API 站点
  return applyVideoProxy(allApiSites, config);
}

export async function setCachedConfig(config: AdminConfig) {
  cachedConfig = config;
}

// 特殊功能权限检查
export async function hasSpecialFeaturePermission(
  username: string,
  feature: 'ai-recommend' | 'youtube-search',
  providedConfig?: AdminConfig
): Promise<boolean> {
  try {
    // 站长默认拥有所有权限
    if (username === process.env.USERNAME) {
      return true;
    }

    // 使用提供的配置或获取新配置
    const config = providedConfig || await getConfig();
    const userConfig = config.UserConfig.Users.find((u) => u.username === username);

    // 如果用户不在配置中，检查是否是新注册用户
    if (!userConfig) {
      // 新注册用户默认无特殊功能权限，但不阻止基本访问
      // 这里返回false是正确的，因为新用户默认不应该有AI/YouTube权限
      return false;
    }

    // 管理员默认拥有所有权限
    if (userConfig.role === 'admin') {
      return true;
    }

    // 普通用户需要检查特殊功能权限
    // 优先检查用户直接配置的 enabledApis
    if (userConfig.enabledApis && userConfig.enabledApis.length > 0) {
      return userConfig.enabledApis.includes(feature);
    }

    // 如果没有直接配置，检查用户组 tags 的权限
    if (userConfig.tags && userConfig.tags.length > 0 && config.UserConfig.Tags) {
      for (const tagName of userConfig.tags) {
        const tagConfig = config.UserConfig.Tags.find(t => t.name === tagName);
        if (tagConfig && tagConfig.enabledApis && tagConfig.enabledApis.includes(feature)) {
          return true;
        }
      }
    }

    // 默认情况下，普通用户无权使用特殊功能
    return false;
  } catch (error) {
    console.error('权限检查失败:', error);
    // 出错时，如果是站长则返回true，否则返回false
    return username === process.env.USERNAME;
  }
}