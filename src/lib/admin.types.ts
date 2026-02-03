export interface AdminConfig {
  ConfigSubscribtion: {
    URL: string;
    AutoUpdate: boolean;
    LastCheck: string;
  };
  ConfigFile: string;
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SearchDownstreamMaxPage: number;
    SiteInterfaceCacheTime: number;
    DoubanProxyType: string;
    DoubanProxy: string;
    DoubanImageProxyType: string;
    DoubanImageProxy: string;
    DisableYellowFilter: boolean;
    ShowAdultContent: boolean; // 是否显示成人内容，默认 false
    FluidSearch: boolean;
    // TMDB配置
    TMDBApiKey?: string;
    TMDBLanguage?: string;
    EnableTMDBActorSearch?: boolean;
    // 自定义去广告代码
    CustomAdFilterCode?: string;
    CustomAdFilterVersion?: number;
    // 默认用户组
    DefaultUserTags?: string[];
  };
  UserConfig: {
    AllowRegister?: boolean; // 是否允许用户注册，默认 true
    AutoCleanupInactiveUsers?: boolean; // 是否自动清理非活跃用户，默认 false
    InactiveUserDays?: number; // 非活跃用户保留天数，默认 7
    Users: {
      username: string;
      role: 'user' | 'admin' | 'owner';
      banned?: boolean;
      enabledApis?: string[]; // 优先级高于tags限制（网站内搜索用）
      tags?: string[]; // 多 tags 取并集限制
      createdAt?: number; // 用户注册时间戳
      tvboxToken?: string; // 用户专属的 TVBox Token
      tvboxEnabledSources?: string[]; // TVBox 可访问的源（为空则返回所有源）
      showAdultContent?: boolean; // 用户级别的成人内容显示控制
      oidcSub?: string; // OIDC的唯一标识符(sub字段)
    }[];
    Tags?: {
      name: string;
      enabledApis: string[];
      showAdultContent?: boolean; // 用户组级别的成人内容显示控制
    }[];
  };
  SourceConfig: {
    key: string;
    name: string;
    api: string;
    detail?: string;
    from: 'config' | 'custom';
    disabled?: boolean;
    is_adult?: boolean;
    type?: 'vod' | 'shortdrama'; // 视频源类型：vod=普通视频，shortdrama=短剧（系统会自动查找"短剧"分类）
    weight?: number; // 优先级权重：0-100，数字越大优先级越高，默认50。播放时先按权重排序，同权重再按测速结果
  }[];
  CustomCategories: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  LiveConfig?: {
    key: string;
    name: string;
    url: string;  // m3u 地址
    ua?: string;
    epg?: string; // 节目单
    isTvBox?: boolean;
    from: 'config' | 'custom';
    channelNumber?: number;
    disabled?: boolean;
  }[];
  NetDiskConfig?: {
    enabled: boolean;                    // 是否启用网盘搜索
    pansouUrl: string;                   // PanSou服务地址
    timeout: number;                     // 请求超时时间(秒)
    enabledCloudTypes: string[];         // 启用的网盘类型
  };
  AIRecommendConfig?: {
    enabled: boolean;                    // 是否启用AI推荐功能
    apiUrl: string;                      // OpenAI兼容API地址
    apiKey: string;                      // API密钥
    model: string;                       // 模型名称
    temperature: number;                 // 温度参数 0-2
    maxTokens: number;                   // 最大token数
    // 🔥 智能协调器（Orchestrator）配置
    enableOrchestrator?: boolean;        // 是否启用智能协调器（意图分析+联网搜索）
    enableWebSearch?: boolean;           // 是否启用联网搜索
    tavilyApiKeys?: string[];            // Tavily API Keys（支持多个轮询，1000次/月免费）
  };
  YouTubeConfig?: {
    enabled: boolean;                    // 是否启用YouTube搜索功能
    apiKey: string;                      // YouTube Data API v3密钥
    enableDemo: boolean;                 // 是否启用演示模式
    maxResults: number;                  // 每页最大搜索结果数
    enabledRegions: string[];            // 启用的地区代码列表
    enabledCategories: string[];         // 启用的视频分类列表
  };
  TVBoxSecurityConfig?: {
    enableAuth: boolean;                 // 是否启用Token验证
    token: string;                       // 访问Token
    enableIpWhitelist: boolean;          // 是否启用IP白名单
    allowedIPs: string[];               // 允许的IP地址列表
    enableRateLimit: boolean;            // 是否启用频率限制
    rateLimit: number;                   // 每分钟允许的请求次数
  };
  TVBoxProxyConfig?: {
    enabled: boolean;                    // 是否为TVBox启用Cloudflare Worker代理
    proxyUrl: string;                    // Cloudflare Worker代理地址（例如：https://corsapi.smone.workers.dev）
  };
  VideoProxyConfig?: {
    enabled: boolean;                    // 是否为普通视频源启用Cloudflare Worker代理
    proxyUrl: string;                    // Cloudflare Worker代理地址（例如：https://corsapi.smone.workers.dev）
  };
  TelegramAuthConfig?: {
    enabled: boolean;                    // 是否启用Telegram登录
    botToken: string;                    // Telegram Bot Token
    botUsername: string;                 // Telegram Bot Username
    autoRegister: boolean;               // 是否自动注册新用户
    buttonSize: 'large' | 'medium' | 'small'; // 按钮大小
    showAvatar: boolean;                 // 是否显示用户头像
    requestWriteAccess: boolean;         // 是否请求发送消息权限
  };
  // 旧的单 Provider 配置（保留用于向后兼容）
  OIDCAuthConfig?: {
    enabled: boolean;                    // 是否启用OIDC登录
    enableRegistration: boolean;         // 是否启用OIDC注册
    issuer: string;                      // OIDC Issuer URL (用于自动发现)
    authorizationEndpoint: string;       // 授权端点
    tokenEndpoint: string;               // Token端点
    userInfoEndpoint: string;            // 用户信息端点
    clientId: string;                    // OIDC Client ID
    clientSecret: string;                // OIDC Client Secret
    buttonText: string;                  // OIDC登录按钮文字
    minTrustLevel: number;               // 最低信任等级（仅LinuxDo网站有效，为0时不判断）
  };
  // 新的多 Provider 配置
  OIDCProviders?: {
    id: string;                          // Provider ID (google, github, microsoft, linuxdo, custom)
    name: string;                        // 显示名称
    enabled: boolean;                    // 是否启用此Provider
    enableRegistration: boolean;         // 是否启用注册
    issuer: string;                      // OIDC Issuer URL
    authorizationEndpoint: string;       // 授权端点
    tokenEndpoint: string;               // Token端点
    userInfoEndpoint: string;            // 用户信息端点
    clientId: string;                    // Client ID
    clientSecret: string;                // Client Secret
    buttonText: string;                  // 按钮文字
    minTrustLevel: number;               // 最低信任等级
  }[];
  ShortDramaConfig?: {
    primaryApiUrl: string;               // 主API地址
    alternativeApiUrl: string;           // 备用API地址（私密）
    enableAlternative: boolean;          // 是否启用备用API
  };
  DownloadConfig?: {
    enabled: boolean;                    // 是否启用下载功能（全局开关）
  };
  WatchRoomConfig?: {
    enabled: boolean;                    // 是否启用观影室功能
    serverUrl: string;                   // 外部观影室服务器地址
    authKey: string;                     // 观影室服务器认证密钥
  };
  DoubanConfig?: {
    enablePuppeteer: boolean;            // 是否启用 Puppeteer 绕过 Challenge（默认 false）
    cookies?: string;                    // 豆瓣认证 Cookies（包含 dbcl2, frodotk_db, ck 等）
  };
  CronConfig?: {
    enableAutoRefresh: boolean;          // 是否启用自动刷新播放记录和收藏（默认 true）
    maxRecordsPerRun: number;            // 每次运行最多处理的记录数（默认 100）
    onlyRefreshRecent: boolean;          // 仅刷新最近活跃的记录（默认 true）
    recentDays: number;                  // 最近活跃的天数定义（默认 30）
    onlyRefreshOngoing: boolean;         // 仅刷新连载中的剧集（默认 true）
  };
  TrustedNetworkConfig?: {
    enabled: boolean;                    // 是否启用信任网络模式（内网免登录）
    trustedIPs: string[];               // 信任的IP/CIDR列表（如 192.168.0.0/16, 10.0.0.0/8）
  };
  DanmuApiConfig?: {
    enabled: boolean;                    // 是否启用弹幕API（默认启用）
    useCustomApi: boolean;               // 是否使用自定义API（false则使用默认API）
    customApiUrl: string;                // 自定义弹幕API地址
    customToken: string;                 // 自定义API Token
    timeout: number;                     // 请求超时时间（秒），默认15
  };
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}
