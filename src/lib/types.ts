import { AdminConfig } from './admin.types';

// 播放记录数据结构
export interface PlayRecord {
  title: string;
  source_name: string;
  cover: string;
  year: string;
  index: number; // 第几集
  total_episodes: number; // 总集数
  original_episodes?: number; // 首次观看时的原始集数
  play_time: number; // 播放进度（秒）
  total_time: number; // 总进度（秒）
  save_time: number; // 记录保存时间（时间戳）
  search_title: string; // 搜索时使用的标题
  remarks?: string; // 备注信息（如"已完结"、"更新至20集"等）
  douban_id?: number; // 豆瓣ID（用于准确识别视频）
  type?: string; // 内容类型（anime/tv/movie）用于继续播放时正确请求详情
}

// 收藏数据结构
export interface Favorite {
  source_name: string;
  total_episodes: number; // 总集数
  title: string;
  year: string;
  cover: string;
  save_time: number; // 记录保存时间（时间戳）
  search_title: string; // 搜索时使用的标题
  origin?: 'vod' | 'live' | 'shortdrama';
  type?: string; // 内容类型（movie/tv/variety/shortdrama等）
  releaseDate?: string; // 上映日期 (YYYY-MM-DD)，用于即将上映内容
  remarks?: string; // 备注信息（如"X天后上映"、"已上映"等）
}

// 短剧分类数据结构
export interface ShortDramaCategory {
  type_id: number;
  type_name: string;
}

// 短剧列表项数据结构
export interface ShortDramaItem {
  id: number;
  name: string;
  cover: string;
  update_time: string;
  score: number;
  episode_count: number;
  description?: string;
  author?: string;        // 演员/导演信息
  backdrop?: string;      // 高清背景图
  vote_average?: number;  // 用户评分 (0-10)
  tmdb_id?: number;       // TMDB ID
}

// 短剧解析结果数据结构
export interface ShortDramaParseResult {
  code: number;
  msg?: string;
  data?: {
    videoId: number;
    videoName: string;
    currentEpisode: number;
    totalEpisodes: number;
    parsedUrl: string;
    proxyUrl: string;
    cover: string;
    description: string;
    episode?: {
      index: number;
      label: string;
      parsedUrl: string;
      proxyUrl?: string;
      title?: string;
    };
  };
  metadata?: {
    author?: string;
    backdrop?: string;
    vote_average?: number;
    tmdb_id?: number;
  };
}

// 短剧API响应数据结构
export interface ShortDramaResponse<T> {
  code: number;
  msg?: string;
  data: T;
}

// 存储接口
export interface IStorage {
  // 播放记录相关
  getPlayRecord(userName: string, key: string): Promise<PlayRecord | null>;
  setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void>;
  getAllPlayRecords(userName: string): Promise<{ [key: string]: PlayRecord }>;
  deletePlayRecord(userName: string, key: string): Promise<void>;
  // 🚀 批量写入播放记录（Upstash 优化，使用 mset 只算1条命令）
  setPlayRecordsBatch?(
    userName: string,
    records: { [key: string]: PlayRecord }
  ): Promise<void>;

  // 收藏相关
  getFavorite(userName: string, key: string): Promise<Favorite | null>;
  setFavorite(userName: string, key: string, favorite: Favorite): Promise<void>;
  getAllFavorites(userName: string): Promise<{ [key: string]: Favorite }>;
  deleteFavorite(userName: string, key: string): Promise<void>;
  // 🚀 批量写入收藏（Upstash 优化，使用 mset 只算1条命令）
  setFavoritesBatch?(
    userName: string,
    favorites: { [key: string]: Favorite }
  ): Promise<void>;

  // 用户相关
  registerUser(userName: string, password: string): Promise<void>;
  verifyUser(userName: string, password: string): Promise<boolean>;
  // 检查用户是否存在（无需密码）
  checkUserExist(userName: string): Promise<boolean>;
  // 修改用户密码
  changePassword(userName: string, newPassword: string): Promise<void>;
  // 删除用户（包括密码、搜索历史、播放记录、收藏夹）
  deleteUser(userName: string): Promise<void>;

  // 搜索历史相关
  getSearchHistory(userName: string): Promise<string[]>;
  addSearchHistory(userName: string, keyword: string): Promise<void>;
  deleteSearchHistory(userName: string, keyword?: string): Promise<void>;

  // 用户列表
  getAllUsers(): Promise<string[]>;

  // 管理员配置相关
  getAdminConfig(): Promise<AdminConfig | null>;
  setAdminConfig(config: AdminConfig): Promise<void>;

  // 跳过片头片尾配置相关
  getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null>;
  setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void>;
  deleteSkipConfig(userName: string, source: string, id: string): Promise<void>;
  getAllSkipConfigs(userName: string): Promise<{ [key: string]: EpisodeSkipConfig }>;

  // 数据清理相关
  clearAllData(): Promise<void>;

  // 通用缓存相关（新增）
  getCache(key: string): Promise<any | null>;
  setCache(key: string, data: any, expireSeconds?: number): Promise<void>;
  deleteCache(key: string): Promise<void>;
  clearExpiredCache(prefix?: string): Promise<void>;

  // 播放统计相关
  getPlayStats(): Promise<PlayStatsResult>;
  getUserPlayStat(userName: string): Promise<UserPlayStat>;
  getContentStats(limit?: number): Promise<ContentStat[]>;
  updatePlayStatistics(
    userName: string,
    source: string,
    id: string,
    watchTime: number
  ): Promise<void>;

  // 登入统计相关
  updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean
  ): Promise<void>;
}

// 搜索结果数据结构
export interface SearchResult {
  id: string;
  title: string;
  poster: string;
  episodes: string[];
  episodes_titles: string[];
  source: string;
  source_name: string;
  class?: string;
  year: string;
  desc?: string;
  type_name?: string;
  douban_id?: number;
  remarks?: string; // 备注信息（如"已完结"、"更新至20集"等）
  drama_name?: string; // 短剧名称（用于备用API fallback）
  metadata?: {
    // 备用API提供的额外元数据
    author?: string;
    backdrop?: string;
    vote_average?: number;
    tmdb_id?: number;
  };
}

// 豆瓣数据结构
export interface DoubanItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
  // 详细信息字段
  directors?: string[];
  screenwriters?: string[];
  cast?: string[];
  genres?: string[];
  countries?: string[];
  languages?: string[];
  episodes?: number;
  episode_length?: number;
  movie_duration?: number;
  first_aired?: string;
  plot_summary?: string;
  // 🎬 Netflix风格字段
  backdrop?: string;      // 高清背景图（用于HeroBanner）
  trailerUrl?: string;    // 预告片视频URL
}

export interface DoubanResult {
  code: number;
  message: string;
  list: DoubanItem[];
}

// 豆瓣短评数据结构
export interface DoubanComment {
  username: string;
  user_id: string;
  avatar: string;
  rating: number; // 0-5, 0表示未评分
  time: string;
  location: string;
  content: string;
  useful_count: number;
}

export interface DoubanCommentsResult {
  code: number;
  message: string;
  data?: {
    comments: DoubanComment[];
    start: number;
    limit: number;
    count: number;
  };
}

// ---- 跳过配置（多片段支持）----

// 单个跳过片段
export interface SkipSegment {
  start: number; // 开始时间（秒）
  end: number; // 结束时间（秒）
  type: 'opening' | 'ending'; // 片头或片尾
  title?: string; // 可选的描述
  autoSkip?: boolean; // 是否自动跳过（默认true）
  autoNextEpisode?: boolean; // 片尾是否自动跳转下一集（默认true，仅对ending类型有效）
  mode?: 'absolute' | 'remaining'; // 时间模式：absolute=绝对时间，remaining=剩余时间
  remainingTime?: number; // 剩余时间（秒），仅在mode=remaining时有效
}

// 剧集跳过配置
export interface EpisodeSkipConfig {
  source: string; // 资源站标识
  id: string; // 剧集ID
  title: string; // 剧集标题
  segments: SkipSegment[]; // 跳过片段列表
  updated_time: number; // 最后更新时间
}

// 用户播放统计数据结构
export interface UserPlayStat {
  username: string; // 用户名
  totalWatchTime: number; // 总观看时间（秒）
  totalPlays: number; // 总播放次数
  lastPlayTime: number; // 最后播放时间戳
  recentRecords: PlayRecord[]; // 最近播放记录（最多10条）
  avgWatchTime: number; // 平均每次观看时长
  mostWatchedSource: string; // 最常观看的来源

  // 新增LunaTV-alpha的高级统计字段
  totalMovies?: number; // 观看影片总数（去重）
  firstWatchDate?: number; // 首次观看时间戳
  lastUpdateTime?: number; // 最后更新时间戳
  createdAt?: number; // 注册时间戳
  loginDays?: number; // 累计登录天数
  lastLoginDate?: number; // 最后登录时间（已有字段）
  lastLoginTime?: number; // 最后登入时间戳（新增，与lastLoginDate统一概念）
  firstLoginTime?: number; // 首次登入时间戳（新增）
  loginCount?: number; // 登入次数（新增）
  activeStreak?: number; // 连续活跃天数
  continuousLoginDays?: number; // 连续登录天数
}

// 全站播放统计数据结构
export interface PlayStatsResult {
  totalUsers: number; // 总用户数
  totalWatchTime: number; // 全站总观看时间
  totalPlays: number; // 全站总播放次数
  avgWatchTimePerUser: number; // 用户平均观看时长
  avgPlaysPerUser: number; // 用户平均播放次数
  userStats: Array<{
    username: string;
    totalWatchTime: number;
    totalPlays: number;
    lastPlayTime: number;
    recentRecords: PlayRecord[];
    avgWatchTime: number;
    mostWatchedSource: string;
    registrationDays: number; // 注册天数
    lastLoginTime: number; // 最后登录时间
    loginCount: number; // 登入次数
    createdAt: number; // 用户创建时间
  }>; // 每个用户的统计
  topSources: Array<{
    // 热门来源统计（前5名）
    source: string;
    count: number;
  }>;
  dailyStats: Array<{
    // 近7天每日统计
    date: string;
    watchTime: number;
    plays: number;
  }>;
  // 新增：用户注册统计
  registrationStats: {
    todayNewUsers: number; // 今日新增用户
    totalRegisteredUsers: number; // 总注册用户数
    registrationTrend: Array<{
      // 近7天注册趋势
      date: string;
      newUsers: number;
    }>;
  };
  // 新增：用户活跃度统计
  activeUsers: {
    daily: number; // 日活跃用户数
    weekly: number; // 周活跃用户数
    monthly: number; // 月活跃用户数
  };
}

// 内容热度统计数据结构
export interface ContentStat {
  source: string;
  id: string;
  title: string;
  source_name: string;
  cover: string;
  year: string;
  playCount: number; // 播放次数
  totalWatchTime: number; // 总观看时长
  averageWatchTime: number; // 平均观看时长
  lastPlayed: number; // 最后播放时间
  uniqueUsers: number; // 观看用户数
}

// 发布日历数据结构
export interface ReleaseCalendarItem {
  id: string; // 唯一标识符
  title: string; // 影视名称
  type: 'movie' | 'tv'; // 类型：电影或电视剧
  director: string; // 导演
  actors: string; // 主演
  region: string; // 地区
  genre: string; // 类型/标签
  releaseDate: string; // 发布日期 (YYYY-MM-DD)
  cover?: string; // 封面图片URL
  description?: string; // 简介
  episodes?: number; // 集数（电视剧）
  source: 'manmankan'; // 数据来源
  createdAt: number; // 记录创建时间戳
  updatedAt: number; // 记录更新时间戳
}

// 发布日历API响应结构
export interface ReleaseCalendarResult {
  items: ReleaseCalendarItem[];
  total: number;
  hasMore: boolean;
  filters: {
    types: Array<{ value: 'movie' | 'tv'; label: string; count: number }>;
    regions: Array<{ value: string; label: string; count: number }>;
    genres: Array<{ value: string; label: string; count: number }>;
  };
}

// 个性化发布推荐结构
export interface PersonalizedReleaseRecommendation {
  userId: string;
  recommendations: Array<{
    item: ReleaseCalendarItem;
    reason: string; // 推荐理由
    score: number; // 推荐分数 0-100
    matchedPreferences: string[]; // 匹配的用户偏好
  }>;
  generatedAt: number; // 生成时间戳
}
