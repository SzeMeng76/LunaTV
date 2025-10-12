/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Heart, ChevronUp } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import EpisodeSelector from '@/components/EpisodeSelector';
import NetDiskSearchResults from '@/components/NetDiskSearchResults';
import PageLayout from '@/components/PageLayout';
import SkipController, { SkipSettingsButton } from '@/components/SkipController';
import artplayerPluginChromecast from '@/lib/artplayer-plugin-chromecast';
import { ClientCache } from '@/lib/client-cache';
import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  getAllPlayRecords,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanDetails } from '@/lib/douban.client';
import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';

// 扩展 HTMLVideoElement 类型以支持 hls 属性
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

// Wake Lock API 类型声明
interface WakeLockSentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

function PlayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState('正在搜索播放源...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);

  // 豆瓣详情状态
  const [movieDetails, setMovieDetails] = useState<any>(null);
  const [loadingMovieDetails, setLoadingMovieDetails] = useState(false);

  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  // bangumi详情状态
  const [bangumiDetails, setBangumiDetails] = useState<any>(null);
  const [loadingBangumiDetails, setLoadingBangumiDetails] = useState(false);

  // 网盘搜索状态
  const [netdiskResults, setNetdiskResults] = useState<{ [key: string]: any[] } | null>(null);
  const [netdiskLoading, setNetdiskLoading] = useState(false);
  const [netdiskError, setNetdiskError] = useState<string | null>(null);
  const [netdiskTotal, setNetdiskTotal] = useState(0);

  // SkipController 相关状态
  const [isSkipSettingOpen, setIsSkipSettingOpen] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // 进度条拖拽状态管理
  const isDraggingProgressRef = useRef(false);
  const seekResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // resize事件防抖管理
  const resizeResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 去广告开关（从 localStorage 继承，默认 true）
  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const blockAdEnabledRef = useRef(blockAdEnabled);
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
  }, [blockAdEnabled]);

  // 外部弹幕开关（从 localStorage 继承，默认全部关闭）
  const [externalDanmuEnabled, setExternalDanmuEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_external_danmu');
      if (v !== null) return v === 'true';
    }
    return false; // 默认关闭外部弹幕
  });
  const externalDanmuEnabledRef = useRef(externalDanmuEnabled);
  useEffect(() => {
    externalDanmuEnabledRef.current = externalDanmuEnabled;
  }, [externalDanmuEnabled]);


  // 视频基本信息
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  const [videoDoubanId, setVideoDoubanId] = useState(
    parseInt(searchParams.get('douban_id') || '0') || 0
  );
  // 当前源和ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 搜索所需信息
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const availableSourcesRef = useRef<SearchResult[]>([]);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const videoDoubanIdRef = useRef(videoDoubanId);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);

  // 同步最新值到 refs
  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
    videoDoubanIdRef.current = videoDoubanId;
    availableSourcesRef.current = availableSources;
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
    videoDoubanId,
    availableSources,
  ]);

  // 加载详情（豆瓣或bangumi）
  useEffect(() => {
    const loadMovieDetails = async () => {
      if (!videoDoubanId || videoDoubanId === 0 || detail?.source === 'shortdrama') {
        return;
      }

      // 检测是否为bangumi ID
      if (isBangumiId(videoDoubanId)) {
        // 加载bangumi详情
        if (loadingBangumiDetails || bangumiDetails) {
          return;
        }
        
        setLoadingBangumiDetails(true);
        try {
          const bangumiData = await fetchBangumiDetails(videoDoubanId);
          if (bangumiData) {
            setBangumiDetails(bangumiData);
          }
        } catch (error) {
          console.error('Failed to load bangumi details:', error);
        } finally {
          setLoadingBangumiDetails(false);
        }
      } else {
        // 加载豆瓣详情
        if (loadingMovieDetails || movieDetails) {
          return;
        }
        
        setLoadingMovieDetails(true);
        try {
          const response = await getDoubanDetails(videoDoubanId.toString());
          if (response.code === 200 && response.data) {
            setMovieDetails(response.data);
          }
        } catch (error) {
          console.error('Failed to load movie details:', error);
        } finally {
          setLoadingMovieDetails(false);
        }
      }
    };

    loadMovieDetails();
  }, [videoDoubanId, loadingMovieDetails, movieDetails, loadingBangumiDetails, bangumiDetails]);

  // 自动网盘搜索：当有视频标题时可以随时搜索
  useEffect(() => {
    // 移除自动搜索，改为用户点击按钮时触发
    // 这样可以避免不必要的API调用
  }, []);

  // 视频播放地址
  const [videoUrl, setVideoUrl] = useState('');

  // 总集数
  const totalEpisodes = detail?.episodes?.length || 0;

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);
  // 上次使用的音量，默认 0.7
  const lastVolumeRef = useRef<number>(0.7);
  // 上次使用的播放速率，默认 1.0
  const lastPlaybackRateRef = useRef<number>(1.0);

  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );

  // 优选和测速开关
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    return false;
  });

  // 保存优选时的测速结果，避免EpisodeSelector重复测速
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, { quality: string; loadSpeed: string; pingTime: number }>
  >(new Map());

  // 弹幕缓存：避免重复请求相同的弹幕数据，支持页面刷新持久化（统一存储）
  const DANMU_CACHE_DURATION = 30 * 60; // 30分钟缓存（秒）
  const DANMU_CACHE_KEY_PREFIX = 'danmu-cache';
  
  // 获取单个弹幕缓存
  const getDanmuCacheItem = async (key: string): Promise<{ data: any[]; timestamp: number } | null> => {
    try {
      const cacheKey = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
      // 优先从统一存储获取
      const cached = await ClientCache.get(cacheKey);
      if (cached) return cached;
      
      // 兜底：从localStorage获取（兼容性）
      if (typeof localStorage !== 'undefined') {
        const oldCacheKey = 'lunatv_danmu_cache';
        const localCached = localStorage.getItem(oldCacheKey);
        if (localCached) {
          const parsed = JSON.parse(localCached);
          const cacheMap = new Map(Object.entries(parsed));
          const item = cacheMap.get(key) as { data: any[]; timestamp: number } | undefined;
          if (item && typeof item.timestamp === 'number' && Date.now() - item.timestamp < DANMU_CACHE_DURATION * 1000) {
            return item;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn('读取弹幕缓存失败:', error);
      return null;
    }
  };
  
  // 保存单个弹幕缓存
  const setDanmuCacheItem = async (key: string, data: any[]): Promise<void> => {
    try {
      const cacheKey = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
      const cacheData = { data, timestamp: Date.now() };
      
      // 主要存储：统一存储
      await ClientCache.set(cacheKey, cacheData, DANMU_CACHE_DURATION);
      
      // 兜底存储：localStorage（兼容性，但只存储最近几个）
      if (typeof localStorage !== 'undefined') {
        try {
          const oldCacheKey = 'lunatv_danmu_cache';
          let localCache: Map<string, { data: any[]; timestamp: number }> = new Map();
          
          const existing = localStorage.getItem(oldCacheKey);
          if (existing) {
            const parsed = JSON.parse(existing);
            localCache = new Map(Object.entries(parsed)) as Map<string, { data: any[]; timestamp: number }>;
          }
          
          // 清理过期项并限制数量（最多保留10个）
          const now = Date.now();
          const validEntries = Array.from(localCache.entries())
            .filter(([, item]) => typeof item.timestamp === 'number' && now - item.timestamp < DANMU_CACHE_DURATION * 1000)
            .slice(-9); // 保留9个，加上新的共10个
            
          validEntries.push([key, cacheData]);
          
          const obj = Object.fromEntries(validEntries);
          localStorage.setItem(oldCacheKey, JSON.stringify(obj));
        } catch (e) {
          // localStorage可能满了，忽略错误
        }
      }
    } catch (error) {
      console.warn('保存弹幕缓存失败:', error);
    }
  };

  // 折叠状态（仅在 lg 及以上屏幕有效）
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  // 播放进度保存相关
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  
  // 弹幕加载状态管理，防止重复加载
  const danmuLoadingRef = useRef<boolean>(false);
  const lastDanmuLoadKeyRef = useRef<string>('');

  // 🚀 新增：弹幕操作防抖和性能优化
  const danmuOperationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const episodeSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const danmuPluginStateRef = useRef<any>(null); // 保存弹幕插件状态
  const isSourceChangingRef = useRef<boolean>(false); // 标记是否正在换源
  const isEpisodeChangingRef = useRef<boolean>(false); // 标记是否正在切换集数
  const isSkipControllerTriggeredRef = useRef<boolean>(false); // 标记是否通过 SkipController 触发了下一集
  const videoEndedHandledRef = useRef<boolean>(false); // 🔥 标记当前视频的 video:ended 事件是否已经被处理过（防止多个监听器重复触发）

  // 🚀 新增：连续切换源防抖和资源管理
  const sourceSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSwitchRef = useRef<any>(null); // 保存待处理的切换请求
  const switchPromiseRef = useRef<Promise<void> | null>(null); // 当前切换的Promise

  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);

  // Wake Lock 相关
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // -----------------------------------------------------------------------------
  // 工具函数（Utils）
  // -----------------------------------------------------------------------------

  // bangumi ID检测（3-6位数字）
  const isBangumiId = (id: number): boolean => {
    const length = id.toString().length;
    return id > 0 && length >= 3 && length <= 6;
  };

  // bangumi缓存配置
  const BANGUMI_CACHE_EXPIRE = 4 * 60 * 60 * 1000; // 4小时，和douban详情一致

  // bangumi缓存工具函数（统一存储）
  const getBangumiCache = async (id: number) => {
    try {
      const cacheKey = `bangumi-details-${id}`;
      // 优先从统一存储获取
      const cached = await ClientCache.get(cacheKey);
      if (cached) return cached;
      
      // 兜底：从localStorage获取（兼容性）
      if (typeof localStorage !== 'undefined') {
        const localCached = localStorage.getItem(cacheKey);
        if (localCached) {
          const { data, expire } = JSON.parse(localCached);
          if (Date.now() <= expire) {
            return data;
          }
          localStorage.removeItem(cacheKey);
        }
      }
      
      return null;
    } catch (e) {
      console.warn('获取Bangumi缓存失败:', e);
      return null;
    }
  };

  const setBangumiCache = async (id: number, data: any) => {
    try {
      const cacheKey = `bangumi-details-${id}`;
      const expireSeconds = Math.floor(BANGUMI_CACHE_EXPIRE / 1000); // 转换为秒
      
      // 主要存储：统一存储
      await ClientCache.set(cacheKey, data, expireSeconds);
      
      // 兜底存储：localStorage（兼容性）
      if (typeof localStorage !== 'undefined') {
        try {
          const cacheData = {
            data,
            expire: Date.now() + BANGUMI_CACHE_EXPIRE,
            created: Date.now()
          };
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
          // localStorage可能满了，忽略错误
        }
      }
    } catch (e) {
      console.warn('设置Bangumi缓存失败:', e);
    }
  };

  // 获取bangumi详情（带缓存）
  const fetchBangumiDetails = async (bangumiId: number) => {
    // 检查缓存
    const cached = await getBangumiCache(bangumiId);
    if (cached) {
      console.log(`Bangumi详情缓存命中: ${bangumiId}`);
      return cached;
    }

    try {
      const response = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`);
      if (response.ok) {
        const bangumiData = await response.json();
        
        // 保存到缓存
        await setBangumiCache(bangumiId, bangumiData);
        console.log(`Bangumi详情已缓存: ${bangumiId}`);
        
        return bangumiData;
      }
    } catch (error) {
      console.log('Failed to fetch bangumi details:', error);
    }
    return null;
  };

  /**
   * 生成搜索查询的多种变体，提高搜索命中率
   * @param originalQuery 原始查询
   * @returns 按优先级排序的搜索变体数组
   */
  const generateSearchVariants = (originalQuery: string): string[] => {
    const variants: string[] = [];
    const trimmed = originalQuery.trim();

    // 1. 原始查询（最高优先级）
    variants.push(trimmed);

    // 2. 处理中文标点符号变体
    const chinesePunctuationVariants = generateChinesePunctuationVariants(trimmed);
    chinesePunctuationVariants.forEach(variant => {
      if (!variants.includes(variant)) {
        variants.push(variant);
      }
    });

    // 3. 移除数字变体处理（优化性能，依赖downstream相关性评分处理数字差异）

    // 如果包含空格，生成额外变体
    if (trimmed.includes(' ')) {
      // 4. 去除所有空格
      const noSpaces = trimmed.replace(/\s+/g, '');
      if (noSpaces !== trimmed) {
        variants.push(noSpaces);
      }

      // 5. 标准化空格（多个空格合并为一个）
      const normalizedSpaces = trimmed.replace(/\s+/g, ' ');
      if (normalizedSpaces !== trimmed && !variants.includes(normalizedSpaces)) {
        variants.push(normalizedSpaces);
      }

      // 6. 提取关键词组合（针对"中餐厅 第九季"这种情况）
      const keywords = trimmed.split(/\s+/);
      if (keywords.length >= 2) {
        // 主要关键词 + 季/集等后缀
        const mainKeyword = keywords[0];
        const lastKeyword = keywords[keywords.length - 1];

        // 如果最后一个词包含"第"、"季"、"集"等，尝试组合
        if (/第|季|集|部|篇|章/.test(lastKeyword)) {
          const combined = mainKeyword + lastKeyword;
          if (!variants.includes(combined)) {
            variants.push(combined);
          }
        }

        // 7. 空格变冒号的变体（重要！针对"死神来了 血脉诅咒" -> "死神来了：血脉诅咒"）
        const withColon = trimmed.replace(/\s+/g, '：');
        if (!variants.includes(withColon)) {
          variants.push(withColon);
        }

        // 8. 空格变英文冒号的变体
        const withEnglishColon = trimmed.replace(/\s+/g, ':');
        if (!variants.includes(withEnglishColon)) {
          variants.push(withEnglishColon);
        }

        // 仅使用主关键词搜索（过滤无意义的词）
        const meaninglessWords = ['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'];
        if (!variants.includes(mainKeyword) &&
            !meaninglessWords.includes(mainKeyword.toLowerCase()) &&
            mainKeyword.length > 2) {
          variants.push(mainKeyword);
        }
      }
    }

    // 去重并返回
    return Array.from(new Set(variants));
  };

  // 移除数字变体生成函数（优化性能，依赖相关性评分处理）

  /**
   * 生成中文标点符号的搜索变体
   * @param query 原始查询
   * @returns 标点符号变体数组
   */
  const generateChinesePunctuationVariants = (query: string): string[] => {
    const variants: string[] = [];

    // 检查是否包含中文标点符号
    const chinesePunctuation = /[：；，。！？、""''（）【】《》]/;
    if (!chinesePunctuation.test(query)) {
      return variants;
    }

    // 中文冒号变体 (针对"死神来了：血脉诅咒"这种情况)
    if (query.includes('：')) {
      // 优先级1: 替换为空格 (最可能匹配，如"死神来了 血脉诅咒" 能匹配到 "死神来了6：血脉诅咒")
      const withSpace = query.replace(/：/g, ' ');
      variants.push(withSpace);

      // 优先级2: 完全去除冒号
      const noColon = query.replace(/：/g, '');
      variants.push(noColon);

      // 优先级3: 替换为英文冒号
      const englishColon = query.replace(/：/g, ':');
      variants.push(englishColon);

      // 优先级4: 提取冒号前的主标题 (降低优先级，避免匹配到错误的系列)
      const beforeColon = query.split('：')[0].trim();
      if (beforeColon && beforeColon !== query) {
        variants.push(beforeColon);
      }

      // 优先级5: 提取冒号后的副标题
      const afterColon = query.split('：')[1]?.trim();
      if (afterColon) {
        variants.push(afterColon);
      }
    }

    // 其他中文标点符号处理
    let cleanedQuery = query;

    // 替换中文标点为对应英文标点
    cleanedQuery = cleanedQuery.replace(/；/g, ';');
    cleanedQuery = cleanedQuery.replace(/，/g, ',');
    cleanedQuery = cleanedQuery.replace(/。/g, '.');
    cleanedQuery = cleanedQuery.replace(/！/g, '!');
    cleanedQuery = cleanedQuery.replace(/？/g, '?');
    cleanedQuery = cleanedQuery.replace(/"/g, '"');
    cleanedQuery = cleanedQuery.replace(/"/g, '"');
    cleanedQuery = cleanedQuery.replace(/'/g, "'");
    cleanedQuery = cleanedQuery.replace(/'/g, "'");
    cleanedQuery = cleanedQuery.replace(/（/g, '(');
    cleanedQuery = cleanedQuery.replace(/）/g, ')');
    cleanedQuery = cleanedQuery.replace(/【/g, '[');
    cleanedQuery = cleanedQuery.replace(/】/g, ']');
    cleanedQuery = cleanedQuery.replace(/《/g, '<');
    cleanedQuery = cleanedQuery.replace(/》/g, '>');

    if (cleanedQuery !== query) {
      variants.push(cleanedQuery);
    }

    // 完全去除所有标点符号
    const noPunctuation = query.replace(/[：；，。！？、""''（）【】《》:;,.!?"'()[\]<>]/g, '');
    if (noPunctuation !== query && noPunctuation.trim()) {
      variants.push(noPunctuation);
    }

    return variants;
  };

  // 检查是否包含查询中的所有关键词（与downstream评分逻辑保持一致）
  const checkAllKeywordsMatch = (queryTitle: string, resultTitle: string): boolean => {
    const queryWords = queryTitle.replace(/[^\w\s\u4e00-\u9fff]/g, '').split(/\s+/).filter(w => w.length > 0);

    // 检查结果标题是否包含查询中的所有关键词
    return queryWords.every(word => resultTitle.includes(word));
  };

  // 网盘搜索函数
  const handleNetDiskSearch = async (query: string) => {
    if (!query.trim()) return;

    setNetdiskLoading(true);
    setNetdiskError(null);
    setNetdiskResults(null);
    setNetdiskTotal(0);

    try {
      const response = await fetch(`/api/netdisk/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();

      if (data.success) {
        setNetdiskResults(data.data.merged_by_type || {});
        setNetdiskTotal(data.data.total || 0);
        console.log(`网盘搜索完成: "${query}" - ${data.data.total || 0} 个结果`);
      } else {
        setNetdiskError(data.error || '网盘搜索失败');
      }
    } catch (error: any) {
      console.error('网盘搜索请求失败:', error);
      setNetdiskError('网盘搜索请求失败，请稍后重试');
    } finally {
      setNetdiskLoading(false);
    }
  };

  // 播放源优选函数（针对旧iPad做极端保守优化）
  const preferBestSource = async (
    sources: SearchResult[]
  ): Promise<SearchResult> => {
    if (sources.length === 1) return sources[0];

    // 使用全局统一的设备检测结果
    const _isIPad = /iPad/i.test(userAgent) || (userAgent.includes('Macintosh') && navigator.maxTouchPoints >= 1);
    const _isIOS = isIOSGlobal;
    const isIOS13 = isIOS13Global;
    const isMobile = isMobileGlobal;

    // 如果是iPad或iOS13+（包括新iPad在桌面模式下），使用极简策略避免崩溃
    if (isIOS13) {
      console.log('检测到iPad/iOS13+设备，使用无测速优选策略避免崩溃');
      
      // 简单的源名称优先级排序，不进行实际测速
      const sourcePreference = [
        'ok', 'niuhu', 'ying', 'wasu', 'mgtv', 'iqiyi', 'youku', 'qq'
      ];
      
      const sortedSources = sources.sort((a, b) => {
        const aIndex = sourcePreference.findIndex(name => 
          a.source_name?.toLowerCase().includes(name)
        );
        const bIndex = sourcePreference.findIndex(name => 
          b.source_name?.toLowerCase().includes(name)
        );
        
        // 如果都在优先级列表中，按优先级排序
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        // 如果只有一个在优先级列表中，优先选择它
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        
        // 都不在优先级列表中，保持原始顺序
        return 0;
      });
      
      console.log('iPad/iOS13+优选结果:', sortedSources.map(s => s.source_name));
      return sortedSources[0];
    }

    // 移动设备使用轻量级测速（仅ping，不创建HLS）
    if (isMobile) {
      console.log('移动设备使用轻量级优选');
      return await lightweightPreference(sources);
    }

    // 桌面设备使用原来的测速方法（控制并发）
    return await fullSpeedTest(sources);
  };

  // 轻量级优选：仅测试连通性，不创建video和HLS
  const lightweightPreference = async (sources: SearchResult[]): Promise<SearchResult> => {
    console.log('开始轻量级测速，仅测试连通性');
    
    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          if (!source.episodes || source.episodes.length === 0) {
            return { source, pingTime: 9999, available: false };
          }

          const episodeUrl = source.episodes.length > 1 
            ? source.episodes[1] 
            : source.episodes[0];
          
          // 仅测试连通性和响应时间
          const startTime = performance.now();
          await fetch(episodeUrl, { 
            method: 'HEAD', 
            mode: 'no-cors',
            signal: AbortSignal.timeout(3000) // 3秒超时
          });
          const pingTime = performance.now() - startTime;
          
          return { 
            source, 
            pingTime: Math.round(pingTime), 
            available: true 
          };
        } catch (error) {
          console.warn(`轻量级测速失败: ${source.source_name}`, error);
          return { source, pingTime: 9999, available: false };
        }
      })
    );

    // 按可用性和响应时间排序
    const sortedResults = results
      .filter(r => r.available)
      .sort((a, b) => a.pingTime - b.pingTime);

    if (sortedResults.length === 0) {
      console.warn('所有源都不可用，返回第一个');
      return sources[0];
    }

    console.log('轻量级优选结果:', sortedResults.map(r => 
      `${r.source.source_name}: ${r.pingTime}ms`
    ));
    
    return sortedResults[0].source;
  };

  // 完整测速（桌面设备）
  const fullSpeedTest = async (sources: SearchResult[]): Promise<SearchResult> => {
    // 桌面设备使用小批量并发，避免创建过多实例
    const concurrency = 2;
    const allResults: Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    } | null> = [];

    for (let i = 0; i < sources.length; i += concurrency) {
      const batch = sources.slice(i, i + concurrency);
      console.log(`测速批次 ${Math.floor(i/concurrency) + 1}/${Math.ceil(sources.length/concurrency)}: ${batch.length} 个源`);
      
      const batchResults = await Promise.all(
        batch.map(async (source) => {
          try {
            if (!source.episodes || source.episodes.length === 0) {
              return null;
            }

            const episodeUrl = source.episodes.length > 1
              ? source.episodes[1]
              : source.episodes[0];
            
            const testResult = await getVideoResolutionFromM3u8(episodeUrl);
            return { source, testResult };
          } catch (error) {
            console.warn(`测速失败: ${source.source_name}`, error);
            return null;
          }
        })
      );
      
      allResults.push(...batchResults);
      
      // 批次间延迟，让资源有时间清理
      if (i + concurrency < sources.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 等待所有测速完成，包含成功和失败的结果
    // 保存所有测速结果到 precomputedVideoInfo，供 EpisodeSelector 使用（包含错误结果）
    const newVideoInfoMap = new Map<
      string,
      {
        quality: string;
        loadSpeed: string;
        pingTime: number;
        hasError?: boolean;
      }
    >();
    allResults.forEach((result, index) => {
      const source = sources[index];
      const sourceKey = `${source.source}-${source.id}`;

      if (result) {
        // 成功的结果
        newVideoInfoMap.set(sourceKey, result.testResult);
      }
    });

    // 过滤出成功的结果用于优选计算
    const successfulResults = allResults.filter(Boolean) as Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    }>;

    setPrecomputedVideoInfo(newVideoInfoMap);

    if (successfulResults.length === 0) {
      console.warn('所有播放源测速都失败，使用第一个播放源');
      return sources[0];
    }

    // 找出所有有效速度的最大值，用于线性映射
    const validSpeeds = successfulResults
      .map((result) => {
        const speedStr = result.testResult.loadSpeed;
        if (speedStr === '未知' || speedStr === '测量中...') return 0;

        const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2];
        return unit === 'MB/s' ? value * 1024 : value; // 统一转换为 KB/s
      })
      .filter((speed) => speed > 0);

    const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1024; // 默认1MB/s作为基准

    // 找出所有有效延迟的最小值和最大值，用于线性映射
    const validPings = successfulResults
      .map((result) => result.testResult.pingTime)
      .filter((ping) => ping > 0);

    const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
    const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

    // 计算每个结果的评分
    const resultsWithScore = successfulResults.map((result) => ({
      ...result,
      score: calculateSourceScore(
        result.testResult,
        maxSpeed,
        minPing,
        maxPing
      ),
    }));

    // 按综合评分排序，选择最佳播放源
    resultsWithScore.sort((a, b) => b.score - a.score);

    console.log('播放源评分排序结果:');
    resultsWithScore.forEach((result, index) => {
      console.log(
        `${index + 1}. ${result.source.source_name
        } - 评分: ${result.score.toFixed(2)} (${result.testResult.quality}, ${result.testResult.loadSpeed
        }, ${result.testResult.pingTime}ms)`
      );
    });

    return resultsWithScore[0].source;
  };

  // 计算播放源综合评分
  const calculateSourceScore = (
    testResult: {
      quality: string;
      loadSpeed: string;
      pingTime: number;
    },
    maxSpeed: number,
    minPing: number,
    maxPing: number
  ): number => {
    let score = 0;

    // 分辨率评分 (40% 权重)
    const qualityScore = (() => {
      switch (testResult.quality) {
        case '4K':
          return 100;
        case '2K':
          return 85;
        case '1080p':
          return 75;
        case '720p':
          return 60;
        case '480p':
          return 40;
        case 'SD':
          return 20;
        default:
          return 0;
      }
    })();
    score += qualityScore * 0.4;

    // 下载速度评分 (40% 权重) - 基于最大速度线性映射
    const speedScore = (() => {
      const speedStr = testResult.loadSpeed;
      if (speedStr === '未知' || speedStr === '测量中...') return 30;

      // 解析速度值
      const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
      if (!match) return 30;

      const value = parseFloat(match[1]);
      const unit = match[2];
      const speedKBps = unit === 'MB/s' ? value * 1024 : value;

      // 基于最大速度线性映射，最高100分
      const speedRatio = speedKBps / maxSpeed;
      return Math.min(100, Math.max(0, speedRatio * 100));
    })();
    score += speedScore * 0.4;

    // 网络延迟评分 (20% 权重) - 基于延迟范围线性映射
    const pingScore = (() => {
      const ping = testResult.pingTime;
      if (ping <= 0) return 0; // 无效延迟给默认分

      // 如果所有延迟都相同，给满分
      if (maxPing === minPing) return 100;

      // 线性映射：最低延迟=100分，最高延迟=0分
      const pingRatio = (maxPing - ping) / (maxPing - minPing);
      return Math.min(100, Math.max(0, pingRatio * 100));
    })();
    score += pingScore * 0.2;

    return Math.round(score * 100) / 100; // 保留两位小数
  };

  // 更新视频地址
  const updateVideoUrl = async (
    detailData: SearchResult | null,
    episodeIndex: number
  ) => {
    if (
      !detailData ||
      !detailData.episodes ||
      episodeIndex >= detailData.episodes.length
    ) {
      setVideoUrl('');
      return;
    }

    const episodeData = detailData.episodes[episodeIndex];

    // 检查是否为短剧格式
    if (episodeData && episodeData.startsWith('shortdrama:')) {
      try {
        const [, videoId, episode] = episodeData.split(':');
        const response = await fetch(
          `/api/shortdrama/parse?id=${videoId}&episode=${episode}`
        );

        if (response.ok) {
          const result = await response.json();
          const newUrl = result.url || '';
          if (newUrl !== videoUrl) {
            setVideoUrl(newUrl);
          }
        } else {
          setError('短剧解析失败');
          setVideoUrl('');
        }
      } catch (err) {
        console.error('短剧URL解析失败:', err);
        setError('短剧解析失败');
        setVideoUrl('');
      }
    } else {
      // 普通视频格式
      const newUrl = episodeData || '';
      if (newUrl !== videoUrl) {
        setVideoUrl(newUrl);
      }
    }
  };

  const ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      // 移除旧的 source，保持唯一
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    // 始终允许远程播放（AirPlay / Cast）
    video.disableRemotePlayback = false;
    // 如果曾经有禁用属性，移除之
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  // 检测移动设备（在组件层级定义）- 参考ArtPlayer compatibility.js
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOSGlobal = /iPad|iPhone|iPod/i.test(userAgent) && !(window as any).MSStream;
  const isIOS13Global = isIOSGlobal || (userAgent.includes('Macintosh') && navigator.maxTouchPoints >= 1);
  const isMobileGlobal = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || isIOS13Global;

  // 内存压力检测和清理（针对移动设备）
  const checkMemoryPressure = async () => {
    // 仅在支持performance.memory的浏览器中执行
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      try {
        const memInfo = (performance as any).memory;
        const usedJSHeapSize = memInfo.usedJSHeapSize;
        const heapLimit = memInfo.jsHeapSizeLimit;
        
        // 计算内存使用率
        const memoryUsageRatio = usedJSHeapSize / heapLimit;
        
        console.log(`内存使用情况: ${(memoryUsageRatio * 100).toFixed(2)}% (${(usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(heapLimit / 1024 / 1024).toFixed(2)}MB)`);
        
        // 如果内存使用超过75%，触发清理
        if (memoryUsageRatio > 0.75) {
          console.warn('内存使用过高，清理缓存...');
          
          // 清理弹幕缓存
          try {
            // 清理统一存储中的弹幕缓存
            await ClientCache.clearExpired('danmu-cache');
            
            // 兜底清理localStorage中的弹幕缓存（兼容性）
            const oldCacheKey = 'lunatv_danmu_cache';
            localStorage.removeItem(oldCacheKey);
            console.log('弹幕缓存已清理');
          } catch (e) {
            console.warn('清理弹幕缓存失败:', e);
          }
          
          // 尝试强制垃圾回收（如果可用）
          if (typeof (window as any).gc === 'function') {
            (window as any).gc();
            console.log('已触发垃圾回收');
          }
          
          return true; // 返回真表示高内存压力
        }
      } catch (error) {
        console.warn('内存检测失败:', error);
      }
    }
    return false;
  };

  // 定期内存检查（仅在移动设备上）
  useEffect(() => {
    if (!isMobileGlobal) return;
    
    const memoryCheckInterval = setInterval(() => {
      // 异步调用内存检查，不阻塞定时器
      checkMemoryPressure().catch(console.error);
    }, 30000); // 每30秒检查一次
    
    return () => {
      clearInterval(memoryCheckInterval);
    };
  }, [isMobileGlobal]);
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request(
          'screen'
        );
        console.log('Wake Lock 已启用');
      }
    } catch (err) {
      console.warn('Wake Lock 请求失败:', err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Wake Lock 已释放');
      }
    } catch (err) {
      console.warn('Wake Lock 释放失败:', err);
    }
  };

  // 清理播放器资源的统一函数（添加更完善的清理逻辑）
  const cleanupPlayer = () => {
    // 🚀 新增：清理弹幕优化相关的定时器
    if (danmuOperationTimeoutRef.current) {
      clearTimeout(danmuOperationTimeoutRef.current);
      danmuOperationTimeoutRef.current = null;
    }
    
    if (episodeSwitchTimeoutRef.current) {
      clearTimeout(episodeSwitchTimeoutRef.current);
      episodeSwitchTimeoutRef.current = null;
    }
    
    // 清理弹幕状态引用
    danmuPluginStateRef.current = null;
    
    if (artPlayerRef.current) {
      try {
        // 1. 清理弹幕插件的WebWorker
        if (artPlayerRef.current.plugins?.artplayerPluginDanmuku) {
          const danmukuPlugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
          
          // 尝试获取并清理WebWorker
          if (danmukuPlugin.worker && typeof danmukuPlugin.worker.terminate === 'function') {
            danmukuPlugin.worker.terminate();
            console.log('弹幕WebWorker已清理');
          }
          
          // 清空弹幕数据
          if (typeof danmukuPlugin.reset === 'function') {
            danmukuPlugin.reset();
          }
        }

        // 2. 销毁HLS实例
        if (artPlayerRef.current.video.hls) {
          artPlayerRef.current.video.hls.destroy();
          console.log('HLS实例已销毁');
        }

        // 3. 销毁ArtPlayer实例 (使用false参数避免DOM清理冲突)
        artPlayerRef.current.destroy(false);
        artPlayerRef.current = null;

        console.log('播放器资源已清理');
      } catch (err) {
        console.warn('清理播放器资源时出错:', err);
        // 即使出错也要确保引用被清空
        artPlayerRef.current = null;
      }
    }
  };

  // 去广告相关函数
  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    // 按行分割M3U8内容
    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 只过滤#EXT-X-DISCONTINUITY标识
      if (!line.includes('#EXT-X-DISCONTINUITY')) {
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (hours === 0) {
      // 不到一小时，格式为 00:00
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    } else {
      // 超过一小时，格式为 00:00:00
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  };

  class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: any) {
      super(config);
      const load = this.load.bind(this);
      this.load = function (context: any, config: any, callbacks: any) {
        // 拦截manifest和level请求
        if (
          (context as any).type === 'manifest' ||
          (context as any).type === 'level'
        ) {
          const onSuccess = callbacks.onSuccess;
          callbacks.onSuccess = function (
            response: any,
            stats: any,
            context: any
          ) {
            // 如果是m3u8文件，处理内容以移除广告分段
            if (response.data && typeof response.data === 'string') {
              // 过滤掉广告段 - 实现更精确的广告过滤逻辑
              response.data = filterAdsFromM3U8(response.data);
            }
            return onSuccess(response, stats, context, null);
          };
        }
        // 执行原始load方法
        load(context, config, callbacks);
      };
    }
  }

  // 🚀 优化的弹幕操作处理函数（防抖 + 性能优化）
  const handleDanmuOperationOptimized = (nextState: boolean) => {
    // 清除之前的防抖定时器
    if (danmuOperationTimeoutRef.current) {
      clearTimeout(danmuOperationTimeoutRef.current);
    }
    
    // 立即更新UI状态（确保响应性）
    externalDanmuEnabledRef.current = nextState;
    setExternalDanmuEnabled(nextState);
    
    // 同步保存到localStorage（快速操作）
    try {
      localStorage.setItem('enable_external_danmu', String(nextState));
    } catch (e) {
      console.warn('localStorage设置失败:', e);
    }
    
    // 防抖处理弹幕数据操作（避免频繁切换时的性能问题）
    danmuOperationTimeoutRef.current = setTimeout(async () => {
      try {
        if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
          const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
          
          if (nextState) {
            // 开启弹幕：使用更温和的加载方式
            console.log('🚀 优化后开启外部弹幕...');
            
            // 使用requestIdleCallback优化性能（如果可用）
            const loadDanmu = async () => {
              const externalDanmu = await loadExternalDanmu();
              // 二次确认状态，防止快速切换导致的状态不一致
              if (externalDanmuEnabledRef.current && artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                plugin.load(externalDanmu);
                plugin.show();
                console.log('✅ 外部弹幕已优化加载:', externalDanmu.length, '条');
                
                if (artPlayerRef.current && externalDanmu.length > 0) {
                  artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
                }
              }
            };
            
            // 使用 requestIdleCallback 或 setTimeout 来确保不阻塞主线程
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(loadDanmu, { timeout: 1000 });
            } else {
              setTimeout(loadDanmu, 50);
            }
          } else {
            // 关闭弹幕：立即处理
            console.log('🚀 优化后关闭外部弹幕...');
            plugin.load(); // 不传参数，真正清空弹幕
            plugin.hide();
            console.log('✅ 外部弹幕已关闭');
            
            if (artPlayerRef.current) {
              artPlayerRef.current.notice.show = '外部弹幕已关闭';
            }
          }
        }
      } catch (error) {
        console.error('优化后弹幕操作失败:', error);
      }
    }, 300); // 300ms防抖延迟
  };

  // 加载外部弹幕数据（带缓存和防重复）
  const loadExternalDanmu = async (): Promise<any[]> => {
    if (!externalDanmuEnabledRef.current) {
      console.log('外部弹幕开关已关闭');
      return [];
    }
    
    // 生成当前请求的唯一标识
    const currentVideoTitle = videoTitle;
    const currentVideoYear = videoYear; 
    const currentVideoDoubanId = videoDoubanId;
    const currentEpisodeNum = currentEpisodeIndex + 1;
    const requestKey = `${currentVideoTitle}_${currentVideoYear}_${currentVideoDoubanId}_${currentEpisodeNum}`;
    
    // 🚀 优化加载状态检测：更智能的卡住检测
    const now = Date.now();
    const loadingState = danmuLoadingRef.current as any;
    const lastLoadTime = loadingState?.timestamp || 0;
    const lastRequestKey = loadingState?.requestKey || '';
    const isStuckLoad = now - lastLoadTime > 15000; // 降低到15秒超时
    const isSameRequest = lastRequestKey === requestKey;

    // 智能重复检测：区分真正的重复和卡住的请求
    if (loadingState?.loading && isSameRequest && !isStuckLoad) {
      console.log('⏳ 弹幕正在加载中，跳过重复请求');
      return [];
    }

    // 强制重置卡住的加载状态
    if (isStuckLoad && loadingState?.loading) {
      console.warn('🔧 检测到弹幕加载超时，强制重置 (15秒)');
      danmuLoadingRef.current = false;
    }

    // 设置新的加载状态，包含更多上下文信息
    danmuLoadingRef.current = {
      loading: true,
      timestamp: now,
      requestKey,
      source: currentSource,
      episode: currentEpisodeNum
    } as any;
    lastDanmuLoadKeyRef.current = requestKey;
    
    try {
      const params = new URLSearchParams();
      
      // 使用当前最新的state值而不是ref值
      const currentVideoTitle = videoTitle;
      const currentVideoYear = videoYear; 
      const currentVideoDoubanId = videoDoubanId;
      const currentEpisodeNum = currentEpisodeIndex + 1;
      
      if (currentVideoDoubanId && currentVideoDoubanId > 0) {
        params.append('douban_id', currentVideoDoubanId.toString());
      }
      if (currentVideoTitle) {
        params.append('title', currentVideoTitle);
      }
      if (currentVideoYear) {
        params.append('year', currentVideoYear);
      }
      if (currentEpisodeIndex !== null && currentEpisodeIndex >= 0) {
        params.append('episode', currentEpisodeNum.toString());
      }

      if (!params.toString()) {
        console.log('没有可用的参数获取弹幕');
        return [];
      }

      // 生成缓存键（使用state值确保准确性）
      const cacheKey = `${currentVideoTitle}_${currentVideoYear}_${currentVideoDoubanId}_${currentEpisodeNum}`;
      const now = Date.now();
      
      console.log('🔑 弹幕缓存调试信息:');
      console.log('- 缓存键:', cacheKey);
      console.log('- 当前时间:', now);
      console.log('- 视频标题:', currentVideoTitle);
      console.log('- 视频年份:', currentVideoYear);
      console.log('- 豆瓣ID:', currentVideoDoubanId);
      console.log('- 集数:', currentEpisodeNum);
      
      // 检查缓存
      console.log('🔍 检查弹幕缓存:', cacheKey);
      const cached = await getDanmuCacheItem(cacheKey);
      if (cached) {
        console.log('📦 找到缓存数据:');
        console.log('- 缓存时间:', cached.timestamp);
        console.log('- 时间差:', now - cached.timestamp, 'ms');
        console.log('- 缓存有效期:', DANMU_CACHE_DURATION * 1000, 'ms');
        console.log('- 是否过期:', (now - cached.timestamp) >= (DANMU_CACHE_DURATION * 1000));
        
        if ((now - cached.timestamp) < (DANMU_CACHE_DURATION * 1000)) {
          console.log('✅ 使用弹幕缓存数据，缓存键:', cacheKey);
          console.log('📊 缓存弹幕数量:', cached.data.length);
          return cached.data;
        }
      } else {
        console.log('❌ 未找到缓存数据');
      }

      console.log('开始获取外部弹幕，参数:', params.toString());
      const response = await fetch(`/api/danmu-external?${params}`);
      console.log('弹幕API响应状态:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('弹幕API请求失败:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      console.log('外部弹幕API返回数据:', data);
      console.log('外部弹幕加载成功:', data.total || 0, '条');
      
      const finalDanmu = data.danmu || [];
      console.log('最终弹幕数据:', finalDanmu.length, '条');
      
      // 缓存结果
      console.log('💾 保存弹幕到统一存储:');
      console.log('- 缓存键:', cacheKey);
      console.log('- 弹幕数量:', finalDanmu.length);
      console.log('- 保存时间:', now);
      
      // 保存到统一存储
      await setDanmuCacheItem(cacheKey, finalDanmu);
      
      return finalDanmu;
    } catch (error) {
      console.error('加载外部弹幕失败:', error);
      console.log('弹幕加载失败，返回空结果');
      return [];
    } finally {
      // 重置加载状态
      danmuLoadingRef.current = false;
    }
  };

  // 🚀 优化的集数变化处理（防抖 + 状态保护）
  useEffect(() => {
    // 🔥 标记正在切换集数（只在非换源时）
    if (!isSourceChangingRef.current) {
      isEpisodeChangingRef.current = true;
      // 🔑 立即重置 SkipController 触发标志，允许新集数自动跳过片头片尾
      isSkipControllerTriggeredRef.current = false;
      videoEndedHandledRef.current = false;
      console.log('🔄 开始切换集数，重置自动跳过标志');
    }

    updateVideoUrl(detail, currentEpisodeIndex);

    // 🚀 如果正在换源，跳过弹幕处理（换源会在完成后手动处理）
    if (isSourceChangingRef.current) {
      console.log('⏭️ 正在换源，跳过弹幕处理');
      return;
    }

    // 🔥 关键修复：重置弹幕加载标识，确保新集数能正确加载弹幕
    lastDanmuLoadKeyRef.current = '';
    danmuLoadingRef.current = false; // 重置加载状态

    // 清除之前的集数切换定时器，防止重复执行
    if (episodeSwitchTimeoutRef.current) {
      clearTimeout(episodeSwitchTimeoutRef.current);
    }

    // 如果播放器已经存在且弹幕插件已加载，重新加载弹幕
    if (artPlayerRef.current && artPlayerRef.current.plugins?.artplayerPluginDanmuku) {
      console.log('🚀 集数变化，优化后重新加载弹幕');

      // 🔥 关键修复：立即清空当前弹幕，避免旧弹幕残留
      const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
      plugin.reset(); // 立即回收所有正在显示的弹幕DOM
      plugin.load(); // 不传参数，完全清空弹幕队列
      console.log('🧹 已清空旧弹幕数据');

      // 保存当前弹幕插件状态
      danmuPluginStateRef.current = {
        isHide: artPlayerRef.current.plugins.artplayerPluginDanmuku.isHide,
        isStop: artPlayerRef.current.plugins.artplayerPluginDanmuku.isStop,
        option: artPlayerRef.current.plugins.artplayerPluginDanmuku.option
      };
      
      // 使用防抖处理弹幕重新加载
      episodeSwitchTimeoutRef.current = setTimeout(async () => {
        try {
          // 确保播放器和插件仍然存在（防止快速切换时的状态不一致）
          if (!artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            console.warn('⚠️ 集数切换后弹幕插件不存在，跳过弹幕加载');
            return;
          }
          
          const externalDanmu = await loadExternalDanmu(); // 这里会检查开关状态
          console.log('🔄 集数变化后外部弹幕加载结果:', externalDanmu);
          
          // 再次确认插件状态
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
            
            if (externalDanmu.length > 0) {
              console.log('✅ 向播放器插件重新加载弹幕数据:', externalDanmu.length, '条');
              plugin.load(externalDanmu);
              
              // 恢复弹幕插件的状态
              if (danmuPluginStateRef.current) {
                if (!danmuPluginStateRef.current.isHide) {
                  plugin.show();
                }
              }
              
              if (artPlayerRef.current) {
                artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
              }
            } else {
              console.log('📭 集数变化后没有弹幕数据可加载');
              plugin.load(); // 不传参数，确保清空弹幕

              if (artPlayerRef.current) {
                artPlayerRef.current.notice.show = '暂无弹幕数据';
              }
            }
          }
        } catch (error) {
          console.error('❌ 集数变化后加载外部弹幕失败:', error);
        } finally {
          // 清理定时器引用
          episodeSwitchTimeoutRef.current = null;
        }
      }, 800); // 缩短延迟时间，提高响应性
    }
  }, [detail, currentEpisodeIndex]);

  // 进入页面时直接获取全部源信息
  useEffect(() => {
    const fetchSourceDetail = async (
      source: string,
      id: string
    ): Promise<SearchResult[]> => {
      try {
        let detailResponse;

        // 判断是否为短剧源
        if (source === 'shortdrama') {
          detailResponse = await fetch(
            `/api/shortdrama/detail?id=${id}&episode=1`
          );
        } else {
          detailResponse = await fetch(
            `/api/detail?source=${source}&id=${id}`
          );
        }

        if (!detailResponse.ok) {
          throw new Error('获取视频详情失败');
        }
        const detailData = (await detailResponse.json()) as SearchResult;
        setAvailableSources([detailData]);
        return [detailData];
      } catch (err) {
        console.error('获取视频详情失败:', err);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };
    const fetchSourcesData = async (query: string): Promise<SearchResult[]> => {
      // 使用智能搜索变体获取全部源信息
      try {
        console.log('开始智能搜索，原始查询:', query);
        const searchVariants = generateSearchVariants(query.trim());
        console.log('生成的搜索变体:', searchVariants);
        
        const allResults: SearchResult[] = [];
        let bestResults: SearchResult[] = [];
        
        // 依次尝试每个搜索变体，采用早期退出策略
        for (const variant of searchVariants) {
          console.log('尝试搜索变体:', variant);

          const response = await fetch(
            `/api/search?q=${encodeURIComponent(variant)}`
          );
          if (!response.ok) {
            console.warn(`搜索变体 "${variant}" 失败:`, response.statusText);
            continue;
          }
          const data = await response.json();

          if (data.results && data.results.length > 0) {
            allResults.push(...data.results);

            // 移除早期退出策略，让downstream的相关性评分发挥作用

            // 处理搜索结果，使用智能模糊匹配（与downstream评分逻辑保持一致）
            const filteredResults = data.results.filter(
              (result: SearchResult) => {
                const queryTitle = videoTitleRef.current.replaceAll(' ', '').toLowerCase();
                const resultTitle = result.title.replaceAll(' ', '').toLowerCase();

                // 智能标题匹配：支持数字变体和标点符号变化
                const titleMatch = resultTitle.includes(queryTitle) ||
                  queryTitle.includes(resultTitle) ||
                  // 移除数字和标点后匹配（针对"死神来了：血脉诅咒" vs "死神来了6：血脉诅咒"）
                  resultTitle.replace(/\d+|[：:]/g, '') === queryTitle.replace(/\d+|[：:]/g, '') ||
                  // 通用关键词匹配：检查是否包含查询中的所有关键词
                  checkAllKeywordsMatch(queryTitle, resultTitle);

                const yearMatch = videoYearRef.current
                  ? result.year.toLowerCase() === videoYearRef.current.toLowerCase()
                  : true;
                const typeMatch = searchType
                  ? (searchType === 'tv' && result.episodes.length > 1) ||
                    (searchType === 'movie' && result.episodes.length === 1)
                  : true;

                return titleMatch && yearMatch && typeMatch;
              }
            );

            if (filteredResults.length > 0) {
              console.log(`变体 "${variant}" 找到 ${filteredResults.length} 个精确匹配结果`);
              bestResults = filteredResults;
              break; // 找到精确匹配就停止
            }
          }
        }
        
        // 智能匹配：英文标题严格匹配，中文标题宽松匹配
        let finalResults = bestResults;

        // 如果没有精确匹配，根据语言类型进行不同策略的匹配
        if (bestResults.length === 0) {
          const queryTitle = videoTitleRef.current.toLowerCase().trim();
          const allCandidates = allResults;

          // 检测查询主要语言（英文 vs 中文）
          const englishChars = (queryTitle.match(/[a-z\s]/g) || []).length;
          const chineseChars = (queryTitle.match(/[\u4e00-\u9fff]/g) || []).length;
          const isEnglishQuery = englishChars > chineseChars;

          console.log(`搜索语言检测: ${isEnglishQuery ? '英文' : '中文'} - "${queryTitle}"`);

          let relevantMatches;

          if (isEnglishQuery) {
            // 英文查询：使用词汇匹配策略，避免不相关结果
            console.log('使用英文词汇匹配策略');

            // 提取有效英文词汇（过滤停用词）
            const queryWords = queryTitle.toLowerCase()
              .replace(/[^\w\s]/g, ' ')
              .split(/\s+/)
              .filter(word => word.length > 2 && !['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'].includes(word));

            console.log('英文关键词:', queryWords);

            relevantMatches = allCandidates.filter(result => {
              const title = result.title.toLowerCase();
              const titleWords = title.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(word => word.length > 1);

              // 计算词汇匹配度：标题必须包含至少50%的查询关键词
              const matchedWords = queryWords.filter(queryWord =>
                titleWords.some(titleWord =>
                  titleWord.includes(queryWord) || queryWord.includes(titleWord) ||
                  // 允许部分相似（如gumball vs gum）
                  (queryWord.length > 4 && titleWord.length > 4 &&
                   queryWord.substring(0, 4) === titleWord.substring(0, 4))
                )
              );

              const wordMatchRatio = matchedWords.length / queryWords.length;
              if (wordMatchRatio >= 0.5) {
                console.log(`英文词汇匹配 (${matchedWords.length}/${queryWords.length}): "${result.title}" - 匹配词: [${matchedWords.join(', ')}]`);
                return true;
              }
              return false;
            });
          } else {
            // 中文查询：宽松匹配，保持现有行为
            console.log('使用中文宽松匹配策略');
            relevantMatches = allCandidates.filter(result => {
              const title = result.title.toLowerCase();
              const normalizedQuery = queryTitle.replace(/[^\w\u4e00-\u9fff]/g, '');
              const normalizedTitle = title.replace(/[^\w\u4e00-\u9fff]/g, '');

              // 包含匹配或50%相似度
              if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) {
                console.log(`中文包含匹配: "${result.title}"`);
                return true;
              }

              const commonChars = Array.from(normalizedQuery).filter(char => normalizedTitle.includes(char)).length;
              const similarity = commonChars / normalizedQuery.length;
              if (similarity >= 0.5) {
                console.log(`中文相似匹配 (${(similarity*100).toFixed(1)}%): "${result.title}"`);
                return true;
              }
              return false;
            });
          }

          console.log(`匹配结果: ${relevantMatches.length}/${allCandidates.length}`);

          const maxResults = isEnglishQuery ? 5 : 20; // 英文更严格控制结果数
          if (relevantMatches.length > 0 && relevantMatches.length <= maxResults) {
            finalResults = Array.from(
              new Map(relevantMatches.map(item => [`${item.source}-${item.id}`, item])).values()
            );
          } else {
            console.log('没有找到合理的匹配，返回空结果');
            finalResults = [];
          }
        }
          
        console.log(`智能搜索完成，最终返回 ${finalResults.length} 个结果`);
        setAvailableSources(finalResults);
        return finalResults;
      } catch (err) {
        console.error('智能搜索失败:', err);
        setSourceSearchError(err instanceof Error ? err.message : '搜索失败');
        setAvailableSources([]);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };

    const initAll = async () => {
      if (!currentSource && !currentId && !videoTitle && !searchTitle) {
        setError('缺少必要参数');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadingStage(currentSource && currentId ? 'fetching' : 'searching');
      setLoadingMessage(
        currentSource && currentId
          ? '🎬 正在获取视频详情...'
          : '🔍 正在搜索播放源...'
      );

      let sourcesInfo: SearchResult[] = [];

      // 对于短剧，直接获取详情，跳过搜索
      if (currentSource === 'shortdrama' && currentId) {
        sourcesInfo = await fetchSourceDetail(currentSource, currentId);
      } else {
        // 其他情况先搜索
        sourcesInfo = await fetchSourcesData(searchTitle || videoTitle);
        if (
          currentSource &&
          currentId &&
          !sourcesInfo.some(
            (source) => source.source === currentSource && source.id === currentId
          )
        ) {
          sourcesInfo = await fetchSourceDetail(currentSource, currentId);
        }
      }
      if (sourcesInfo.length === 0) {
        setError('未找到匹配结果');
        setLoading(false);
        return;
      }

      let detailData: SearchResult = sourcesInfo[0];
      // 指定源和id且无需优选
      if (currentSource && currentId && !needPreferRef.current) {
        const target = sourcesInfo.find(
          (source) => source.source === currentSource && source.id === currentId
        );
        if (target) {
          detailData = target;
        } else {
          setError('未找到匹配结果');
          setLoading(false);
          return;
        }
      }

      // 未指定源和 id 或需要优选，且开启优选开关
      if (
        (!currentSource || !currentId || needPreferRef.current) &&
        optimizationEnabled
      ) {
        setLoadingStage('preferring');
        setLoadingMessage('⚡ 正在优选最佳播放源...');

        detailData = await preferBestSource(sourcesInfo);
      }

      console.log(detailData.source, detailData.id);

      setNeedPrefer(false);
      setCurrentSource(detailData.source);
      setCurrentId(detailData.id);
      setVideoYear(detailData.year);
      setVideoTitle(detailData.title || videoTitleRef.current);
      setVideoCover(detailData.poster);
      // 优先保留URL参数中的豆瓣ID，如果URL中没有则使用详情数据中的
      setVideoDoubanId(videoDoubanIdRef.current || detailData.douban_id || 0);
      setDetail(detailData);
      if (currentEpisodeIndex >= detailData.episodes.length) {
        setCurrentEpisodeIndex(0);
      }

      // 规范URL参数
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', detailData.source);
      newUrl.searchParams.set('id', detailData.id);
      newUrl.searchParams.set('year', detailData.year);
      newUrl.searchParams.set('title', detailData.title);
      newUrl.searchParams.delete('prefer');
      window.history.replaceState({}, '', newUrl.toString());

      setLoadingStage('ready');
      setLoadingMessage('✨ 准备就绪，即将开始播放...');

      // 短暂延迟让用户看到完成状态
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    };

    initAll();
  }, []);

  // 播放记录处理
  useEffect(() => {
    // 仅在初次挂载时检查播放记录
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;

      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          // 更新当前选集索引
          if (targetIndex !== currentEpisodeIndex) {
            setCurrentEpisodeIndex(targetIndex);
          }

          // 保存待恢复的播放进度，待播放器就绪后跳转
          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('读取播放记录失败:', err);
      }
    };

    initFromHistory();
  }, []);

  // 🚀 优化的换源处理（防连续点击）
  const handleSourceChange = async (
    newSource: string,
    newId: string,
    newTitle: string
  ) => {
    try {
      // 防止连续点击换源
      if (isSourceChangingRef.current) {
        console.log('⏸️ 正在换源中，忽略重复点击');
        return;
      }

      // 🚀 设置换源标识，防止useEffect重复处理弹幕
      isSourceChangingRef.current = true;

      // 显示换源加载状态
      setVideoLoadingStage('sourceChanging');
      setIsVideoLoading(true);

      // 🚀 立即重置弹幕相关状态，避免残留
      lastDanmuLoadKeyRef.current = '';
      danmuLoadingRef.current = false;

      // 清除弹幕操作定时器
      if (danmuOperationTimeoutRef.current) {
        clearTimeout(danmuOperationTimeoutRef.current);
        danmuOperationTimeoutRef.current = null;
      }
      if (episodeSwitchTimeoutRef.current) {
        clearTimeout(episodeSwitchTimeoutRef.current);
        episodeSwitchTimeoutRef.current = null;
      }

      // 🚀 正确地清空弹幕状态（基于ArtPlayer插件API）
      if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
        const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

        try {
          // 🚀 正确清空弹幕：先reset回收DOM，再load清空队列
          if (typeof plugin.reset === 'function') {
            plugin.reset(); // 立即回收所有正在显示的弹幕DOM
          }

          if (typeof plugin.load === 'function') {
            // 关键：load()不传参数会触发清空逻辑（danmuku === undefined）
            plugin.load();
            console.log('✅ 已完全清空弹幕队列');
          }

          // 然后隐藏弹幕层
          if (typeof plugin.hide === 'function') {
            plugin.hide();
          }

          console.log('🧹 换源时已清空旧弹幕数据');
        } catch (error) {
          console.warn('清空弹幕时出错，但继续换源:', error);
        }
      }

      // 记录当前播放进度（仅在同一集数切换时恢复）
      const currentPlayTime = artPlayerRef.current?.currentTime || 0;
      console.log('换源前当前播放时间:', currentPlayTime);

      // 清除前一个历史记录
      if (currentSourceRef.current && currentIdRef.current) {
        try {
          await deletePlayRecord(
            currentSourceRef.current,
            currentIdRef.current
          );
          console.log('已清除前一个播放记录');
        } catch (err) {
          console.error('清除播放记录失败:', err);
        }
      }

      const newDetail = availableSources.find(
        (source) => source.source === newSource && source.id === newId
      );
      if (!newDetail) {
        setError('未找到匹配结果');
        return;
      }

      // 尝试跳转到当前正在播放的集数
      let targetIndex = currentEpisodeIndex;

      // 如果当前集数超出新源的范围，则跳转到第一集
      if (!newDetail.episodes || targetIndex >= newDetail.episodes.length) {
        targetIndex = 0;
      }

      // 如果仍然是同一集数且播放进度有效，则在播放器就绪后恢复到原始进度
      if (targetIndex !== currentEpisodeIndex) {
        resumeTimeRef.current = 0;
      } else if (
        (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
        currentPlayTime > 1
      ) {
        resumeTimeRef.current = currentPlayTime;
      }

      // 更新URL参数（不刷新页面）
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', newSource);
      newUrl.searchParams.set('id', newId);
      newUrl.searchParams.set('year', newDetail.year);
      window.history.replaceState({}, '', newUrl.toString());

      setVideoTitle(newDetail.title || newTitle);
      setVideoYear(newDetail.year);
      setVideoCover(newDetail.poster);
      // 优先保留URL参数中的豆瓣ID，如果URL中没有则使用详情数据中的
      setVideoDoubanId(videoDoubanIdRef.current || newDetail.douban_id || 0);
      setCurrentSource(newSource);
      setCurrentId(newId);
      setDetail(newDetail);
      setCurrentEpisodeIndex(targetIndex);

      // 🚀 换源完成后，优化弹幕加载流程
      setTimeout(async () => {
        isSourceChangingRef.current = false; // 重置换源标识

        if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku && externalDanmuEnabledRef.current) {
          console.log('🔄 换源完成，开始优化弹幕加载...');

          // 确保状态完全重置
          lastDanmuLoadKeyRef.current = '';
          danmuLoadingRef.current = false;

          try {
            const startTime = performance.now();
            const danmuData = await loadExternalDanmu();

            if (danmuData.length > 0 && artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

              // 🚀 确保在加载新弹幕前完全清空旧弹幕
              plugin.reset(); // 立即回收所有正在显示的弹幕DOM
              plugin.load(); // 不传参数，完全清空队列
              console.log('🧹 换源后已清空旧弹幕，准备加载新弹幕');

              // 🚀 优化大量弹幕的加载：分批处理，减少阻塞
              if (danmuData.length > 1000) {
                console.log(`📊 检测到大量弹幕 (${danmuData.length}条)，启用分批加载`);

                // 先加载前500条，快速显示
                const firstBatch = danmuData.slice(0, 500);
                plugin.load(firstBatch);

                // 剩余弹幕分批异步加载，避免阻塞
                const remainingBatches = [];
                for (let i = 500; i < danmuData.length; i += 300) {
                  remainingBatches.push(danmuData.slice(i, i + 300));
                }

                // 使用requestIdleCallback分批加载剩余弹幕
                remainingBatches.forEach((batch, index) => {
                  setTimeout(() => {
                    if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                      // 将批次弹幕追加到现有队列
                      batch.forEach(danmu => {
                        plugin.emit(danmu).catch(console.warn);
                      });
                    }
                  }, (index + 1) * 100); // 每100ms加载一批
                });

                console.log(`⚡ 分批加载完成: 首批${firstBatch.length}条 + ${remainingBatches.length}个后续批次`);
              } else {
                // 弹幕数量较少，正常加载
                plugin.load(danmuData);
                console.log(`✅ 换源后弹幕加载完成: ${danmuData.length} 条`);
              }

              const loadTime = performance.now() - startTime;
              console.log(`⏱️ 弹幕加载耗时: ${loadTime.toFixed(2)}ms`);
            } else {
              console.log('📭 换源后没有弹幕数据');
            }
          } catch (error) {
            console.error('❌ 换源后弹幕加载失败:', error);
          }
        }
      }, 1000); // 减少到1秒延迟，加快响应

    } catch (err) {
      // 重置换源标识
      isSourceChangingRef.current = false;

      // 隐藏换源加载状态
      setIsVideoLoading(false);
      setError(err instanceof Error ? err.message : '换源失败');
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, []);

  // 🚀 组件卸载时清理所有定时器和状态
  useEffect(() => {
    return () => {
      // 清理所有定时器
      if (danmuOperationTimeoutRef.current) {
        clearTimeout(danmuOperationTimeoutRef.current);
      }
      if (episodeSwitchTimeoutRef.current) {
        clearTimeout(episodeSwitchTimeoutRef.current);
      }
      if (sourceSwitchTimeoutRef.current) {
        clearTimeout(sourceSwitchTimeoutRef.current);
      }

      // 重置状态
      isSourceChangingRef.current = false;
      switchPromiseRef.current = null;
      pendingSwitchRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 集数切换
  // ---------------------------------------------------------------------------
  // 处理集数切换
  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      // 在更换集数前保存当前播放进度
      if (artPlayerRef.current && artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handlePreviousEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx > 0) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx - 1);
    }
  };

  const handleNextEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx < d.episodes.length - 1) {
      // 🔥 关键修复：通过 SkipController 自动跳下一集时，不保存播放进度
      // 因为此时的播放位置是片尾，用户并没有真正看到这个位置
      // 如果保存了片尾的进度，下次"继续观看"会从片尾开始，导致进度错误
      // if (artPlayerRef.current && !artPlayerRef.current.paused) {
      //   saveCurrentPlayProgress();
      // }

      // 🔑 标记通过 SkipController 触发了下一集
      isSkipControllerTriggeredRef.current = true;
      setCurrentEpisodeIndex(idx + 1);
    }
  };

  // ---------------------------------------------------------------------------
  // 键盘快捷键
  // ---------------------------------------------------------------------------
  // 处理全局快捷键
  const handleKeyboardShortcuts = (e: KeyboardEvent) => {
    // 忽略输入框中的按键事件
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return;

    // Alt + 左箭头 = 上一集
    if (e.altKey && e.key === 'ArrowLeft') {
      if (detailRef.current && currentEpisodeIndexRef.current > 0) {
        handlePreviousEpisode();
        e.preventDefault();
      }
    }

    // Alt + 右箭头 = 下一集
    if (e.altKey && e.key === 'ArrowRight') {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      if (d && idx < d.episodes.length - 1) {
        handleNextEpisode();
        e.preventDefault();
      }
    }

    // 左箭头 = 快退
    if (!e.altKey && e.key === 'ArrowLeft') {
      if (artPlayerRef.current && artPlayerRef.current.currentTime > 5) {
        artPlayerRef.current.currentTime -= 10;
        e.preventDefault();
      }
    }

    // 右箭头 = 快进
    if (!e.altKey && e.key === 'ArrowRight') {
      if (
        artPlayerRef.current &&
        artPlayerRef.current.currentTime < artPlayerRef.current.duration - 5
      ) {
        artPlayerRef.current.currentTime += 10;
        e.preventDefault();
      }
    }

    // 上箭头 = 音量+
    if (e.key === 'ArrowUp') {
      if (artPlayerRef.current && artPlayerRef.current.volume < 1) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume + 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 下箭头 = 音量-
    if (e.key === 'ArrowDown') {
      if (artPlayerRef.current && artPlayerRef.current.volume > 0) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume - 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 空格 = 播放/暂停
    if (e.key === ' ') {
      if (artPlayerRef.current) {
        artPlayerRef.current.toggle();
        e.preventDefault();
      }
    }

    // f 键 = 切换全屏
    if (e.key === 'f' || e.key === 'F') {
      if (artPlayerRef.current) {
        artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
        e.preventDefault();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 播放记录相关
  // ---------------------------------------------------------------------------
  // 保存播放进度
  const saveCurrentPlayProgress = async () => {
    if (
      !artPlayerRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current ||
      !videoTitleRef.current ||
      !detailRef.current?.source_name
    ) {
      return;
    }

    const player = artPlayerRef.current;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    // 如果播放时间太短（少于5秒）或者视频时长无效，不保存
    if (currentTime < 1 || !duration) {
      return;
    }

    try {
      // 获取现有播放记录以保持原始集数
      const existingRecord = await getAllPlayRecords().then(records => {
        const key = generateStorageKey(currentSourceRef.current, currentIdRef.current);
        return records[key];
      }).catch(() => null);

      const currentTotalEpisodes = detailRef.current?.episodes.length || 1;

      // 尝试从换源列表中获取更准确的 remarks（搜索接口比详情接口更可能有 remarks）
      const sourceFromList = availableSourcesRef.current?.find(
        s => s.source === currentSourceRef.current && s.id === currentIdRef.current
      );
      const remarksToSave = sourceFromList?.remarks || detailRef.current?.remarks;

      await savePlayRecord(currentSourceRef.current, currentIdRef.current, {
        title: videoTitleRef.current,
        source_name: detailRef.current?.source_name || '',
        year: detailRef.current?.year,
        cover: detailRef.current?.poster || '',
        index: currentEpisodeIndexRef.current + 1, // 转换为1基索引
        total_episodes: currentTotalEpisodes,
        // 🔑 关键：不要在这里设置 original_episodes
        // 让 savePlayRecord 自己处理：
        // - 首次保存时会自动设置为 total_episodes
        // - 后续保存时会从数据库读取并保持不变
        // - 只有当用户看了新集数时才会更新
        // 这样避免了播放器传入错误的 original_episodes（可能是更新后的值）
        original_episodes: existingRecord?.original_episodes, // 只传递已有值，不自动填充
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
        search_title: searchTitle,
        remarks: remarksToSave, // 优先使用搜索结果的 remarks，因为详情接口可能没有
      });

      lastSaveTimeRef.current = Date.now();
      console.log('播放进度已保存:', {
        title: videoTitleRef.current,
        episode: currentEpisodeIndexRef.current + 1,
        year: detailRef.current?.year,
        progress: `${Math.floor(currentTime)}/${Math.floor(duration)}`,
      });
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  };

  useEffect(() => {
    // 页面即将卸载时保存播放进度和清理资源
    const handleBeforeUnload = () => {
      saveCurrentPlayProgress();
      releaseWakeLock();
      cleanupPlayer();
    };

    // 页面可见性变化时保存播放进度和释放 Wake Lock
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentPlayProgress();
        releaseWakeLock();
      } else if (document.visibilityState === 'visible') {
        // 页面重新可见时，如果正在播放则重新请求 Wake Lock
        if (artPlayerRef.current && !artPlayerRef.current.paused) {
          requestWakeLock();
        }
      }
    };

    // 添加事件监听器
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // 清理事件监听器
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentEpisodeIndex, detail, artPlayerRef.current]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 收藏相关
  // ---------------------------------------------------------------------------
  // 每当 source 或 id 变化时检查收藏状态
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);
      } catch (err) {
        console.error('检查收藏状态失败:', err);
      }
    })();
  }, [currentSource, currentId]);

  // 监听收藏数据更新事件
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        const key = generateStorageKey(currentSource, currentId);
        const isFav = !!favorites[key];
        setFavorited(isFav);
      }
    );

    return unsubscribe;
  }, [currentSource, currentId]);

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (
      !videoTitleRef.current ||
      !detailRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current
    )
      return;

    try {
      if (favorited) {
        // 如果已收藏，删除收藏
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
        setFavorited(false);
      } else {
        // 如果未收藏，添加收藏
        await saveFavorite(currentSourceRef.current, currentIdRef.current, {
          title: videoTitleRef.current,
          source_name: detailRef.current?.source_name || '',
          year: detailRef.current?.year,
          cover: detailRef.current?.poster || '',
          total_episodes: detailRef.current?.episodes.length || 1,
          save_time: Date.now(),
          search_title: searchTitle,
        });
        setFavorited(true);
      }
    } catch (err) {
      console.error('切换收藏失败:', err);
    }
  };

  useEffect(() => {
    // 异步初始化播放器，避免SSR问题
    const initPlayer = async () => {
      if (
        !Hls ||
        !videoUrl ||
        loading ||
        currentEpisodeIndex === null ||
        !artRef.current
      ) {
        return;
      }

    // 确保选集索引有效
    if (
      !detail ||
      !detail.episodes ||
      currentEpisodeIndex >= detail.episodes.length ||
      currentEpisodeIndex < 0
    ) {
      setError(`选集索引无效，当前共 ${totalEpisodes} 集`);
      return;
    }

    if (!videoUrl) {
      setError('视频地址无效');
      return;
    }
    console.log(videoUrl);

    // 检测移动设备和浏览器类型 - 使用统一的全局检测结果
    const isSafari = /^(?:(?!chrome|android).)*safari/i.test(userAgent);
    const isIOS = isIOSGlobal;
    const isIOS13 = isIOS13Global;
    const isMobile = isMobileGlobal;
    const isWebKit = isSafari || isIOS;
    // Chrome浏览器检测 - 只有真正的Chrome才支持Chromecast
    // 排除各种厂商浏览器，即使它们的UA包含Chrome字样
    const isChrome = /Chrome/i.test(userAgent) && 
                    !/Edg/i.test(userAgent) &&      // 排除Edge
                    !/OPR/i.test(userAgent) &&      // 排除Opera
                    !/SamsungBrowser/i.test(userAgent) && // 排除三星浏览器
                    !/OPPO/i.test(userAgent) &&     // 排除OPPO浏览器
                    !/OppoBrowser/i.test(userAgent) && // 排除OppoBrowser
                    !/HeyTapBrowser/i.test(userAgent) && // 排除HeyTapBrowser (OPPO新版浏览器)
                    !/OnePlus/i.test(userAgent) &&  // 排除OnePlus浏览器
                    !/Xiaomi/i.test(userAgent) &&   // 排除小米浏览器
                    !/MIUI/i.test(userAgent) &&     // 排除MIUI浏览器
                    !/Huawei/i.test(userAgent) &&   // 排除华为浏览器
                    !/Vivo/i.test(userAgent) &&     // 排除Vivo浏览器
                    !/UCBrowser/i.test(userAgent) && // 排除UC浏览器
                    !/QQBrowser/i.test(userAgent) && // 排除QQ浏览器
                    !/Baidu/i.test(userAgent) &&    // 排除百度浏览器
                    !/SogouMobileBrowser/i.test(userAgent); // 排除搜狗浏览器

    // 调试信息：输出设备检测结果和投屏策略
    console.log('🔍 设备检测结果:', {
      userAgent,
      isIOS,
      isSafari,
      isMobile,
      isWebKit,
      isChrome,
      'AirPlay按钮': isIOS || isSafari ? '✅ 显示' : '❌ 隐藏',
      'Chromecast按钮': isChrome && !isIOS ? '✅ 显示' : '❌ 隐藏',
      '投屏策略': isIOS || isSafari ? '🍎 AirPlay (WebKit)' : isChrome ? '📺 Chromecast (Cast API)' : '❌ 不支持投屏'
    });

    // 🚀 优化连续切换：防抖机制 + 资源管理
    if (artPlayerRef.current && !loading) {
      try {
        // 清除之前的切换定时器
        if (sourceSwitchTimeoutRef.current) {
          clearTimeout(sourceSwitchTimeoutRef.current);
          sourceSwitchTimeoutRef.current = null;
        }

        // 如果有正在进行的切换，先取消
        if (switchPromiseRef.current) {
          console.log('⏸️ 取消前一个切换操作，开始新的切换');
          // ArtPlayer没有提供取消机制，但我们可以忽略旧的结果
          switchPromiseRef.current = null;
        }

        // 保存弹幕状态
        if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
          danmuPluginStateRef.current = {
            isHide: artPlayerRef.current.plugins.artplayerPluginDanmuku.isHide,
            isStop: artPlayerRef.current.plugins.artplayerPluginDanmuku.isStop,
            option: artPlayerRef.current.plugins.artplayerPluginDanmuku.option
          };
        }

        // 🚀 关键修复：区分换源和切换集数
        const isEpisodeChange = isEpisodeChangingRef.current;
        const currentTime = artPlayerRef.current.currentTime || 0;

        let switchPromise: Promise<any>;
        if (isEpisodeChange) {
          console.log(`🎯 开始切换集数: ${videoUrl} (重置播放时间到0)`);
          // 切换集数时重置播放时间到0
          switchPromise = artPlayerRef.current.switchUrl(videoUrl);
        } else {
          console.log(`🎯 开始切换源: ${videoUrl} (保持进度: ${currentTime.toFixed(2)}s)`);
          // 换源时保持播放进度
          switchPromise = artPlayerRef.current.switchQuality(videoUrl);
        }

        // 创建切换Promise
        switchPromise = switchPromise.then(() => {
          // 只有当前Promise还是活跃的才执行后续操作
          if (switchPromiseRef.current === switchPromise) {
            artPlayerRef.current.title = `${videoTitle} - 第${currentEpisodeIndex + 1}集`;
            artPlayerRef.current.poster = videoCover;
            console.log('✅ 源切换完成');

            // 🔥 重置集数切换标识
            if (isEpisodeChange) {
              // 🔑 关键修复：切换集数后显式重置播放时间为 0，确保片头自动跳过能触发
              artPlayerRef.current.currentTime = 0;
              console.log('🎯 集数切换完成，重置播放时间为 0');
              isEpisodeChangingRef.current = false;
            }
          }
        }).catch((error: any) => {
          if (switchPromiseRef.current === switchPromise) {
            console.warn('⚠️ 源切换失败，将重建播放器:', error);
            // 重置集数切换标识
            if (isEpisodeChange) {
              isEpisodeChangingRef.current = false;
            }
            throw error; // 让外层catch处理
          }
        });

        switchPromiseRef.current = switchPromise;
        await switchPromise;
        
        if (artPlayerRef.current?.video) {
          ensureVideoSource(
            artPlayerRef.current.video as HTMLVideoElement,
            videoUrl
          );
        }
        
        // 🚀 移除原有的 setTimeout 弹幕加载逻辑，交由 useEffect 统一优化处理
        
        console.log('使用switch方法成功切换视频');
        return;
      } catch (error) {
        console.warn('Switch方法失败，将重建播放器:', error);
        // 重置集数切换标识
        isEpisodeChangingRef.current = false;
        // 如果switch失败，清理播放器并重新创建
        cleanupPlayer();
      }
    }
    if (artPlayerRef.current) {
      cleanupPlayer();
    }

    // 确保 DOM 容器完全清空，避免多实例冲突
    if (artRef.current) {
      artRef.current.innerHTML = '';
    }

    try {
      // 使用动态导入的 Artplayer
      const Artplayer = (window as any).DynamicArtplayer;
      const artplayerPluginDanmuku = (window as any).DynamicArtplayerPluginDanmuku;
      
      // 创建新的播放器实例
      Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      Artplayer.USE_RAF = true;
      // 重新启用5.3.0内存优化功能，但使用false参数避免清空DOM
      Artplayer.REMOVE_SRC_WHEN_DESTROY = true;

      artPlayerRef.current = new Artplayer({
        container: artRef.current,
        url: videoUrl,
        poster: videoCover,
        volume: 0.7,
        isLive: false,
        // iOS设备需要静音才能自动播放，参考ArtPlayer源码处理
        muted: isIOS || isSafari,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: false,
        screenshot: false,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: false,
        miniProgressBar: false,
        mutex: true,
        playsInline: true,
        autoPlayback: false,
        theme: '#22c55e',
        lang: 'zh-cn',
        hotkey: false,
        fastForward: true,
        autoOrientation: true,
        lock: true,
        // AirPlay 仅在支持 WebKit API 的浏览器中启用
        // 主要是 Safari (桌面和移动端) 和 iOS 上的其他浏览器
        airplay: isIOS || isSafari,
        moreVideoAttr: {
          crossOrigin: 'anonymous',
        },
        // HLS 支持配置
        customType: {
          m3u8: function (video: HTMLVideoElement, url: string) {
            if (!Hls) {
              console.error('HLS.js 未加载');
              return;
            }

            if (video.hls) {
              video.hls.destroy();
            }
            
            // 在函数内部重新检测iOS13+设备
            const localIsIOS13 = isIOS13;
            
            // 🚀 根据 HLS.js 官方源码的最佳实践配置
            const hls = new Hls({
              debug: false,
              enableWorker: true,
              // 参考 HLS.js config.ts：移动设备关闭低延迟模式以节省资源
              lowLatencyMode: !isMobile,
              
              // 🎯 官方推荐的缓冲策略 - iOS13+ 特别优化
              /* 缓冲长度配置 - 参考 hlsDefaultConfig */
              maxBufferLength: isMobile 
                ? (localIsIOS13 ? 8 : isIOS ? 10 : 15)  // iOS13+: 8s, iOS: 10s, Android: 15s
                : 30, // 桌面默认30s
              backBufferLength: isMobile 
                ? (localIsIOS13 ? 5 : isIOS ? 8 : 10)   // iOS13+更保守
                : Infinity, // 桌面使用无限回退缓冲

              /* 缓冲大小配置 - 基于官方 maxBufferSize */
              maxBufferSize: isMobile 
                ? (localIsIOS13 ? 20 * 1000 * 1000 : isIOS ? 30 * 1000 * 1000 : 40 * 1000 * 1000) // iOS13+: 20MB, iOS: 30MB, Android: 40MB
                : 60 * 1000 * 1000, // 桌面: 60MB (官方默认)

              /* 网络加载优化 - 参考 defaultLoadPolicy */
              maxLoadingDelay: isMobile ? (localIsIOS13 ? 2 : 3) : 4, // iOS13+设备更快超时
              maxBufferHole: isMobile ? (localIsIOS13 ? 0.05 : 0.1) : 0.1, // 减少缓冲洞容忍度
              
              /* Fragment管理 - 参考官方配置 */
              liveDurationInfinity: false, // 避免无限缓冲 (官方默认false)
              liveBackBufferLength: isMobile ? (localIsIOS13 ? 3 : 5) : null, // 已废弃，保持兼容

              /* 高级优化配置 - 参考 StreamControllerConfig */
              maxMaxBufferLength: isMobile ? (localIsIOS13 ? 60 : 120) : 600, // 最大缓冲长度限制
              maxFragLookUpTolerance: isMobile ? 0.1 : 0.25, // 片段查找容忍度
              
              /* ABR优化 - 参考 ABRControllerConfig */
              abrEwmaFastLive: isMobile ? 2 : 3, // 移动端更快的码率切换
              abrEwmaSlowLive: isMobile ? 6 : 9,
              abrBandWidthFactor: isMobile ? 0.8 : 0.95, // 移动端更保守的带宽估计
              
              /* 启动优化 */
              startFragPrefetch: !isMobile, // 移动端关闭预取以节省资源
              testBandwidth: !localIsIOS13, // iOS13+关闭带宽测试以快速启动
              
              /* Loader配置 - 参考官方 fragLoadPolicy */
              fragLoadPolicy: {
                default: {
                  maxTimeToFirstByteMs: isMobile ? 6000 : 10000,
                  maxLoadTimeMs: isMobile ? 60000 : 120000,
                  timeoutRetry: {
                    maxNumRetry: isMobile ? 2 : 4,
                    retryDelayMs: 0,
                    maxRetryDelayMs: 0,
                  },
                  errorRetry: {
                    maxNumRetry: isMobile ? 3 : 6,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: isMobile ? 4000 : 8000,
                  },
                },
              },

              /* 自定义loader */
              loader: blockAdEnabledRef.current
                ? CustomHlsJsLoader
                : Hls.DefaultConfig.loader,
            });

            hls.loadSource(url);
            hls.attachMedia(video);
            video.hls = hls;

            ensureVideoSource(video, url);

            hls.on(Hls.Events.ERROR, function (event: any, data: any) {
              console.error('HLS Error:', event, data);

              // v1.6.13 增强：处理片段解析错误（针对initPTS修复）
              if (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
                console.log('片段解析错误，尝试重新加载...');
                // 重新开始加载，利用v1.6.13的initPTS修复
                hls.startLoad();
                return;
              }

              // v1.6.13 增强：处理时间戳相关错误（直播回搜修复）
              if (data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR &&
                  data.err && data.err.message &&
                  data.err.message.includes('timestamp')) {
                console.log('时间戳错误，清理缓冲区并重新加载...');
                try {
                  // 清理缓冲区后重新开始，利用v1.6.13的时间戳包装修复
                  const currentTime = video.currentTime;
                  hls.trigger(Hls.Events.BUFFER_RESET, undefined);
                  hls.startLoad(currentTime);
                } catch (e) {
                  console.warn('缓冲区重置失败:', e);
                  hls.startLoad();
                }
                return;
              }

              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log('网络错误，尝试恢复...');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log('媒体错误，尝试恢复...');
                    hls.recoverMediaError();
                    break;
                  default:
                    console.log('无法恢复的错误');
                    hls.destroy();
                    break;
                }
              }
            });
          },
        },
        icons: {
          loading:
            '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48cGF0aCBkPSJNMjUuMjUxIDYuNDYxYy0xMC4zMTggMC0xOC42ODMgOC4zNjUtMTguNjgzIDE4LjY4M2g0LjA2OGMwLTguMDcgNi41NDUtMTQuNjE1IDE0LjYxNS0xNC42MTVWNi40NjF6IiBmaWxsPSIjMDA5Njg4Ij48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIGF0dHJpYnV0ZVR5cGU9IlhNTCIgZHVyPSIxcyIgZnJvbT0iMCAyNSAyNSIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiIHRvPSIzNjAgMjUgMjUiIHR5cGU9InJvdGF0ZSIvPjwvcGF0aD48L3N2Zz4=">',
        },
        settings: [
          {
            html: '去广告',
            icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
            tooltip: blockAdEnabled ? '已开启' : '已关闭',
            onClick() {
              const newVal = !blockAdEnabled;
              try {
                localStorage.setItem('enable_blockad', String(newVal));
                if (artPlayerRef.current) {
                  resumeTimeRef.current = artPlayerRef.current.currentTime;
                  if (artPlayerRef.current.video.hls) {
                    artPlayerRef.current.video.hls.destroy();
                  }
                  artPlayerRef.current.destroy(false);
                  artPlayerRef.current = null;
                }
                setBlockAdEnabled(newVal);
              } catch (_) {
                // ignore
              }
              return newVal ? '当前开启' : '当前关闭';
            },
          },
          {
            name: '外部弹幕',
            html: '外部弹幕',
            icon: '<text x="50%" y="50%" font-size="14" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">外</text>',
            tooltip: externalDanmuEnabled ? '外部弹幕已开启' : '外部弹幕已关闭',
            switch: externalDanmuEnabled,
            onSwitch: function (item: any) {
              const nextState = !item.switch;
              
              // 🚀 使用优化后的弹幕操作处理函数
              handleDanmuOperationOptimized(nextState);
              
              // 更新tooltip显示
              item.tooltip = nextState ? '外部弹幕已开启' : '外部弹幕已关闭';
              
              return nextState; // 立即返回新状态
            },
          },
        ],
        // 控制栏配置
        controls: [
          {
            position: 'left',
            index: 13,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
            tooltip: '播放下一集',
            click: function () {
              handleNextEpisode();
            },
          },
          // 🚀 简单弹幕发送按钮（仅Web端显示）
          ...(isMobile ? [] : [{
            position: 'right',
            html: '弹',
            tooltip: '发送弹幕',
            click: function () {
              if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                // 手动弹出输入框发送弹幕
                const text = prompt('请输入弹幕内容', '');
                if (text && text.trim()) {
                  artPlayerRef.current.plugins.artplayerPluginDanmuku.emit({
                    text: text.trim(),
                    time: artPlayerRef.current.currentTime,
                    color: '#FFFFFF',
                    mode: 0,
                  });
                }
              }
            },
          }]),
        ],
        // 🚀 性能优化的弹幕插件配置 - 保持弹幕数量，优化渲染性能
        plugins: [
          artplayerPluginDanmuku((() => {
            // 🎯 设备性能检测
            const getDevicePerformance = () => {
              const hardwareConcurrency = navigator.hardwareConcurrency || 2
              const memory = (performance as any).memory?.jsHeapSizeLimit || 0
              
              // 简单性能评分（0-1）
              let score = 0
              score += Math.min(hardwareConcurrency / 4, 1) * 0.5 // CPU核心数权重
              score += Math.min(memory / (1024 * 1024 * 1024), 1) * 0.3 // 内存权重
              score += (isMobile ? 0.2 : 0.5) * 0.2 // 设备类型权重
              
              if (score > 0.7) return 'high'
              if (score > 0.4) return 'medium' 
              return 'low'
            }
            
            const devicePerformance = getDevicePerformance()
            console.log(`🎯 设备性能等级: ${devicePerformance}`)
            
            // 🚀 激进性能优化：针对大量弹幕的渲染策略
            const getOptimizedConfig = () => {
              const baseConfig = {
                danmuku: [], // 初始为空数组，后续通过load方法加载
                speed: parseInt(localStorage.getItem('danmaku_speed') || '6'),
                opacity: parseFloat(localStorage.getItem('danmaku_opacity') || '0.8'),
                fontSize: parseInt(localStorage.getItem('danmaku_fontSize') || '25'),
                color: '#FFFFFF',
                mode: 0 as const,
                modes: JSON.parse(localStorage.getItem('danmaku_modes') || '[0, 1, 2]') as Array<0 | 1 | 2>,
                margin: JSON.parse(localStorage.getItem('danmaku_margin') || '[10, "75%"]') as [number | `${number}%`, number | `${number}%`],
                visible: localStorage.getItem('danmaku_visible') !== 'false',
                emitter: false,
                maxLength: 50,
                lockTime: 1, // 🎯 进一步减少锁定时间，提升进度跳转响应
                theme: 'dark' as const,
                width: 300,

                // 🎯 激进优化配置 - 保持功能完整性
                antiOverlap: devicePerformance === 'high', // 只有高性能设备开启防重叠，避免重叠计算
                synchronousPlayback: true, // ✅ 必须保持true！确保弹幕与视频播放速度同步
                heatmap: false, // 关闭热力图，减少DOM计算开销
                
                // 🧠 智能过滤器 - 激进性能优化，过滤影响性能的弹幕
                filter: (danmu: any) => {
                  // 基础验证
                  if (!danmu.text || !danmu.text.trim()) return false

                  const text = danmu.text.trim();

                  // 🔥 激进长度限制，减少DOM渲染负担
                  if (text.length > 50) return false // 从100改为50，更激进
                  if (text.length < 2) return false  // 过短弹幕通常无意义

                  // 🔥 激进特殊字符过滤，避免复杂渲染
                  const specialCharCount = (text.match(/[^\u4e00-\u9fa5a-zA-Z0-9\s.,!?；，。！？]/g) || []).length
                  if (specialCharCount > 5) return false // 从10改为5，更严格

                  // 🔥 过滤纯数字或纯符号弹幕，减少无意义渲染
                  if (/^\d+$/.test(text)) return false
                  if (/^[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/.test(text)) return false

                  // 🔥 过滤常见低质量弹幕，提升整体质量
                  const lowQualityPatterns = [
                    /^666+$/, /^好+$/, /^哈+$/, /^啊+$/,
                    /^[!！.。？?]+$/, /^牛+$/, /^强+$/
                  ];
                  if (lowQualityPatterns.some(pattern => pattern.test(text))) return false

                  return true
                },
                
                // 🚀 优化的弹幕显示前检查（换源时性能优化）
                beforeVisible: (danmu: any) => {
                  return new Promise<boolean>((resolve) => {
                    // 换源期间快速拒绝弹幕显示，减少处理开销
                    if (isSourceChangingRef.current) {
                      resolve(false);
                      return;
                    }

                    // 🎯 动态弹幕密度控制 - 根据当前屏幕上的弹幕数量决定是否显示
                    const currentVisibleCount = document.querySelectorAll('.art-danmuku [data-state="emit"]').length;
                    const maxConcurrentDanmu = devicePerformance === 'high' ? 60 :
                                             devicePerformance === 'medium' ? 40 : 25;

                    if (currentVisibleCount >= maxConcurrentDanmu) {
                      // 🔥 当弹幕密度过高时，随机丢弃部分弹幕，保持流畅性
                      const dropRate = devicePerformance === 'high' ? 0.1 :
                                      devicePerformance === 'medium' ? 0.3 : 0.5;
                      if (Math.random() < dropRate) {
                        resolve(false); // 丢弃当前弹幕
                        return;
                      }
                    }

                    // 🎯 硬件加速优化
                    if (danmu.$ref && danmu.mode === 0) {
                      danmu.$ref.style.willChange = 'transform';
                      danmu.$ref.style.backfaceVisibility = 'hidden';

                      // 低性能设备额外优化
                      if (devicePerformance === 'low') {
                        danmu.$ref.style.transform = 'translateZ(0)'; // 强制硬件加速
                        danmu.$ref.classList.add('art-danmuku-optimized');
                      }
                    }

                    resolve(true);
                  });
                },
              }
              
              // 根据设备性能调整核心配置
              switch (devicePerformance) {
                case 'high': // 高性能设备 - 完整功能
                  return {
                    ...baseConfig,
                    antiOverlap: true, // 开启防重叠
                    synchronousPlayback: true, // 保持弹幕与视频播放速度同步
                    useWorker: true, // v5.2.0: 启用Web Worker优化
                  }
                
                case 'medium': // 中等性能设备 - 适度优化
                  return {
                    ...baseConfig,
                    antiOverlap: !isMobile, // 移动端关闭防重叠
                    synchronousPlayback: true, // 保持同步播放以确保体验一致
                    useWorker: true, // v5.2.0: 中等设备也启用Worker
                  }
                
                case 'low': // 低性能设备 - 平衡优化
                  return {
                    ...baseConfig,
                    antiOverlap: false, // 关闭复杂的防重叠算法
                    synchronousPlayback: true, // 保持同步以确保体验，计算量不大
                    useWorker: true, // 开启Worker减少主线程负担
                    maxLength: 30, // v5.2.0优化: 减少弹幕数量是关键优化
                  }
              }
            }
            
            const config = getOptimizedConfig()
            
            // 🎨 为低性能设备添加CSS硬件加速样式
            if (devicePerformance === 'low') {
              // 创建CSS动画样式（硬件加速）
              if (!document.getElementById('danmaku-performance-css')) {
                const style = document.createElement('style')
                style.id = 'danmaku-performance-css'
                style.textContent = `
                  /* 🚀 硬件加速的弹幕优化 */
                  .art-danmuku-optimized {
                    will-change: transform !important;
                    backface-visibility: hidden !important;
                    transform: translateZ(0) !important;
                    transition: transform linear !important;
                  }
                `
                document.head.appendChild(style)
                console.log('🎨 已加载CSS硬件加速优化')
              }
            }
            
            return config
          })()),
          // Chromecast 插件加载策略：
          // 只在 Chrome 浏览器中显示 Chromecast（排除 iOS Chrome）
          // Safari 和 iOS：不显示 Chromecast（用原生 AirPlay）
          // 其他浏览器：不显示 Chromecast（不支持 Cast API）
          ...(isChrome && !isIOS ? [
            artplayerPluginChromecast({
              onStateChange: (state) => {
                console.log('Chromecast state changed:', state);
              },
              onCastAvailable: (available) => {
                console.log('Chromecast available:', available);
              },
              onCastStart: () => {
                console.log('Chromecast started');
              },
              onError: (error) => {
                console.error('Chromecast error:', error);
              }
            })
          ] : []),
        ],
      });

      // 监听播放器事件
      artPlayerRef.current.on('ready', async () => {
        setError(null);

        // iOS设备自动播放优化：如果是静音启动的，在开始播放后恢复音量
        if ((isIOS || isSafari) && artPlayerRef.current.muted) {
          console.log('iOS设备静音自动播放，准备在播放开始后恢复音量');
          
          const handleFirstPlay = () => {
            setTimeout(() => {
              if (artPlayerRef.current && artPlayerRef.current.muted) {
                artPlayerRef.current.muted = false;
                artPlayerRef.current.volume = lastVolumeRef.current || 0.7;
                console.log('iOS设备已恢复音量:', artPlayerRef.current.volume);
              }
            }, 500); // 延迟500ms确保播放稳定
            
            // 只执行一次
            artPlayerRef.current.off('video:play', handleFirstPlay);
          };
          
          artPlayerRef.current.on('video:play', handleFirstPlay);
        }

        // 添加弹幕插件按钮选择性隐藏CSS
        const optimizeDanmukuControlsCSS = () => {
          if (document.getElementById('danmuku-controls-optimize')) return;

          const style = document.createElement('style');
          style.id = 'danmuku-controls-optimize';
          style.textContent = `
            /* 隐藏弹幕开关按钮和发射器 */
            .artplayer-plugin-danmuku .apd-toggle {
              display: none !important;
            }

            .artplayer-plugin-danmuku .apd-emitter {
              display: none !important;
            }

            
            /* 弹幕配置面板优化 - 修复全屏模式下点击问题 */
            .artplayer-plugin-danmuku .apd-config {
              position: relative;
            }
            
            .artplayer-plugin-danmuku .apd-config-panel {
              /* 使用绝对定位而不是fixed，让ArtPlayer的动态定位生效 */
              position: absolute !important;
              /* 保持ArtPlayer原版的默认left: 0，让JS动态覆盖 */
              /* 保留z-index确保层级正确 */
              z-index: 2147483647 !important; /* 使用最大z-index确保在全屏模式下也能显示在最顶层 */
              /* 确保面板可以接收点击事件 */
              pointer-events: auto !important;
              /* 添加一些基础样式确保可见性 */
              background: rgba(0, 0, 0, 0.8);
              border-radius: 6px;
              backdrop-filter: blur(10px);
            }
            
            /* 全屏模式下的特殊优化 */
            .artplayer[data-fullscreen="true"] .artplayer-plugin-danmuku .apd-config-panel {
              /* 全屏时使用固定定位并调整位置 */
              position: fixed !important;
              top: auto !important;
              bottom: 80px !important; /* 距离底部控制栏80px */
              right: 20px !important; /* 距离右边20px */
              left: auto !important;
              z-index: 2147483647 !important;
            }
            
            /* 确保全屏模式下弹幕面板内部元素可点击 */
            .artplayer[data-fullscreen="true"] .artplayer-plugin-danmuku .apd-config-panel * {
              pointer-events: auto !important;
            }
          `;
          document.head.appendChild(style);
        };
        
        // 应用CSS优化
        optimizeDanmukuControlsCSS();

        // 精确解决弹幕菜单与进度条拖拽冲突 - 基于ArtPlayer原生拖拽逻辑
        const fixDanmakuProgressConflict = () => {
          let isDraggingProgress = false;
          
          setTimeout(() => {
            const progressControl = document.querySelector('.art-control-progress') as HTMLElement;
            if (!progressControl) return;
            
            // 添加精确的CSS控制
            const addPrecisionCSS = () => {
              if (document.getElementById('danmaku-drag-fix')) return;
              
              const style = document.createElement('style');
              style.id = 'danmaku-drag-fix';
              style.textContent = `
                /* 🔧 修复长时间播放后弹幕菜单hover失效问题 */

                /* 确保控制元素本身可以接收鼠标事件，恢复原生hover机制 */
                .artplayer-plugin-danmuku .apd-config,
                .artplayer-plugin-danmuku .apd-style {
                  pointer-events: auto !important;
                }

                /* 简化：依赖全局CSS中的hover处理 */

                /* 确保进度条层级足够高，避免被弹幕面板遮挡 */
                .art-progress {
                  position: relative;
                  z-index: 1000 !important;
                }

                /* 面板背景在非hover状态下不拦截事件，但允许hover检测 */
                .artplayer-plugin-danmuku .apd-config-panel:not(:hover),
                .artplayer-plugin-danmuku .apd-style-panel:not(:hover) {
                  pointer-events: none;
                }

                /* 面板内的具体控件始终可以交互 */
                .artplayer-plugin-danmuku .apd-config-panel-inner,
                .artplayer-plugin-danmuku .apd-style-panel-inner,
                .artplayer-plugin-danmuku .apd-config-panel .apd-mode,
                .artplayer-plugin-danmuku .apd-config-panel .apd-other,
                .artplayer-plugin-danmuku .apd-config-panel .apd-slider,
                .artplayer-plugin-danmuku .apd-style-panel .apd-mode,
                .artplayer-plugin-danmuku .apd-style-panel .apd-color {
                  pointer-events: auto !important;
                }
              `;
              document.head.appendChild(style);
            };
            
            // 精确模拟ArtPlayer的拖拽检测逻辑
            const handleProgressMouseDown = (event: MouseEvent) => {
              // 只有左键才开始拖拽检测
              if (event.button === 0) {
                isDraggingProgress = true;
                const artplayer = document.querySelector('.artplayer') as HTMLElement;
                if (artplayer) {
                  artplayer.setAttribute('data-dragging', 'true');
                }
              }
            };
            
            // 监听document的mousemove，与ArtPlayer保持一致
            const handleDocumentMouseMove = () => {
              // 如果正在拖拽，确保弹幕菜单被隐藏
              if (isDraggingProgress) {
                const panels = document.querySelectorAll('.artplayer-plugin-danmuku .apd-config-panel, .artplayer-plugin-danmuku .apd-style-panel') as NodeListOf<HTMLElement>;
                panels.forEach(panel => {
                  if (panel.style.opacity !== '0') {
                    panel.style.opacity = '0';
                    panel.style.pointerEvents = 'none';
                  }
                });
              }
            };
            
            // mouseup时立即恢复 - 与ArtPlayer逻辑完全同步
            const handleDocumentMouseUp = () => {
              if (isDraggingProgress) {
                isDraggingProgress = false;
                const artplayer = document.querySelector('.artplayer') as HTMLElement;
                if (artplayer) {
                  artplayer.removeAttribute('data-dragging');
                }
                // 立即恢复，不使用延迟
              }
            };
            
            // 绑定事件 - 与ArtPlayer使用相同的事件绑定方式
            progressControl.addEventListener('mousedown', handleProgressMouseDown);
            document.addEventListener('mousemove', handleDocumentMouseMove);
            document.addEventListener('mouseup', handleDocumentMouseUp);
            
            // 应用CSS
            addPrecisionCSS();

            // 🔄 添加定期重置机制，防止长时间播放后状态污染
            const danmakuResetInterval = setInterval(() => {
              if (!artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                clearInterval(danmakuResetInterval);
                return;
              }

              try {
                // 重置弹幕控件和面板状态
                const controls = document.querySelectorAll('.artplayer-plugin-danmuku .apd-config, .artplayer-plugin-danmuku .apd-style') as NodeListOf<HTMLElement>;
                const panels = document.querySelectorAll('.artplayer-plugin-danmuku .apd-config-panel, .artplayer-plugin-danmuku .apd-style-panel') as NodeListOf<HTMLElement>;

                // 强制重置控制元素的事件接收能力
                controls.forEach(control => {
                  if (control.style.pointerEvents === 'none') {
                    control.style.pointerEvents = 'auto';
                  }
                });

                // 重置面板状态，但不影响当前hover状态
                panels.forEach(panel => {
                  if (!panel.matches(':hover') && panel.style.opacity === '0') {
                    panel.style.opacity = '';
                    panel.style.pointerEvents = '';
                    panel.style.visibility = '';
                  }
                });

                console.log('🔄 弹幕菜单hover状态已重置');
              } catch (error) {
                console.warn('弹幕状态重置失败:', error);
              }
            }, 300000); // 每5分钟重置一次

            // 🚀 立即恢复hover状态（修复当前可能已存在的问题）
            const immediateRestore = () => {
              const controls = document.querySelectorAll('.artplayer-plugin-danmuku .apd-config, .artplayer-plugin-danmuku .apd-style') as NodeListOf<HTMLElement>;
              controls.forEach(control => {
                control.style.pointerEvents = 'auto';
              });
              console.log('🚀 弹幕菜单hover状态已立即恢复');
            };

            // 立即执行一次恢复
            setTimeout(immediateRestore, 100);

          }, 1500); // 等待弹幕插件加载
        };

        // 启用精确修复
        fixDanmakuProgressConflict();

        // 移动端弹幕配置按钮点击切换支持 - 基于ArtPlayer设置按钮原理
        const addMobileDanmakuToggle = () => {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

          setTimeout(() => {
            const configButton = document.querySelector('.artplayer-plugin-danmuku .apd-config');
            const configPanel = document.querySelector('.artplayer-plugin-danmuku .apd-config-panel');

            if (!configButton || !configPanel) {
              console.warn('弹幕配置按钮或面板未找到');
              return;
            }

            console.log('设备类型:', isMobile ? '移动端' : '桌面端');

            // 桌面端：简化处理，依赖CSS hover，移除复杂的JavaScript事件
            if (!isMobile) {
              console.log('桌面端：使用CSS原生hover，避免JavaScript事件冲突');
              return;
            }
            
            if (isMobile) {
              // 移动端：添加点击切换支持 + 持久位置修正
              console.log('为移动端添加弹幕配置按钮点击切换功能');
              
              let isConfigVisible = false;
              
              // 弹幕面板位置修正函数 - 简化版本
              const adjustPanelPosition = () => {
                const player = document.querySelector('.artplayer');
                if (!player || !configButton || !configPanel) return;

                try {
                  const panelElement = configPanel as HTMLElement;

                  // 始终清除内联样式，使用CSS默认定位
                  panelElement.style.left = '';
                  panelElement.style.right = '';
                  panelElement.style.transform = '';

                  console.log('弹幕面板：使用CSS默认定位，自动适配屏幕方向');
                } catch (error) {
                  console.warn('弹幕面板位置调整失败:', error);
                }
              };
              
              // 添加点击事件监听器
              configButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                isConfigVisible = !isConfigVisible;
                
                if (isConfigVisible) {
                  (configPanel as HTMLElement).style.display = 'block';
                  // 显示后立即调整位置
                  setTimeout(adjustPanelPosition, 10);
                  console.log('移动端弹幕配置面板：显示');
                } else {
                  (configPanel as HTMLElement).style.display = 'none';
                  console.log('移动端弹幕配置面板：隐藏');
                }
              });
              
              // 监听ArtPlayer的resize事件
              if (artPlayerRef.current) {
                artPlayerRef.current.on('resize', () => {
                  if (isConfigVisible) {
                    console.log('检测到ArtPlayer resize事件，重新调整弹幕面板位置');
                    setTimeout(adjustPanelPosition, 50); // 短暂延迟确保resize完成
                  }
                });
                console.log('已监听ArtPlayer resize事件，实现自动适配');
              }
              
              // 额外监听屏幕方向变化事件，确保完全自动适配
              const handleOrientationChange = () => {
                if (isConfigVisible) {
                  console.log('检测到屏幕方向变化，重新调整弹幕面板位置');
                  setTimeout(adjustPanelPosition, 100); // 稍长延迟等待方向变化完成
                }
              };

              window.addEventListener('orientationchange', handleOrientationChange);
              window.addEventListener('resize', handleOrientationChange);

              // 清理函数
              const _cleanup = () => {
                window.removeEventListener('orientationchange', handleOrientationChange);
                window.removeEventListener('resize', handleOrientationChange);
              };

              // 点击其他地方自动隐藏
              document.addEventListener('click', (e) => {
                if (isConfigVisible &&
                    !configButton.contains(e.target as Node) &&
                    !configPanel.contains(e.target as Node)) {
                  isConfigVisible = false;
                  (configPanel as HTMLElement).style.display = 'none';
                  console.log('点击外部区域，隐藏弹幕配置面板');
                }
              });

              console.log('移动端弹幕配置切换功能已激活');
            }
          }, 2000); // 延迟2秒确保弹幕插件完全初始化
        };
        
        // 启用移动端弹幕配置切换
        addMobileDanmakuToggle();

        // 播放器就绪后，加载外部弹幕数据
        console.log('播放器已就绪，开始加载外部弹幕');
        setTimeout(async () => {
          try {
            const externalDanmu = await loadExternalDanmu(); // 这里会检查开关状态
            console.log('外部弹幕加载结果:', externalDanmu);
            
            if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              if (externalDanmu.length > 0) {
                console.log('向播放器插件加载弹幕数据:', externalDanmu.length, '条');
                artPlayerRef.current.plugins.artplayerPluginDanmuku.load(externalDanmu);
                artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
              } else {
                console.log('没有弹幕数据可加载');
                artPlayerRef.current.notice.show = '暂无弹幕数据';
              }
            } else {
              console.error('弹幕插件未找到');
            }
          } catch (error) {
            console.error('加载外部弹幕失败:', error);
          }
        }, 1000); // 延迟1秒确保插件完全初始化

        // 监听弹幕插件的显示/隐藏事件，自动保存状态到localStorage
        artPlayerRef.current.on('artplayerPluginDanmuku:show', () => {
          localStorage.setItem('danmaku_visible', 'true');
          console.log('弹幕显示状态已保存');
        });
        
        artPlayerRef.current.on('artplayerPluginDanmuku:hide', () => {
          localStorage.setItem('danmaku_visible', 'false');
          console.log('弹幕隐藏状态已保存');
        });

        // 监听弹幕插件的配置变更事件，自动保存所有设置到localStorage
        artPlayerRef.current.on('artplayerPluginDanmuku:config', (option: any) => {
          try {
            // 保存所有弹幕配置到localStorage
            if (typeof option.fontSize !== 'undefined') {
              localStorage.setItem('danmaku_fontSize', option.fontSize.toString());
            }
            if (typeof option.opacity !== 'undefined') {
              localStorage.setItem('danmaku_opacity', option.opacity.toString());
            }
            if (typeof option.speed !== 'undefined') {
              localStorage.setItem('danmaku_speed', option.speed.toString());
            }
            if (typeof option.margin !== 'undefined') {
              localStorage.setItem('danmaku_margin', JSON.stringify(option.margin));
            }
            if (typeof option.modes !== 'undefined') {
              localStorage.setItem('danmaku_modes', JSON.stringify(option.modes));
            }
            if (typeof option.antiOverlap !== 'undefined') {
              localStorage.setItem('danmaku_antiOverlap', option.antiOverlap.toString());
            }
            if (typeof option.visible !== 'undefined') {
              localStorage.setItem('danmaku_visible', option.visible.toString());
            }
            console.log('弹幕配置已自动保存:', option);
          } catch (error) {
            console.error('保存弹幕配置失败:', error);
          }
        });

        // 监听播放进度跳转，优化弹幕重置（减少闪烁）
        artPlayerRef.current.on('seek', () => {
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            // 清除之前的重置计时器
            if (seekResetTimeoutRef.current) {
              clearTimeout(seekResetTimeoutRef.current);
            }
            
            // 增加延迟并只在非拖拽状态下重置，减少快进时的闪烁
            seekResetTimeoutRef.current = setTimeout(() => {
              if (!isDraggingProgressRef.current && artPlayerRef.current?.plugins?.artplayerPluginDanmuku && !artPlayerRef.current.seeking) {
                artPlayerRef.current.plugins.artplayerPluginDanmuku.reset();
                console.log('进度跳转，弹幕已重置');
              }
            }, 500); // 增加到500ms延迟，减少频繁重置导致的闪烁
          }
        });

        // 监听拖拽状态 - v5.2.0优化: 在拖拽期间暂停弹幕更新以减少闪烁
        artPlayerRef.current.on('video:seeking', () => {
          isDraggingProgressRef.current = true;
          // v5.2.0新增: 拖拽时隐藏弹幕，减少CPU占用和闪烁
          // 只有在外部弹幕开启且当前显示时才隐藏
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku && 
              externalDanmuEnabledRef.current && 
              !artPlayerRef.current.plugins.artplayerPluginDanmuku.isHide) {
            artPlayerRef.current.plugins.artplayerPluginDanmuku.hide();
          }
        });

        artPlayerRef.current.on('video:seeked', () => {
          isDraggingProgressRef.current = false;
          // v5.2.0优化: 拖拽结束后根据外部弹幕开关状态决定是否恢复弹幕显示
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            // 只有在外部弹幕开启时才恢复显示
            if (externalDanmuEnabledRef.current) {
              artPlayerRef.current.plugins.artplayerPluginDanmuku.show(); // 先恢复显示
              setTimeout(() => {
                // 延迟重置以确保播放状态稳定
                if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                  artPlayerRef.current.plugins.artplayerPluginDanmuku.reset();
                  console.log('拖拽结束，弹幕已重置');
                }
              }, 100);
            } else {
              // 外部弹幕关闭时，确保保持隐藏状态
              artPlayerRef.current.plugins.artplayerPluginDanmuku.hide();
              console.log('拖拽结束，外部弹幕已关闭，保持隐藏状态');
            }
          }
        });

        // 监听播放器窗口尺寸变化，触发弹幕重置（双重保障）
        artPlayerRef.current.on('resize', () => {
          // 清除之前的重置计时器
          if (resizeResetTimeoutRef.current) {
            clearTimeout(resizeResetTimeoutRef.current);
          }
          
          // 延迟重置弹幕，避免连续触发（全屏切换优化）
          resizeResetTimeoutRef.current = setTimeout(() => {
            if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              artPlayerRef.current.plugins.artplayerPluginDanmuku.reset();
              console.log('窗口尺寸变化，弹幕已重置（防抖优化）');
            }
          }, 300); // 300ms防抖，减少全屏切换时的卡顿
        });

        // 播放器就绪后，如果正在播放则请求 Wake Lock
        if (artPlayerRef.current && !artPlayerRef.current.paused) {
          requestWakeLock();
        }
      });

      // 监听播放状态变化，控制 Wake Lock
      artPlayerRef.current.on('play', () => {
        requestWakeLock();
      });

      artPlayerRef.current.on('pause', () => {
        releaseWakeLock();
        // 🔥 关键修复：暂停时也检查是否在片尾，避免保存错误的进度
        const currentTime = artPlayerRef.current?.currentTime || 0;
        const duration = artPlayerRef.current?.duration || 0;
        const remainingTime = duration - currentTime;
        const isNearEnd = duration > 0 && remainingTime < 180; // 最后3分钟

        if (!isNearEnd) {
          saveCurrentPlayProgress();
        }
      });

      artPlayerRef.current.on('video:ended', () => {
        releaseWakeLock();
      });

      // 如果播放器初始化时已经在播放状态，则请求 Wake Lock
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        requestWakeLock();
      }

      artPlayerRef.current.on('video:volumechange', () => {
        lastVolumeRef.current = artPlayerRef.current.volume;
      });
      artPlayerRef.current.on('video:ratechange', () => {
        lastPlaybackRateRef.current = artPlayerRef.current.playbackRate;
      });

      // 监听视频可播放事件，这时恢复播放进度更可靠
      artPlayerRef.current.on('video:canplay', () => {
        // 🔥 重置 video:ended 处理标志，因为这是新视频
        videoEndedHandledRef.current = false;

        // 若存在需要恢复的播放进度，则跳转
        if (resumeTimeRef.current && resumeTimeRef.current > 0) {
          try {
            const duration = artPlayerRef.current.duration || 0;
            let target = resumeTimeRef.current;
            if (duration && target >= duration - 2) {
              target = Math.max(0, duration - 5);
            }
            artPlayerRef.current.currentTime = target;
            console.log('成功恢复播放进度到:', resumeTimeRef.current);
          } catch (err) {
            console.warn('恢复播放进度失败:', err);
          }
        }
        resumeTimeRef.current = null;

        // iOS设备自动播放回退机制：如果自动播放失败，尝试用户交互触发播放
        if ((isIOS || isSafari) && artPlayerRef.current.paused) {
          console.log('iOS设备检测到视频未自动播放，准备交互触发机制');
          
          const tryAutoPlay = async () => {
            try {
              // 多重尝试策略
              let playAttempts = 0;
              const maxAttempts = 3;
              
              const attemptPlay = async (): Promise<boolean> => {
                playAttempts++;
                console.log(`iOS自动播放尝试 ${playAttempts}/${maxAttempts}`);
                
                try {
                  await artPlayerRef.current.play();
                  console.log('iOS设备自动播放成功');
                  return true;
                } catch (playError: any) {
                  console.log(`播放尝试 ${playAttempts} 失败:`, playError.name);
                  
                  // 根据错误类型采用不同策略
                  if (playError.name === 'NotAllowedError') {
                    // 用户交互需求错误 - 最常见
                    if (playAttempts < maxAttempts) {
                      // 尝试降低音量再播放
                      artPlayerRef.current.volume = 0.1;
                      await new Promise(resolve => setTimeout(resolve, 200));
                      return attemptPlay();
                    }
                    return false;
                  } else if (playError.name === 'AbortError') {
                    // 播放被中断 - 等待后重试
                    if (playAttempts < maxAttempts) {
                      await new Promise(resolve => setTimeout(resolve, 500));
                      return attemptPlay();
                    }
                    return false;
                  }
                  return false;
                }
              };
              
              const success = await attemptPlay();
              
              if (!success) {
                console.log('iOS设备需要用户交互才能播放，这是正常的浏览器行为');
                // 显示友好的播放提示
                if (artPlayerRef.current) {
                  artPlayerRef.current.notice.show = '轻触播放按钮开始观看';
                  
                  // 添加一次性点击监听器用于首次播放
                  let hasHandledFirstInteraction = false;
                  const handleFirstUserInteraction = async () => {
                    if (hasHandledFirstInteraction) return;
                    hasHandledFirstInteraction = true;
                    
                    try {
                      await artPlayerRef.current.play();
                      // 首次成功播放后恢复正常音量
                      setTimeout(() => {
                        if (artPlayerRef.current && !artPlayerRef.current.muted) {
                          artPlayerRef.current.volume = lastVolumeRef.current || 0.7;
                        }
                      }, 1000);
                    } catch (error) {
                      console.warn('用户交互播放失败:', error);
                    }
                    
                    // 移除监听器
                    artPlayerRef.current?.off('video:play', handleFirstUserInteraction);
                    document.removeEventListener('click', handleFirstUserInteraction);
                  };
                  
                  // 监听播放事件和点击事件
                  artPlayerRef.current.on('video:play', handleFirstUserInteraction);
                  document.addEventListener('click', handleFirstUserInteraction);
                }
              }
            } catch (error) {
              console.warn('自动播放回退机制执行失败:', error);
            }
          };
          
          // 延迟尝试，避免与进度恢复冲突
          setTimeout(tryAutoPlay, 200);
        }

        setTimeout(() => {
          if (
            Math.abs(artPlayerRef.current.volume - lastVolumeRef.current) > 0.01
          ) {
            artPlayerRef.current.volume = lastVolumeRef.current;
          }
          if (
            Math.abs(
              artPlayerRef.current.playbackRate - lastPlaybackRateRef.current
            ) > 0.01 &&
            isWebKit
          ) {
            artPlayerRef.current.playbackRate = lastPlaybackRateRef.current;
          }
          artPlayerRef.current.notice.show = '';
        }, 0);

        // 隐藏换源加载状态
        setIsVideoLoading(false);

        // 🔥 重置集数切换标识（播放器成功创建后）
        if (isEpisodeChangingRef.current) {
          isEpisodeChangingRef.current = false;
          console.log('🎯 播放器创建完成，重置集数切换标识');
        }
      });

      // 监听播放器错误
      artPlayerRef.current.on('error', (err: any) => {
        console.error('播放器错误:', err);
        if (artPlayerRef.current.currentTime > 0) {
          return;
        }
      });

      // 监听视频播放结束事件，自动播放下一集
      artPlayerRef.current.on('video:ended', () => {
        const idx = currentEpisodeIndexRef.current;

        // 🔥 关键修复：首先检查这个 video:ended 事件是否已经被处理过
        if (videoEndedHandledRef.current) {
          return;
        }

        // 🔑 检查是否已经通过 SkipController 触发了下一集，避免重复触发
        if (isSkipControllerTriggeredRef.current) {
          videoEndedHandledRef.current = true;
          // 🔥 关键修复：延迟重置标志，等待新集数开始加载
          setTimeout(() => {
            isSkipControllerTriggeredRef.current = false;
          }, 2000);
          return;
        }

        const d = detailRef.current;
        if (d && d.episodes && idx < d.episodes.length - 1) {
          videoEndedHandledRef.current = true;
          setTimeout(() => {
            setCurrentEpisodeIndex(idx + 1);
          }, 1000);
        }
      });

      // 合并的timeupdate监听器 - 处理跳过片头片尾和保存进度
      artPlayerRef.current.on('video:timeupdate', () => {
        const currentTime = artPlayerRef.current.currentTime || 0;
        const duration = artPlayerRef.current.duration || 0;
        const now = performance.now(); // 使用performance.now()更精确

        // 更新 SkipController 所需的时间信息
        setCurrentPlayTime(currentTime);
        setVideoDuration(duration);

        // 保存播放进度逻辑 - 优化所有存储类型的保存间隔
        const saveNow = Date.now();
        // upstash需要更长间隔避免频率限制，其他存储类型也适当降低频率减少性能开销
        const interval = process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash' ? 20000 : 10000; // 统一提高到10秒

        // 🔥 关键修复：如果当前播放位置接近视频结尾（最后3分钟），不保存进度
        // 这是为了避免自动跳过片尾时保存了片尾位置的进度，导致"继续观看"从错误位置开始
        const remainingTime = duration - currentTime;
        const isNearEnd = duration > 0 && remainingTime < 180; // 最后3分钟

        if (saveNow - lastSaveTimeRef.current > interval && !isNearEnd) {
          saveCurrentPlayProgress();
          lastSaveTimeRef.current = saveNow;
        }
      });

      artPlayerRef.current.on('pause', () => {
        // 🔥 关键修复：暂停时也检查是否在片尾，避免保存错误的进度
        const currentTime = artPlayerRef.current?.currentTime || 0;
        const duration = artPlayerRef.current?.duration || 0;
        const remainingTime = duration - currentTime;
        const isNearEnd = duration > 0 && remainingTime < 180; // 最后3分钟

        if (!isNearEnd) {
          saveCurrentPlayProgress();
        }
      });

      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
      }
    } catch (err) {
      console.error('创建播放器失败:', err);
      // 重置集数切换标识
      isEpisodeChangingRef.current = false;
      setError('播放器初始化失败');
    }
    }; // 结束 initPlayer 函数

    // 动态导入 ArtPlayer 并初始化
    const loadAndInit = async () => {
      try {
        const [{ default: Artplayer }, { default: artplayerPluginDanmuku }] = await Promise.all([
          import('artplayer'),
          import('artplayer-plugin-danmuku')
        ]);
        
        // 将导入的模块设置为全局变量供 initPlayer 使用
        (window as any).DynamicArtplayer = Artplayer;
        (window as any).DynamicArtplayerPluginDanmuku = artplayerPluginDanmuku;
        
        await initPlayer();
      } catch (error) {
        console.error('动态导入 ArtPlayer 失败:', error);
        setError('播放器加载失败');
      }
    };

    loadAndInit();
  }, [Hls, videoUrl, loading, blockAdEnabled]);

  // 当组件卸载时清理定时器、Wake Lock 和播放器资源
  useEffect(() => {
    return () => {
      // 清理定时器
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }

      // 清理弹幕重置定时器
      if (seekResetTimeoutRef.current) {
        clearTimeout(seekResetTimeoutRef.current);
      }
      
      // 清理resize防抖定时器
      if (resizeResetTimeoutRef.current) {
        clearTimeout(resizeResetTimeoutRef.current);
      }

      // 释放 Wake Lock
      releaseWakeLock();

      // 销毁播放器实例
      cleanupPlayer();
    };
  }, []);

  // 返回顶部功能相关
  useEffect(() => {
    // 获取滚动位置的函数 - 专门针对 body 滚动
    const getScrollTop = () => {
      return document.body.scrollTop || 0;
    };

    // 使用 requestAnimationFrame 持续检测滚动位置
    let isRunning = false;
    const checkScrollPosition = () => {
      if (!isRunning) return;

      const scrollTop = getScrollTop();
      const shouldShow = scrollTop > 300;
      setShowBackToTop(shouldShow);

      requestAnimationFrame(checkScrollPosition);
    };

    // 启动持续检测
    isRunning = true;
    checkScrollPosition();

    // 监听 body 元素的滚动事件
    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      isRunning = false; // 停止 requestAnimationFrame 循环
      // 移除 body 滚动事件监听器
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      // 根据调试结果，真正的滚动容器是 document.body
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  if (loading) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 动画影院图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>
                  {loadingStage === 'searching' && '🔍'}
                  {loadingStage === 'preferring' && '⚡'}
                  {loadingStage === 'fetching' && '🎬'}
                  {loadingStage === 'ready' && '✨'}
                </div>
                {/* 旋转光环 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
              </div>

              {/* 浮动粒子效果 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 进度指示器 */}
            <div className='mb-6 w-80 mx-auto'>
              <div className='flex justify-center space-x-2 mb-4'>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${loadingStage === 'searching' || loadingStage === 'fetching'
                    ? 'bg-green-500 scale-125'
                    : loadingStage === 'preferring' ||
                      loadingStage === 'ready'
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                    }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${loadingStage === 'preferring'
                    ? 'bg-green-500 scale-125'
                    : loadingStage === 'ready'
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                    }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${loadingStage === 'ready'
                    ? 'bg-green-500 scale-125'
                    : 'bg-gray-300'
                    }`}
                ></div>
              </div>

              {/* 进度条 */}
              <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
                <div
                  className='h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-1000 ease-out'
                  style={{
                    width:
                      loadingStage === 'searching' ||
                        loadingStage === 'fetching'
                        ? '33%'
                        : loadingStage === 'preferring'
                          ? '66%'
                          : '100%',
                  }}
                ></div>
              </div>
            </div>

            {/* 加载消息 */}
            <div className='space-y-2'>
              <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
                {loadingMessage}
              </p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 错误图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>😵</div>
                {/* 脉冲效果 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl opacity-20 animate-pulse'></div>
              </div>

              {/* 浮动错误粒子 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-red-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-yellow-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 错误信息 */}
            <div className='space-y-4 mb-8'>
              <h2 className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
                哎呀，出现了一些问题
              </h2>
              <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
                <p className='text-red-600 dark:text-red-400 font-medium'>
                  {error}
                </p>
              </div>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                请检查网络连接或尝试刷新页面
              </p>
            </div>

            {/* 操作按钮 */}
            <div className='space-y-3'>
              <button
                onClick={() =>
                  videoTitle
                    ? router.push(`/search?q=${encodeURIComponent(videoTitle)}`)
                    : router.back()
                }
                className='w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                {videoTitle ? '🔍 返回搜索' : '← 返回上页'}
              </button>

              <button
                onClick={() => window.location.reload()}
                className='w-full px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200'
              >
                🔄 重新尝试
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/play'>
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        {/* 第一行：影片标题 */}
        <div className='py-1'>
          <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
            {videoTitle || '影片标题'}
            {totalEpisodes > 1 && (
              <span className='text-gray-500 dark:text-gray-400'>
                {` > ${detail?.episodes_titles?.[currentEpisodeIndex] || `第 ${currentEpisodeIndex + 1} 集`}`}
              </span>
            )}
          </h1>
        </div>
        {/* 第二行：播放器和选集 */}
        <div className='space-y-2'>
          {/* 折叠控制 */}
          <div className='flex justify-end items-center'>
            {/* 折叠控制按钮 - 仅在 lg 及以上屏幕显示 */}
            <button
              onClick={() =>
                setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)
              }
              className='hidden lg:flex group relative items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-200'
              title={
                isEpisodeSelectorCollapsed ? '显示选集面板' : '隐藏选集面板'
              }
            >
              <svg
                className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isEpisodeSelectorCollapsed ? 'rotate-180' : 'rotate-0'
                  }`}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M9 5l7 7-7 7'
                />
              </svg>
              <span className='text-xs font-medium text-gray-600 dark:text-gray-300'>
                {isEpisodeSelectorCollapsed ? '显示' : '隐藏'}
              </span>

              {/* 精致的状态指示点 */}
              <div
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all duration-200 ${isEpisodeSelectorCollapsed
                  ? 'bg-orange-400 animate-pulse'
                  : 'bg-green-400'
                  }`}
              ></div>
            </button>
          </div>

          <div
            className={`grid gap-4 lg:h-[500px] xl:h-[650px] 2xl:h-[750px] transition-all duration-300 ease-in-out ${isEpisodeSelectorCollapsed
              ? 'grid-cols-1'
              : 'grid-cols-1 md:grid-cols-4'
              }`}
          >
            {/* 播放器 */}
            <div
              className={`h-full transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30 ${isEpisodeSelectorCollapsed ? 'col-span-1' : 'md:col-span-3'
                }`}
            >
              <div className='relative w-full h-[300px] lg:h-full'>
                <div
                  ref={artRef}
                  className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg'
                ></div>

                {/* 跳过设置按钮 - 播放器内右上角 */}
                {currentSource && currentId && (
                  <div className='absolute top-4 right-4 z-10'>
                    <button
                      onClick={() => setIsSkipSettingOpen(true)}
                      className='group flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-xl border border-white/30 hover:border-white/50 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] hover:shadow-[0_8px_32px_0_rgba(255,255,255,0.18)] hover:scale-105 transition-all duration-300 ease-out'
                      title='跳过设置'
                      style={{
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      }}
                    >
                      <svg
                        className='w-5 h-5 text-white drop-shadow-lg group-hover:rotate-90 transition-all duration-300'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4'
                        />
                      </svg>
                      <span className='text-sm font-medium text-white drop-shadow-lg transition-all duration-300 hidden sm:inline'>
                        跳过设置
                      </span>
                    </button>
                  </div>
                )}

                {/* SkipController 组件 */}
                {currentSource && currentId && detail?.title && (
                  <SkipController
                    source={currentSource}
                    id={currentId}
                    title={detail.title}
                    episodeIndex={currentEpisodeIndex}
                    artPlayerRef={artPlayerRef}
                    currentTime={currentPlayTime}
                    duration={videoDuration}
                    isSettingMode={isSkipSettingOpen}
                    onSettingModeChange={setIsSkipSettingOpen}
                    onNextEpisode={handleNextEpisode}
                  />
                )}

                {/* 换源加载蒙层 */}
                {isVideoLoading && (
                  <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex items-center justify-center z-[500] transition-all duration-300'>
                    <div className='text-center max-w-md mx-auto px-6'>
                      {/* 动画影院图标 */}
                      <div className='relative mb-8'>
                        <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                          <div className='text-white text-4xl'>🎬</div>
                          {/* 旋转光环 */}
                          <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
                        </div>

                        {/* 浮动粒子效果 */}
                        <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                          <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                          <div
                            className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                            style={{ animationDelay: '0.5s' }}
                          ></div>
                          <div
                            className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                            style={{ animationDelay: '1s' }}
                          ></div>
                        </div>
                      </div>

                      {/* 换源消息 */}
                      <div className='space-y-2'>
                        <p className='text-xl font-semibold text-white animate-pulse'>
                          {videoLoadingStage === 'sourceChanging'
                            ? '🔄 切换播放源...'
                            : '🔄 视频加载中...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 选集和换源 - 在移动端始终显示，在 lg 及以上可折叠 */}
            <div
              className={`h-[300px] lg:h-full md:overflow-hidden transition-all duration-300 ease-in-out ${isEpisodeSelectorCollapsed
                ? 'md:col-span-1 lg:hidden lg:opacity-0 lg:scale-95'
                : 'md:col-span-1 lg:opacity-100 lg:scale-100'
                }`}
            >
              <EpisodeSelector
                totalEpisodes={totalEpisodes}
                episodes_titles={detail?.episodes_titles || []}
                value={currentEpisodeIndex + 1}
                onChange={handleEpisodeChange}
                onSourceChange={handleSourceChange}
                currentSource={currentSource}
                currentId={currentId}
                videoTitle={searchTitle || videoTitle}
                availableSources={availableSources}
                sourceSearchLoading={sourceSearchLoading}
                sourceSearchError={sourceSearchError}
                precomputedVideoInfo={precomputedVideoInfo}
              />
            </div>
          </div>
        </div>

        {/* 详情展示 */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          {/* 文字区 */}
          <div className='md:col-span-3'>
            <div className='p-6 flex flex-col min-h-0'>
              {/* 标题 */}
              <div className='mb-4 flex-shrink-0'>
                <div className='flex flex-col md:flex-row md:items-center gap-3'>
                  <h1 className='text-2xl md:text-3xl font-bold tracking-wide text-center md:text-left bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent'>
                    {videoTitle || '影片标题'}
                  </h1>

                  {/* 按钮组 */}
                  <div className='flex items-center justify-center md:justify-start gap-2 flex-wrap'>
                    {/* 收藏按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite();
                      }}
                      className='group relative flex-shrink-0 transition-all duration-300 hover:scale-110'
                    >
                      <div className='absolute inset-0 bg-gradient-to-r from-red-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300'></div>
                      <FavoriteIcon filled={favorited} />
                    </button>

                    {/* 网盘资源按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // 触发网盘搜索（如果还没搜索过）
                        if (!netdiskResults && !netdiskLoading && videoTitle) {
                          handleNetDiskSearch(videoTitle);
                        }
                        // 滚动到网盘区域
                        setTimeout(() => {
                          const element = document.getElementById('netdisk-section');
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }, 100);
                      }}
                      className='group relative flex-shrink-0 transition-all duration-300 hover:scale-105'
                    >
                      <div className='absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300'></div>
                      <div className='relative flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg hover:shadow-xl transition-all duration-300'>
                        📁
                        {netdiskLoading ? (
                          <span className='flex items-center gap-1'>
                            <span className='inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin'></span>
                            搜索中...
                          </span>
                        ) : netdiskTotal > 0 ? (
                          <span>{netdiskTotal}个资源</span>
                        ) : (
                          <span>网盘资源</span>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* 关键信息行 */}
              <div className='flex flex-wrap items-center gap-3 text-base mb-4 opacity-80 flex-shrink-0'>
                {detail?.class && (
                  <span className='text-green-600 font-semibold'>
                    {detail.class}
                  </span>
                )}
                {(detail?.year || videoYear) && (
                  <span>{detail?.year || videoYear}</span>
                )}
                {detail?.source_name && (
                  <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
                    {detail.source_name}
                  </span>
                )}
                {detail?.type_name && <span>{detail.type_name}</span>}
              </div>

              {/* 详细信息（豆瓣或bangumi） */}
              {currentSource !== 'shortdrama' && videoDoubanId && videoDoubanId !== 0 && detail && detail.source !== 'shortdrama' && (
                <div className='mb-4 flex-shrink-0'>
                  {/* 加载状态 */}
                  {(loadingMovieDetails || loadingBangumiDetails) && !movieDetails && !bangumiDetails && (
                    <div className='animate-pulse'>
                      <div className='h-4 bg-gray-300 rounded w-64 mb-2'></div>
                      <div className='h-4 bg-gray-300 rounded w-48'></div>
                    </div>
                  )}
                  
                  {/* Bangumi详情 */}
                  {bangumiDetails && (
                    <div className='space-y-2 text-sm'>
                      {/* Bangumi评分 */}
                      {bangumiDetails.rating?.score && parseFloat(bangumiDetails.rating.score) > 0 && (
                        <div className='flex items-center gap-2'>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>Bangumi评分: </span>
                          <div className='flex items-center group'>
                            <span className='relative text-transparent bg-clip-text bg-gradient-to-r from-pink-600 via-rose-600 to-pink-600 dark:from-pink-400 dark:via-rose-400 dark:to-pink-400 font-bold text-lg transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_2px_8px_rgba(236,72,153,0.5)]'>
                              {bangumiDetails.rating.score}
                            </span>
                            <div className='flex ml-2 gap-0.5'>
                              {[...Array(5)].map((_, i) => (
                                <svg
                                  key={i}
                                  className={`w-4 h-4 transition-all duration-300 ${
                                    i < Math.floor(parseFloat(bangumiDetails.rating.score) / 2)
                                      ? 'text-pink-500 drop-shadow-[0_0_4px_rgba(236,72,153,0.5)] group-hover:scale-110'
                                      : 'text-gray-300 dark:text-gray-600'
                                  }`}
                                  fill='currentColor'
                                  viewBox='0 0 20 20'
                                  style={{ transitionDelay: `${i * 50}ms` }}
                                >
                                  <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                                </svg>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 制作信息从infobox提取 */}
                      {bangumiDetails.infobox && bangumiDetails.infobox.map((info: any, index: number) => {
                        if (info.key === '导演' && info.value) {
                          const directors = Array.isArray(info.value) ? info.value.map((v: any) => v.v || v).join('、') : info.value;
                          return (
                            <div key={index}>
                              <span className='font-semibold text-gray-700 dark:text-gray-300'>导演: </span>
                              <span className='text-gray-600 dark:text-gray-400'>{directors}</span>
                            </div>
                          );
                        }
                        if (info.key === '制作' && info.value) {
                          const studios = Array.isArray(info.value) ? info.value.map((v: any) => v.v || v).join('、') : info.value;
                          return (
                            <div key={index}>
                              <span className='font-semibold text-gray-700 dark:text-gray-300'>制作: </span>
                              <span className='text-gray-600 dark:text-gray-400'>{studios}</span>
                            </div>
                          );
                        }
                        return null;
                      })}
                      
                      {/* 播出日期 */}
                      {bangumiDetails.date && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>播出日期: </span>
                          <span className='text-gray-600 dark:text-gray-400'>{bangumiDetails.date}</span>
                        </div>
                      )}
                      
                      {/* 标签信息 */}
                      <div className='flex flex-wrap gap-2 mt-3'>
                        {bangumiDetails.tags && bangumiDetails.tags.slice(0, 4).map((tag: any, index: number) => (
                          <span key={index} className='relative group bg-gradient-to-r from-blue-500/90 to-indigo-500/90 dark:from-blue-600/90 dark:to-indigo-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{tag.name}</span>
                          </span>
                        ))}
                        {bangumiDetails.total_episodes && (
                          <span className='relative group bg-gradient-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>共{bangumiDetails.total_episodes}话</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 豆瓣详情 */}
                  {movieDetails && (
                    <div className='space-y-2 text-sm'>
                      {/* 豆瓣评分 */}
                      {movieDetails.rate && movieDetails.rate !== "0" && parseFloat(movieDetails.rate) > 0 && (
                        <div className='flex items-center gap-2'>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>豆瓣评分: </span>
                          <div className='flex items-center group'>
                            <span className='relative text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 via-amber-600 to-yellow-600 dark:from-yellow-400 dark:via-amber-400 dark:to-yellow-400 font-bold text-lg transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_2px_8px_rgba(251,191,36,0.5)]'>
                              {movieDetails.rate}
                            </span>
                            <div className='flex ml-2 gap-0.5'>
                              {[...Array(5)].map((_, i) => (
                                <svg
                                  key={i}
                                  className={`w-4 h-4 transition-all duration-300 ${
                                    i < Math.floor(parseFloat(movieDetails.rate) / 2)
                                      ? 'text-yellow-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)] group-hover:scale-110'
                                      : 'text-gray-300 dark:text-gray-600'
                                  }`}
                                  fill='currentColor'
                                  viewBox='0 0 20 20'
                                  style={{ transitionDelay: `${i * 50}ms` }}
                                >
                                  <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                                </svg>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 导演 */}
                      {movieDetails.directors && movieDetails.directors.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>导演: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.directors.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 编剧 */}
                      {movieDetails.screenwriters && movieDetails.screenwriters.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>编剧: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.screenwriters.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 主演 */}
                      {movieDetails.cast && movieDetails.cast.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>主演: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.cast.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 首播日期 */}
                      {movieDetails.first_aired && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>
                            {movieDetails.episodes ? '首播' : '上映'}: 
                          </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.first_aired}
                          </span>
                        </div>
                      )}
                      
                      {/* 标签信息 */}
                      <div className='flex flex-wrap gap-2 mt-3'>
                        {movieDetails.countries && movieDetails.countries.slice(0, 2).map((country: string, index: number) => (
                          <span key={index} className='relative group bg-gradient-to-r from-blue-500/90 to-cyan-500/90 dark:from-blue-600/90 dark:to-cyan-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{country}</span>
                          </span>
                        ))}
                        {movieDetails.languages && movieDetails.languages.slice(0, 2).map((language: string, index: number) => (
                          <span key={index} className='relative group bg-gradient-to-r from-purple-500/90 to-pink-500/90 dark:from-purple-600/90 dark:to-pink-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{language}</span>
                          </span>
                        ))}
                        {movieDetails.episodes && (
                          <span className='relative group bg-gradient-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>共{movieDetails.episodes}集</span>
                          </span>
                        )}
                        {movieDetails.episode_length && (
                          <span className='relative group bg-gradient-to-r from-orange-500/90 to-amber-500/90 dark:from-orange-600/90 dark:to-amber-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-orange-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-orange-400 to-amber-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>单集{movieDetails.episode_length}分钟</span>
                          </span>
                        )}
                        {movieDetails.movie_duration && (
                          <span className='relative group bg-gradient-to-r from-red-500/90 to-rose-500/90 dark:from-red-600/90 dark:to-rose-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-gradient-to-r from-red-400 to-rose-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{movieDetails.movie_duration}分钟</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 短剧详细信息 */}
              {detail?.source === 'shortdrama' && (
                <div className='mb-4 flex-shrink-0'>
                  <div className='space-y-2 text-sm'>
                    {/* 集数信息 */}
                    {detail?.episodes && detail.episodes.length > 0 && (
                      <div className='flex flex-wrap gap-2'>
                        <span className='relative group bg-gradient-to-r from-blue-500/90 to-indigo-500/90 dark:from-blue-600/90 dark:to-indigo-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>共{detail.episodes.length}集</span>
                        </span>
                        <span className='relative group bg-gradient-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>短剧</span>
                        </span>
                        <span className='relative group bg-gradient-to-r from-purple-500/90 to-pink-500/90 dark:from-purple-600/90 dark:to-pink-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>{detail.year}年</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 剧情简介 */}
              {(detail?.desc || bangumiDetails?.summary) && (
                <div
                  className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {bangumiDetails?.summary || detail?.desc}
                </div>
              )}
              
              {/* 网盘资源区域 */}
              <div id="netdisk-section" className='mt-6'>
                <div className='border-t border-gray-200 dark:border-gray-700 pt-6'>
                  <div className='mb-4'>
                    <h3 className='text-xl font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                      📁 网盘资源
                      {netdiskLoading && (
                        <span className='inline-block align-middle'>
                          <span className='inline-block h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
                        </span>
                      )}
                      {netdiskTotal > 0 && (
                        <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'>
                          {netdiskTotal} 个资源
                        </span>
                      )}
                    </h3>
                    {videoTitle && !netdiskLoading && !netdiskResults && (
                      <p className='text-sm text-gray-500 dark:text-gray-400 mt-2'>
                        点击上方"📁 网盘资源"按钮开始搜索
                      </p>
                    )}
                    {videoTitle && !netdiskLoading && (netdiskResults || netdiskError) && (
                      <p className='text-sm text-gray-500 dark:text-gray-400 mt-2'>
                        搜索关键词：{videoTitle}
                      </p>
                    )}
                  </div>
                  
                  <NetDiskSearchResults
                    results={netdiskResults}
                    loading={netdiskLoading}
                    error={netdiskError}
                    total={netdiskTotal}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 封面展示 */}
          <div className='hidden md:block md:col-span-1 md:order-first'>
            <div className='pl-0 py-4 pr-6'>
              <div className='group relative bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]'>
                {(videoCover || bangumiDetails?.images?.large) ? (
                  <>
                    {/* 渐变光泽动画层 */}
                    <div
                      className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10'
                      style={{
                        background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.15) 55%, transparent 70%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 2.5s ease-in-out infinite',
                      }}
                    />

                    <img
                      src={processImageUrl(bangumiDetails?.images?.large || videoCover)}
                      alt={videoTitle}
                      className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
                    />

                    {/* 悬浮遮罩 */}
                    <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500'></div>

                    {/* 链接按钮（bangumi或豆瓣） */}
                    {videoDoubanId !== 0 && (
                      <a
                        href={
                          bangumiDetails
                            ? `https://bgm.tv/subject/${videoDoubanId.toString()}`
                            : `https://movie.douban.com/subject/${videoDoubanId.toString()}`
                        }
                        target='_blank'
                        rel='noopener noreferrer'
                        className='absolute top-3 left-3 z-20'
                      >
                        <div className={`relative ${bangumiDetails ? 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600' : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600'} text-white text-xs font-bold w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 ease-out hover:scale-110 group/link`}>
                          <div className={`absolute inset-0 ${bangumiDetails ? 'bg-pink-400' : 'bg-green-400'} rounded-full opacity-0 group-hover/link:opacity-30 blur transition-opacity duration-300`}></div>
                          <svg
                            width='18'
                            height='18'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            className='relative z-10'
                          >
                            <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'></path>
                            <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'></path>
                          </svg>
                        </div>
                      </a>
                    )}
                  </>
                ) : (
                  <span className='text-gray-600 dark:text-gray-400'>
                    封面图片
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-6 right-6 z-[500] w-12 h-12 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group relative overflow-hidden ${
          showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        style={{ position: 'fixed', right: '1.5rem', bottom: '1.5rem', left: 'auto' }}
        aria-label='返回顶部'
      >
        {/* 渐变背景 */}
        <div className='absolute inset-0 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 group-hover:from-green-600 group-hover:via-emerald-600 group-hover:to-teal-600 transition-all duration-300'></div>

        {/* 发光效果 */}
        <div className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 opacity-0 group-hover:opacity-50 blur-md transition-all duration-300'></div>

        {/* 脉冲光环 */}
        <div className='absolute inset-0 rounded-full border-2 border-white/30 animate-ping group-hover:opacity-0 transition-opacity duration-300'></div>

        <ChevronUp className='w-6 h-6 text-white relative z-10 transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-1' />
      </button>
    </PageLayout>
  );
}

// FavoriteIcon 组件
const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-7 w-7'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444' /* Tailwind red-500 */
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient />
    </Suspense>
  );
}
