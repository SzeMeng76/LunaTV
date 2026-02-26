/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

/// <reference types="@webgpu/types" />

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Hls from 'hls.js';
import { Heart, ChevronUp, Download, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useDownload } from '@/contexts/DownloadContext';
import { useDanmu } from '@/hooks/useDanmu';
import type { DanmuManualOverride } from '@/hooks/useDanmu';
import DownloadEpisodeSelector from '@/components/download/DownloadEpisodeSelector';
import DanmuManualMatchModal, { type DanmuManualSelection } from '@/components/DanmuManualMatchModal';
import EpisodeSelector from '@/components/EpisodeSelector';
import NetDiskSearchResults from '@/components/NetDiskSearchResults';
import AcgSearch from '@/components/AcgSearch';
import PageLayout from '@/components/PageLayout';
import SkipController, { SkipSettingsButton } from '@/components/SkipController';
import VideoCard from '@/components/VideoCard';
import CommentSection from '@/components/play/CommentSection';
import DownloadButtons from '@/components/play/DownloadButtons';
import FavoriteButton from '@/components/play/FavoriteButton';
import NetDiskButton from '@/components/play/NetDiskButton';
import CollapseButton from '@/components/play/CollapseButton';
import BackToTopButton from '@/components/play/BackToTopButton';
import LoadingScreen from '@/components/play/LoadingScreen';
import VideoInfoSection from '@/components/play/VideoInfoSection';
import VideoLoadingOverlay from '@/components/play/VideoLoadingOverlay';
import WatchRoomSyncBanner from '@/components/play/WatchRoomSyncBanner';
import SourceSwitchDialog from '@/components/play/SourceSwitchDialog';
import OwnerChangeDialog from '@/components/play/OwnerChangeDialog';
import VideoCoverDisplay from '@/components/play/VideoCoverDisplay';
import PlayErrorDisplay from '@/components/play/PlayErrorDisplay';
import DanmuSettingsPanel from '@/components/play/DanmuSettingsPanel';
import WebSRSettingsPanel from '@/components/play/WebSRSettingsPanel';
import artplayerPluginChromecast from '@/lib/artplayer-plugin-chromecast';
import artplayerPluginLiquidGlass from '@/lib/artplayer-plugin-liquid-glass';
import { ClientCache } from '@/lib/client-cache';
import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  getAllFavorites,
  getAllPlayRecords,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanDetails, getDoubanComments, getDoubanActorMovies } from '@/lib/douban.client';
import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';
import { useWatchRoomContextSafe } from '@/components/WatchRoomProvider';
import { useWatchRoomSync } from './hooks/useWatchRoomSync';
import {
  useSavePlayRecordMutation,
  useSaveFavoriteMutation,
  useDeleteFavoriteMutation,
} from './hooks/usePlayPageMutations';
import {
  useDoubanDetailsQuery,
  useDoubanCommentsQuery,
} from './hooks/usePlayPageQueries';
import {
  usePrefetchNextEpisode,
  usePrefetchDoubanData,
} from './hooks/usePlayPagePrefetch';

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
  const { createTask, setShowDownloadPanel } = useDownload();
  const watchRoom = useWatchRoomContextSafe();

  // TanStack Query mutations
  const savePlayRecordMutation = useSavePlayRecordMutation();
  const saveFavoriteMutation = useSaveFavoriteMutation();
  const deleteFavoriteMutation = useDeleteFavoriteMutation();

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

  // 测速进度状态
  const [speedTestProgress, setSpeedTestProgress] = useState<{
    current: number;
    total: number;
    currentSource: string;
    result?: string;
  } | null>(null);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);

  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  // bangumi详情状态
  const [bangumiDetails, setBangumiDetails] = useState<any>(null);
  const [loadingBangumiDetails, setLoadingBangumiDetails] = useState(false);

  // 短剧详情状态（用于显示简介等信息）
  const [shortdramaDetails, setShortdramaDetails] = useState<any>(null);
  const [loadingShortdramaDetails, setLoadingShortdramaDetails] = useState(false);

  // 网盘搜索状态
  const [netdiskResults, setNetdiskResults] = useState<{ [key: string]: any[] } | null>(null);
  const [netdiskLoading, setNetdiskLoading] = useState(false);
  const [netdiskError, setNetdiskError] = useState<string | null>(null);
  const [netdiskTotal, setNetdiskTotal] = useState(0);
  const [showNetdiskModal, setShowNetdiskModal] = useState(false);
  const [netdiskResourceType, setNetdiskResourceType] = useState<'netdisk' | 'acg'>('netdisk'); // 资源类型

  // ACG 动漫磁力搜索状态
  const [acgTriggerSearch, setAcgTriggerSearch] = useState<boolean>();

  // 演员作品状态
  const [selectedCelebrityName, setSelectedCelebrityName] = useState<string | null>(null);
  const [celebrityWorks, setCelebrityWorks] = useState<any[]>([]);
  const [loadingCelebrityWorks, setLoadingCelebrityWorks] = useState(false);

  // SkipController 相关状态
  const [isSkipSettingOpen, setIsSkipSettingOpen] = useState(false);
  const [currentPlayTime, setCurrentPlayTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // 弹幕设置面板状态
  const [isDanmuSettingsPanelOpen, setIsDanmuSettingsPanelOpen] = useState(false);
  const [isDanmuManualModalOpen, setIsDanmuManualModalOpen] = useState(false);
  const [manualDanmuOverrides, setManualDanmuOverrides] = useState<Record<string, DanmuManualSelection>>({});
  const [, setDanmuSettingsVersion] = useState(0);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // WebSR 设置面板状态
  const [isWebSRSettingsPanelOpen, setIsWebSRSettingsPanelOpen] = useState(false);

  // 下载选集面板状态
  const [showDownloadEpisodeSelector, setShowDownloadEpisodeSelector] = useState(false);

  // 下载功能启用状态
  const [downloadEnabled, setDownloadEnabled] = useState(true);

  // 视频分辨率状态
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);

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

  // 自定义去广告代码
  const [customAdFilterCode, setCustomAdFilterCode] = useState<string>('');
  const [customAdFilterVersion, setCustomAdFilterVersion] = useState<number>(1);
  const customAdFilterCodeRef = useRef(customAdFilterCode);


  // WebSR超分相关状态
  const [webGPUSupported, setWebGPUSupported] = useState<boolean>(false);
  const [websrEnabled, setWebsrEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('websr_enabled') === 'true';
    }
    return false;
  });
  const [websrMode, setWebsrMode] = useState<'upscale' | 'restore'>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('websr_mode');
      if (v === 'restore') return 'restore';
    }
    return 'upscale';
  });
  const [websrContentType, setWebsrContentType] = useState<'an' | 'rl' | '3d'>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('websr_content_type');
      if (v === 'rl' || v === '3d') return v;
    }
    return 'an';
  });
  const [websrNetworkSize, setWebsrNetworkSize] = useState<'s' | 'm' | 'l'>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('websr_network_size');
      if (v === 'm' || v === 'l') return v;
    }
    return 's';
  });
  const [websrCompareEnabled, setWebsrCompareEnabled] = useState(false);
  const [websrComparePosition, setWebsrComparePosition] = useState(50);

  const websrRef = useRef<{
    instance: any;
    gpu: GPUDevice | null;
    canvas: HTMLCanvasElement | null;
    weightsCache: Map<string, any>;
    isActive: boolean;
    renderLoopActive: boolean;
  }>({
    instance: null,
    gpu: null,
    canvas: null,
    weightsCache: new Map(),
    isActive: false,
    renderLoopActive: false,
  });

  const websrEnabledRef = useRef(websrEnabled);
  const websrModeRef = useRef(websrMode);
  const websrContentTypeRef = useRef(websrContentType);
  const websrNetworkSizeRef = useRef(websrNetworkSize);
  const netdiskModalContentRef = useRef<HTMLDivElement>(null);

  // 获取服务器配置（下载功能开关）
  useEffect(() => {
    const fetchServerConfig = async () => {
      try {
        const response = await fetch('/api/server-config');
        if (response.ok) {
          const config = await response.json();
          setDownloadEnabled(config.DownloadEnabled ?? true);
        }
      } catch (error) {
        console.error('获取服务器配置失败:', error);
        // 出错时默认启用下载功能
        setDownloadEnabled(true);
      }
    };
    fetchServerConfig();
  }, []);

  useEffect(() => {
    websrEnabledRef.current = websrEnabled;
    websrModeRef.current = websrMode;
    websrContentTypeRef.current = websrContentType;
    websrNetworkSizeRef.current = websrNetworkSize;
  }, [websrEnabled, websrMode, websrContentType, websrNetworkSize]);

  // 获取 HLS 缓冲配置（根据用户设置的模式）
  const getHlsBufferConfig = () => {
    const mode =
      typeof window !== 'undefined'
        ? localStorage.getItem('playerBufferMode') || 'standard'
        : 'standard';

    switch (mode) {
      case 'enhanced':
        // 增强模式：1.5 倍缓冲
        return {
          maxBufferLength: 45, // 45s（默认30s × 1.5）
          backBufferLength: 45,
          maxBufferSize: 90 * 1000 * 1000, // 90MB
        };
      case 'max':
        // 强力模式：3 倍缓冲
        return {
          maxBufferLength: 90, // 90s（默认30s × 3）
          backBufferLength: 60,
          maxBufferSize: 180 * 1000 * 1000, // 180MB
        };
      case 'standard':
      default:
        // 默认模式
        return {
          maxBufferLength: 30,
          backBufferLength: 30,
          maxBufferSize: 60 * 1000 * 1000, // 60MB
        };
    }
  };

  // 视频基本信息
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  const [videoDoubanId, setVideoDoubanId] = useState(
    parseInt(searchParams.get('douban_id') || '0') || 0
  );

  // TanStack Query queries - 豆瓣详情和评论（依赖 videoDoubanId）
  const {
    data: movieDetails,
    status: movieDetailsStatus,
    error: movieDetailsError,
  } = useDoubanDetailsQuery(videoDoubanId);

  const {
    data: movieComments,
    status: commentsStatus,
    error: commentsError,
  } = useDoubanCommentsQuery(videoDoubanId);

  // 兼容旧代码的 loading 状态
  const loadingMovieDetails = movieDetailsStatus === 'pending';
  const loadingComments = commentsStatus === 'pending';

  // 当前源和ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 解析 source 参数以获取 embyKey（仅用于 API 调用）
  const parseSourceForApi = (source: string): { source: string; embyKey?: string } => {
    if (source.startsWith('emby_')) {
      const key = source.substring(5);
      return { source: 'emby', embyKey: key };
    }
    return { source };
  };

  // 短剧ID（用于获取详情显示，不影响源搜索）
  const [shortdramaId] = useState(searchParams.get('shortdrama_id') || '');

  // 搜索所需信息
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(() => {
    // 从 URL 读取初始集数
    const indexParam = searchParams.get('index');
    return indexParam ? parseInt(indexParam, 10) : 0;
  });

  // 监听 URL index 参数变化（观影室切集同步）
  useEffect(() => {
    const indexParam = searchParams.get('index');
    const newIndex = indexParam ? parseInt(indexParam, 10) : 0;
    if (newIndex !== currentEpisodeIndex) {
      console.log('[PlayPage] URL index changed, updating episode:', newIndex);
      setCurrentEpisodeIndex(newIndex);
    }
  }, [searchParams]);

  // 重新加载触发器（用于触发 initAll 重新执行）
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const reloadFlagRef = useRef<string | null>(null);

  // 监听 URL source/id 参数变化（观影室切换源同步）
  useEffect(() => {
    const newSource = searchParams.get('source') || '';
    const newId = searchParams.get('id') || '';
    const newIndex = parseInt(searchParams.get('index') || '0');
    const newTime = parseInt(searchParams.get('t') || '0');
    const reloadFlag = searchParams.get('_reload');

    // 如果 source 或 id 变化，且有 _reload 标记，且不是已经处理过的reload
    if (reloadFlag && reloadFlag !== reloadFlagRef.current && (newSource !== currentSource || newId !== currentId)) {
      console.log('[PlayPage] URL source/id changed with reload flag, reloading:', { newSource, newId, newIndex, newTime });

      // 标记此reload已处理
      reloadFlagRef.current = reloadFlag;

      // 重置所有相关状态（但保留 detail，让 initAll 重新加载后再更新）
      setCurrentSource(newSource);
      setCurrentId(newId);
      setCurrentEpisodeIndex(newIndex);
      // 不清空 detail，避免触发 videoUrl 清空导致黑屏
      // setDetail(null);
      setError(null);
      setLoading(true);
      setNeedPrefer(false);
      setPlayerReady(false);

      // 触发重新加载（通过更新 reloadTrigger 来触发 initAll 重新执行）
      setReloadTrigger(prev => prev + 1);
    }
  }, [searchParams, currentSource, currentId]);

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

  // ArtPlayer ref
  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);

  // 🚀 使用 useDanmu Hook 管理弹幕
  const danmuScopeKey = `${videoTitle}_${videoYear}_${videoDoubanId}_${currentEpisodeIndex + 1}`;
  const activeManualDanmuOverride: DanmuManualOverride | null = manualDanmuOverrides[danmuScopeKey] || null;

  const {
    externalDanmuEnabled,
    setExternalDanmuEnabled,
    danmuList, // 弹幕列表state（用于显示弹幕数量）
    loading: danmuLoading, // 加载状态（state）
    loadMeta: danmuLoadMeta, // 加载元数据
    error: danmuError, // 错误状态
    loadExternalDanmu,
    handleDanmuOperationOptimized,
    externalDanmuEnabledRef,
    danmuLoadingRef,
    lastDanmuLoadKeyRef,
    danmuPluginStateRef,
  } = useDanmu({
    videoTitle,
    videoYear,
    videoDoubanId,
    currentEpisodeIndex,
    currentSource,
    artPlayerRef,
    manualOverride: activeManualDanmuOverride,
  });

  // ✅ 合并所有 ref 同步的 useEffect - 减少不必要的渲染
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
    customAdFilterCodeRef.current = customAdFilterCode;
    externalDanmuEnabledRef.current = externalDanmuEnabled;
    needPreferRef.current = needPrefer;
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
    videoDoubanIdRef.current = videoDoubanId;
    availableSourcesRef.current = availableSources;
  }, [
    blockAdEnabled,
    customAdFilterCode,
    externalDanmuEnabled,
    needPrefer,
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
    videoDoubanId,
    availableSources,
  ]);

  // 🎬 更新全屏标题层内容（集数变化时）
  // portalContainer 作为依赖确保 ArtPlayer 初始化后再执行
  useEffect(() => {
    if (!artPlayerRef.current) return;
    const titleLayer = artPlayerRef.current.layers['fullscreen-title'];
    if (!titleLayer) return;

    const episodeName = detail?.episodes_titles?.[currentEpisodeIndex] || '';
    const hasEpisodes = detail?.episodes && detail.episodes.length > 1;

    titleLayer.innerHTML = `
      <div class="fullscreen-title-container">
        <div class="fullscreen-title-content">
          <h1 class="fullscreen-title-text">${detail?.title || ''}</h1>
          ${hasEpisodes && episodeName
            ? `<span class="fullscreen-episode-text">${episodeName}</span>`
            : hasEpisodes
              ? `<span class="fullscreen-episode-text">第 ${currentEpisodeIndex + 1} 集</span>`
              : ''}
        </div>
      </div>
    `;
  }, [currentEpisodeIndex, detail, portalContainer]);

  // 获取自定义去广告代码
  useEffect(() => {
    const fetchAdFilterCode = async () => {
      try {
        // 从缓存读取去广告代码和版本号
        const cachedCode = localStorage.getItem('customAdFilterCode');
        const cachedVersion = localStorage.getItem('customAdFilterVersion');

        if (cachedCode && cachedVersion) {
          setCustomAdFilterCode(cachedCode);
          setCustomAdFilterVersion(parseInt(cachedVersion));
          console.log('使用缓存的去广告代码');
        }

        // 从 window.RUNTIME_CONFIG 获取版本号
        const version = (window as any).RUNTIME_CONFIG?.CUSTOM_AD_FILTER_VERSION || 0;

        // 如果版本号为 0，说明去广告未设置，清空缓存并跳过
        if (version === 0) {
          localStorage.removeItem('customAdFilterCode');
          localStorage.removeItem('customAdFilterVersion');
          setCustomAdFilterCode('');
          setCustomAdFilterVersion(0);
          return;
        }

        // 如果缓存版本号与服务器版本号不一致，获取最新代码
        if (!cachedVersion || parseInt(cachedVersion) !== version) {
          console.log('检测到去广告代码更新（版本 ' + version + '），获取最新代码');

          // 获取完整代码
          const fullResponse = await fetch('/api/ad-filter?full=true');
          if (!fullResponse.ok) {
            console.warn('获取完整去广告代码失败，使用缓存');
            return;
          }

          const { code, version: newVersion } = await fullResponse.json();

          // 更新缓存和状态
          localStorage.setItem('customAdFilterCode', code || '');
          localStorage.setItem('customAdFilterVersion', String(newVersion || 0));
          setCustomAdFilterCode(code || '');
          setCustomAdFilterVersion(newVersion || 0);

          console.log('去广告代码已更新到版本 ' + newVersion);
        }
      } catch (error) {
        console.error('获取自定义去广告代码失败:', error);
      }
    };

    fetchAdFilterCode();
  }, []);

  // WebGPU支持检测
  useEffect(() => {
    const checkWebGPUSupport = async () => {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        setWebGPUSupported(false);
        console.log('WebGPU不支持：浏览器不支持WebGPU API');
        return;
      }

      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (!adapter) {
          setWebGPUSupported(false);
          console.log('WebGPU不支持：无法获取GPU适配器');
          return;
        }

        setWebGPUSupported(true);
        console.log('WebGPU支持检测：✅ 支持');
      } catch (err) {
        setWebGPUSupported(false);
        console.log('WebGPU不支持：检测失败', err);
      }
    };

    checkWebGPUSupport();
  }, []);

  // WebSR 启用/禁用生命周期
  useEffect(() => {
    if (!websrEnabled || !webGPUSupported || !artPlayerRef.current?.video) {
      destroyWebSR();
      return;
    }

    const video = artPlayerRef.current.video as HTMLVideoElement;

    const waitForVideo = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        initWebSR();
      } else {
        const handler = () => {
          video.removeEventListener('loadedmetadata', handler);
          initWebSR();
        };
        video.addEventListener('loadedmetadata', handler);
      }
    };

    waitForVideo();

    return () => {
      destroyWebSR();
    };
  }, [websrEnabled, webGPUSupported]);

  // WebSR 配置变化（模式/网络大小/内容类型）
  useEffect(() => {
    if (!websrRef.current.isActive) return;
    switchWebSRConfig();
  }, [websrMode, websrNetworkSize, websrContentType]);

  // WebSR 对比模式
  useEffect(() => {
    if (!websrRef.current.canvas || !artPlayerRef.current?.video) return;

    const canvas = websrRef.current.canvas;
    const video = artPlayerRef.current.video as HTMLVideoElement;

    if (websrCompareEnabled) {
      canvas.style.clipPath = `inset(0 0 0 ${websrComparePosition}%)`;
      video.style.opacity = '1';
      video.style.clipPath = `inset(0 ${100 - websrComparePosition}% 0 0)`;
    } else {
      canvas.style.clipPath = '';
      video.style.opacity = '0';
      video.style.clipPath = '';
    }
  }, [websrCompareEnabled, websrComparePosition]);

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
      }
      // 🚀 TanStack Query 会自动加载豆瓣详情和评论，无需手动 useEffect
    };

    loadMovieDetails();
  }, [videoDoubanId, loadingBangumiDetails, bangumiDetails]);

  // 🚀 豆瓣评论由 useDoubanCommentsQuery 自动加载，无需手动 useEffect

  // 加载短剧详情（仅用于显示简介等信息，不影响源搜索）
  useEffect(() => {
    const loadShortdramaDetails = async () => {
      if (!shortdramaId || loadingShortdramaDetails || shortdramaDetails) {
        return;
      }

      setLoadingShortdramaDetails(true);
      try {
        // 传递 name 参数以支持备用API fallback
        const dramaTitle = searchParams.get('title') || videoTitleRef.current || '';
        const titleParam = dramaTitle ? `&name=${encodeURIComponent(dramaTitle)}` : '';
        const response = await fetch(`/api/shortdrama/detail?id=${shortdramaId}&episode=1${titleParam}`);
        if (response.ok) {
          const data = await response.json();
          setShortdramaDetails(data);
        }
      } catch (error) {
        console.error('Failed to load shortdrama details:', error);
      } finally {
        setLoadingShortdramaDetails(false);
      }
    };

    loadShortdramaDetails();
  }, [shortdramaId, loadingShortdramaDetails, shortdramaDetails]);

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
  const [backgroundSourcesLoading, setBackgroundSourcesLoading] = useState(false);

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

  // 🚀 连续切换源防抖和资源管理
  const episodeSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSourceChangingRef = useRef<boolean>(false); // 标记是否正在换源
  const isEpisodeChangingRef = useRef<boolean>(false); // 标记是否正在切换集数
  const isSkipControllerTriggeredRef = useRef<boolean>(false); // 标记是否通过 SkipController 触发了下一集
  const videoEndedHandledRef = useRef<boolean>(false); // 🔥 标记当前视频的 video:ended 事件是否已经被处理过（防止多个监听器重复触发）

  // 🚀 新增：连续切换源防抖和资源管理
  const sourceSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSwitchRef = useRef<any>(null); // 保存待处理的切换请求
  const switchPromiseRef = useRef<Promise<void> | null>(null); // 当前切换的Promise

  // 播放器就绪状态
  const [playerReady, setPlayerReady] = useState(false);

  // Wake Lock 相关
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // 观影室同步
  const {
    isInRoom: isInWatchRoom,
    isOwner: isWatchRoomOwner,
    syncPaused,
    pauseSync,
    resumeSync,
    isSameVideoAsOwner,
    pendingOwnerChange,
    confirmFollowOwner,
    rejectFollowOwner,
    showSourceSwitchDialog,
    pendingOwnerState,
    handleConfirmSourceSwitch,
    handleCancelSourceSwitch,
  } = useWatchRoomSync({
    watchRoom,
    artPlayerRef,
    detail,
    episodeIndex: currentEpisodeIndex,
    playerReady,
    videoId: currentId,  // 传入URL参数的id
    currentSource: currentSource,  // 传入当前播放源
    videoTitle: videoTitle,  // 传入视频标题（来自 state，初始值来自 URL）
    videoYear: videoYear,  // 传入视频年份（来自 state，初始值来自 URL）
    videoDoubanId: videoDoubanId,  // 传入豆瓣ID
    searchTitle: searchTitle,  // 传入搜索标题
    setCurrentEpisodeIndex,  // 传入切换集数的函数
  });

  // 🚀 数据预取 - 下一集预取（当播放进度达到80%时）
  usePrefetchNextEpisode({
    detail,
    currentEpisodeIndex,
    currentTime: currentPlayTime,
    duration: videoDuration,
    source: currentSource,
    id: currentId,
  });

  // 🚀 数据预取 - 豆瓣数据预取（当视频加载时）
  usePrefetchDoubanData({
    videoDoubanId: videoDoubanId ? String(videoDoubanId) : null,
    enabled: !!videoDoubanId,
  });

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
      const response = await fetch(`/api/proxy/bangumi?path=v0/subjects/${bangumiId}`);
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

    // 3. 添加数字变体处理（处理"第X季" <-> "X" 的转换）
    const numberVariants = generateNumberVariants(trimmed);
    numberVariants.forEach(variant => {
      if (!variants.includes(variant)) {
        variants.push(variant);
      }
    });

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

  /**
   * 生成数字变体的搜索变体（处理"第X季" <-> "X"的转换）
   * 优化：只生成最有可能匹配的前2-3个变体
   * @param query 原始查询
   * @returns 数字变体数组（按优先级排序）
   */
  const generateNumberVariants = (query: string): string[] => {
    const variants: string[] = [];

    // 中文数字到阿拉伯数字的映射
    const chineseNumbers: { [key: string]: string } = {
      '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
      '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
    };

    // 1. 处理"第X季/部/集"格式（最常见的情况）
    const seasonPattern = /第([一二三四五六七八九十\d]+)(季|部|集|期)/;
    const match = seasonPattern.exec(query);

    if (match) {
      const fullMatch = match[0];
      const number = match[1];
      const suffix = match[2];
      const arabicNumber = chineseNumbers[number] || number;
      const base = query.replace(fullMatch, '').trim();

      if (base) {
        // 只生成最常见的格式：无空格，如"一拳超人3"
        // 不生成"一拳超人 3"和"一拳超人S3"等变体，避免匹配太多不相关结果
        variants.push(`${base}${arabicNumber}`);
      }
    }

    // 2. 处理末尾纯数字（如"牧神记3"）
    const endNumberMatch = query.match(/^(.+?)\s*(\d+)$/);
    if (endNumberMatch) {
      const base = endNumberMatch[1].trim();
      const number = endNumberMatch[2];
      const chineseNum = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][parseInt(number)];

      if (chineseNum && parseInt(number) <= 10) {
        // 只生成无空格带"第X季"的变体，如"牧神记第三季"
        variants.push(`${base}第${chineseNum}季`);
      }
    }

    // 限制返回前1个最有可能的变体
    return variants.slice(0, 1);
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

  // 处理演员点击事件
  const handleCelebrityClick = async (celebrityName: string) => {
    // 如果点击的是已选中的演员，则收起
    if (selectedCelebrityName === celebrityName) {
      setSelectedCelebrityName(null);
      setCelebrityWorks([]);
      return;
    }

    setSelectedCelebrityName(celebrityName);
    setLoadingCelebrityWorks(true);
    setCelebrityWorks([]);

    try {
      // 检查缓存
      const cacheKey = `douban-celebrity-${celebrityName}`;
      const cached = await ClientCache.get(cacheKey);

      if (cached) {
        console.log(`演员作品缓存命中: ${celebrityName}`);
        setCelebrityWorks(cached);
        setLoadingCelebrityWorks(false);
        return;
      }

      console.log('搜索演员作品:', celebrityName);

      // 三级 fallback：豆瓣通用搜索 -> 豆瓣API -> TMDB
      let works: any[] = [];
      let source = '';

      // 1. 豆瓣通用搜索（主用，数据最全）
      try {
        const response = await fetch(`/api/douban/celebrity-works?name=${encodeURIComponent(celebrityName)}&limit=20`);
        const data = await response.json();
        if (data.success && data.works && data.works.length > 0) {
          works = data.works;
          source = 'douban-search';
          console.log(`找到 ${works.length} 部 ${celebrityName} 的作品（豆瓣通用搜索）`);
        }
      } catch (e) {
        console.warn('豆瓣通用搜索失败:', e);
      }

      // 2. 豆瓣 API（备用）
      if (works.length === 0) {
        console.log('豆瓣通用搜索无结果，尝试豆瓣API...');
        try {
          const apiResponse = await fetch(`/api/douban/celebrity-works?name=${encodeURIComponent(celebrityName)}&limit=20&mode=api`);
          const apiData = await apiResponse.json();
          if (apiData.success && apiData.works && apiData.works.length > 0) {
            works = apiData.works;
            source = 'douban-api';
            console.log(`找到 ${works.length} 部 ${celebrityName} 的作品（豆瓣API）`);
          }
        } catch (e) {
          console.warn('豆瓣API搜索失败:', e);
        }
      }

      // 3. TMDB（最后 fallback）
      if (works.length === 0) {
        console.log('豆瓣无结果，尝试TMDB...');
        try {
          const tmdbResponse = await fetch(`/api/tmdb/actor?actor=${encodeURIComponent(celebrityName)}&type=movie&limit=20`);
          const tmdbResult = await tmdbResponse.json();
          if (tmdbResult.code === 200 && tmdbResult.list && tmdbResult.list.length > 0) {
            works = tmdbResult.list.map((work: any) => ({
              ...work,
              source: 'tmdb'
            }));
            source = 'tmdb';
            console.log(`找到 ${works.length} 部 ${celebrityName} 的作品（TMDB）`);
          }
        } catch (e) {
          console.warn('TMDB搜索失败:', e);
        }
      }

      if (works.length > 0) {
        await ClientCache.set(cacheKey, works, 2 * 60 * 60);
        setCelebrityWorks(works);
        console.log(`演员作品已缓存: ${celebrityName} (${source})`);
      } else {
        console.log('所有源均未找到相关作品');
        setCelebrityWorks([]);
      }
    } catch (error) {
      console.error('获取演员作品出错:', error);
      setCelebrityWorks([]);
    } finally {
      setLoadingCelebrityWorks(false);
    }
  };

  // 获取源权重映射
  const fetchSourceWeights = async (): Promise<Record<string, number>> => {
    try {
      const response = await fetch('/api/source-weights');
      if (!response.ok) {
        console.warn('获取源权重失败，使用默认权重');
        return {};
      }
      const data = await response.json();
      return data.weights || {};
    } catch (error) {
      console.warn('获取源权重失败:', error);
      return {};
    }
  };

  // 按权重排序源（权重高的在前）
  const sortSourcesByWeight = (sources: SearchResult[], weights: Record<string, number>): SearchResult[] => {
    return [...sources].sort((a, b) => {
      const weightA = weights[a.source] ?? 50;
      const weightB = weights[b.source] ?? 50;
      return weightB - weightA; // 降序排列，权重高的在前
    });
  };

  // 设置可用源列表（先按权重排序）
  const setAvailableSourcesWithWeight = async (sources: SearchResult[]): Promise<SearchResult[]> => {
    if (sources.length <= 1) {
      setAvailableSources(sources);
      return sources;
    }
    const weights = await fetchSourceWeights();
    const sortedSources = sortSourcesByWeight(sources, weights);
    console.log('按权重排序可用源:', sortedSources.map(s => `${s.source_name}(${weights[s.source] ?? 50})`).slice(0, 5), '...');
    setAvailableSources(sortedSources);
    return sortedSources;
  };

  // 播放源优选函数（针对旧iPad做极端保守优化）
  const preferBestSource = async (
    sources: SearchResult[]
  ): Promise<SearchResult> => {
    if (sources.length === 1) return sources[0];

    // 🎯 获取源权重并按权重排序
    const weights = await fetchSourceWeights();
    const weightedSources = sortSourcesByWeight(sources, weights);
    console.log('按权重排序后的源:', weightedSources.map(s => `${s.source_name}(${weights[s.source] ?? 50})`));

    // 使用全局统一的设备检测结果
    const _isIPad = /iPad/i.test(userAgent) || (userAgent.includes('Macintosh') && navigator.maxTouchPoints >= 1);
    const _isIOS = isIOSGlobal;
    const isIOS13 = isIOS13Global;
    const isMobile = isMobileGlobal;

    // 如果是iPad或iOS13+（包括新iPad在桌面模式下），使用极简策略避免崩溃
    if (isIOS13) {
      console.log('检测到iPad/iOS13+设备，使用无测速优选策略避免崩溃');

      // 直接返回权重最高的源（已按权重排序）
      // 同时保留原来的源名称优先级作为备用排序
      const sourcePreference = [
        'ok', 'niuhu', 'ying', 'wasu', 'mgtv', 'iqiyi', 'youku', 'qq'
      ];

      const sortedSources = weightedSources.sort((a, b) => {
        // 首先按权重排序（已经排好了）
        const weightA = weights[a.source] ?? 50;
        const weightB = weights[b.source] ?? 50;
        if (weightA !== weightB) {
          return weightB - weightA;
        }

        // 权重相同时，按源名称优先级排序
        const aIndex = sourcePreference.findIndex(name =>
          a.source_name?.toLowerCase().includes(name)
        );
        const bIndex = sourcePreference.findIndex(name =>
          b.source_name?.toLowerCase().includes(name)
        );

        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;

        return 0;
      });

      console.log('iPad/iOS13+优选结果:', sortedSources.map(s => s.source_name));
      return sortedSources[0];
    }

    // 移动设备使用轻量级测速（仅ping，不创建HLS）
    if (isMobile) {
      console.log('移动设备使用轻量级优选');
      return await lightweightPreference(weightedSources, weights);
    }

    // 桌面设备使用原来的测速方法（控制并发）
    return await fullSpeedTest(weightedSources, weights);
  };

  // 轻量级优选：仅测试连通性，不创建video和HLS
  const lightweightPreference = async (sources: SearchResult[], weights: Record<string, number> = {}): Promise<SearchResult> => {
    console.log('开始轻量级测速，仅测试连通性');

    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          if (!source.episodes || source.episodes.length === 0) {
            return { source, pingTime: 9999, available: false, weight: weights[source.source] ?? 50 };
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
            available: true,
            weight: weights[source.source] ?? 50
          };
        } catch (error) {
          console.warn(`轻量级测速失败: ${source.source_name}`, error);
          return { source, pingTime: 9999, available: false, weight: weights[source.source] ?? 50 };
        }
      })
    );

    // 按权重分组，在同权重组内按ping时间排序
    const sortedResults = results
      .filter(r => r.available)
      .sort((a, b) => {
        // 首先按权重降序
        if (a.weight !== b.weight) {
          return b.weight - a.weight;
        }
        // 同权重按ping时间升序
        return a.pingTime - b.pingTime;
      });

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
  const fullSpeedTest = async (sources: SearchResult[], weights: Record<string, number> = {}): Promise<SearchResult> => {
    // 桌面设备使用小批量并发，避免创建过多实例
    const concurrency = 3;
    // 限制最大测试数量为20个源（平衡速度和覆盖率）
    const maxTestCount = 20;
    const topPriorityCount = 5; // 前5个优先级最高的源（已按权重排序）

    // 🎯 混合策略：前5个（高权重）+ 随机15个
    let sourcesToTest: SearchResult[];
    if (sources.length <= maxTestCount) {
      // 如果源总数不超过20个，全部测试
      sourcesToTest = sources;
    } else {
      // 保留前5个（已按权重排序，权重最高的在前）
      const prioritySources = sources.slice(0, topPriorityCount);

      // 从剩余源中随机选择15个
      const remainingSources = sources.slice(topPriorityCount);
      const shuffled = remainingSources.sort(() => 0.5 - Math.random());
      const randomSources = shuffled.slice(0, maxTestCount - topPriorityCount);

      sourcesToTest = [...prioritySources, ...randomSources];
    }

    console.log(`开始测速: 共${sources.length}个源，将测试前${topPriorityCount}个高权重源 + 随机${sourcesToTest.length - Math.min(topPriorityCount, sources.length)}个 = ${sourcesToTest.length}个`);

    const allResults: Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    } | null> = [];

    let shouldStop = false; // 早停标志
    let testedCount = 0; // 已测试数量

    for (let i = 0; i < sourcesToTest.length && !shouldStop; i += concurrency) {
      const batch = sourcesToTest.slice(i, i + concurrency);
      console.log(`测速批次 ${Math.floor(i/concurrency) + 1}/${Math.ceil(sourcesToTest.length/concurrency)}: ${batch.length} 个源`);

      const batchResults = await Promise.all(
        batch.map(async (source, batchIndex) => {
          try {
            // 更新进度：显示当前正在测试的源
            const currentIndex = i + batchIndex + 1;
            setSpeedTestProgress({
              current: currentIndex,
              total: sourcesToTest.length,
              currentSource: source.source_name,
            });

            if (!source.episodes || source.episodes.length === 0) {
              return null;
            }

            const episodeUrl = source.episodes.length > 1
              ? source.episodes[1]
              : source.episodes[0];

            const testResult = await getVideoResolutionFromM3u8(episodeUrl);

            // 更新进度：显示测试结果
            setSpeedTestProgress({
              current: currentIndex,
              total: sourcesToTest.length,
              currentSource: source.source_name,
              result: `${testResult.quality} | ${testResult.loadSpeed} | ${testResult.pingTime}ms`,
            });

            return { source, testResult };
          } catch (error) {
            console.warn(`测速失败: ${source.source_name}`, error);

            // 更新进度：显示失败
            const currentIndex = i + batchIndex + 1;
            setSpeedTestProgress({
              current: currentIndex,
              total: sourcesToTest.length,
              currentSource: source.source_name,
              result: '测速失败',
            });

            return null;
          }
        })
      );

      allResults.push(...batchResults);
      testedCount += batch.length;

      // 🎯 保守策略早停判断：找到高质量源
      const successfulInBatch = batchResults.filter(Boolean) as Array<{
        source: SearchResult;
        testResult: { quality: string; loadSpeed: string; pingTime: number };
      }>;

      for (const result of successfulInBatch) {
        const { quality, loadSpeed } = result.testResult;
        const speedMatch = loadSpeed.match(/^([\d.]+)\s*MB\/s$/);
        const speedMBps = speedMatch ? parseFloat(speedMatch[1]) : 0;

        // 🛑 保守策略：只有非常优质的源才早停
        const is4KHighSpeed = quality === '4K' && speedMBps >= 8;
        const is2KHighSpeed = quality === '2K' && speedMBps >= 6;

        if (is4KHighSpeed || is2KHighSpeed) {
          console.log(`✓ 找到顶级优质源: ${result.source.source_name} (${quality}, ${loadSpeed})，停止测速`);
          shouldStop = true;
          break;
        }
      }

      // 批次间延迟，让资源有时间清理（减少延迟时间）
      if (i + concurrency < sourcesToTest.length && !shouldStop) {
        await new Promise(resolve => setTimeout(resolve, 200));
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

    // 计算每个结果的评分（结合测速结果和权重）
    const resultsWithScore = successfulResults.map((result) => {
      const testScore = calculateSourceScore(
        result.testResult,
        maxSpeed,
        minPing,
        maxPing
      );
      const weight = weights[result.source.source] ?? 50;
      // 权重加成：权重每增加10分，总分增加5%
      // 例如：权重100的源比权重50的源，总分高出25%
      const weightBonus = 1 + (weight - 50) * 0.005;
      const finalScore = testScore * weightBonus;
      return {
        ...result,
        score: finalScore,
        testScore,
        weight,
      };
    });

    // 按综合评分排序，选择最佳播放源
    resultsWithScore.sort((a, b) => b.score - a.score);

    console.log('播放源评分排序结果（含权重加成）:');
    resultsWithScore.forEach((result, index) => {
      console.log(
        `${index + 1}. ${result.source.source_name
        } - 总分: ${result.score.toFixed(2)} (测速分: ${result.testScore.toFixed(2)}, 权重: ${result.weight}) [${result.testResult.quality}, ${result.testResult.loadSpeed
        }, ${result.testResult.pingTime}ms]`
      );
    });

    // 清除测速进度状态
    setSpeedTestProgress(null);

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
        // 添加剧名参数以支持备用API fallback
        const nameParam = detailData.drama_name ? `&name=${encodeURIComponent(detailData.drama_name)}` : '';
        const response = await fetch(
          `/api/shortdrama/parse?id=${videoId}&episode=${episode}${nameParam}`
        );

        if (response.ok) {
          const result = await response.json();
          const newUrl = result.url || '';
          if (newUrl !== videoUrl) {
            setVideoUrl(newUrl);
          }
        } else {
          // 读取API返回的错误信息
          try {
            const errorData = await response.json();
            setError(errorData.error || '短剧解析失败');
          } catch {
            setError('短剧解析失败');
          }
          setVideoUrl('');
        }
      } catch (err) {
        console.error('短剧URL解析失败:', err);
        setError('播放失败，请稍后再试');
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

  // 清理播放器资源的统一函数
  const cleanupPlayer = async () => {
    // 先清理WebSR，避免GPU纹理错误
    await destroyWebSR();

    // 清理集数切换定时器
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
        setPlayerReady(false); // 重置播放器就绪状态

        console.log('播放器资源已清理');
      } catch (err) {
        console.warn('清理播放器资源时出错:', err);
        // 即使出错也要确保引用被清空
        artPlayerRef.current = null;
        setPlayerReady(false); // 重置播放器就绪状态
      }
    }
  };

  // WebSR 辅助函数：获取网络名称
  const getWebsrNetworkName = (mode: 'upscale' | 'restore', size: 's' | 'm' | 'l'): any => {
    if (mode === 'restore') {
      return `anime4k/cnn-restore-${size}`;
    }
    return `anime4k/cnn-2x-${size}`;
  };

  // WebSR 辅助函数：获取权重文件名
  const getWebsrWeightFilename = (
    mode: 'upscale' | 'restore',
    size: 's' | 'm' | 'l',
    contentType: 'an' | 'rl' | '3d'
  ): string => {
    if (mode === 'restore') {
      return `cnn-restore-${size}-an.json`;
    }
    return `cnn-2x-${size}-${contentType}.json`;
  };

  // 初始化Anime4K超分
  const initWebSR = async () => {
    if (!artPlayerRef.current?.video) return;

    try {
      const video = artPlayerRef.current.video as HTMLVideoElement;

      // 等待视频尺寸就绪
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            video.removeEventListener('loadedmetadata', handler);
            resolve();
          };
          video.addEventListener('loadedmetadata', handler);
          if (video.videoWidth && video.videoHeight) {
            video.removeEventListener('loadedmetadata', handler);
            resolve();
          }
        });
      }

      if (!video.videoWidth || !video.videoHeight) {
        throw new Error('无法获取视频尺寸');
      }

      // 初始化 GPU（复用已有的或创建新的）
      if (!websrRef.current.gpu) {
        const { default: WebSR } = await import('@websr/websr');
        const gpu = await WebSR.initWebGPU();
        if (!gpu) {
          throw new Error('WebGPU 初始化失败');
        }
        websrRef.current.gpu = gpu;
      }

      // 创建 canvas
      const canvas = document.createElement('canvas');
      const scale = websrModeRef.current === 'upscale' ? 2 : 1;
      canvas.width = Math.floor(video.videoWidth * scale);
      canvas.height = Math.floor(video.videoHeight * scale);

      // Canvas 样式
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'contain';
      canvas.style.pointerEvents = 'none'; // 让点击穿透到 ArtPlayer
      canvas.style.zIndex = '1';

      // 插入 canvas
      const container = artPlayerRef.current.template.$video.parentElement;
      container.insertBefore(canvas, video);

      // 获取权重文件
      const weightFile = getWebsrWeightFilename(
        websrModeRef.current,
        websrNetworkSizeRef.current,
        websrContentTypeRef.current
      );

      let weights = websrRef.current.weightsCache.get(weightFile);
      if (!weights) {
        const response = await fetch(`/weights/anime4k/${weightFile}`);
        if (!response.ok) {
          throw new Error(`权重文件加载失败: ${weightFile}`);
        }
        weights = await response.json();
        websrRef.current.weightsCache.set(weightFile, weights);
      }

      // 创建 WebSR 实例
      const { default: WebSR } = await import('@websr/websr');
      const networkName = getWebsrNetworkName(websrModeRef.current, websrNetworkSizeRef.current);

      const websr = new WebSR({
        canvas: canvas,
        weights: weights,
        network_name: networkName,
        gpu: websrRef.current.gpu,
      });

      websrRef.current.instance = websr;
      websrRef.current.canvas = canvas;
      websrRef.current.isActive = true;
      websrRef.current.renderLoopActive = true;

      // 使用 requestVideoFrameCallback 手动渲染循环
      const renderFrame = () => {
        if (!websrRef.current.renderLoopActive || !websrRef.current.instance) return;
        websrRef.current.instance.render(video).then(() => {
          if (websrRef.current.renderLoopActive) {
            video.requestVideoFrameCallback(renderFrame);
          }
        }).catch((err: any) => {
          console.warn('WebSR render error:', err);
          if (websrRef.current.renderLoopActive) {
            video.requestVideoFrameCallback(renderFrame);
          }
        });
      };
      video.requestVideoFrameCallback(renderFrame);

      // 隐藏原始视频
      video.style.opacity = '0';
      video.style.position = 'absolute';

      const modeText = websrModeRef.current === 'upscale' ? '2x超分' : '降噪';
      const sizeText = { s: '快速', m: '标准', l: '高质' }[websrNetworkSizeRef.current];
      const typeText = { an: '动漫', rl: '真人', '3d': '3D' }[websrContentTypeRef.current];

      console.log(`WebSR已启用: ${modeText} | ${sizeText} | ${typeText}`);
      if (artPlayerRef.current) {
        artPlayerRef.current.notice.show = `超分已启用 (${modeText}, ${sizeText}, ${typeText})`;
      }
    } catch (err) {
      console.error('初始化WebSR失败:', err);
      if (artPlayerRef.current) {
        artPlayerRef.current.notice.show = '超分启用失败：' + (err instanceof Error ? err.message : '未知错误');
      }

      // 清理
      if (websrRef.current.canvas && websrRef.current.canvas.parentNode) {
        websrRef.current.canvas.parentNode.removeChild(websrRef.current.canvas);
      }
      if (artPlayerRef.current?.video) {
        artPlayerRef.current.video.style.opacity = '1';
        artPlayerRef.current.video.style.position = '';
      }
      websrRef.current.canvas = null;
      websrRef.current.instance = null;
      websrRef.current.isActive = false;
    }
  };

  // 销毁WebSR
  const destroyWebSR = async () => {
    const ref = websrRef.current;
    ref.isActive = false;
    ref.renderLoopActive = false;

    try {
      if (ref.instance) {
        await ref.instance.destroy();
        ref.instance = null;
      }

      if (ref.canvas && ref.canvas.parentNode) {
        ref.canvas.parentNode.removeChild(ref.canvas);
        ref.canvas = null;
      }

      if (artPlayerRef.current?.video) {
        artPlayerRef.current.video.style.opacity = '1';
        artPlayerRef.current.video.style.position = '';
      }

      console.log('WebSR已清理');
    } catch (err) {
      console.warn('清理WebSR时出错:', err);
    }
  };

  // 切换WebSR状态
  const toggleWebSR = async (enabled: boolean) => {
    try {
      if (enabled) {
        await initWebSR();
      } else {
        await destroyWebSR();
      }
      setWebsrEnabled(enabled);
      localStorage.setItem('websr_enabled', String(enabled));
    } catch (err) {
      console.error('切换超分状态失败:', err);
    }
  };

  // 切换WebSR配置（模式/网络大小/内容类型变化时）
  const switchWebSRConfig = async () => {
    if (!websrRef.current.isActive) return;

    try {
      // 如果 upscale <-> restore 切换，canvas 尺寸会变，需要完全重建
      const currentScale = websrRef.current.canvas ?
        (websrRef.current.canvas.width > (artPlayerRef.current?.video?.videoWidth || 0) ? 2 : 1) : 1;
      const newScale = websrModeRef.current === 'upscale' ? 2 : 1;

      if (currentScale !== newScale) {
        await destroyWebSR();
        await initWebSR();
        return;
      }

      // 否则热切换网络
      const networkName = getWebsrNetworkName(websrModeRef.current, websrNetworkSizeRef.current);
      const weightFile = getWebsrWeightFilename(
        websrModeRef.current,
        websrNetworkSizeRef.current,
        websrContentTypeRef.current
      );

      let weights = websrRef.current.weightsCache.get(weightFile);
      if (!weights) {
        const response = await fetch(`/weights/anime4k/${weightFile}`);
        if (!response.ok) throw new Error(`权重文件加载失败: ${weightFile}`);
        weights = await response.json();
        websrRef.current.weightsCache.set(weightFile, weights);
      }

      if (websrRef.current.instance && websrRef.current.instance.switchNetwork) {
        await websrRef.current.instance.switchNetwork(networkName, weights);

        if (artPlayerRef.current) {
          const modeText = websrModeRef.current === 'upscale' ? '2x超分' : '降噪';
          const sizeText = { s: '快速', m: '标准', l: '高质' }[websrNetworkSizeRef.current];
          const typeText = { an: '动漫', rl: '真人', '3d': '3D' }[websrContentTypeRef.current];
          artPlayerRef.current.notice.show = `已切换: ${modeText}, ${sizeText}, ${typeText}`;
        }
      }
    } catch (err) {
      console.error('切换WebSR配置失败:', err);
      // 失败时重建
      await destroyWebSR();
      await initWebSR();
    }
  };

  // 去广告相关函数
  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    // 如果有自定义去广告代码，优先使用
    const customCode = customAdFilterCodeRef.current;
    if (customCode && customCode.trim()) {
      try {
        // 移除 TypeScript 类型注解,转换为纯 JavaScript
        const jsCode = customCode
          .replace(/(\w+)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*([,)])/g, '$1$3')
          .replace(/\)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*\{/g, ') {')
          .replace(/(const|let|var)\s+(\w+)\s*:\s*(string|number|boolean|any|void|never|unknown|object)\s*=/g, '$1 $2 =');

        // 创建并执行自定义函数
        // eslint-disable-next-line no-new-func
        const customFunction = new Function('type', 'm3u8Content',
          jsCode + '\nreturn filterAdsFromM3U8(type, m3u8Content);'
        );
        const result = customFunction(currentSourceRef.current, m3u8Content);
        console.log('✅ 使用自定义去广告代码');
        return result;
      } catch (err) {
        console.error('执行自定义去广告代码失败,降级使用默认规则:', err);
        // 继续使用默认规则
      }
    }

    // 默认去广告规则
    if (!m3u8Content) return '';

    // 广告关键字列表
    const adKeywords = [
      'sponsor',
      '/ad/',
      '/ads/',
      'advert',
      'advertisement',
      '/adjump',
      'redtraffic'
    ];

    // 按行分割M3U8内容
    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // 跳过 #EXT-X-DISCONTINUITY 标识
      if (line.includes('#EXT-X-DISCONTINUITY')) {
        i++;
        continue;
      }

      // 如果是 EXTINF 行，检查下一行 URL 是否包含广告关键字
      if (line.includes('#EXTINF:')) {
        // 检查下一行 URL 是否包含广告关键字
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const containsAdKeyword = adKeywords.some(keyword =>
            nextLine.toLowerCase().includes(keyword.toLowerCase())
          );

          if (containsAdKeyword) {
            // 跳过 EXTINF 行和 URL 行
            i += 2;
            continue;
          }
        }
      }

      // 保留当前行
      filteredLines.push(line);
      i++;
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

          const result = await loadExternalDanmu(); // 这里会检查开关状态，返回 { count, data }
          console.log('🔄 集数变化后外部弹幕加载结果:', result.count, '条');

          // 再次确认插件状态
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

            if (result.count > 0) {
              console.log('✅ 向播放器插件重新加载弹幕数据:', result.count, '条');
              plugin.load(); // 清空已有弹幕
              plugin.load(result.data);

              // 恢复弹幕插件的状态
              if (danmuPluginStateRef.current) {
                if (!danmuPluginStateRef.current.isHide) {
                  plugin.show();
                }
              }

              if (artPlayerRef.current) {
                artPlayerRef.current.notice.show = `已加载 ${result.count} 条弹幕`;
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
      id: string,
      title?: string
    ): Promise<SearchResult[]> => {
      try {
        let detailResponse;

        // 判断是否为短剧源
        if (source === 'shortdrama') {
          // 传递 title 参数以支持备用API fallback
          // 优先使用 URL 参数的 title，因为 videoTitleRef 可能还未初始化
          const dramaTitle = searchParams.get('title') || videoTitleRef.current || '';
          const titleParam = dramaTitle ? `&name=${encodeURIComponent(dramaTitle)}` : '';
          detailResponse = await fetch(
            `/api/shortdrama/detail?id=${id}&episode=1${titleParam}`
          );
        } else {
          // 所有其他源（包括 Emby）统一使用 /api/detail
          // 添加 title 参数用于搜索匹配
          const titleParam = title ? `&title=${encodeURIComponent(title)}` : '';
          detailResponse = await fetch(
            `/api/detail?source=${source}&id=${id}${titleParam}`
          );
        }

        if (!detailResponse.ok) {
          throw new Error('获取视频详情失败');
        }

        const detailData = (await detailResponse.json()) as SearchResult;

        // 对于短剧源，检查 title 和 poster 是否有效
        if (source === 'shortdrama') {
          if (!detailData.title || !detailData.poster) {
            throw new Error('短剧源数据不完整（缺少标题或海报）');
          }
        }

        // 注意：不检查episodes是否为空，因为有些源可能需要后续处理
        // 即使episodes为空，也返回数据，让调用方决定如何处理

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

            // 处理搜索结果，使用分级匹配：精确匹配优先，避免短标题误匹配
            const queryTitle = videoTitleRef.current.replaceAll(' ', '').toLowerCase();

            const matchYearAndType = (result: SearchResult) => {
              const yearMatch = videoYearRef.current
                ? result.year.toLowerCase() === videoYearRef.current.toLowerCase()
                : true;
              const typeMatch = searchType
                ? (searchType === 'tv' && result.episodes.length > 1) ||
                  (searchType === 'movie' && result.episodes.length === 1)
                : true;
              return yearMatch && typeMatch;
            };

            // 第一优先级：精确匹配（标题完全相等，或去除数字/标点后相等）
            const exactResults = data.results.filter(
              (result: SearchResult) => {
                if (videoDoubanIdRef.current && videoDoubanIdRef.current > 0 && result.douban_id) {
                  return result.douban_id === videoDoubanIdRef.current;
                }
                const resultTitle = result.title.replaceAll(' ', '').toLowerCase();
                const exactMatch = resultTitle === queryTitle ||
                  resultTitle.replace(/\d+|[：:]/g, '') === queryTitle.replace(/\d+|[：:]/g, '');
                return exactMatch && matchYearAndType(result);
              }
            );

            // 第二优先级：宽松包含匹配（仅当精确匹配无结果时使用）
            let filteredResults = exactResults;
            if (exactResults.length === 0) {
              filteredResults = data.results.filter(
                (result: SearchResult) => {
                  if (videoDoubanIdRef.current && videoDoubanIdRef.current > 0 && result.douban_id) {
                    return result.douban_id === videoDoubanIdRef.current;
                  }
                  const resultTitle = result.title.replaceAll(' ', '').toLowerCase();
                  const titleMatch = resultTitle.includes(queryTitle) ||
                    queryTitle.includes(resultTitle) ||
                    (queryTitle.length > 4 && checkAllKeywordsMatch(queryTitle, resultTitle));
                  return titleMatch && matchYearAndType(result);
                }
              );
            }

            if (filteredResults.length > 0) {
              console.log(`变体 "${variant}" 找到 ${filteredResults.length} 个匹配结果（${exactResults.length > 0 ? '精确' : '宽松'}匹配）`);
              bestResults = filteredResults;
              break; // 找到匹配就停止
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
            console.log('使用中文匹配策略（精确优先）');
            const normalizedQuery = queryTitle.replace(/[^\w\u4e00-\u9fff]/g, '');

            // 先尝试精确匹配
            const exactChinese = allCandidates.filter(result => {
              const normalizedTitle = result.title.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, '');
              const isExact = normalizedTitle === normalizedQuery ||
                normalizedTitle.replace(/\d+/g, '') === normalizedQuery.replace(/\d+/g, '');
              if (isExact) console.log(`中文精确匹配: "${result.title}"`);
              return isExact;
            });

            if (exactChinese.length > 0) {
              relevantMatches = exactChinese;
            } else {
              // 精确无结果，降级到包含匹配
              relevantMatches = allCandidates.filter(result => {
                const title = result.title.toLowerCase();
                const normalizedTitle = title.replace(/[^\w\u4e00-\u9fff]/g, '');

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
          }

          console.log(`匹配结果: ${relevantMatches.length}/${allCandidates.length}`);

          // 如果有匹配结果，直接返回（去重）
          if (relevantMatches.length > 0) {
            finalResults = Array.from(
              new Map(relevantMatches.map(item => [`${item.source}-${item.id}`, item])).values()
            ) as SearchResult[];
            console.log(`找到 ${finalResults.length} 个唯一匹配结果`);
          } else {
            console.log('没有找到合理的匹配，返回空结果');
            finalResults = [];
          }
        }

        console.log(`智能搜索完成，最终返回 ${finalResults.length} 个结果`);
        // 按权重排序后设置可用源列表
        const sortedResults = await setAvailableSourcesWithWeight(finalResults);
        return sortedResults;
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

      let detailData: SearchResult | null = null;
      let sourcesInfo: SearchResult[] = [];

      // 如果已经有了source和id，优先通过单个详情接口快速获取
      if (currentSource && currentId) {
        // 先快速获取当前源的详情
        try {
          console.log('[Play] 获取当前源详情:', currentSource, currentId);
          const currentSourceDetail = await fetchSourceDetail(
            currentSource,
            currentId,
            searchTitle || videoTitle
          );
          console.log('[Play] 获取到的详情:', currentSourceDetail);
          if (currentSourceDetail.length > 0) {
            detailData = currentSourceDetail[0];
            sourcesInfo = currentSourceDetail;
            console.log('[Play] 设置 detailData 和 sourcesInfo 成功');
          } else {
            console.error('[Play] fetchSourceDetail 返回空数组');
          }
        } catch (err) {
          console.error('获取当前源详情失败:', err);
        }

        // 异步获取其他源信息，不阻塞播放
        setBackgroundSourcesLoading(true);
        fetchSourcesData(searchTitle || videoTitle).then((sources) => {
          // 合并当前源和搜索到的其他源
          const allSources = [...sourcesInfo];
          sources.forEach((source) => {
            // 避免重复添加当前源
            if (!(source.source === currentSource && source.id === currentId)) {
              allSources.push(source);
            }
          });
          setAvailableSources(allSources);
          setBackgroundSourcesLoading(false);
        }).catch((err) => {
          console.error('异步获取其他源失败:', err);
          setBackgroundSourcesLoading(false);
        });
      } else {
        // 没有source和id，正常搜索流程
        sourcesInfo = await fetchSourcesData(searchTitle || videoTitle);
      }

      if (!detailData && sourcesInfo.length === 0) {
        setError('未找到匹配结果');
        setLoading(false);
        return;
      }

      if (!detailData) {
        detailData = sourcesInfo[0];
      }
      // 指定源和id且无需优选
      if (currentSource && currentId && !needPreferRef.current) {
        const target = sourcesInfo.find(
          (source) => source.source === currentSource && source.id === currentId
        );
        if (target) {
          detailData = target;

          // 如果是 emby 源且 episodes 为空，需要调用 detail 接口获取完整信息
          if ((detailData.source === 'emby' || detailData.source.startsWith('emby_')) && (!detailData.episodes || detailData.episodes.length === 0)) {
            console.log('[Play] Emby source has no episodes, fetching detail...');
            const detailSources = await fetchSourceDetail(currentSource, currentId, searchTitle || videoTitle);
            if (detailSources.length > 0) {
              detailData = detailSources[0];
            }
          }
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

        // 过滤掉 emby 源，它们不参与测速
        const sourcesToTest = sourcesInfo.filter(s => {
          // 检查是否为 emby 源（包括 emby 和 emby_xxx 格式）
          if (s.source === 'emby' || s.source.startsWith('emby_')) return false;
          return true;
        });

        const excludedSources = sourcesInfo.filter(s =>
          s.source === 'emby' || s.source.startsWith('emby_')
        );

        if (sourcesToTest.length > 0) {
          detailData = await preferBestSource(sourcesToTest);
        } else if (excludedSources.length > 0) {
          // 如果只有 emby 源，直接使用第一个
          detailData = excludedSources[0];
        } else {
          detailData = sourcesInfo[0];
        }
      }

      if (!detailData) {
        setError('未找到匹配结果');
        setLoading(false);
        return;
      }

      console.log(detailData.source, detailData.id);

      // 如果是 emby 源且 episodes 为空，需要调用 detail 接口获取完整信息
      if ((detailData.source === 'emby' || detailData.source.startsWith('emby_')) && (!detailData.episodes || detailData.episodes.length === 0)) {
        console.log('[Play] Emby source has no episodes, fetching detail...');
        const detailSources = await fetchSourceDetail(detailData.source, detailData.id, detailData.title || videoTitleRef.current);
        if (detailSources.length > 0) {
          detailData = detailSources[0];
        }
      }

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
  }, [reloadTrigger]); // 添加 reloadTrigger 作为依赖，当它变化时重新执行 initAll

  // 播放记录处理
  useEffect(() => {
    // 仅在初次挂载时检查播放记录
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;

      // 🔥 关键修复：优先检查 sessionStorage 中的临时进度（换源时保存的）
      const tempProgressKey = `temp_progress_${currentSource}_${currentId}_${currentEpisodeIndex}`;
      const tempProgress = sessionStorage.getItem(tempProgressKey);

      if (tempProgress) {
        const savedTime = parseFloat(tempProgress);
        if (savedTime > 1) {
          resumeTimeRef.current = savedTime;
          console.log(`🎯 从 sessionStorage 恢复换源前的播放进度: ${savedTime.toFixed(2)}s`);
          // 立即清除临时进度，避免重复恢复
          sessionStorage.removeItem(tempProgressKey);
          return; // 优先使用临时进度，不再读取历史记录
        }
      }

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

      // 清除集数切换定时器
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

      // 🔥 关键修复：将播放进度保存到 sessionStorage，防止组件重新挂载时丢失
      // 使用临时的 key，在新组件挂载后立即读取并清除
      if (currentPlayTime > 1) {
        const tempProgressKey = `temp_progress_${newSource}_${newId}_${currentEpisodeIndex}`;
        sessionStorage.setItem(tempProgressKey, currentPlayTime.toString());
        console.log(`💾 已保存临时播放进度到 sessionStorage: ${tempProgressKey} = ${currentPlayTime.toFixed(2)}s`);
      }

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

      // 如果是 emby 源且 episodes 为空，需要调用 detail 接口获取完整信息
      let detailToUse = newDetail;
      if ((newDetail.source === 'emby' || newDetail.source.startsWith('emby_')) && (!newDetail.episodes || newDetail.episodes.length === 0)) {
        console.log('[Play] Emby source has no episodes after switch, fetching detail...');
        try {
          const { source: apiSource, embyKey } = parseSourceForApi(newSource);
          const embyKeyParam = embyKey ? `&embyKey=${embyKey}` : '';
          const detailResponse = await fetch(`/api/emby/detail?id=${newId}${embyKeyParam}`);
          if (detailResponse.ok) {
            const detailSources = (await detailResponse.json()) as SearchResult[];
            if (detailSources.length > 0) {
              detailToUse = detailSources[0];
            }
          }
        } catch (err) {
          console.error('[Play] Failed to fetch Emby detail:', err);
        }
      }

      // 🔥 换源时保持当前集数不变（除非新源集数不够）
      let targetIndex = currentEpisodeIndex;

      // 只有当新源的集数不够时才调整到最后一集或第一集
      if (detailToUse.episodes && detailToUse.episodes.length > 0) {
        if (targetIndex >= detailToUse.episodes.length) {
          // 当前集数超出新源范围，跳转到新源的最后一集
          targetIndex = detailToUse.episodes.length - 1;
          console.log(`⚠️ 当前集数(${currentEpisodeIndex})超出新源范围(${detailToUse.episodes.length}集)，跳转到第${targetIndex + 1}集`);
          // 🔥 集数变化时，清除保存的临时进度
          const tempProgressKey = `temp_progress_${newSource}_${newId}_${currentEpisodeIndex}`;
          sessionStorage.removeItem(tempProgressKey);
        } else {
          // 集数在范围内，保持不变
          console.log(`✅ 换源保持当前集数: 第${targetIndex + 1}集`);
        }
      }

      // 🔥 由于组件会重新挂载，不再需要设置 resumeTimeRef（进度已保存到 sessionStorage）
      // 组件重新挂载后会自动从 sessionStorage 恢复进度

      // 更新URL参数（不刷新页面）
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', newSource);
      newUrl.searchParams.set('id', newId);
      newUrl.searchParams.set('year', detailToUse.year);
      newUrl.searchParams.set('index', targetIndex.toString());  // 🔥 同步URL的index参数
      window.history.replaceState({}, '', newUrl.toString());

      setVideoTitle(detailToUse.title || newTitle);
      setVideoYear(detailToUse.year);
      setVideoCover(detailToUse.poster);
      // 优先保留URL参数中的豆瓣ID，如果URL中没有则使用详情数据中的
      setVideoDoubanId(videoDoubanIdRef.current || detailToUse.douban_id || 0);
      setCurrentSource(newSource);
      setCurrentId(newId);
      setDetail(detailToUse);

      // 🔥 只有当集数确实改变时才调用 setCurrentEpisodeIndex
      // 这样可以避免触发不必要的 useEffect 和集数切换逻辑
      if (targetIndex !== currentEpisodeIndex) {
        setCurrentEpisodeIndex(targetIndex);
      }

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
            const result = await loadExternalDanmu();

            if (result.count > 0 && artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

              // 🚀 确保在加载新弹幕前完全清空旧弹幕
              plugin.reset(); // 立即回收所有正在显示的弹幕DOM
              plugin.load(); // 不传参数，完全清空队列
              console.log('🧹 换源后已清空旧弹幕，准备加载新弹幕');

              // 🚀 优化大量弹幕的加载：分批处理，减少阻塞
              if (result.count > 1000) {
                console.log(`📊 检测到大量弹幕 (${result.count}条)，启用分批加载`);

                // 先加载前500条，快速显示
                const firstBatch = result.data.slice(0, 500);
                plugin.load(firstBatch);

                // 剩余弹幕分批异步加载，避免阻塞
                const remainingBatches = [];
                for (let i = 500; i < result.data.length; i += 300) {
                  remainingBatches.push(result.data.slice(i, i + 300));
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
                plugin.load(result.data);
                console.log(`✅ 换源后弹幕加载完成: ${result.count} 条`);
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
  const handleEpisodeChange = async (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      // 在更换集数前保存当前播放进度
      if (artPlayerRef.current && artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }

      // 🔥 优化：检查目标集数是否有历史播放记录
      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSourceRef.current, currentIdRef.current);
        const record = allRecords[key];

        // 如果历史记录的集数与目标集数匹配，且有播放进度
        if (record && record.index - 1 === episodeNumber && record.play_time > 0) {
          resumeTimeRef.current = record.play_time;
          console.log(`🎯 切换到第${episodeNumber + 1}集，恢复历史进度: ${record.play_time.toFixed(2)}s`);
        } else {
          resumeTimeRef.current = 0;
          console.log(`🔄 切换到第${episodeNumber + 1}集，从头播放`);
        }
      } catch (err) {
        console.warn('读取历史记录失败:', err);
        resumeTimeRef.current = 0;
      }

      // 🔥 优化：同步更新URL参数，保持URL与实际播放状态一致
      try {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('index', episodeNumber.toString());
        window.history.replaceState({}, '', newUrl.toString());
      } catch (err) {
        console.warn('更新URL参数失败:', err);
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

      savePlayRecordMutation.mutate({
        source: currentSourceRef.current,
        id: currentIdRef.current,
        record: {
          title: videoTitleRef.current,
          source_name: detailRef.current?.source_name || '',
          year: detailRef.current?.year,
          cover: detailRef.current?.poster || '',
          index: currentEpisodeIndexRef.current + 1,
          total_episodes: currentTotalEpisodes,
          original_episodes: existingRecord?.original_episodes,
          play_time: Math.floor(currentTime),
          total_time: Math.floor(duration),
          save_time: Date.now(),
          search_title: searchTitle,
          remarks: remarksToSave,
          douban_id: videoDoubanIdRef.current || detailRef.current?.douban_id || undefined,
          type: searchType || undefined,
        },
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
      cleanupPlayer(); // 不await，让它异步执行
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
  // 每当 source 或 id 变化时检查收藏状态（支持豆瓣/Bangumi等虚拟源）
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const favorites = await getAllFavorites();

        // 检查多个可能的收藏key
        const possibleKeys = [
          `${currentSource}+${currentId}`, // 当前真实播放源
          videoDoubanId ? `douban+${videoDoubanId}` : null, // 豆瓣收藏
          videoDoubanId ? `bangumi+${videoDoubanId}` : null, // Bangumi收藏
          shortdramaId ? `shortdrama+${shortdramaId}` : null, // 短剧收藏
        ].filter(Boolean);

        // 检查是否任一key已被收藏
        const fav = possibleKeys.some(key => !!favorites[key as string]);
        setFavorited(fav);
      } catch (err) {
        console.error('检查收藏状态失败:', err);
      }
    })();
  }, [currentSource, currentId, videoDoubanId, shortdramaId]);

  // 监听收藏数据更新事件（支持豆瓣/Bangumi等虚拟源）
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        // 检查多个可能的收藏key
        const possibleKeys = [
          generateStorageKey(currentSource, currentId), // 当前真实播放源
          videoDoubanId ? `douban+${videoDoubanId}` : null, // 豆瓣收藏
          videoDoubanId ? `bangumi+${videoDoubanId}` : null, // Bangumi收藏
          shortdramaId ? `shortdrama+${shortdramaId}` : null, // 短剧收藏
        ].filter(Boolean);

        // 检查是否任一key已被收藏
        const isFav = possibleKeys.some(key => !!favorites[key as string]);
        setFavorited(isFav);
      }
    );

    return unsubscribe;
  }, [currentSource, currentId, videoDoubanId, shortdramaId]);

  // 自动更新收藏的集数和片源信息（支持豆瓣/Bangumi/短剧等虚拟源）
  useEffect(() => {
    if (!detail || !currentSource || !currentId) return;

    const updateFavoriteData = async () => {
      try {
        const realEpisodes = detail.episodes.length || 1;
        const favorites = await getAllFavorites();

        // 检查多个可能的收藏key
        const possibleKeys = [
          `${currentSource}+${currentId}`, // 当前真实播放源
          videoDoubanId ? `douban+${videoDoubanId}` : null, // 豆瓣收藏
          videoDoubanId ? `bangumi+${videoDoubanId}` : null, // Bangumi收藏
        ].filter(Boolean);

        let favoriteToUpdate = null;
        let favoriteKey = '';

        // 找到已存在的收藏
        for (const key of possibleKeys) {
          if (favorites[key as string]) {
            favoriteToUpdate = favorites[key as string];
            favoriteKey = key as string;
            break;
          }
        }

        if (!favoriteToUpdate) return;

        // 检查是否需要更新（集数不同或缺少片源信息）
        const needsUpdate =
          favoriteToUpdate.total_episodes === 99 ||
          favoriteToUpdate.total_episodes !== realEpisodes ||
          !favoriteToUpdate.source_name ||
          favoriteToUpdate.source_name === '即将上映' ||
          favoriteToUpdate.source_name === '豆瓣' ||
          favoriteToUpdate.source_name === 'Bangumi';

        if (needsUpdate) {
          console.log(`🔄 更新收藏数据: ${favoriteKey}`, {
            旧集数: favoriteToUpdate.total_episodes,
            新集数: realEpisodes,
            旧片源: favoriteToUpdate.source_name,
            新片源: detail.source_name,
          });

          // 提取收藏key中的source和id
          const [favSource, favId] = favoriteKey.split('+');

          // 根据 type_name 推断内容类型
          const inferType = (typeName?: string): string | undefined => {
            if (!typeName) return undefined;
            const lowerType = typeName.toLowerCase();
            if (lowerType.includes('短剧') || lowerType.includes('shortdrama') || lowerType.includes('short-drama') || lowerType.includes('short drama')) return 'shortdrama';
            if (lowerType.includes('综艺') || lowerType.includes('variety')) return 'variety';
            if (lowerType.includes('电影') || lowerType.includes('movie')) return 'movie';
            if (lowerType.includes('电视剧') || lowerType.includes('剧集') || lowerType.includes('tv') || lowerType.includes('series')) return 'tv';
            if (lowerType.includes('动漫') || lowerType.includes('动画') || lowerType.includes('anime')) return 'anime';
            if (lowerType.includes('纪录片') || lowerType.includes('documentary')) return 'documentary';
            return undefined;
          };

          // 确定内容类型：优先使用已有的 type，如果没有则推断
          let contentType = favoriteToUpdate.type || inferType(detail.type_name);
          // 如果还是无法确定类型，检查 source 是否为 shortdrama
          if (!contentType && favSource === 'shortdrama') {
            contentType = 'shortdrama';
          }

          saveFavoriteMutation.mutate({
            source: favSource,
            id: favId,
            favorite: {
              title: videoTitleRef.current || detail.title || favoriteToUpdate.title,
              source_name: detail.source_name || favoriteToUpdate.source_name || '',
              year: detail.year || favoriteToUpdate.year || '',
              cover: detail.poster || favoriteToUpdate.cover || '',
              total_episodes: realEpisodes,
              save_time: favoriteToUpdate.save_time || Date.now(),
              search_title: favoriteToUpdate.search_title || searchTitle,
              releaseDate: favoriteToUpdate.releaseDate,
              remarks: favoriteToUpdate.remarks,
              type: contentType,
            },
          });

          console.log('✅ 收藏数据更新成功');
        }
      } catch (err) {
        console.error('自动更新收藏数据失败:', err);
      }
    };

    updateFavoriteData();
  }, [detail, currentSource, currentId, videoDoubanId, searchTitle]);

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (
      !videoTitleRef.current ||
      !detailRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current
    )
      return;

    if (favorited) {
      // 如果已收藏，删除收藏
      deleteFavoriteMutation.mutate(
        {
          source: currentSourceRef.current,
          id: currentIdRef.current,
        },
        {
          onSuccess: () => {
            setFavorited(false);
          },
          onError: (err) => {
            console.error('删除收藏失败:', err);
          },
        }
      );
    } else {
      // 根据 type_name 推断内容类型
      const inferType = (typeName?: string): string | undefined => {
        if (!typeName) return undefined;
        const lowerType = typeName.toLowerCase();
        if (lowerType.includes('短剧') || lowerType.includes('shortdrama') || lowerType.includes('short-drama') || lowerType.includes('short drama')) return 'shortdrama';
        if (lowerType.includes('综艺') || lowerType.includes('variety')) return 'variety';
        if (lowerType.includes('电影') || lowerType.includes('movie')) return 'movie';
        if (lowerType.includes('电视剧') || lowerType.includes('剧集') || lowerType.includes('tv') || lowerType.includes('series')) return 'tv';
        if (lowerType.includes('动漫') || lowerType.includes('动画') || lowerType.includes('anime')) return 'anime';
        if (lowerType.includes('纪录片') || lowerType.includes('documentary')) return 'documentary';
        return undefined;
      };

      // 根据 source 或 type_name 确定内容类型
      let contentType = inferType(detailRef.current?.type_name);
      // 如果 type_name 无法推断类型，检查 source 是否为 shortdrama
      if (!contentType && currentSourceRef.current === 'shortdrama') {
        contentType = 'shortdrama';
      }

      // 如果未收藏，添加收藏
      saveFavoriteMutation.mutate(
        {
          source: currentSourceRef.current,
          id: currentIdRef.current,
          favorite: {
            title: videoTitleRef.current,
            source_name: detailRef.current?.source_name || '',
            year: detailRef.current?.year,
            cover: detailRef.current?.poster || '',
            total_episodes: detailRef.current?.episodes.length || 1,
            save_time: Date.now(),
            search_title: searchTitle,
            type: contentType,
          },
        },
        {
          onSuccess: () => {
            setFavorited(true);
          },
          onError: (err) => {
            console.error('添加收藏失败:', err);
          },
        }
      );
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
        await cleanupPlayer();
      }
    }
    if (artPlayerRef.current) {
      await cleanupPlayer();
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
      Artplayer.USE_RAF = false;
      Artplayer.FULLSCREEN_WEB_IN_BODY = true;
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
        screenshot: !isMobile, // 桌面端启用截图功能
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

            // 获取用户的缓冲模式配置
            const bufferConfig = getHlsBufferConfig();

            // 🚀 根据 HLS.js 官方源码的最佳实践配置
            const hls = new Hls({
              debug: false,
              enableWorker: true,
              // 参考 HLS.js config.ts：移动设备关闭低延迟模式以节省资源
              lowLatencyMode: !isMobile,

              // 🎯 官方推荐的缓冲策略 - iOS13+ 特别优化
              /* 缓冲长度配置 - 参考 hlsDefaultConfig - 桌面设备应用用户配置 */
              maxBufferLength: isMobile
                ? (localIsIOS13 ? 8 : isIOS ? 10 : 15)  // iOS13+: 8s, iOS: 10s, Android: 15s
                : bufferConfig.maxBufferLength, // 桌面使用用户配置
              backBufferLength: isMobile
                ? (localIsIOS13 ? 5 : isIOS ? 8 : 10)   // iOS13+更保守
                : bufferConfig.backBufferLength, // 桌面使用用户配置

              /* 缓冲大小配置 - 基于官方 maxBufferSize - 桌面设备应用用户配置 */
              maxBufferSize: isMobile
                ? (localIsIOS13 ? 20 * 1000 * 1000 : isIOS ? 30 * 1000 * 1000 : 40 * 1000 * 1000) // iOS13+: 20MB, iOS: 30MB, Android: 40MB
                : bufferConfig.maxBufferSize, // 桌面使用用户配置

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

              // v1.6.15 改进：优化了播放列表末尾空片段/间隙处理，改进了音频TS片段duration处理
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
          {
            name: '弹幕设置',
            html: '弹幕设置',
            tooltip: '打开弹幕设置面板',
            icon: '<text x="50%" y="50%" font-size="14" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">弹</text>',
            // 🎨 点击式按钮，打开美化的弹幕设置面板
            onClick: function () {
              setIsDanmuSettingsPanelOpen(true);
              // 关闭settings菜单
              if (artPlayerRef.current) {
                artPlayerRef.current.setting.show = false;
              }
              // ✅ 必须返回tooltip文本，否则ArtPlayer会设置为undefined
              return '打开弹幕设置面板';
            },
          },
          ...(webGPUSupported ? [
            {
              name: '超分设置',
              html: '超分设置',
              icon: '<text x="50%" y="50%" font-size="14" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">超</text>',
              tooltip: '打开AI超分设置面板',
              onClick: function () {
                setIsWebSRSettingsPanelOpen(true);
                if (artPlayerRef.current) {
                  artPlayerRef.current.setting.show = false;
                }
                return '打开AI超分设置面板';
              },
            },
          ] : []),
        ],
        // 控制栏配置
        controls: [
          {
            position: 'left',
            index: 13,
            html: '<i class="art-icon flex hint--top" aria-label="播放下一集"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
            tooltip: '播放下一集',
            click: function () {
              handleNextEpisode();
            },
          },
          // 🚀 简单弹幕发送按钮（仅Web端显示）
          ...(isMobile ? [] : [{
            position: 'right',
            html: '<span class="hint--top" aria-label="发送弹幕">弹</span>',
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
                speed: parseFloat(localStorage.getItem('danmaku_speed') || '5'),
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
                antiOverlap: localStorage.getItem('danmaku_antiOverlap') !== null
                  ? localStorage.getItem('danmaku_antiOverlap') === 'true'
                  : (devicePerformance === 'high'), // 默认值：高性能设备开启防重叠
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
              title: videoTitle ? `${videoTitle}${currentEpisodeIndex >= 0 ? ` - 第${currentEpisodeIndex + 1}集` : ''}` : undefined,
              poster: videoCover || undefined,
              onStateChange: (state) => {
                console.log('Chromecast state changed:', state);
              },
              onCastAvailable: (available) => {
                console.log('Chromecast available:', available);
              },
              onCastStart: () => {
                console.log('Chromecast started');
              },
              onCastEnd: () => {
                console.log('Chromecast ended');
              },
              onError: (error) => {
                console.error('Chromecast error:', error);
              }
            })
          ] : []),
          // 毛玻璃效果控制栏插件 - 现代化悬浮设计
          // CSS已优化：桌面98%宽度，移动端100%，按钮可自动缩小适应
          artplayerPluginLiquidGlass()
        ],
      });

      // 设置 Portal 容器为 ArtPlayer 的 $player 元素（全屏时只有该元素可见）
      setPortalContainer(artPlayerRef.current.template.$player);

      // 监听播放器事件
      artPlayerRef.current.on('ready', async () => {
        setError(null);
        setPlayerReady(true); // 标记播放器已就绪，启用观影室同步

        // 使用ArtPlayer layers API添加分辨率徽章（带渐变和发光效果）
        const video = artPlayerRef.current.video as HTMLVideoElement;

        // 添加分辨率徽章layer
        artPlayerRef.current.layers.add({
          name: 'resolution-badge',
          html: '<div class="resolution-badge"></div>',
          style: {
            position: 'absolute',
            bottom: '60px',
            left: '20px',
            padding: '5px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '700',
            color: 'white',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(10px)',
            pointerEvents: 'none',
            opacity: '1',
            transition: 'opacity 0.3s ease',
            letterSpacing: '0.5px',
          },
        });

        // 🎬 全屏标题/集数层
        const fsEpisodeName = detail?.episodes_titles?.[currentEpisodeIndex] || '';
        const fsHasEpisodes = detail?.episodes && detail.episodes.length > 1;
        artPlayerRef.current.layers.add({
          name: 'fullscreen-title',
          html: `
            <div class="fullscreen-title-container">
              <div class="fullscreen-title-content">
                <h1 class="fullscreen-title-text">${detail?.title || ''}</h1>
                ${fsHasEpisodes && fsEpisodeName
                  ? `<span class="fullscreen-episode-text">${fsEpisodeName}</span>`
                  : fsHasEpisodes
                    ? `<span class="fullscreen-episode-text">第 ${currentEpisodeIndex + 1} 集</span>`
                    : ''}
              </div>
            </div>
          `,
          style: {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            height: '80px',
            display: 'none',
            pointerEvents: 'none',
            zIndex: '20',
          },
        });

        // 自动隐藏徽章的定时器
        let badgeHideTimer: NodeJS.Timeout | null = null;

        const showBadge = () => {
          const badge = artPlayerRef.current?.layers['resolution-badge'];
          if (badge) {
            badge.style.opacity = '1';

            // 清除之前的定时器
            if (badgeHideTimer) {
              clearTimeout(badgeHideTimer);
            }

            // 3秒后自动隐藏徽章
            badgeHideTimer = setTimeout(() => {
              if (badge) {
                badge.style.opacity = '0';
              }
            }, 3000);
          }
        };

        const updateResolution = () => {
          if (video.videoWidth && video.videoHeight) {
            const width = video.videoWidth;
            const label = width >= 3840 ? '4K' :
                         width >= 2560 ? '2K' :
                         width >= 1920 ? '1080P' :
                         width >= 1280 ? '720P' :
                         width + 'P';

            // 根据质量设置不同的渐变背景和发光效果
            let gradientStyle = '';
            let boxShadow = '';

            if (width >= 3840) {
              // 4K - 金色/紫色渐变 + 金色发光
              gradientStyle = 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)';
              boxShadow = '0 0 20px rgba(255, 215, 0, 0.6), 0 0 10px rgba(255, 165, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
            } else if (width >= 2560) {
              // 2K - 蓝色/青色渐变 + 蓝色发光
              gradientStyle = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
              boxShadow = '0 0 20px rgba(102, 126, 234, 0.6), 0 0 10px rgba(118, 75, 162, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
            } else if (width >= 1920) {
              // 1080P - 绿色/青色渐变 + 绿色发光
              gradientStyle = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
              boxShadow = '0 0 15px rgba(17, 153, 142, 0.5), 0 0 8px rgba(56, 239, 125, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
            } else if (width >= 1280) {
              // 720P - 橙色渐变 + 橙色发光
              gradientStyle = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
              boxShadow = '0 0 15px rgba(240, 147, 251, 0.4), 0 0 8px rgba(245, 87, 108, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
            } else {
              // 低质量 - 灰色渐变
              gradientStyle = 'linear-gradient(135deg, #606c88 0%, #3f4c6b 100%)';
              boxShadow = '0 0 10px rgba(96, 108, 136, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
            }

            // 更新layer内容和样式
            const badge = artPlayerRef.current.layers['resolution-badge'];
            if (badge) {
              badge.innerHTML = label;
              badge.style.background = gradientStyle;
              badge.style.boxShadow = boxShadow;
            }

            // 同时更新state供React使用
            setVideoResolution({ width: video.videoWidth, height: video.videoHeight });

            // 显示徽章并启动自动隐藏定时器
            showBadge();
          }
        };

        // 监听loadedmetadata事件获取分辨率
        video.addEventListener('loadedmetadata', updateResolution);
        if (video.videoWidth && video.videoHeight) {
          updateResolution();
        }

        // 用户交互时重新显示徽章（鼠标移动、点击、键盘操作）
        const userInteractionEvents = ['mousemove', 'click', 'touchstart', 'keydown'];
        userInteractionEvents.forEach(eventName => {
          artPlayerRef.current.on(eventName, showBadge);
        });

        // 观影室时间同步：从URL参数读取初始播放时间
        const timeParam = searchParams.get('t') || searchParams.get('time');
        if (timeParam && artPlayerRef.current) {
          const seekTime = parseFloat(timeParam);
          if (!isNaN(seekTime) && seekTime > 0) {
            console.log('[WatchRoom] Seeking to synced time:', seekTime);
            setTimeout(() => {
              if (artPlayerRef.current) {
                artPlayerRef.current.currentTime = seekTime;
              }
            }, 500); // 延迟确保播放器完全就绪
          }
        }

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
            const result = await loadExternalDanmu(); // 这里会检查开关状态，返回 { count, data }
            console.log('外部弹幕加载结果:', result.count, '条');

            if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              const danmuPlugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
              danmuPlugin.load(); // 清空已有弹幕
              if (result.count > 0) {
                console.log('向播放器插件加载弹幕数据:', result.count, '条');
                danmuPlugin.load(result.data);
                artPlayerRef.current.notice.show = `已加载 ${result.count} 条弹幕`;
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

      // 监听全屏事件，进入全屏后自动隐藏控制栏 + 显示标题层
      artPlayerRef.current.on('fullscreen', (isFullscreen: boolean) => {
        const titleLayer = artPlayerRef.current?.layers['fullscreen-title'];
        if (titleLayer) {
          titleLayer.style.display = isFullscreen ? 'block' : 'none';
        }
        if (isFullscreen) {
          // 进入全屏后，延迟100ms触发控制栏自动隐藏
          setTimeout(() => {
            if (artPlayerRef.current?.controls) {
              artPlayerRef.current.controls.show = true;
            }
          }, 100);
        }
      });

      // 监听网页全屏事件，显示/隐藏标题层
      artPlayerRef.current.on('fullscreenWeb', (isFullscreenWeb: boolean) => {
        const titleLayer = artPlayerRef.current?.layers['fullscreen-title'];
        if (titleLayer) {
          titleLayer.style.display = isFullscreenWeb ? 'block' : 'none';
        }
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

        // 保存播放进度逻辑 - 优化保存间隔以减少网络开销
        const saveNow = Date.now();
        // 🔧 优化：增加播放中的保存间隔，依赖暂停时保存作为主要保存时机
        // upstash: 60秒兜底保存，其他存储: 30秒兜底保存
        // 用户暂停、切换集数、页面卸载时会立即保存，因此较长间隔不影响体验
        const interval = process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash' ? 60000 : 30000;

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

      // 清理WebSR
      destroyWebSR();

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
      <LoadingScreen
        loadingStage={loadingStage}
        loadingMessage={loadingMessage}
        speedTestProgress={speedTestProgress}
      />
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <PlayErrorDisplay error={error} videoTitle={videoTitle} />
      </PageLayout>
    );
  }

  return (
    <>
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
          <div className='flex justify-end items-center gap-2 sm:gap-3'>
            {/* 网盘资源按钮 */}
            <NetDiskButton
              videoTitle={videoTitle}
              netdiskLoading={netdiskLoading}
              netdiskTotal={netdiskTotal}
              netdiskResults={netdiskResults}
              onSearch={handleNetDiskSearch}
              onOpenModal={() => setShowNetdiskModal(true)}
            />

            {/* 下载按钮 - 使用独立组件优化性能 */}
            <DownloadButtons
              downloadEnabled={downloadEnabled}
              onDownloadClick={() => setShowDownloadEpisodeSelector(true)}
              onDownloadPanelClick={() => setShowDownloadPanel(true)}
            />

            {/* 折叠控制按钮 - 仅在 lg 及以上屏幕显示 */}
            <CollapseButton
              isCollapsed={isEpisodeSelectorCollapsed}
              onToggle={() => setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)}
            />
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

                {/* WebSR 分屏对比分割线 */}
                {websrEnabled && websrCompareEnabled && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${websrComparePosition}%`,
                      top: 0,
                      bottom: 0,
                      width: '4px',
                      backgroundColor: 'white',
                      cursor: 'col-resize',
                      zIndex: 10,
                      transform: 'translateX(-50%)',
                    }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                      const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                      if (!rect) return;
                      const x = e.clientX - rect.left;
                      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
                      setWebsrComparePosition(pct);
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255,255,255,0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        color: '#333',
                      }}
                    >
                      ↔
                    </div>
                  </div>
                )}

                {/* 跳过设置按钮 - 播放器内右上角 */}
                {currentSource && currentId && (
                  <div className='absolute top-4 right-4 z-10'>
                    <SkipSettingsButton onClick={() => setIsSkipSettingOpen(true)} />
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
                <VideoLoadingOverlay
                  isVisible={isVideoLoading}
                  loadingStage={videoLoadingStage}
                />
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
                availableSources={availableSources.filter(source => {
                  // 必须有集数数据（所有源包括短剧源都必须满足）
                  if (!source.episodes || source.episodes.length < 1) return false;

                  // 短剧源不受集数差异限制（但必须有集数数据）
                  if (source.source === 'shortdrama') return true;

                  // 如果当前有 detail，只显示集数相近的源（允许 ±30% 的差异）
                  if (detail && detail.episodes && detail.episodes.length > 0) {
                    const currentEpisodes = detail.episodes.length;
                    const sourceEpisodes = source.episodes.length;
                    const tolerance = Math.max(5, Math.ceil(currentEpisodes * 0.3)); // 至少5集的容差

                    // 在合理范围内
                    return Math.abs(sourceEpisodes - currentEpisodes) <= tolerance;
                  }

                  return true;
                })}
                sourceSearchLoading={sourceSearchLoading}
                sourceSearchError={sourceSearchError}
                precomputedVideoInfo={precomputedVideoInfo}
              />
            </div>
          </div>
        </div>

        {/* 详情展示 */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          {/* 文字区 - 使用独立组件优化性能 */}
          <VideoInfoSection
            videoTitle={videoTitle}
            videoYear={videoYear}
            videoCover={videoCover}
            videoDoubanId={videoDoubanId}
            currentSource={currentSource}
            favorited={favorited}
            onToggleFavorite={handleToggleFavorite}
            detail={detail}
            movieDetails={movieDetails}
            bangumiDetails={bangumiDetails}
            shortdramaDetails={shortdramaDetails}
            movieComments={movieComments}
            commentsError={commentsError?.message || null}
            loadingMovieDetails={loadingMovieDetails}
            loadingBangumiDetails={loadingBangumiDetails}
            loadingComments={loadingComments}
            loadingCelebrityWorks={loadingCelebrityWorks}
            selectedCelebrityName={selectedCelebrityName}
            celebrityWorks={celebrityWorks}
            onCelebrityClick={handleCelebrityClick}
            onClearCelebrity={() => {
              setSelectedCelebrityName(null);
              setCelebrityWorks([]);
            }}
            processImageUrl={processImageUrl}
          />

          {/* 封面展示 */}
          <VideoCoverDisplay
            videoCover={videoCover}
            bangumiDetails={bangumiDetails}
            videoTitle={videoTitle}
            videoDoubanId={videoDoubanId}
            processImageUrl={processImageUrl}
          />
        </div>
      </div>

      {/* 返回顶部悬浮按钮 - 使用独立组件优化性能 */}
      <BackToTopButton show={showBackToTop} onClick={scrollToTop} />

      {/* 观影室同步暂停提示条 */}
      <WatchRoomSyncBanner
        show={isInWatchRoom && !isWatchRoomOwner && syncPaused && !pendingOwnerChange}
        onResumeSync={resumeSync}
      />

      {/* 源切换确认对话框 */}
      <SourceSwitchDialog
        show={showSourceSwitchDialog && !!pendingOwnerState}
        ownerSource={pendingOwnerState?.source || ''}
        onConfirm={handleConfirmSourceSwitch}
        onCancel={handleCancelSourceSwitch}
      />

      {/* 房主切换视频/集数确认框 */}
      <OwnerChangeDialog
        show={!!pendingOwnerChange}
        videoName={pendingOwnerChange?.videoName || ''}
        episode={pendingOwnerChange?.episode || 0}
        onConfirm={confirmFollowOwner}
        onReject={rejectFollowOwner}
      />

      {/* 🎨 美化的弹幕设置面板 - Portal 到 ArtPlayer $player 支持全屏 */}
      {isDanmuSettingsPanelOpen && portalContainer && createPortal(
        <div style={{ all: 'initial', fontFamily: 'Inter, system-ui, sans-serif', position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
          <style>{`.danmu-iso svg { fill: none !important; }`}</style>
          <div className="danmu-iso" style={{ pointerEvents: 'auto' }}>
            <DanmuSettingsPanel
              isOpen={isDanmuSettingsPanelOpen}
              onClose={() => setIsDanmuSettingsPanelOpen(false)}
              settings={{
                enabled: externalDanmuEnabled, // 启用弹幕主开关
                fontSize: parseInt(localStorage.getItem('danmaku_fontSize') || '25'),
                speed: parseFloat(localStorage.getItem('danmaku_speed') || '5'),
                opacity: parseFloat(localStorage.getItem('danmaku_opacity') || '0.8'),
                margin: JSON.parse(localStorage.getItem('danmaku_margin') || '[10, "75%"]'),
                modes: JSON.parse(localStorage.getItem('danmaku_modes') || '[0, 1, 2]') as Array<0 | 1 | 2>,
                antiOverlap: localStorage.getItem('danmaku_antiOverlap') !== null
                  ? localStorage.getItem('danmaku_antiOverlap') === 'true'
                  : true, // 默认开启防重叠
                visible: localStorage.getItem('danmaku_visible') !== 'false',
              }}
              matchInfo={
                detail?.title && currentEpisodeIndex >= 0
                  ? {
                      animeTitle: detail.title,
                      episodeTitle: `第 ${currentEpisodeIndex + 1} 集`,
                    }
                  : null
              }
              onSettingsChange={(newSettings) => {
                // 更新启用状态
                if (newSettings.enabled !== undefined) {
                  handleDanmuOperationOptimized(newSettings.enabled);
                }

                // 更新 localStorage
                if (newSettings.fontSize !== undefined) {
                  localStorage.setItem('danmaku_fontSize', String(newSettings.fontSize));
                }
                if (newSettings.speed !== undefined) {
                  localStorage.setItem('danmaku_speed', String(newSettings.speed));
                }
                if (newSettings.opacity !== undefined) {
                  localStorage.setItem('danmaku_opacity', String(newSettings.opacity));
                }
                if (newSettings.margin !== undefined) {
                  localStorage.setItem('danmaku_margin', JSON.stringify(newSettings.margin));
                }
                if (newSettings.modes !== undefined) {
                  localStorage.setItem('danmaku_modes', JSON.stringify(newSettings.modes));
                }
                if (newSettings.antiOverlap !== undefined) {
                  localStorage.setItem('danmaku_antiOverlap', String(newSettings.antiOverlap));
                }
                if (newSettings.visible !== undefined) {
                  localStorage.setItem('danmaku_visible', String(newSettings.visible));
                }

                // 实时更新弹幕插件配置
                if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                  artPlayerRef.current.plugins.artplayerPluginDanmuku.config(newSettings);

                  // 处理显示/隐藏
                  if (newSettings.visible !== undefined) {
                    if (newSettings.visible) {
                      artPlayerRef.current.plugins.artplayerPluginDanmuku.show();
                    } else {
                      artPlayerRef.current.plugins.artplayerPluginDanmuku.hide();
                    }
                  }
                }

                // 触发面板重新读取设置（通过 key 变化）
                setDanmuSettingsVersion(v => v + 1);
              }}
              danmuCount={danmuList.length} // 使用state而不是ref，确保React能追踪变化
              loading={danmuLoading}
              loadMeta={danmuLoadMeta}
              error={danmuError}
              onReload={async () => {
                // 重新加载外部弹幕（强制刷新）
                const result = await loadExternalDanmu({ force: true });
                if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                  const danmuPlugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
                  danmuPlugin.load(); // 清空已有弹幕
                  danmuPlugin.load(result.data);
                  if (result.count > 0) {
                    artPlayerRef.current.notice.show = `已加载 ${result.count} 条弹幕`;
                  } else {
                    artPlayerRef.current.notice.show = '暂无弹幕数据';
                  }
                }
                return result.count;
              }}
              isManualOverridden={!!activeManualDanmuOverride}
              onManualMatch={() => {
                setIsDanmuSettingsPanelOpen(false);
                setIsDanmuManualModalOpen(true);
              }}
              onClearManualMatch={async () => {
                setManualDanmuOverrides((prev) => {
                  const next = { ...prev };
                  delete next[danmuScopeKey];
                  return next;
                });
                // Reload with auto matching
                const result = await loadExternalDanmu({ force: true, manualOverride: null });
                if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
                  const danmuPlugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
                  danmuPlugin.load(); // 清空已有弹幕
                  danmuPlugin.load(result.data);
                  artPlayerRef.current.notice.show = result.count > 0
                    ? `已恢复自动匹配，加载 ${result.count} 条弹幕`
                    : '已恢复自动匹配，暂无弹幕';
                }
              }}
            />
          </div>
        </div>,
        portalContainer
      )}

      {/* 手动匹配弹幕弹窗 */}
      <DanmuManualMatchModal
        isOpen={isDanmuManualModalOpen}
        defaultKeyword={videoTitle}
        currentEpisode={currentEpisodeIndex + 1}
        portalContainer={portalContainer}
        onClose={() => setIsDanmuManualModalOpen(false)}
        onApply={async (selection) => {
          setManualDanmuOverrides((prev) => ({
            ...prev,
            [danmuScopeKey]: selection,
          }));
          setIsDanmuManualModalOpen(false);

          const override: DanmuManualOverride = {
            animeId: selection.animeId,
            episodeId: selection.episodeId,
            animeTitle: selection.animeTitle,
            episodeTitle: selection.episodeTitle,
          };
          const result = await loadExternalDanmu({ force: true, manualOverride: override });
          if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
            const danmuPlugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;
            danmuPlugin.load(); // 清空已有弹幕
            danmuPlugin.load(result.data);
            artPlayerRef.current.notice.show = result.count > 0
              ? `已手动匹配: ${selection.animeTitle} · ${selection.episodeTitle} (${result.count} 条)`
              : `已手动匹配，但该集暂无弹幕`;
          }
        }}
      />

      {/* WebSR 设置面板 */}
      {isWebSRSettingsPanelOpen && portalContainer && createPortal(
        <div style={{ all: 'initial', fontFamily: 'Inter, system-ui, sans-serif', position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
          <style>{`.websr-iso svg { fill: none !important; }`}</style>
          <div className="websr-iso" style={{ pointerEvents: 'auto' }}>
            <WebSRSettingsPanel
              isOpen={isWebSRSettingsPanelOpen}
              onClose={() => setIsWebSRSettingsPanelOpen(false)}
              settings={{
                enabled: websrEnabled,
                mode: websrMode,
                contentType: websrContentType,
                networkSize: websrNetworkSize,
                compareEnabled: websrCompareEnabled,
                comparePosition: 50,
              }}
              onSettingsChange={async (newSettings) => {
                // 更新启用状态
                if (newSettings.enabled !== undefined) {
                  await toggleWebSR(newSettings.enabled);
                }

                // 更新模式
                if (newSettings.mode !== undefined) {
                  setWebsrMode(newSettings.mode);
                  localStorage.setItem('websr_mode', newSettings.mode);
                  await switchWebSRConfig();
                }

                // 更新内容类型
                if (newSettings.contentType !== undefined) {
                  setWebsrContentType(newSettings.contentType);
                  localStorage.setItem('websr_content_type', newSettings.contentType);
                  await switchWebSRConfig();
                }

                // 更新画质等级
                if (newSettings.networkSize !== undefined) {
                  setWebsrNetworkSize(newSettings.networkSize);
                  localStorage.setItem('websr_network_size', newSettings.networkSize);
                  await switchWebSRConfig();
                }

                // 更新对比模式
                if (newSettings.compareEnabled !== undefined) {
                  setWebsrCompareEnabled(newSettings.compareEnabled);
                }
              }}
              webGPUSupported={webGPUSupported}
              processing={false}
            />
          </div>
        </div>,
        portalContainer
      )}
      </PageLayout>

      {/* 网盘资源模态框 */}
      {showNetdiskModal && (
        <div
          className='fixed inset-0 z-9999 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4'
          onClick={() => setShowNetdiskModal(false)}
        >
          <div
            className='bg-white dark:bg-gray-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-4xl max-h-[85vh] md:max-h-[90vh] flex flex-col shadow-2xl'
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 - Fixed */}
            <div className='shrink-0 border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6'>
              <div className='flex items-center justify-between mb-3'>
                <div className='flex items-center gap-2 sm:gap-3'>
                  <div className='text-2xl sm:text-3xl'>📁</div>
                  <div>
                    <h3 className='text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-200'>
                      资源搜索
                    </h3>
                    {videoTitle && (
                      <p className='text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5'>
                        搜索关键词：{videoTitle}
                      </p>
                    )}
                  </div>
                  {netdiskLoading && netdiskResourceType === 'netdisk' && (
                    <span className='inline-block ml-2'>
                      <span className='inline-block h-4 w-4 sm:h-5 sm:w-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
                    </span>
                  )}
                  {netdiskTotal > 0 && netdiskResourceType === 'netdisk' && (
                    <span className='inline-flex items-center px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 ml-2'>
                      {netdiskTotal} 个资源
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowNetdiskModal(false)}
                  className='rounded-lg p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-95'
                  aria-label='关闭'
                >
                  <X className='h-5 w-5 sm:h-6 sm:w-6 text-gray-500' />
                </button>
              </div>

              {/* 资源类型切换器 - 仅当是动漫时显示 */}
              {(() => {
                const typeName = detail?.type_name?.toLowerCase() || '';
                const isAnime = typeName.includes('动漫') ||
                               typeName.includes('动画') ||
                               typeName.includes('anime') ||
                               typeName.includes('番剧') ||
                               typeName.includes('日剧') ||
                               typeName.includes('韩剧');

                console.log('[NetDisk] type_name:', detail?.type_name, 'isAnime:', isAnime);

                return isAnime && (
                  <div className='flex items-center gap-2'>
                    <span className='text-xs sm:text-sm text-gray-600 dark:text-gray-400'>资源类型：</span>
                    <div className='flex gap-2'>
                      <button
                        onClick={() => {
                          setNetdiskResourceType('netdisk');
                          setNetdiskResults(null);
                          setNetdiskError(null);
                        }}
                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                          netdiskResourceType === 'netdisk'
                            ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
                        }`}
                      >
                        💾 网盘资源
                      </button>
                      <button
                        onClick={() => {
                          setNetdiskResourceType('acg');
                          setNetdiskResults(null);
                          setNetdiskError(null);
                          if (videoTitle) {
                            setAcgTriggerSearch(prev => !prev);
                          }
                        }}
                        className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                          netdiskResourceType === 'acg'
                            ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
                        }`}
                      >
                        🎌 动漫磁力
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* 内容区 - Scrollable */}
            <div ref={netdiskModalContentRef} className='flex-1 overflow-y-auto p-4 sm:p-6 relative'>
              {/* 根据资源类型显示不同的内容 */}
              {netdiskResourceType === 'netdisk' ? (
                <>
                  {videoTitle && !netdiskLoading && !netdiskResults && !netdiskError && (
                    <div className='flex flex-col items-center justify-center py-12 sm:py-16 text-center'>
                      <div className='text-5xl sm:text-6xl mb-4'>📁</div>
                      <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
                        点击搜索按钮开始查找网盘资源
                      </p>
                      <button
                        onClick={() => handleNetDiskSearch(videoTitle)}
                        disabled={netdiskLoading}
                        className='mt-4 px-4 sm:px-6 py-2 sm:py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 text-sm sm:text-base font-medium'
                      >
                        开始搜索
                      </button>
                    </div>
                  )}

                  <NetDiskSearchResults
                    results={netdiskResults}
                    loading={netdiskLoading}
                    error={netdiskError}
                    total={netdiskTotal}
                  />

                </>
              ) : (
                /* ACG 动漫磁力搜索 */
                <AcgSearch
                  keyword={videoTitle || ''}
                  triggerSearch={acgTriggerSearch}
                  onError={(error) => console.error('ACG搜索失败:', error)}
                />
              )}

              {/* 返回顶部按钮 - 统一放在外层，适用于所有资源类型 */}
              {((netdiskResourceType === 'netdisk' && netdiskTotal > 10) ||
                (netdiskResourceType === 'acg')) && (
                <button
                  onClick={() => {
                    if (netdiskModalContentRef.current) {
                      netdiskModalContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  className={`sticky bottom-6 left-full -ml-14 sm:bottom-8 sm:-ml-16 w-11 h-11 sm:w-12 sm:h-12 ${
                    netdiskResourceType === 'acg'
                      ? 'bg-purple-500 hover:bg-purple-600'
                      : 'bg-blue-500 hover:bg-blue-600'
                  } text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center active:scale-95 z-50 group`}
                  aria-label='返回顶部'
                >
                  <svg className='w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-y-[-2px] transition-transform' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2.5} d='M5 10l7-7m0 0l7 7m-7-7v18' />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 下载选集面板 */}
      <DownloadEpisodeSelector
      isOpen={showDownloadEpisodeSelector}
      onClose={() => setShowDownloadEpisodeSelector(false)}
      totalEpisodes={detail?.episodes?.length || 1}
      episodesTitles={detail?.episodes_titles || []}
      videoTitle={videoTitle || '视频'}
      currentEpisodeIndex={currentEpisodeIndex}
      onDownload={async (episodeIndexes) => {
        if (!detail?.episodes || detail.episodes.length === 0) {
          // 单集视频，直接下载当前
          const currentUrl = videoUrl;
          if (!currentUrl) {
            alert('无法获取视频地址');
            return;
          }
          if (!currentUrl.includes('.m3u8')) {
            alert('仅支持M3U8格式视频下载');
            return;
          }
          try {
            // 从 M3U8 URL 提取 origin 和 referer
            const urlObj = new URL(currentUrl);
            const origin = `${urlObj.protocol}//${urlObj.host}`;
            const referer = currentUrl;

            await createTask(currentUrl, videoTitle || '视频', 'TS', {
              referer,
              origin,
            });
          } catch (error) {
            console.error('创建下载任务失败:', error);
            alert('创建下载任务失败: ' + (error as Error).message);
          }
          return;
        }

        // 批量下载多集
        for (const episodeIndex of episodeIndexes) {
          try {
            const episodeUrl = detail.episodes[episodeIndex];
            if (!episodeUrl) continue;

            // 检查是否是M3U8
            if (!episodeUrl.includes('.m3u8')) {
              console.warn(`第${episodeIndex + 1}集不是M3U8格式，跳过`);
              continue;
            }

            const episodeName = `第${episodeIndex + 1}集`;
            const downloadTitle = `${videoTitle || '视频'}_${episodeName}`;

            // 从 M3U8 URL 提取 origin 和 referer
            const urlObj = new URL(episodeUrl);
            const origin = `${urlObj.protocol}//${urlObj.host}`;
            const referer = episodeUrl;

            await createTask(episodeUrl, downloadTitle, 'TS', {
              referer,
              origin,
            });
          } catch (error) {
            console.error(`创建第${episodeIndex + 1}集下载任务失败:`, error);
          }
        }
      }}
      />
    </>
  );
}


export default function PlayPage() {
  return (
    <>
      <Suspense fallback={<div>Loading...</div>}>
        <PlayPageClientWrapper />
      </Suspense>
    </>
  );
}

function PlayPageClientWrapper() {
  const searchParams = useSearchParams();
  // 使用 source + id 作为 key，强制在切换源时重新挂载组件
  // 参考：https://github.com/vercel/next.js/issues/2819
  const key = `${searchParams.get('source')}-${searchParams.get('id')}-${searchParams.get('_reload') || ''}`;

  return <PlayPageClient key={key} />;
}
