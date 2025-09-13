/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Hls from 'hls.js';
import { Heart } from 'lucide-react';

// import artplayerPluginChromecast from '@/lib/artplayer-plugin-chromecast';


import {
  deleteFavorite,
  deletePlayRecord,
  deleteSkipConfig,
  generateStorageKey,
  getAllPlayRecords,
  getSkipConfig,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  saveSkipConfig,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { getDoubanDetails } from '@/lib/douban.client';
import { SearchResult, DanmakuConfig } from '@/lib/types';

// 弹幕配置相关函数
const getDanmakuConfig = async (): Promise<DanmakuConfig | null> => {
  try {
    const response = await fetch('/api/danmaku-config');
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('获取弹幕配置失败:', error);
    return null;
  }
};

const saveDanmakuConfig = async (config: DanmakuConfig): Promise<boolean> => {
  try {
    const response = await fetch('/api/danmaku-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config }),
    });
    return response.ok;
  } catch (error) {
    console.error('保存弹幕配置失败:', error);
    return false;
  }
};
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';

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

  // 跳过片头片尾配置
  const [skipConfig, setSkipConfig] = useState<{
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }>({
    enable: false,
    intro_time: 0,
    outro_time: 0,
  });
  const skipConfigRef = useRef(skipConfig);
  useEffect(() => {
    skipConfigRef.current = skipConfig;
  }, [
    skipConfig,
    skipConfig.enable,
    skipConfig.intro_time,
    skipConfig.outro_time,
  ]);

  // 跳过检查的时间间隔控制
  const lastSkipCheckRef = useRef(0);

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

  // 外部弹幕开关（从数据库读取，默认 true）
  const [externalDanmuEnabled, setExternalDanmuEnabled] = useState<boolean>(true);
  const [danmakuConfigLoaded, setDanmakuConfigLoaded] = useState<boolean>(false);
  const externalDanmuEnabledRef = useRef(externalDanmuEnabled);
  const updateButtonStateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    externalDanmuEnabledRef.current = externalDanmuEnabled;
    // 当外部弹幕开关状态变化时，更新按钮状态
    if (updateButtonStateRef.current) {
      updateButtonStateRef.current();
    }
  }, [externalDanmuEnabled]);

  // 从数据库加载弹幕配置
  useEffect(() => {
    const loadDanmakuConfig = async () => {
      const authInfo = getAuthInfoFromBrowserCookie();
      if (!authInfo?.username) {
        // 未登录用户，使用localStorage作为后备
        if (typeof window !== 'undefined') {
          const v = localStorage.getItem('enable_external_danmu');
          if (v !== null) {
            setExternalDanmuEnabled(v === 'true');
          }
        }
        setDanmakuConfigLoaded(true);
        return;
      }

      try {
        const config = await getDanmakuConfig();
        if (config) {
          setExternalDanmuEnabled(config.externalDanmuEnabled);
        } else {
          // 数据库中没有配置，使用localStorage作为后备
          if (typeof window !== 'undefined') {
            const v = localStorage.getItem('enable_external_danmu');
            if (v !== null) {
              const enabled = v === 'true';
              setExternalDanmuEnabled(enabled);
              // 同步到数据库
              await saveDanmakuConfig({ externalDanmuEnabled: enabled });
            }
          }
        }
      } catch (error) {
        console.error('加载弹幕配置失败:', error);
        // 出错时使用localStorage作为后备
        if (typeof window !== 'undefined') {
          const v = localStorage.getItem('enable_external_danmu');
          if (v !== null) {
            setExternalDanmuEnabled(v === 'true');
          }
        }
      } finally {
        setDanmakuConfigLoaded(true);
        // 配置加载完成后，更新按钮状态
        setTimeout(() => {
          if (updateButtonStateRef.current) {
            updateButtonStateRef.current();
          }
        }, 100); // 稍微延迟确保状态已更新
      }
    };

    loadDanmakuConfig();
  }, []);


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
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
    videoDoubanId,
  ]);

  // 加载豆瓣详情
  useEffect(() => {
    const loadMovieDetails = async () => {
      if (!videoDoubanId || videoDoubanId === 0 || loadingMovieDetails || movieDetails) {
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
    };

    loadMovieDetails();
  }, [videoDoubanId, loadingMovieDetails, movieDetails]);

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

  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
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
    return false; // 默认关闭优选和测速
  });

  // 保存优选时的测速结果，避免EpisodeSelector重复测速
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, { quality: string; loadSpeed: string; pingTime: number }>
  >(new Map());

  // 弹幕缓存：避免重复请求相同的弹幕数据，支持页面刷新持久化
  const DANMU_CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存
  const DANMU_CACHE_KEY = 'lunatv_danmu_cache';

  // 获取弹幕缓存
  const getDanmuCache = (): Map<string, { data: any[]; timestamp: number }> => {
    try {
      const cached = localStorage.getItem(DANMU_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.warn('读取弹幕缓存失败:', error);
    }
    return new Map();
  };

  // 保存弹幕缓存
  const setDanmuCache = (cache: Map<string, { data: any[]; timestamp: number }>) => {
    try {
      const obj = Object.fromEntries(cache.entries());
      localStorage.setItem(DANMU_CACHE_KEY, JSON.stringify(obj));
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
  // 防抖保存弹幕配置的定时器
  const saveConfigTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const configUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);

  // Wake Lock 相关
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // -----------------------------------------------------------------------------
  // 工具函数（Utils）
  // -----------------------------------------------------------------------------

  // 播放源优选函数（针对旧iPad做极端保守优化）
  const preferBestSource = async (
    sources: SearchResult[]
  ): Promise<SearchResult> => {
    if (sources.length === 1) return sources[0];

    // 检测是否为iPad（所有浏览器都可能崩溃）
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIPad = /iPad/i.test(userAgent);
    const isIOS = /iPad|iPhone|iPod/i.test(userAgent);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || isIOS;

    // 如果是iPad，使用极简策略避免崩溃
    if (isIPad) {
      console.log('检测到iPad，使用无测速优选策略避免崩溃');

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

      console.log('iPad优选结果:', sortedSources.map(s => s.source_name));
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
      console.log(`测速批次 ${Math.floor(i / concurrency) + 1}/${Math.ceil(sources.length / concurrency)}: ${batch.length} 个源`);

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
  const updateVideoUrl = (
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
    const newUrl = detailData?.episodes[episodeIndex] || '';
    if (newUrl !== videoUrl) {
      setVideoUrl(newUrl);
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

  // 检测移动设备（在组件层级定义）
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOSGlobal = /iPad|iPhone|iPod/i.test(userAgent) && !(window as any).MSStream;
  const isMobileGlobal = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || isIOSGlobal;

  // 内存压力检测和清理（针对移动设备）
  const checkMemoryPressure = () => {
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
            localStorage.removeItem(DANMU_CACHE_KEY);
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
      checkMemoryPressure();
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

  // 跳过片头片尾配置相关函数
  const handleSkipConfigChange = async (newConfig: {
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }) => {
    if (!currentSourceRef.current || !currentIdRef.current) return;

    try {
      setSkipConfig(newConfig);
      if (!newConfig.enable && !newConfig.intro_time && !newConfig.outro_time) {
        await deleteSkipConfig(currentSourceRef.current, currentIdRef.current);
        artPlayerRef.current.setting.update({
          name: '跳过片头片尾',
          html: '跳过片头片尾',
          switch: skipConfigRef.current.enable,
          onSwitch: function (item: any) {
            const newConfig = {
              ...skipConfigRef.current,
              enable: !item.switch,
            };
            handleSkipConfigChange(newConfig);
            return !item.switch;
          },
        });
        artPlayerRef.current.setting.update({
          name: '设置片头',
          html: '设置片头',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
          tooltip:
            skipConfigRef.current.intro_time === 0
              ? '设置片头时间'
              : `${formatTime(skipConfigRef.current.intro_time)}`,
          onClick: function () {
            const currentTime = artPlayerRef.current?.currentTime || 0;
            if (currentTime > 0) {
              const newConfig = {
                ...skipConfigRef.current,
                intro_time: currentTime,
              };
              handleSkipConfigChange(newConfig);
              return `${formatTime(currentTime)}`;
            }
          },
        });
        artPlayerRef.current.setting.update({
          name: '设置片尾',
          html: '设置片尾',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
          tooltip:
            skipConfigRef.current.outro_time >= 0
              ? '设置片尾时间'
              : `-${formatTime(-skipConfigRef.current.outro_time)}`,
          onClick: function () {
            const outroTime =
              -(
                artPlayerRef.current?.duration -
                artPlayerRef.current?.currentTime
              ) || 0;
            if (outroTime < 0) {
              const newConfig = {
                ...skipConfigRef.current,
                outro_time: outroTime,
              };
              handleSkipConfigChange(newConfig);
              return `-${formatTime(-outroTime)}`;
            }
          },
        });
      } else {
        await saveSkipConfig(
          currentSourceRef.current,
          currentIdRef.current,
          newConfig
        );
      }
      console.log('跳过片头片尾配置已保存:', newConfig);
    } catch (err) {
      console.error('保存跳过片头片尾配置失败:', err);
    }
  };

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

    // 防止重复加载相同内容
    if (danmuLoadingRef.current) {
      console.log('弹幕正在加载中，等待加载完成...');
      // 等待当前加载完成
      while (danmuLoadingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // 加载完成后，尝试从缓存获取结果
      const danmuCache = getDanmuCache();
      const cached = danmuCache.get(requestKey);
      if (cached && (Date.now() - cached.timestamp) < DANMU_CACHE_DURATION) {
        console.log('等待完成，使用缓存数据:', cached.data.length, '条');
        return cached.data;
      }
    }

    if (lastDanmuLoadKeyRef.current === requestKey) {
      console.log('内容未变化，跳过本次请求');
      return [];
    }

    danmuLoadingRef.current = true;
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

      // 从localStorage获取缓存
      const danmuCache = getDanmuCache();
      console.log('- 缓存Map大小:', danmuCache.size);

      // 检查缓存
      const cached = danmuCache.get(cacheKey);
      if (cached) {
        console.log('📦 找到缓存数据:');
        console.log('- 缓存时间:', cached.timestamp);
        console.log('- 时间差:', now - cached.timestamp, 'ms');
        console.log('- 缓存有效期:', DANMU_CACHE_DURATION, 'ms');
        console.log('- 是否过期:', (now - cached.timestamp) >= DANMU_CACHE_DURATION);
      } else {
        console.log('❌ 未找到缓存数据');
      }

      if (cached && (now - cached.timestamp) < DANMU_CACHE_DURATION) {
        console.log('✅ 使用弹幕缓存数据，缓存键:', cacheKey);
        console.log('📊 缓存弹幕数量:', cached.data.length);
        return cached.data;
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
      console.log('💾 保存弹幕到缓存:');
      console.log('- 缓存键:', cacheKey);
      console.log('- 弹幕数量:', finalDanmu.length);
      console.log('- 保存时间:', now);

      const updatedCache = getDanmuCache();
      updatedCache.set(cacheKey, {
        data: finalDanmu,
        timestamp: now
      });

      // 清理过期缓存
      updatedCache.forEach((value, key) => {
        if (now - value.timestamp >= DANMU_CACHE_DURATION) {
          console.log('🗑️ 清理过期缓存:', key);
          updatedCache.delete(key);
        }
      });

      // 保存到localStorage
      setDanmuCache(updatedCache);

      console.log('✅ 缓存保存完成，当前缓存大小:', updatedCache.size);

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

  // 当集数索引变化时自动更新视频地址
  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);

    // 重置弹幕加载标识，允许新集数加载弹幕
    lastDanmuLoadKeyRef.current = '';

    // 如果播放器已经存在且弹幕插件已加载，重新加载弹幕
    if (artPlayerRef.current && artPlayerRef.current.plugins?.artplayerPluginDanmuku) {
      console.log('集数变化，等待弹幕配置加载完成后重新加载弹幕');
      setTimeout(async () => {
        // 等待弹幕配置加载完成
        while (!danmakuConfigLoaded) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('集数变化，弹幕配置已加载，当前开关状态:', externalDanmuEnabledRef.current);

        try {
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

            // 根据用户开关状态同步弹幕插件的显示/隐藏状态
            if (externalDanmuEnabledRef.current) {
              // 用户开启了弹幕，确保插件显示并加载数据
              if (plugin.isHide) {
                plugin.show();
                console.log('集数切换：根据用户设置开启弹幕显示');
              }

              const externalDanmu = await loadExternalDanmu();
              console.log('集数变化后外部弹幕加载结果:', externalDanmu);

              if (externalDanmu.length > 0) {
                console.log('向播放器插件重新加载弹幕数据:', externalDanmu.length, '条');
                plugin.load(externalDanmu);
                artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
              } else {
                console.log('集数变化后没有弹幕数据可加载');
                plugin.load([]);
                // 延迟显示无弹幕提示，避免在加载过程中误显示
                setTimeout(() => {
                  if (externalDanmuEnabledRef.current && artPlayerRef.current) {
                    artPlayerRef.current.notice.show = '暂无弹幕数据';
                  }
                }, 2000);
              }
            } else {
              // 用户关闭了弹幕，确保插件隐藏并清空数据
              if (!plugin.isHide) {
                plugin.hide();
                console.log('集数切换：根据用户设置关闭弹幕显示');
              }
              plugin.load([]);
              console.log('集数切换：弹幕开关关闭，已清空弹幕数据');
            }

            // 更新按钮状态
            if (updateButtonStateRef.current) {
              updateButtonStateRef.current();
            }
          }
        } catch (error) {
          console.error('集数变化后加载外部弹幕失败:', error);
        }
      }, 1000); // 延迟1秒确保视频加载完成
    }
  }, [detail, currentEpisodeIndex]);

  // 进入页面时直接获取全部源信息
  useEffect(() => {
    const fetchSourceDetail = async (
      source: string,
      id: string
    ): Promise<SearchResult[]> => {
      try {
        const detailResponse = await fetch(
          `/api/detail?source=${source}&id=${id}`
        );
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
      // 根据搜索词获取全部源信息
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}`
        );
        if (!response.ok) {
          throw new Error('搜索失败');
        }
        const data = await response.json();

        // 处理搜索结果，根据规则过滤
        const results = data.results.filter(
          (result: SearchResult) =>
            result.title.replaceAll(' ', '').toLowerCase() ===
            videoTitleRef.current.replaceAll(' ', '').toLowerCase() &&
            (videoYearRef.current
              ? result.year.toLowerCase() === videoYearRef.current.toLowerCase()
              : true) &&
            (searchType
              ? (searchType === 'tv' && result.episodes.length > 1) ||
              (searchType === 'movie' && result.episodes.length === 1)
              : true)
        );
        setAvailableSources(results);
        return results;
      } catch (err) {
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

      let sourcesInfo = await fetchSourcesData(searchTitle || videoTitle);
      if (
        currentSource &&
        currentId &&
        !sourcesInfo.some(
          (source) => source.source === currentSource && source.id === currentId
        )
      ) {
        sourcesInfo = await fetchSourceDetail(currentSource, currentId);
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

  // 跳过片头片尾配置处理
  useEffect(() => {
    // 仅在初次挂载时检查跳过片头片尾配置
    const initSkipConfig = async () => {
      if (!currentSource || !currentId) return;

      try {
        const config = await getSkipConfig(currentSource, currentId);
        if (config) {
          setSkipConfig(config);
        }
      } catch (err) {
        console.error('读取跳过片头片尾配置失败:', err);
      }
    };

    initSkipConfig();
  }, []);

  // 处理换源
  const handleSourceChange = async (
    newSource: string,
    newId: string,
    newTitle: string
  ) => {
    try {
      // 显示换源加载状态
      setVideoLoadingStage('sourceChanging');
      setIsVideoLoading(true);

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

      // 清除并设置下一个跳过片头片尾配置
      if (currentSourceRef.current && currentIdRef.current) {
        try {
          await deleteSkipConfig(
            currentSourceRef.current,
            currentIdRef.current
          );
          await saveSkipConfig(newSource, newId, skipConfigRef.current);
        } catch (err) {
          console.error('清除跳过片头片尾配置失败:', err);
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
    } catch (err) {
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
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
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
      await savePlayRecord(currentSourceRef.current, currentIdRef.current, {
        title: videoTitleRef.current,
        source_name: detailRef.current?.source_name || '',
        year: detailRef.current?.year,
        cover: detailRef.current?.poster || '',
        index: currentEpisodeIndexRef.current + 1, // 转换为1基索引
        total_episodes: detailRef.current?.episodes.length || 1,
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
        search_title: searchTitle,
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

      // 检测移动设备和浏览器类型
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isSafari = /^(?:(?!chrome|android).)*safari/i.test(userAgent);
      const isIOS = /iPad|iPhone|iPod/i.test(userAgent) && !(window as any).MSStream;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || isIOS;
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
        'Chromecast按钮': '❌ 已移除',
        '投屏策略': isIOS || isSafari ? '🍎 AirPlay (WebKit)' : '❌ Chromecast已移除'
      });

      // 优先使用ArtPlayer的switch方法，避免重建播放器
      if (artPlayerRef.current && !loading) {
        try {
          // 清空当前弹幕（为切换做准备）
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            artPlayerRef.current.plugins.artplayerPluginDanmuku.load([]);
            console.log('已清空弹幕数据，准备切换');
          }

          // 使用ArtPlayer的switch方法切换URL
          artPlayerRef.current.switch = videoUrl;
          artPlayerRef.current.title = `${videoTitle} - 第${currentEpisodeIndex + 1}集`;
          artPlayerRef.current.poster = videoCover;

          if (artPlayerRef.current?.video) {
            ensureVideoSource(
              artPlayerRef.current.video as HTMLVideoElement,
              videoUrl
            );
          }

          // 延迟重新加载弹幕，确保视频切换完成并等待弹幕配置加载
          setTimeout(async () => {
            // 等待弹幕配置加载完成
            while (!danmakuConfigLoaded) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('视频切换完成，弹幕配置已加载，当前开关状态:', externalDanmuEnabledRef.current);

            try {
              if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

                // 根据用户开关状态同步弹幕插件的显示/隐藏状态
                if (externalDanmuEnabledRef.current) {
                  // 用户开启了弹幕，确保插件显示并加载数据
                  if (plugin.isHide) {
                    plugin.show();
                    console.log('换源：根据用户设置开启弹幕显示');
                  }

                  const externalDanmu = await loadExternalDanmu();
                  console.log('切换后重新加载弹幕结果:', externalDanmu);

                  if (externalDanmu.length > 0) {
                    console.log('切换后向播放器插件加载弹幕数据:', externalDanmu.length, '条');
                    plugin.load(externalDanmu);
                    artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
                  } else {
                    console.log('切换后没有弹幕数据可加载');
                    plugin.load([]);
                    // 延迟显示无弹幕提示，避免在加载过程中误显示
                    setTimeout(() => {
                      if (externalDanmuEnabledRef.current && artPlayerRef.current) {
                        artPlayerRef.current.notice.show = '暂无弹幕数据';
                      }
                    }, 2000);
                  }
                } else {
                  // 用户关闭了弹幕，确保插件隐藏并清空数据
                  if (!plugin.isHide) {
                    plugin.hide();
                    console.log('换源：根据用户设置关闭弹幕显示');
                  }
                  plugin.load([]);
                  console.log('换源：弹幕开关关闭，已清空弹幕数据');
                }

                // 更新按钮状态
                if (updateButtonStateRef.current) {
                  updateButtonStateRef.current();
                }
              }
            } catch (error) {
              console.error('切换后重新加载外部弹幕失败:', error);
            }
          }, 1500);

          console.log('使用switch方法成功切换视频');
          return;
        } catch (error) {
          console.warn('Switch方法失败，将重建播放器:', error);
          // 如果switch失败，清理播放器并重新创建
          cleanupPlayer();
        }
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
        Artplayer.REMOVE_SRC_WHEN_DESTROY = true;
        artPlayerRef.current = new Artplayer({
          container: artRef.current,
          url: videoUrl,
          poster: videoCover,
          volume: 0.7,
          isLive: false,
          muted: false,
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
              const hls = new Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: !isMobile, // 移动设备关闭低延迟模式以节省资源

                /* 缓冲/内存相关 - 移动设备优化 */
                maxBufferLength: isMobile ? (isIOS ? 8 : 12) : 30, // iOS更保守的缓冲
                backBufferLength: isMobile ? (isIOS ? 5 : 8) : 30, // 减少已播放内容缓存
                maxBufferSize: isMobile
                  ? (isIOS ? 15 * 1000 * 1000 : 25 * 1000 * 1000) // iOS: 15MB, Android: 25MB
                  : 60 * 1000 * 1000, // 桌面: 60MB

                /* 网络优化 */
                maxLoadingDelay: isMobile ? 2 : 4, // 移动设备更快的加载超时
                maxBufferHole: isMobile ? 0.3 : 0.5, // 减少缓冲洞

                /* Fragment管理 */
                liveDurationInfinity: false, // 避免无限缓冲
                liveBackBufferLength: isMobile ? 3 : 10, // 减少直播回放缓冲

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
              name: '跳过片头片尾',
              html: '跳过片头片尾',
              switch: skipConfigRef.current.enable,
              onSwitch: function (item: any) {
                const newConfig = {
                  ...skipConfigRef.current,
                  enable: !item.switch,
                };
                handleSkipConfigChange(newConfig);
                return !item.switch;
              },
            },
            {
              html: '删除跳过配置',
              onClick: function () {
                handleSkipConfigChange({
                  enable: false,
                  intro_time: 0,
                  outro_time: 0,
                });
                return '';
              },
            },
            {
              name: '设置片头',
              html: '设置片头',
              icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
              tooltip:
                skipConfigRef.current.intro_time === 0
                  ? '设置片头时间'
                  : `${formatTime(skipConfigRef.current.intro_time)}`,
              onClick: function () {
                const currentTime = artPlayerRef.current?.currentTime || 0;
                if (currentTime > 0) {
                  const newConfig = {
                    ...skipConfigRef.current,
                    intro_time: currentTime,
                  };
                  handleSkipConfigChange(newConfig);
                  return `${formatTime(currentTime)}`;
                }
              },
            },
            {
              name: '设置片尾',
              html: '设置片尾',
              icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
              tooltip:
                skipConfigRef.current.outro_time >= 0
                  ? '设置片尾时间'
                  : `-${formatTime(-skipConfigRef.current.outro_time)}`,
              onClick: function () {
                const outroTime =
                  -(
                    artPlayerRef.current?.duration -
                    artPlayerRef.current?.currentTime
                  ) || 0;
                if (outroTime < 0) {
                  const newConfig = {
                    ...skipConfigRef.current,
                    outro_time: outroTime,
                  };
                  handleSkipConfigChange(newConfig);
                  return `-${formatTime(-outroTime)}`;
                }
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
            // 弹幕发送功能已通过官方 emitter: true 参数启用
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

              // 🚀 根据设备性能调整弹幕渲染策略（不减少数量）
              const getOptimizedConfig = () => {
                const baseConfig = {
                  danmuku: [], // 初始为空数组，后续通过load方法加载
                  speed: parseInt(localStorage.getItem('danmaku_speed') || '6'),
                  opacity: parseFloat(localStorage.getItem('danmaku_opacity') || '0.8'),
                  fontSize: parseInt(localStorage.getItem('danmaku_fontSize') || '25'),
                  color: '#FFFFFF',
                  mode: 0 as const, // 修正类型：使用 const assertion
                  modes: JSON.parse(localStorage.getItem('danmaku_modes') || '[0, 1, 2]') as Array<0 | 1 | 2>,
                  margin: JSON.parse(localStorage.getItem('danmaku_margin') || '[10, "75%"]') as [number | `${number}%`, number | `${number}%`],
                  visible: localStorage.getItem('danmaku_visible') !== 'false',
                  emitter: false, // 开启官方弹幕发射器
                  maxLength: 200,
                  lockTime: 5, // v5.2.0优化: 减少锁定时间，降低快进时的延迟
                  theme: 'dark' as const,
                  width: (() => {
                    // 检测是否为全屏模式
                    const checkFullscreen = () => {
                      const player = document.querySelector('.artplayer');
                      return player && (player.classList.contains('art-fullscreen') || player.classList.contains('art-fullscreen-web'));
                    };
                    // 全屏模式下缩短30%，从300px变为210px
                    return checkFullscreen() ? 210 : 300;
                  })(),

                  // 🧠 智能过滤器 - 只过滤有问题的弹幕，不减少数量
                  filter: (danmu: any) => {
                    // 过滤空弹幕
                    if (!danmu.text || !danmu.text.trim()) return false

                    // 过滤超长弹幕（影响性能）
                    if (danmu.text.length > 100) return false

                    // 过滤可能导致渲染问题的特殊字符
                    const specialCharCount = (danmu.text.match(/[^\u4e00-\u9fa5a-zA-Z0-9\s.,!?；，。！？]/g) || []).length
                    if (specialCharCount > 10) return false

                    return true // 保持尽可能多的弹幕
                  },

                  // 🎯 保持原有的 beforeVisible 逻辑，只添加性能优化
                  beforeVisible: (danmu: any) => {
                    return new Promise<boolean>((resolve) => {
                      // 低性能设备添加CSS动画优化
                      if (devicePerformance === 'low' && danmu.$ref && danmu.mode === 0) {
                        // 添加硬件加速样式
                        danmu.$ref.classList.add('art-danmuku-optimized')
                        danmu.$ref.style.willChange = 'transform'
                        danmu.$ref.style.backfaceVisibility = 'hidden'
                      }
                      resolve(true)
                    })
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

                  case 'low': // 低性能设备 - 激进优化
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
            // Chromecast功能已移除
            // // Chromecast 插件加载策略：
            // // 只在 Chrome 浏览器中显示 Chromecast（排除 iOS Chrome）
            // // Safari 和 iOS：不显示 Chromecast（用原生 AirPlay）
            // // 其他浏览器：不显示 Chromecast（不支持 Cast API）
            // ...(isChrome && !isIOS ? [
            //   artplayerPluginChromecast({
            //     onStateChange: (state) => {
            //       console.log('Chromecast state changed:', state);
            //     },
            //     onCastAvailable: (available) => {
            //       console.log('Chromecast available:', available);
            //     },
            //     onCastStart: () => {
            //       console.log('Chromecast started');
            //     },
            //     onError: (error) => {
            //       console.error('Chromecast error:', error);
            //     }
            //   })
            // ] : []),
          ],
        });

        // 监听播放器事件
        artPlayerRef.current.on('ready', async () => {
          setError(null);

          // 添加弹幕插件按钮选择性隐藏CSS
          const optimizeDanmukuControlsCSS = () => {
            if (document.getElementById('danmuku-controls-optimize')) return;

            const style = document.createElement('style');
            style.id = 'danmuku-controls-optimize';
            style.textContent = `
            /* 只隐藏官方开关按钮，保留发射器 */
            .artplayer-plugin-danmuku .apd-toggle {
              display: none !important;
            }
            
            /* 移动端隐藏弹幕发射器（包括全屏和非全屏） - 使用最强的选择器 */
            @media (max-width: 768px) {
              body .artplayer .artplayer-plugin-danmuku .apd-emitter,
              body .artplayer-fullscreen .artplayer-plugin-danmuku .apd-emitter,
              html body .artplayer .artplayer-plugin-danmuku .apd-emitter,
              html body .artplayer-fullscreen .artplayer-plugin-danmuku .apd-emitter,
              .artplayer .artplayer-plugin-danmuku .apd-emitter,
              .artplayer-fullscreen .artplayer-plugin-danmuku .apd-emitter,
              .artplayer-plugin-danmuku .apd-emitter {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                height: 0 !important;
                width: 0 !important;
                overflow: hidden !important;
              }
            }
            
            /* 去除官方弹幕发射器输入框的focus描边 */
            .artplayer-plugin-danmuku .apd-emitter input {
              outline: none !important;
              border: none !important;
              box-shadow: none !important;
            }
            
            .artplayer-plugin-danmuku .apd-emitter input:focus {
              outline: none !important;
              border: none !important;
              box-shadow: none !important;
            }
            
            /* 自定义弹幕发射器输入框样式 */
            .artplayer-plugin-danmuku .apd-emitter input {
              font-size: 11px !important;
            }
            
            .artplayer-plugin-danmuku .apd-emitter input::placeholder {
              font-size: 11px !important;
              color: #ffffff !important;
              opacity: 0.85 !important;
            }
            
            /* 全屏模式下弹幕发射器宽度控制 */
            .art-fullscreen .artplayer-plugin-danmuku .apd-emitter,
            .art-fullscreen-web .artplayer-plugin-danmuku .apd-emitter {
              width: 280px !important;
              max-width: 280px !important;
            }
            
            .art-fullscreen .artplayer-plugin-danmuku .apd-emitter input,
            .art-fullscreen-web .artplayer-plugin-danmuku .apd-emitter input {
              width: 100% !important;
              max-width: 100% !important;
            }
            
            /* 弹幕配置面板自动适配定位 - 完全模仿ArtPlayer设置面板 */
            .artplayer-plugin-danmuku .apd-config {
              /* 确保相对定位容器不影响面板定位 */
              position: relative;
            }
            
            .artplayer-plugin-danmuku .apd-config-panel {
              /* 改为绝对定位，相对于弹幕配置按钮 */
              position: absolute !important;
              left: 50% !important; /* 水平居中定位 */
              right: auto !important;
              bottom: 100% !important; /* 显示在按钮上方 */
              margin-bottom: 8px !important; /* 与按钮保持8px间距 */
              transform: translateX(-50%) translateY(10px) !important; /* 水平居中偏移 + 初始向下偏移 */
              z-index: 91 !important; /* 比ArtPlayer设置面板(90)稍高 */
              display: none !important;
              opacity: 0 !important;
              transition: opacity 0.2s ease, transform 0.2s ease !important;
              pointer-events: none !important;
            }
            
            /* 显示状态 */
            .artplayer-plugin-danmuku .apd-config-panel.show {
              display: block !important;
              opacity: 1 !important;
              transform: translateX(-50%) translateY(0) !important;
              pointer-events: auto !important;
            }
            
            /* 添加安全区域，连接按钮和面板 */
            .artplayer-plugin-danmuku .apd-config::before {
              content: '' !important;
              position: absolute !important;
              top: -10px !important;
              right: -10px !important;
              bottom: -10px !important;
              left: -10px !important;
              z-index: 90 !important;
              pointer-events: auto !important;
            }
            
            /* 全屏模式下保持相对于按钮的居中定位 */
            .art-fullscreen .artplayer-plugin-danmuku .apd-config-panel,
            .art-fullscreen-web .artplayer-plugin-danmuku .apd-config-panel {
              position: absolute !important;
              left: 50% !important;
              right: auto !important;
              bottom: 100% !important;
              margin-bottom: 8px !important;
              transform: translateX(-50%) translateY(10px) !important;
            }
            
            .art-fullscreen .artplayer-plugin-danmuku .apd-config-panel.show,
            .art-fullscreen-web .artplayer-plugin-danmuku .apd-config-panel.show {
              transform: translateX(-50%) translateY(0) !important;
            }
          `;
            document.head.appendChild(style);
          };

          // 应用CSS优化
          optimizeDanmukuControlsCSS();

          // 移动端弹幕配置按钮点击切换支持 - 基于ArtPlayer设置按钮原理
          const addMobileDanmakuToggle = () => {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            // 增加重试机制，确保弹幕插件完全加载
            let retryCount = 0;
            const maxRetries = 10;

            const tryAddToggleButton = () => {
              const configButton = document.querySelector('.artplayer-plugin-danmuku .apd-config');
              const configPanel = document.querySelector('.artplayer-plugin-danmuku .apd-config-panel');

              if (!configButton || !configPanel) {
                retryCount++;
                if (retryCount < maxRetries) {
                  console.log(`弹幕配置按钮未找到，重试 ${retryCount}/${maxRetries}`);
                  setTimeout(tryAddToggleButton, 500);
                  return;
                } else {
                  console.warn('弹幕配置按钮或面板未找到，已达到最大重试次数');
                  return;
                }
              }

              console.log('找到弹幕配置按钮，开始创建开关按钮');

              // 修改弹幕发射器占位符文字
              const customizePlaceholder = () => {
                const emitterInput = document.querySelector('.artplayer-plugin-danmuku .apd-emitter input');
                if (emitterInput) {
                  const placeholderText = '\u004E\u0065\u0077\u0054\u0056\u0020\u9080\u60A8\u53D1\u4E2A\u53CB\u5584\u7684\u5F39\u5E55\u89C1\u8BC1';
                  emitterInput.setAttribute('placeholder', placeholderText);
                }
              };

              // 立即执行一次
              customizePlaceholder();

              // 使用MutationObserver监听DOM变化，确保占位符修改生效
              const observer = new MutationObserver(() => {
                customizePlaceholder();
              });

              const emitterContainer = document.querySelector('.artplayer-plugin-danmuku .apd-emitter');
              if (emitterContainer) {
                observer.observe(emitterContainer, { childList: true, subtree: true });
              }

              // 创建弹幕开关按钮
              const createDanmakuToggleButton = () => {
                const toggleButton = document.createElement('div');
                toggleButton.className = 'art-danmaku-toggle-button';
                toggleButton.style.cssText = `
                  position: relative;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  width: 36px;
                  height: 36px;
                  margin-left: 8px;
                  cursor: pointer;
                  background: transparent;
                  color: white;
                  font-size: 14px;
                  font-weight: bold;
                  transition: all 0.2s ease;
                  user-select: none;
                  z-index: 90;
                `;

                // 更新按钮状态显示
                const updateButtonState = () => {
                  const isDanmakuVisible = artPlayerRef.current?.plugins?.artplayerPluginDanmuku && !artPlayerRef.current.plugins.artplayerPluginDanmuku.isHide;
                  const isExternalDanmuEnabled = externalDanmuEnabledRef.current;

                  // 只有当弹幕显示且外部弹幕开关都开启时，才显示开启图标
                  if (isDanmakuVisible && isExternalDanmuEnabled) {
                    // 弹幕开启（弹幕显示和外部弹幕同时开启）
                    toggleButton.innerHTML = '<svg t="1757659936665" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="814" width="23" height="23"><path d="M663.04 457.6H610.133333v37.973333h52.906667v-37.973333z m-100.266667 0h-50.346666v37.973333h50.346666v-37.973333z m0 77.226667h-50.346666v35.84h50.346666v-35.84z m100.266667 0H610.133333v35.84h52.906667v-35.84z m-25.6-193.28l45.653333 16.213333c-9.386667 22.186667-20.053333 41.813333-31.573333 59.306667h53.76v194.133333h-95.573333v35.413333h113.493333v44.8l-0.426667 0.426667h-113.066666l-0.426667-0.426667c-29.013333-31.146667-77.653333-33.28-109.226667-4.266666l-4.693333 4.693333h-43.52v-45.226667h110.08v-35.413333h-93.44v-194.133333h55.466667a362.24 362.24 0 0 0-34.56-57.173334l43.946666-14.933333c12.8 18.346667 24.746667 37.973333 34.133334 58.88l-29.013334 12.8h64c13.653333-23.04 24.746667-48.64 34.986667-75.093333z m-198.826667 20.48v142.08H355.413333l-6.4 62.293333h92.586667c0 79.36-2.986667 132.266667-7.253333 159.146667-5.546667 26.88-29.013333 41.386667-71.253334 44.373333-11.946667 0-23.893333-0.853333-37.12-1.706667l-12.373333-44.8c11.946667 1.28 25.173333 2.133333 37.973333 2.133334 23.04 0 36.266667-7.253333 39.253334-22.186667 3.413333-14.933333 5.12-46.506667 5.12-95.573333H299.52l12.8-144.64h78.08v-59.733334H303.786667v-40.96h134.826666v-0.426666z" fill="#ffffff" p-id="815"></path><path d="M775.424 212.693333a170.666667 170.666667 0 0 1 170.496 162.133334l0.170667 8.533333v106.666667a42.666667 42.666667 0 0 1-85.034667 4.949333l-0.298667-4.992V383.36a85.333333 85.333333 0 0 0-78.933333-85.077333l-6.4-0.256H246.954667a85.333333 85.333333 0 0 0-85.12 78.976l-0.213334 6.4v400.597333a85.333333 85.333333 0 0 0 78.933334 85.12l6.4 0.213333h281.770666a42.666667 42.666667 0 0 1 4.992 85.034667l-4.992 0.298667H246.954667a170.666667 170.666667 0 0 1-170.453334-162.133334l-0.213333-8.533333v-400.64a170.666667 170.666667 0 0 1 162.133333-170.453333l8.533334-0.213334h528.469333z" fill="#ffffff" p-id="816"></path><path d="M300.842667 97.194667a42.666667 42.666667 0 0 1 56.32-3.541334l4.010666 3.541334 128 128a42.666667 42.666667 0 0 1-56.32 63.914666l-4.010666-3.541333-128-128a42.666667 42.666667 0 0 1 0-60.373333z" fill="#ffffff" p-id="817"></path><path d="M702.506667 97.194667a42.666667 42.666667 0 0 0-56.32-3.541334l-4.010667 3.541334-128 128a42.666667 42.666667 0 0 0 56.32 63.914666l4.010667-3.541333 128-128a42.666667 42.666667 0 0 0 0-60.373333z" fill="#ffffff" p-id="818"></path><path d="M872.362667 610.773333a42.666667 42.666667 0 0 1 65.578666 54.314667l-3.413333 4.138667-230.058667 244.608a42.666667 42.666667 0 0 1-57.685333 4.096l-4.096-3.712-110.634667-114.688a42.666667 42.666667 0 0 1 57.472-62.848l3.968 3.626666 79.488 82.389334 199.381334-211.925334z" fill="#00ff88" p-id="819"></path></svg>';
                    toggleButton.title = '弹幕已开启';
                  } else {
                    // 弹幕关闭（弹幕显示或外部弹幕任一关闭）
                    toggleButton.innerHTML = '<svg t="1757659973066" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="961" width="23" height="23"><path d="M663.04 457.6H610.133333v37.973333h52.906667v-37.973333z m-100.266667 0h-50.346666v37.973333h50.346666v-37.973333z m0 77.226667h-50.346666v35.84h50.346666v-35.84z m100.266667 0H610.133333v35.84h52.906667v-35.84z m-25.6-193.28l45.653333 16.213333c-9.386667 22.186667-20.053333 41.813333-31.573333 59.306667h53.76v194.133333h-95.573333v35.413333h41.813333l-14.08 45.226667h-27.733333l-0.426667-0.426667-113.92 0.426667h-43.52v-45.226667h110.08v-35.413333h-93.44v-194.133333h55.466667a362.24 362.24 0 0 0-34.56-57.173334l43.946666-14.933333c12.8 18.346667 24.746667 37.973333 34.133334 58.88l-29.013334 12.8h64c13.653333-23.04 24.746667-48.64 34.986667-75.093333z m-198.826667 20.48v142.08H355.413333l-6.4 62.293333h92.586667c0 79.36-2.986667 132.266667-7.253333 159.146667-5.546667 26.88-29.013333 41.386667-71.253334 44.373333-11.946667 0-23.893333-0.853333-37.12-1.706667l-12.373333-44.8c11.946667 1.28 25.173333 2.133333 37.973333 2.133334 23.04 0 36.266667-7.253333 39.253334-22.186667 3.413333-14.933333 5.12-46.506667 5.12-95.573333H299.52l12.8-144.64h78.08v-59.733334H303.786667v-40.96h134.826666v-0.426666z" fill="#ffffff" p-id="962"></path><path d="M775.424 212.693333a170.666667 170.666667 0 0 1 170.496 162.133334l0.170667 8.533333v74.24a42.666667 42.666667 0 0 1-85.034667 4.992l-0.298667-4.992v-74.24a85.333333 85.333333 0 0 0-78.933333-85.077333l-6.4-0.256H246.954667a85.333333 85.333333 0 0 0-85.12 78.976l-0.213334 6.4v400.597333a85.333333 85.333333 0 0 0 78.933334 85.12l6.4 0.213333h281.770666a42.666667 42.666667 0 0 1 4.992 85.034667l-4.992 0.298667H246.954667a170.666667 170.666667 0 0 1-170.453334-162.133334l-0.213333-8.533333v-400.64a170.666667 170.666667 0 0 1 162.133333-170.453333l8.533334-0.213334h528.469333z" fill="#ffffff" p-id="963"></path><path d="M300.842667 97.194667a42.666667 42.666667 0 0 1 56.32-3.541334l4.010666 3.541334 128 128a42.666667 42.666667 0 0 1-56.32 63.914666l-4.010666-3.541333-128-128a42.666667 42.666667 0 0 1 0-60.373333z" fill="#ffffff" p-id="964"></path><path d="M702.506667 97.194667a42.666667 42.666667 0 0 0-56.32-3.541334l-4.010667 3.541334-128 128a42.666667 42.666667 0 0 0 56.32 63.914666l4.010667-3.541333 128-128a42.666667 42.666667 0 0 0 0-60.373333z" fill="#ffffff" p-id="965"></path><path d="M768 512a213.333333 213.333333 0 1 0 0 426.666667 213.333333 213.333333 0 0 0 0-426.666667z m0 85.333333a128 128 0 1 1 0 256 128 128 0 0 1 0-256z" fill="#E73146" p-id="966"></path><path d="M848.512 588.245333a42.666667 42.666667 0 0 1 62.592 57.728l-3.626667 3.925334-214.954666 205.610666a42.666667 42.666667 0 0 1-62.592-57.728l3.626666-3.925333 214.954667-205.653333z" fill="#E73146" p-id="967"></path></svg>';
                    toggleButton.title = '弹幕已关闭';
                  }

                  console.log('按钮状态更新 - 弹幕显示:', isDanmakuVisible, '外部弹幕开关:', isExternalDanmuEnabled, '最终图标状态:', isDanmakuVisible && isExternalDanmuEnabled ? '开启' : '关闭');
                };

                // 将updateButtonState函数保存到ref中，以便在其他地方调用
                updateButtonStateRef.current = updateButtonState;

                // 点击事件处理
                toggleButton.addEventListener('click', async (e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  if (!artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                    console.warn('弹幕插件未加载');
                    return;
                  }

                  const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
                  const isDanmakuVisible = !plugin.isHide;

                  if (isDanmakuVisible) {
                    // 当前弹幕开启，点击关闭弹幕显示和外部弹幕
                    plugin.hide();

                    // 同时关闭外部弹幕
                    externalDanmuEnabledRef.current = false;
                    setExternalDanmuEnabled(false);

                    // 保存到数据库和localStorage
                    const authInfo = getAuthInfoFromBrowserCookie();
                    if (authInfo?.username) {
                      await saveDanmakuConfig({ externalDanmuEnabled: false });
                    }
                    localStorage.setItem('enable_external_danmu', 'false');
                    plugin.load([]);

                    if (artPlayerRef.current) {
                      artPlayerRef.current.notice.show = '弹幕已关闭';
                    }
                  } else {
                    // 当前弹幕关闭，点击开启弹幕显示和外部弹幕
                    plugin.show();

                    // 同时开启外部弹幕
                    externalDanmuEnabledRef.current = true;
                    setExternalDanmuEnabled(true);

                    // 保存到数据库和localStorage
                    const authInfo = getAuthInfoFromBrowserCookie();
                    if (authInfo?.username) {
                      await saveDanmakuConfig({ externalDanmuEnabled: true });
                    }
                    localStorage.setItem('enable_external_danmu', 'true');

                    // 异步加载外部弹幕数据
                    try {
                      const externalDanmu = await loadExternalDanmu();
                      if (externalDanmuEnabledRef.current) {
                        plugin.load(externalDanmu);
                        if (artPlayerRef.current) {
                          if (externalDanmu.length === 0) {
                            artPlayerRef.current.notice.show = '弹幕已开启';
                          } else {
                            artPlayerRef.current.notice.show = `弹幕已开启，已加载 ${externalDanmu.length} 条弹幕`;
                          }
                        }
                      }
                    } catch (error) {
                      console.error('加载外部弹幕失败:', error);
                      if (artPlayerRef.current) {
                        artPlayerRef.current.notice.show = '弹幕已开启，外部弹幕加载失败';
                      }
                    }
                  }

                  updateButtonState();
                });

                // 初始化按钮状态
                updateButtonState();

                return toggleButton;
              };

              // 将弹幕开关按钮添加到弹幕配置按钮旁边
              const danmakuContainer = configButton.parentElement;
              if (danmakuContainer) {
                const toggleButton = createDanmakuToggleButton();
                danmakuContainer.appendChild(toggleButton);
                console.log('弹幕开关按钮已添加');
              }

              console.log('设备类型:', isMobile ? '移动端' : '桌面端');

              if (isMobile) {
                // 移动端：添加点击切换支持 + 持久位置修正
                console.log('为移动端添加弹幕配置按钮点击切换功能');

                let isConfigVisible = false;

                // 弹幕面板位置修正函数 - 完全模仿ArtPlayer设置面板算法
                const adjustPanelPosition = () => {
                  const player = document.querySelector('.artplayer');
                  if (!player || !configButton || !configPanel) return;

                  try {
                    const panelElement = configPanel as HTMLElement;
                    const isFullscreen = player.classList.contains('art-fullscreen') || player.classList.contains('art-fullscreen-web');

                    // 清除所有可能影响定位的内联样式，让CSS接管
                    panelElement.style.left = '';
                    panelElement.style.right = '';
                    panelElement.style.top = '';
                    panelElement.style.bottom = '';
                    panelElement.style.transform = '';
                    panelElement.style.position = '';

                    console.log('弹幕面板：使用CSS默认定位，自动适配', isFullscreen ? '全屏模式' : '普通模式');
                  } catch (error) {
                    console.warn('弹幕面板位置调整失败:', error);
                  }
                };

                // 添加hover延迟交互
                let showTimer: NodeJS.Timeout | null = null;
                let hideTimer: NodeJS.Timeout | null = null;

                const showPanel = () => {
                  if (hideTimer) {
                    clearTimeout(hideTimer);
                    hideTimer = null;
                  }

                  if (!isConfigVisible) {
                    isConfigVisible = true;
                    (configPanel as HTMLElement).style.setProperty('display', 'block', 'important');
                    // 添加show类来触发动画
                    setTimeout(() => {
                      (configPanel as HTMLElement).classList.add('show');
                      adjustPanelPosition();
                    }, 10);
                    console.log('移动端弹幕配置面板：显示');
                  }
                };

                const hidePanel = () => {
                  if (showTimer) {
                    clearTimeout(showTimer);
                    showTimer = null;
                  }

                  if (isConfigVisible) {
                    isConfigVisible = false;
                    (configPanel as HTMLElement).classList.remove('show');
                    // 等待动画完成后隐藏
                    setTimeout(() => {
                      (configPanel as HTMLElement).style.setProperty('display', 'none', 'important');
                    }, 200);
                    console.log('移动端弹幕配置面板：隐藏');
                  }
                };

                // 鼠标进入按钮或面板区域
                const handleMouseEnter = () => {
                  if (hideTimer) {
                    clearTimeout(hideTimer);
                    hideTimer = null;
                  }

                  showTimer = setTimeout(showPanel, 300); // 300ms延迟显示
                };

                // 鼠标离开按钮或面板区域
                const handleMouseLeave = () => {
                  if (showTimer) {
                    clearTimeout(showTimer);
                    showTimer = null;
                  }

                  hideTimer = setTimeout(hidePanel, 500); // 500ms延迟隐藏
                };

                // 为按钮添加hover事件
                configButton.addEventListener('mouseenter', handleMouseEnter);
                configButton.addEventListener('mouseleave', handleMouseLeave);

                // 为面板添加hover事件
                configPanel.addEventListener('mouseenter', handleMouseEnter);
                configPanel.addEventListener('mouseleave', handleMouseLeave);

                // 添加点击展开关闭功能
                configButton.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  if (isConfigVisible) {
                    hidePanel();
                    console.log('移动端弹幕配置面板：点击关闭');
                  } else {
                    showPanel();
                    console.log('移动端弹幕配置面板：点击展开');
                  }
                });

                // 监听ArtPlayer的resize事件，在每次resize后重新调整弹幕面板位置
                if (artPlayerRef.current) {
                  artPlayerRef.current.on('resize', () => {
                    if (isConfigVisible) {
                      console.log('检测到ArtPlayer resize事件，重新调整弹幕面板位置');
                      setTimeout(adjustPanelPosition, 50); // 短暂延迟确保resize完成
                    }
                  });

                  // 监听全屏状态变化
                  artPlayerRef.current.on('fullscreen', (fullscreen: boolean) => {
                    if (isConfigVisible) {
                      console.log('检测到全屏状态变化:', fullscreen ? '进入全屏' : '退出全屏');
                      setTimeout(adjustPanelPosition, 100); // 延迟调整确保全屏切换完成
                    }
                  });

                  artPlayerRef.current.on('fullscreenWeb', (fullscreen: boolean) => {
                    if (isConfigVisible) {
                      console.log('检测到网页全屏状态变化:', fullscreen ? '进入网页全屏' : '退出网页全屏');
                      setTimeout(adjustPanelPosition, 100); // 延迟调整确保全屏切换完成
                    }
                  });

                  console.log('已监听ArtPlayer resize和全屏事件，实现自动适配');
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

                // 移除点击外部区域自动隐藏功能，改为固定显示模式
                // 弹幕设置菜单现在只能通过再次点击按钮来关闭，与显示设置保持一致

                console.log('移动端弹幕配置切换功能已激活');
              } else {
                // 桌面端：使用hover延迟交互，与移动端保持一致
                console.log('为桌面端添加弹幕配置按钮hover延迟交互功能');

                let isConfigVisible = false;
                let showTimer: NodeJS.Timeout | null = null;
                let hideTimer: NodeJS.Timeout | null = null;

                const showPanel = () => {
                  if (hideTimer) {
                    clearTimeout(hideTimer);
                    hideTimer = null;
                  }

                  if (!isConfigVisible) {
                    isConfigVisible = true;
                    (configPanel as HTMLElement).style.setProperty('display', 'block', 'important');
                    // 添加show类来触发动画
                    setTimeout(() => {
                      (configPanel as HTMLElement).classList.add('show');
                    }, 10);
                    console.log('桌面端弹幕配置面板：显示');
                  }
                };

                const hidePanel = () => {
                  if (showTimer) {
                    clearTimeout(showTimer);
                    showTimer = null;
                  }

                  if (isConfigVisible) {
                    isConfigVisible = false;
                    (configPanel as HTMLElement).classList.remove('show');
                    // 等待动画完成后隐藏
                    setTimeout(() => {
                      (configPanel as HTMLElement).style.setProperty('display', 'none', 'important');
                    }, 200);
                    console.log('桌面端弹幕配置面板：隐藏');
                  }
                };

                // 鼠标进入按钮或面板区域
                const handleMouseEnter = () => {
                  if (hideTimer) {
                    clearTimeout(hideTimer);
                    hideTimer = null;
                  }

                  showTimer = setTimeout(showPanel, 300); // 300ms延迟显示
                };

                // 鼠标离开按钮或面板区域
                const handleMouseLeave = () => {
                  if (showTimer) {
                    clearTimeout(showTimer);
                    showTimer = null;
                  }

                  hideTimer = setTimeout(hidePanel, 500); // 500ms延迟隐藏
                };

                // 为按钮添加hover事件
                configButton.addEventListener('mouseenter', handleMouseEnter);
                configButton.addEventListener('mouseleave', handleMouseLeave);

                // 为面板添加hover事件
                configPanel.addEventListener('mouseenter', handleMouseEnter);
                configPanel.addEventListener('mouseleave', handleMouseLeave);

                // 添加点击展开关闭功能
                configButton.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  if (isConfigVisible) {
                    hidePanel();
                    console.log('桌面端弹幕配置面板：点击关闭');
                  } else {
                    showPanel();
                    console.log('桌面端弹幕配置面板：点击展开');
                  }
                });

                console.log('桌面端弹幕配置hover延迟交互功能已激活');
              }
            };

            // 开始尝试添加按钮
            tryAddToggleButton();
          };

          // 启用移动端弹幕配置切换
          addMobileDanmakuToggle();

          // 播放器就绪后，等待弹幕配置加载完成再加载外部弹幕数据
          console.log('播放器已就绪，等待弹幕配置加载完成');
          const waitForConfigAndLoadDanmu = async () => {
            // 等待弹幕配置加载完成
            while (!danmakuConfigLoaded) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('弹幕配置已加载，开始同步弹幕状态，当前开关状态:', externalDanmuEnabledRef.current);

            try {
              if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

                // 根据数据库配置同步弹幕插件的显示状态
                if (externalDanmuEnabledRef.current) {
                  // 外部弹幕开关开启，确保弹幕插件显示
                  if (plugin.isHide) {
                    plugin.show();
                    console.log('根据配置开启弹幕显示');
                  }

                  // 加载外部弹幕数据
                  const externalDanmu = await loadExternalDanmu();
                  console.log('外部弹幕加载结果:', externalDanmu);

                  if (externalDanmu.length > 0) {
                    console.log('向播放器插件加载弹幕数据:', externalDanmu.length, '条');
                    plugin.load(externalDanmu);
                    artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
                  } else {
                    console.log('没有弹幕数据可加载');
                    // 延迟显示无弹幕提示，避免在加载过程中误显示
                    setTimeout(() => {
                      if (externalDanmuEnabledRef.current && artPlayerRef.current) {
                        artPlayerRef.current.notice.show = '暂无弹幕数据';
                      }
                    }, 2000);
                  }
                } else {
                  // 外部弹幕开关关闭，隐藏弹幕插件并清空数据
                  if (!plugin.isHide) {
                    plugin.hide();
                    console.log('根据配置关闭弹幕显示');
                  }
                  plugin.load([]);
                  console.log('弹幕开关关闭，已清空弹幕数据');
                }

                // 更新按钮状态
                if (updateButtonStateRef.current) {
                  updateButtonStateRef.current();
                }
              } else {
                console.error('弹幕插件未找到');
              }
            } catch (error) {
              console.error('同步弹幕状态失败:', error);
            }
          };

          setTimeout(waitForConfigAndLoadDanmu, 1000); // 延迟1秒确保插件完全初始化

          // 监听弹幕插件的显示/隐藏事件，自动保存状态到localStorage
          artPlayerRef.current.on('artplayerPluginDanmuku:show', () => {
            localStorage.setItem('danmaku_visible', 'true');
            console.log('弹幕显示状态已保存');
          });

          artPlayerRef.current.on('artplayerPluginDanmuku:hide', () => {
            localStorage.setItem('danmaku_visible', 'false');
            console.log('弹幕隐藏状态已保存');
          });

          // 防抖保存弹幕配置的函数
          const debouncedSaveConfig = (option: any) => {
            if (saveConfigTimeoutRef.current) {
              clearTimeout(saveConfigTimeoutRef.current);
            }
            saveConfigTimeoutRef.current = setTimeout(() => {
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
            }, 500); // 增加到500ms防抖延迟，减少频繁保存
          };

          // 弹幕配置更新防抖处理
          const debouncedConfigUpdate = (option: any) => {
            // 立即保存到localStorage（用户体验）
            debouncedSaveConfig(option);

            // 防抖处理弹幕插件的配置更新（性能优化）
            if (configUpdateTimeoutRef.current) {
              clearTimeout(configUpdateTimeoutRef.current);
            }

            // 对于字号调整，使用更长的防抖时间减少重新渲染
            const debounceTime = typeof option.fontSize !== 'undefined' ? 800 : 300;

            configUpdateTimeoutRef.current = setTimeout(() => {
              // 这里可以添加额外的弹幕更新逻辑，如果需要的话
              console.log('弹幕配置更新防抖完成:', option);
            }, debounceTime);
          };

          // 监听弹幕插件的配置变更事件，使用防抖保存设置
          artPlayerRef.current.on('artplayerPluginDanmuku:config', debouncedConfigUpdate);

          // 监听播放进度跳转，优化弹幕重置
          artPlayerRef.current.on('seek', () => {
            if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              // 清除之前的重置计时器
              if (seekResetTimeoutRef.current) {
                clearTimeout(seekResetTimeoutRef.current);
              }

              // 延迟重置弹幕，避免拖拽过程中频繁重置
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
            if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku && !artPlayerRef.current.plugins.artplayerPluginDanmuku.isHide) {
              artPlayerRef.current.plugins.artplayerPluginDanmuku.hide();
            }
          });

          artPlayerRef.current.on('video:seeked', () => {
            isDraggingProgressRef.current = false;
            // 拖拽结束后再重置弹幕
            if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              artPlayerRef.current.plugins.artplayerPluginDanmuku.show(); // 先恢复显示
              setTimeout(() => {
                // 延迟重置以确保播放状态稳定
                if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                  artPlayerRef.current.plugins.artplayerPluginDanmuku.reset();
                  console.log('拖拽结束，弹幕已重置');
                }
              }, 100);
              console.log('拖拽结束，弹幕已重置');
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
          saveCurrentPlayProgress();
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
          const d = detailRef.current;
          const idx = currentEpisodeIndexRef.current;
          if (d && d.episodes && idx < d.episodes.length - 1) {
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

          // 跳过片头片尾逻辑 - 优化频率控制
          if (skipConfigRef.current.enable) {
            const SKIP_CHECK_INTERVAL = 1000; // 降低到1秒，提高响应性

            if (now - lastSkipCheckRef.current >= SKIP_CHECK_INTERVAL) {
              lastSkipCheckRef.current = now;

              // 跳过片头
              if (
                skipConfigRef.current.intro_time > 0 &&
                currentTime < skipConfigRef.current.intro_time
              ) {
                artPlayerRef.current.currentTime = skipConfigRef.current.intro_time;
                artPlayerRef.current.notice.show = `已跳过片头 (${formatTime(
                  skipConfigRef.current.intro_time
                )})`;
                return; // 避免执行后续逻辑
              }

              // 跳过片尾
              if (
                skipConfigRef.current.outro_time < 0 &&
                duration > 0 &&
                currentTime > duration + skipConfigRef.current.outro_time
              ) {
                if (
                  currentEpisodeIndexRef.current <
                  (detailRef.current?.episodes?.length || 1) - 1
                ) {
                  handleNextEpisode();
                } else {
                  artPlayerRef.current.pause();
                }
                artPlayerRef.current.notice.show = `已跳过片尾 (${formatTime(
                  skipConfigRef.current.outro_time
                )})`;
                return; // 避免执行后续逻辑
              }
            }
          }

          // 保存播放进度逻辑 - 优化所有存储类型的保存间隔
          const saveNow = Date.now();
          // upstash需要更长间隔避免频率限制，其他存储类型也适当降低频率减少性能开销
          const interval = process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash' ? 20000 : 10000; // 统一提高到10秒

          if (saveNow - lastSaveTimeRef.current > interval) {
            saveCurrentPlayProgress();
            lastSaveTimeRef.current = saveNow;
          }
        });

        artPlayerRef.current.on('pause', () => {
          saveCurrentPlayProgress();
        });

        if (artPlayerRef.current?.video) {
          ensureVideoSource(
            artPlayerRef.current.video as HTMLVideoElement,
            videoUrl
          );
        }
      } catch (err) {
        console.error('创建播放器失败:', err);
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

      // 清理弹幕配置保存防抖定时器
      if (saveConfigTimeoutRef.current) {
        clearTimeout(saveConfigTimeoutRef.current);
      }

      // 清理弹幕配置更新防抖定时器
      if (configUpdateTimeoutRef.current) {
        clearTimeout(configUpdateTimeoutRef.current);
      }

      // 释放 Wake Lock
      releaseWakeLock();

      // 销毁播放器实例
      cleanupPlayer();
    };
  }, []);

  if (loading) {
    return (
      <PageLayout>
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
      <PageLayout>
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
    <PageLayout>
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
          {/* 折叠控制 - 仅在 lg 及以上屏幕显示 */}
          <div className='hidden lg:flex justify-end'>
            <button
              onClick={() =>
                setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)
              }
              className='group relative flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-200'
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
              <h1 className='text-3xl font-bold mb-2 tracking-wide flex items-center flex-shrink-0 text-center md:text-left w-full'>
                {videoTitle || '影片标题'}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite();
                  }}
                  className='ml-3 flex-shrink-0 hover:opacity-80 transition-opacity'
                >
                  <FavoriteIcon filled={favorited} />
                </button>
              </h1>

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

              {/* 豆瓣详细信息 */}
              {videoDoubanId && videoDoubanId !== 0 && (
                <div className='mb-4 flex-shrink-0'>
                  {loadingMovieDetails && !movieDetails && (
                    <div className='animate-pulse'>
                      <div className='h-4 bg-gray-300 rounded w-64 mb-2'></div>
                      <div className='h-4 bg-gray-300 rounded w-48'></div>
                    </div>
                  )}

                  {movieDetails && (
                    <div className='space-y-2 text-sm'>
                      {/* 豆瓣评分 */}
                      {movieDetails.rate && (
                        <div className='flex items-center gap-2'>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>豆瓣评分: </span>
                          <div className='flex items-center'>
                            <span className='text-yellow-600 dark:text-yellow-400 font-bold text-base'>
                              {movieDetails.rate}
                            </span>
                            <div className='flex ml-1'>
                              {[...Array(5)].map((_, i) => (
                                <svg
                                  key={i}
                                  className={`w-3 h-3 ${i < Math.floor(parseFloat(movieDetails.rate) / 2)
                                    ? 'text-yellow-500'
                                    : 'text-gray-300 dark:text-gray-600'
                                    }`}
                                  fill='currentColor'
                                  viewBox='0 0 20 20'
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
                          <span key={index} className='bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full text-xs'>
                            {country}
                          </span>
                        ))}
                        {movieDetails.languages && movieDetails.languages.slice(0, 2).map((language: string, index: number) => (
                          <span key={index} className='bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-2 py-1 rounded-full text-xs'>
                            {language}
                          </span>
                        ))}
                        {movieDetails.episodes && (
                          <span className='bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-1 rounded-full text-xs'>
                            共{movieDetails.episodes}集
                          </span>
                        )}
                        {movieDetails.episode_length && (
                          <span className='bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 px-2 py-1 rounded-full text-xs'>
                            单集{movieDetails.episode_length}分钟
                          </span>
                        )}
                        {movieDetails.movie_duration && (
                          <span className='bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 px-2 py-1 rounded-full text-xs'>
                            {movieDetails.movie_duration}分钟
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* 剧情简介 */}
              {detail?.desc && (
                <div
                  className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {detail.desc}
                </div>
              )}
            </div>
          </div>

          {/* 封面展示 */}
          <div className='hidden md:block md:col-span-1 md:order-first'>
            <div className='pl-0 py-4 pr-6'>
              <div className='relative bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden'>
                {videoCover ? (
                  <>
                    <img
                      src={processImageUrl(videoCover)}
                      alt={videoTitle}
                      className='w-full h-full object-cover'
                    />

                    {/* 豆瓣链接按钮 */}
                    {videoDoubanId !== 0 && (
                      <a
                        href={`https://movie.douban.com/subject/${videoDoubanId.toString()}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='absolute top-3 left-3'
                      >
                        <div className='bg-green-500 text-white text-xs font-bold w-8 h-8 rounded-full flex items-center justify-center shadow-md hover:bg-green-600 hover:scale-[1.1] transition-all duration-300 ease-out'>
                          <svg
                            width='16'
                            height='16'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
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
