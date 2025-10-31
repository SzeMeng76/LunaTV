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
  TelegramAuthConfig?: {
    enabled: boolean;                    // 是否启用Telegram登录
    botToken: string;                    // Telegram Bot Token
    botUsername: string;                 // Telegram Bot Username
    autoRegister: boolean;               // 是否自动注册新用户
    buttonSize: 'large' | 'medium' | 'small'; // 按钮大小
    showAvatar: boolean;                 // 是否显示用户头像
    requestWriteAccess: boolean;         // 是否请求发送消息权限
  };
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}
