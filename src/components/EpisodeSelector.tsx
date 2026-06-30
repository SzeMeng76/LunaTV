/* eslint-disable @next/next/no-img-element */

import { useRouter } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Gauge, RefreshCw, Wifi } from 'lucide-react';

import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl, VideoSourceTestResult } from '@/lib/utils';

// 使用统一的视频测试结果类型
type VideoInfo = VideoSourceTestResult;

// 延迟容差：延迟差距小于此值时，优先比较速度（避免因微小延迟差异导致排序抖动）
const RESPONSE_TIE_BREAKER_MS = 300;

interface EpisodeSelectorProps {
  /** 总集数 */
  totalEpisodes: number;
  /** 剧集标题 */
  episodes_titles: string[];
  /** 每页显示多少集，默认 50 */
  episodesPerPage?: number;
  /** 当前选中的集数（1 开始） */
  value?: number;
  /** 用户点击选集后的回调 */
  onChange?: (episodeNumber: number) => void;
  /** 换源相关 */
  onSourceChange?: (source: string, id: string, title: string) => void;
  currentSource?: string;
  currentId?: string;
  videoTitle?: string;
  videoYear?: string;
  availableSources?: SearchResult[];
  sourceSearchLoading?: boolean;
  sourceSearchError?: string | null;
  /** 预计算的测速结果，避免重复测速 */
  precomputedVideoInfo?: Map<string, VideoInfo>;
}

/**
 * 选集组件，支持分页、自动滚动聚焦当前分页标签，以及换源功能。
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  totalEpisodes,
  episodes_titles,
  episodesPerPage = 50,
  value = 1,
  onChange,
  onSourceChange,
  currentSource,
  currentId,
  videoTitle,
  availableSources = [],
  sourceSearchLoading = false,
  sourceSearchError = null,
  precomputedVideoInfo,
}) => {
  const router = useRouter();
  const pageCount = Math.ceil(totalEpisodes / episodesPerPage);

  // 存储每个源的视频信息
  const [videoInfoMap, setVideoInfoMap] = useState<Map<string, VideoInfo>>(
    new Map()
  );
  const [attemptedSources, setAttemptedSources] = useState<Set<string>>(
    new Set()
  );

  // 手动测速相关状态
  const [manualTesting, setManualTesting] = useState(false);
  const [manualProgress, setManualProgress] = useState({ done: 0, total: 0 });
  const [testingSourceKeys, setTestingSourceKeys] = useState<Set<string>>(new Set());

  // 排序模式状态：'original' | 'speed' | 'name'
  const [sortMode, setSortMode] = useState<'original' | 'speed' | 'name'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('episodeSelectorSortMode');
      if (saved === 'speed' || saved === 'name' || saved === 'original') {
        return saved;
      }
    }
    return 'original';
  });

  // 使用 ref 来避免闭包问题
  const attemptedSourcesRef = useRef<Set<string>>(new Set());
  const videoInfoMapRef = useRef<Map<string, VideoInfo>>(new Map());

  // 同步状态到 ref
  useEffect(() => {
    attemptedSourcesRef.current = attemptedSources;
  }, [attemptedSources]);

  useEffect(() => {
    videoInfoMapRef.current = videoInfoMap;
  }, [videoInfoMap]);

  // 主要的 tab 状态：'episodes' 或 'sources'
  // 当只有一集时默认展示 "换源"，并隐藏 "选集" 标签
  const [activeTab, setActiveTab] = useState<'episodes' | 'sources'>(
    totalEpisodes > 1 ? 'episodes' : 'sources'
  );

  // 当前分页索引（0 开始）
  const initialPage = Math.floor((value - 1) / episodesPerPage);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);

  // 是否倒序显示
  const [descending, setDescending] = useState<boolean>(false);

  // 根据 descending 状态计算实际显示的分页索引
  const displayPage = useMemo(() => {
    if (descending) {
      return pageCount - 1 - currentPage;
    }
    return currentPage;
  }, [currentPage, descending, pageCount]);

  // 获取视频信息的函数 - 移除 attemptedSources 依赖避免不必要的重新创建
  const getVideoInfo = useCallback(async (source: SearchResult) => {
    const sourceKey = `${source.source}-${source.id}`;

    // 使用 ref 获取最新的状态，避免闭包问题
    if (attemptedSourcesRef.current.has(sourceKey)) {
      return;
    }

    // 获取第一集的URL
    if (!source.episodes || source.episodes.length === 0) {
      return;
    }
    const episodeUrl =
      source.episodes.length > 1 ? source.episodes[1] : source.episodes[0];

    // 标记为已尝试
    setAttemptedSources((prev) => new Set(prev).add(sourceKey));

    try {
      const info = await getVideoResolutionFromM3u8(episodeUrl);
      setVideoInfoMap((prev) => new Map(prev).set(sourceKey, info));
    } catch (error) {
      // 失败时保存错误状态
      setVideoInfoMap((prev) =>
        new Map(prev).set(sourceKey, {
          quality: '错误',
          loadSpeed: '未知',
          pingTime: 0,
          hasError: true,
          status: 'failed',
          message: error instanceof Error ? error.message : '测速失败',
          playable: false,
          testedAt: Date.now(),
        })
      );
    }
  }, []);

  // 当有预计算结果时，先合并到videoInfoMap中
  useEffect(() => {
    if (precomputedVideoInfo && precomputedVideoInfo.size > 0) {
      // 原子性地更新两个状态，避免时序问题
      setVideoInfoMap((prev) => {
        const newMap = new Map(prev);
        precomputedVideoInfo.forEach((value, key) => {
          newMap.set(key, value);
        });
        return newMap;
      });

      setAttemptedSources((prev) => {
        const newSet = new Set(prev);
        precomputedVideoInfo.forEach((info, key) => {
          if (!info.hasError) {
            newSet.add(key);
          }
        });
        return newSet;
      });

      // 同步更新 ref，确保 getVideoInfo 能立即看到更新
      precomputedVideoInfo.forEach((info, key) => {
        if (!info.hasError) {
          attemptedSourcesRef.current.add(key);
        }
      });
    }
  }, [precomputedVideoInfo]);

  // 读取本地"优选和测速"开关，默认开启
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

  // 手动测速函数
  const handleManualSpeedTest = useCallback(async () => {
    if (manualTesting || availableSources.length === 0) return;

    setManualTesting(true);
    setManualProgress({ done: 0, total: availableSources.length });

    // 清空之前的测速结果
    setVideoInfoMap(new Map());
    setAttemptedSources(new Set());
    attemptedSourcesRef.current = new Set();
    videoInfoMapRef.current = new Map();

    const batchSize = 3; // 每批测试3个源
    let completed = 0;

    for (let i = 0; i < availableSources.length; i += batchSize) {
      const batch = availableSources.slice(i, i + batchSize);

      // 标记正在测试的源
      batch.forEach(source => {
        const sourceKey = `${source.source}-${source.id}`;
        setTestingSourceKeys(prev => new Set(prev).add(sourceKey));
      });

      await Promise.all(
        batch.map(async (source) => {
          const sourceKey = `${source.source}-${source.id}`;

          if (!source.episodes || source.episodes.length === 0) {
            completed++;
            setManualProgress({ done: completed, total: availableSources.length });
            setTestingSourceKeys(prev => {
              const next = new Set(prev);
              next.delete(sourceKey);
              return next;
            });
            return;
          }

          const episodeUrl = source.episodes.length > 1 ? source.episodes[1] : source.episodes[0];

          try {
            const info = await getVideoResolutionFromM3u8(episodeUrl);
            setVideoInfoMap(prev => new Map(prev).set(sourceKey, info));
            setAttemptedSources(prev => new Set(prev).add(sourceKey));
            attemptedSourcesRef.current.add(sourceKey);
          } catch (error) {
            setVideoInfoMap(prev =>
              new Map(prev).set(sourceKey, {
                quality: '错误',
                loadSpeed: '未知',
                pingTime: 9999,
                hasError: true,
                status: 'failed',
                message: error instanceof Error ? error.message : '测速失败',
                playable: false,
                testedAt: Date.now(),
              })
            );
            setAttemptedSources(prev => new Set(prev).add(sourceKey));
            attemptedSourcesRef.current.add(sourceKey);
          } finally {
            completed++;
            setManualProgress({ done: completed, total: availableSources.length });
            setTestingSourceKeys(prev => {
              const next = new Set(prev);
              next.delete(sourceKey);
              return next;
            });
          }
        })
      );
    }

    setManualTesting(false);
    setTestingSourceKeys(new Set());

    // 测速完成后自动切换到速度排序
    setSortMode('speed');
    localStorage.setItem('episodeSelectorSortMode', 'speed');
  }, [manualTesting, availableSources]);

  // 当切换到换源tab并且有源数据时，异步获取视频信息 - 移除 attemptedSources 依赖避免循环触发
  useEffect(() => {
    const fetchVideoInfosInBatches = async () => {
      if (
        !optimizationEnabled || // 若关闭测速则直接退出
        activeTab !== 'sources' ||
        availableSources.length === 0
      )
        return;

      // 筛选出尚未测速的播放源
      const pendingSources = availableSources.filter((source) => {
        const sourceKey = `${source.source}-${source.id}`;
        return !attemptedSourcesRef.current.has(sourceKey);
      });

      if (pendingSources.length === 0) return;

      const batchSize = Math.ceil(pendingSources.length / 2);

      for (let start = 0; start < pendingSources.length; start += batchSize) {
        const batch = pendingSources.slice(start, start + batchSize);
        await Promise.all(batch.map(getVideoInfo));
      }
    };

    fetchVideoInfosInBatches();
    // 依赖项保持与之前一致
  }, [activeTab, availableSources, getVideoInfo, optimizationEnabled]);

  // 升序分页标签
  const categoriesAsc = useMemo(() => {
    return Array.from({ length: pageCount }, (_, i) => {
      const start = i * episodesPerPage + 1;
      const end = Math.min(start + episodesPerPage - 1, totalEpisodes);
      return { start, end };
    });
  }, [pageCount, episodesPerPage, totalEpisodes]);

  // 根据 descending 状态决定分页标签的排序和内容
  const categories = useMemo(() => {
    if (descending) {
      // 倒序时，label 也倒序显示
      return [...categoriesAsc]
        .reverse()
        .map(({ start, end }) => `${end}-${start}`);
    }
    return categoriesAsc.map(({ start, end }) => `${start}-${end}`);
  }, [categoriesAsc, descending]);

  const categoryContainerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 添加鼠标悬停状态管理
  const [isCategoryHovered, setIsCategoryHovered] = useState(false);

  // 阻止页面竖向滚动
  const preventPageScroll = useCallback((e: WheelEvent) => {
    if (isCategoryHovered) {
      e.preventDefault();
    }
  }, [isCategoryHovered]);

  // 处理滚轮事件，实现横向滚动
  const handleWheel = useCallback((e: WheelEvent) => {
    if (isCategoryHovered && categoryContainerRef.current) {
      e.preventDefault(); // 阻止默认的竖向滚动

      const container = categoryContainerRef.current;
      const scrollAmount = e.deltaY * 2; // 调整滚动速度

      // 根据滚轮方向进行横向滚动
      container.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
      });
    }
  }, [isCategoryHovered]);

  // 添加全局wheel事件监听器
  useEffect(() => {
    if (isCategoryHovered) {
      // 鼠标悬停时阻止页面滚动
      document.addEventListener('wheel', preventPageScroll, { passive: false });
      document.addEventListener('wheel', handleWheel, { passive: false });
    } else {
      // 鼠标离开时恢复页面滚动
      document.removeEventListener('wheel', preventPageScroll);
      document.removeEventListener('wheel', handleWheel);
    }

    return () => {
      document.removeEventListener('wheel', preventPageScroll);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [isCategoryHovered, preventPageScroll, handleWheel]);

  // 当分页切换时，将激活的分页标签滚动到视口中间
  useEffect(() => {
    const btn = buttonRefs.current[displayPage];
    if (btn) {
      // 使用原生 scrollIntoView API 自动滚动到视口中央
      btn.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',  // 水平居中显示选中的分页
      });
    }
  }, [displayPage, pageCount]);

  // 处理换源tab点击，只在点击时才搜索
  const handleSourceTabClick = () => {
    setActiveTab('sources');
  };

  const handleCategoryClick = useCallback(
    (index: number) => {
      if (descending) {
        // 在倒序时，需要将显示索引转换为实际索引
        setCurrentPage(pageCount - 1 - index);
      } else {
        setCurrentPage(index);
      }
    },
    [descending, pageCount]
  );

  const handleEpisodeClick = useCallback(
    (episodeNumber: number) => {
      onChange?.(episodeNumber);
    },
    [onChange]
  );

  const handleSourceClick = useCallback(
    (source: SearchResult) => {
      onSourceChange?.(source.source, source.id, source.title);
    },
    [onSourceChange]
  );

  const currentStart = currentPage * episodesPerPage + 1;
  const currentEnd = Math.min(
    currentStart + episodesPerPage - 1,
    totalEpisodes
  );

  return (
    <div className='md:ml-2 px-4 sm:px-4 py-0 h-full rounded-xl bg-black/10 dark:bg-white/5 flex flex-col border border-white/0 dark:border-white/30 overflow-hidden'>
      {/* 主要的 Tab 切换 - 美化版本 */}
      <div className='flex mb-2 -mx-4 shrink-0 relative'>
        {totalEpisodes > 1 && (
          <div
            onClick={() => setActiveTab('episodes')}
            className={`group flex-1 py-3.5 sm:py-4 px-4 sm:px-6 text-center cursor-pointer transition-all duration-300 font-semibold relative overflow-hidden active:scale-[0.98] min-h-[44px]
              ${activeTab === 'episodes'
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-700 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400'
              }
            `.trim()}
          >
            {/* 激活态背景光晕 */}
            {activeTab === 'episodes' && (
              <div className='absolute inset-0 bg-linear-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 -z-10'></div>
            )}
            {/* 非激活态背景 */}
            {activeTab !== 'episodes' && (
              <div className='absolute inset-0 bg-gray-100/50 dark:bg-gray-800/50 group-hover:bg-gray-100 dark:group-hover:bg-gray-800/70 transition-colors duration-300 -z-10'></div>
            )}
            {/* 悬浮光效 */}
            <div className='absolute inset-0 bg-linear-to-r from-transparent via-green-100/0 to-transparent dark:via-green-500/0 group-hover:via-green-100/50 dark:group-hover:via-green-500/10 transition-all duration-300 -z-10'></div>
            <span className='relative z-10 font-bold text-sm sm:text-base'>选集</span>
          </div>
        )}
        <div
          onClick={handleSourceTabClick}
          className={`group flex-1 py-3.5 sm:py-4 px-4 sm:px-6 text-center cursor-pointer transition-all duration-300 font-semibold relative overflow-hidden active:scale-[0.98] min-h-[44px]
            ${activeTab === 'sources'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400'
            }
          `.trim()}
        >
          {/* 激活态背景光晕 */}
          {activeTab === 'sources' && (
            <div className='absolute inset-0 bg-linear-to-r from-blue-50 via-cyan-50 to-sky-50 dark:from-blue-900/20 dark:via-cyan-900/20 dark:to-sky-900/20 -z-10'></div>
          )}
          {/* 非激活态背景 */}
          {activeTab !== 'sources' && (
            <div className='absolute inset-0 bg-gray-100/50 dark:bg-gray-800/50 group-hover:bg-gray-100 dark:group-hover:bg-gray-800/70 transition-colors duration-300 -z-10'></div>
          )}
          {/* 悬浮光效 */}
          <div className='absolute inset-0 bg-linear-to-r from-transparent via-blue-100/0 to-transparent dark:via-blue-500/0 group-hover:via-blue-100/50 dark:group-hover:via-blue-500/10 transition-all duration-300 -z-10'></div>
          <span className='relative z-10 font-bold text-sm sm:text-base'>换源</span>
        </div>
      </div>

      {/* 选集 Tab 内容 */}
      {activeTab === 'episodes' && (
        <>
          {/* 分类标签 */}
          <div className='flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4 border-b border-gray-300 dark:border-gray-700 -mx-4 px-4 shrink-0'>
            <div
              className='flex-1 overflow-x-auto scrollbar-hide'
              ref={categoryContainerRef}
              onMouseEnter={() => setIsCategoryHovered(true)}
              onMouseLeave={() => setIsCategoryHovered(false)}
              style={{
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              <div className='flex gap-2 min-w-max pb-2'>
                {categories.map((label, idx) => {
                  const isActive = idx === displayPage;
                  return (
                    <button
                      key={label}
                      ref={(el) => {
                        buttonRefs.current[idx] = el;
                      }}
                      onClick={() => handleCategoryClick(idx)}
                      className={`min-w-[64px] sm:min-w-[80px] relative py-2 sm:py-2.5 px-2 sm:px-3 text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0 text-center rounded-t-lg active:scale-95
                        ${isActive
                          ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                          : 'text-gray-700 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400 hover:bg-gray-50 dark:hover:bg-white/5'
                        }
                      `.trim()}
                    >
                      {label}
                      {isActive && (
                        <div className='absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 dark:bg-green-400 rounded-full' />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* 向上/向下按钮 */}
            <button
              className='shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-gray-700 hover:text-green-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-green-400 dark:hover:bg-white/20 transition-all duration-200 hover:scale-105 active:scale-95 transform translate-y-[-4px]'
              onClick={() => {
                // 切换集数排序（正序/倒序）
                setDescending((prev) => !prev);
              }}
            >
              <svg
                className='w-4 h-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4'
                />
              </svg>
            </button>
          </div>

          {/* 集数网格 */}
          <div className='flex flex-wrap gap-2 sm:gap-3 overflow-y-auto flex-1 content-start pb-4'>
            {(() => {
              const len = currentEnd - currentStart + 1;
              const episodes = Array.from({ length: len }, (_, i) =>
                descending ? currentEnd - i : currentStart + i
              );
              return episodes;
            })().map((episodeNumber) => {
              const isActive = episodeNumber === value;
              return (
                <button
                  key={episodeNumber}
                  onClick={() => handleEpisodeClick(episodeNumber - 1)}
                  className={`group min-h-[40px] sm:min-h-[44px] min-w-[40px] sm:min-w-[44px] px-2 sm:px-3 py-2 flex items-center justify-center text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 whitespace-nowrap font-mono relative overflow-hidden active:scale-95
                    ${isActive
                      ? 'bg-linear-to-r from-green-500 via-emerald-500 to-teal-500 text-white shadow-lg shadow-green-500/30 dark:from-green-600 dark:via-emerald-600 dark:to-teal-600 dark:shadow-green-500/20 scale-105'
                      : 'bg-linear-to-r from-gray-200 to-gray-100 text-gray-700 hover:from-gray-300 hover:to-gray-200 hover:scale-105 hover:shadow-md dark:from-white/10 dark:to-white/5 dark:text-gray-300 dark:hover:from-white/20 dark:hover:to-white/15'
                    }`.trim()}
                >
                  {/* 激活态光晕效果 */}
                  {isActive && (
                    <div className='absolute inset-0 bg-linear-to-r from-green-400 via-emerald-400 to-teal-400 opacity-30 blur'></div>
                  )}
                  {/* 悬浮态闪光效果 */}
                  {!isActive && (
                    <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/20 dark:group-hover:via-white/10 transition-all duration-300'></div>
                  )}
                  <span className='relative z-10'>
                    {(() => {
                      const title = episodes_titles?.[episodeNumber - 1];
                      if (!title) {
                        return episodeNumber;
                      }
                      // 如果匹配"第X集"、"第X话"、"X集"、"X话"格式，提取中间的数字
                      const match = title.match(/(?:第)?(\d+)(?:集|话)/);
                      if (match) {
                        return match[1];
                      }
                      return title;
                    })()}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {activeTab === 'sources' && (
        <div className='flex flex-col h-full mt-4'>
          {/* 手动测速面板 */}
          <div className='mb-4 p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-700'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <Gauge className='w-5 h-5 text-blue-600 dark:text-blue-400' />
                <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  视频源测速
                </span>
              </div>
              <button
                onClick={handleManualSpeedTest}
                disabled={manualTesting || availableSources.length === 0}
                className='flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-all duration-200 active:scale-95 disabled:cursor-not-allowed'
              >
                <RefreshCw className={`w-4 h-4 ${manualTesting ? 'animate-spin' : ''}`} />
                {manualTesting ? '测速中...' : '手动测速'}
              </button>
            </div>
            {manualTesting && (
              <div className='mt-2 flex items-center gap-2'>
                <div className='flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
                  <div
                    className='h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300'
                    style={{ width: `${(manualProgress.done / manualProgress.total) * 100}%` }}
                  />
                </div>
                <span className='text-xs text-gray-600 dark:text-gray-400 font-mono'>
                  {manualProgress.done}/{manualProgress.total}
                </span>
              </div>
            )}
          </div>

          {/* 排序模式切换 */}
          <div className='mb-4 flex items-center gap-2'>
            <span className='text-xs text-gray-600 dark:text-gray-400'>排序:</span>
            <div className='flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg'>
              <button
                onClick={() => {
                  setSortMode('original');
                  localStorage.setItem('episodeSelectorSortMode', 'original');
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                  sortMode === 'original'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                原始
              </button>
              <button
                onClick={() => {
                  setSortMode('speed');
                  localStorage.setItem('episodeSelectorSortMode', 'speed');
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1 ${
                  sortMode === 'speed'
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Gauge className='w-3 h-3' />
                速度
              </button>
              <button
                onClick={() => {
                  setSortMode('name');
                  localStorage.setItem('episodeSelectorSortMode', 'name');
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                  sortMode === 'name'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                名称
              </button>
            </div>
            {sortMode === 'speed' && (
              <span className='text-xs text-blue-600 dark:text-blue-400 font-medium animate-fade-in'>
                ⚡ 最快优先
              </span>
            )}
          </div>

          {sourceSearchLoading && (
            <div className='flex items-center justify-center py-8'>
              <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
              <span className='ml-2 text-sm text-gray-600 dark:text-gray-300'>
                搜索中...
              </span>
            </div>
          )}

          {sourceSearchError && (
            <div className='flex items-center justify-center py-8'>
              <div className='text-center'>
                <div className='text-red-500 text-2xl mb-2'>⚠️</div>
                <p className='text-sm text-red-600 dark:text-red-400'>
                  {sourceSearchError}
                </p>
              </div>
            </div>
          )}

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length === 0 && (
              <div className='flex items-center justify-center py-8'>
                <div className='text-center'>
                  <div className='text-gray-400 text-2xl mb-2'>📺</div>
                  <p className='text-sm text-gray-600 dark:text-gray-300'>
                    暂无可用的换源
                  </p>
                </div>
              </div>
            )}

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length > 0 && (
              <div className='flex-1 overflow-y-auto space-y-2 sm:space-y-3 pb-20'>
                {availableSources
                  .sort((a, b) => {
                    const aIsCurrent =
                      a.source?.toString() === currentSource?.toString() &&
                      a.id?.toString() === currentId?.toString();
                    const bIsCurrent =
                      b.source?.toString() === currentSource?.toString() &&
                      b.id?.toString() === currentId?.toString();

                    // 当前源始终排在最前面
                    if (aIsCurrent && !bIsCurrent) return -1;
                    if (!aIsCurrent && bIsCurrent) return 1;

                    // 根据排序模式排序
                    if (sortMode === 'speed') {
                      const aKey = `${a.source}-${a.id}`;
                      const bKey = `${b.source}-${b.id}`;
                      const aInfo = videoInfoMap.get(aKey);
                      const bInfo = videoInfoMap.get(bKey);

                      // 有测速结果的排在前面
                      if (aInfo && !bInfo) return -1;
                      if (!aInfo && bInfo) return 1;

                      // 都有测速结果，按延迟排序（低到高）
                      if (aInfo && bInfo) {
                        // 可播放的排在不可播放的前面
                        const aPlayable = aInfo.playable !== false;
                        const bPlayable = bInfo.playable !== false;
                        if (aPlayable && !bPlayable) return -1;
                        if (!aPlayable && bPlayable) return 1;

                        // 都可播放，智能排序：延迟 + 速度
                        if (aPlayable && bPlayable) {
                          const pingDiff = (aInfo.pingTime || 0) - (bInfo.pingTime || 0);

                          // 延迟差距大于 300ms 时，按延迟排序
                          if (Math.abs(pingDiff) > RESPONSE_TIE_BREAKER_MS) {
                            return pingDiff;
                          }

                          // 延迟差距小，比速度（速度高的优先）
                          const speedDiff = (bInfo.speedKBps || 0) - (aInfo.speedKBps || 0);
                          if (speedDiff !== 0) return speedDiff;

                          // 速度也一样，再精确比延迟
                          if (pingDiff !== 0) return pingDiff;
                        }
                      }
                    } else if (sortMode === 'name') {
                      // 按名称排序
                      return (a.title || '').localeCompare(b.title || '', 'zh-CN');
                    }

                    // 默认保持原始顺序
                    return 0;
                  })
                  .map((source, index) => {
                    const isCurrentSource =
                      source.source?.toString() === currentSource?.toString() &&
                      source.id?.toString() === currentId?.toString();
                    return (
                      <div
                        key={`${source.source}-${source.id}`}
                        onClick={() =>
                          !isCurrentSource && handleSourceClick(source)
                        }
                        className={`group flex items-start gap-2 sm:gap-3 px-2 sm:px-3 py-2 sm:py-3 rounded-xl transition-all select-none duration-200 relative overflow-hidden active:scale-[0.98]
                      ${isCurrentSource
                            ? 'bg-linear-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/30 dark:via-emerald-900/30 dark:to-teal-900/30 border-2 border-green-500/50 dark:border-green-400/50 shadow-lg shadow-green-500/10'
                            : 'bg-linear-to-r from-gray-50 to-gray-100/50 dark:from-white/5 dark:to-white/10 hover:from-blue-50 hover:to-cyan-50 dark:hover:from-blue-900/20 dark:hover:to-cyan-900/20 hover:scale-[1.02] hover:shadow-md cursor-pointer border border-gray-200/50 dark:border-white/10'
                          }`.trim()}
                      >
                        {/* 当前源标记 */}
                        {isCurrentSource && (
                          <div className='absolute top-2 right-2 z-10'>
                            <div className='relative'>
                              <div className='absolute inset-0 bg-green-500 rounded-full blur opacity-60 animate-pulse'></div>
                              <div className='relative bg-linear-to-r from-green-500 to-emerald-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold shadow-lg'>
                                当前源
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 悬浮光效 */}
                        {!isCurrentSource && (
                          <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/0 to-transparent group-hover:via-white/30 dark:group-hover:via-white/5 transition-all duration-500 pointer-events-none'></div>
                        )}

                        {/* 封面 */}
                        <div className='shrink-0 w-10 h-16 sm:w-12 sm:h-20 bg-linear-to-br from-gray-300 to-gray-200 dark:from-gray-600 dark:to-gray-700 rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-all duration-200'>
                          {source.episodes && source.episodes.length > 0 && (
                            <img
                              src={processImageUrl(source.poster)}
                              alt={source.title}
                              className='w-full h-full object-cover'
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          )}
                        </div>

                        {/* 信息区域 */}
                        <div className='flex-1 min-w-0 flex flex-col justify-between h-16 sm:h-20 relative'>
                          {/* 标题 - 顶部 */}
                          <div className='flex items-start gap-2 sm:gap-3 h-5 sm:h-6'>
                            <div className='flex-1 min-w-0 relative group/title'>
                              <h3 className='font-medium text-sm sm:text-base truncate text-gray-900 dark:text-gray-100 leading-none'>
                                {source.title}
                              </h3>
                              {/* 标题级别的 tooltip - 第一个元素不显示 */}
                              {index !== 0 && (
                                <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover/title:opacity-100 group-hover/title:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap z-500 pointer-events-none'>
                                  {source.title}
                                  <div className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800'></div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 源名称和集数信息 - 垂直居中 */}
                          <div className='flex items-center justify-between gap-2'>
                            <span className='text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 border border-gray-500/60 rounded text-gray-700 dark:text-gray-300'>
                              {source.source_name}
                            </span>
                            {source.episodes.length > 1 && (
                              <span className='text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium'>
                                {source.episodes.length} 集
                              </span>
                            )}
                          </div>

                          {/* 网络信息 - 底部 */}
                          <div className='flex items-end h-5 sm:h-6'>
                            {(() => {
                              const sourceKey = `${source.source}-${source.id}`;
                              const videoInfo = videoInfoMap.get(sourceKey);
                              const isTesting = testingSourceKeys.has(sourceKey);

                              if (isTesting) {
                                return (
                                  <div className='text-blue-600 dark:text-blue-400 font-medium text-[10px] sm:text-xs animate-pulse'>
                                    正在测速...
                                  </div>
                                );
                              }

                              if (videoInfo) {
                                if (videoInfo.hasError || videoInfo.status === 'failed') {
                                  return (
                                    <div className='text-red-500/90 dark:text-red-400 font-medium text-[10px] sm:text-xs' title={videoInfo.message}>
                                      {videoInfo.message || '测速失败'}
                                    </div>
                                  );
                                } else if (!videoInfo.hasError) {
                                  return (
                                    <div className='flex items-end gap-2 sm:gap-3'>
                                      <div className='text-green-600 dark:text-green-400 font-medium text-[10px] sm:text-xs'>
                                        {videoInfo.loadSpeed}
                                      </div>
                                      <div className='text-orange-600 dark:text-orange-400 font-medium text-[10px] sm:text-xs'>
                                        {videoInfo.pingTime}ms
                                      </div>
                                    </div>
                                  );
                                }
                              }

                              return null;
                            })()}
                          </div>

                          {/* 质量徽章 - 右下角绝对定位 */}
                          {(() => {
                            const sourceKey = `${source.source}-${source.id}`;
                            const videoInfo = videoInfoMap.get(sourceKey);
                            const isTesting = testingSourceKeys.has(sourceKey);

                            // 正在测试中
                            if (isTesting) {
                              return (
                                <div className='absolute bottom-0 right-0 flex items-center gap-1 bg-blue-500/10 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded text-xs shrink-0'>
                                  <RefreshCw className='w-3 h-3 animate-spin' />
                                  <span>检测中</span>
                                </div>
                              );
                            }

                            if (videoInfo) {
                              if (videoInfo.hasError || videoInfo.status === 'failed') {
                                return (
                                  <div className='absolute bottom-0 right-0 bg-red-500/10 dark:bg-red-400/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded text-xs shrink-0 min-w-[60px] text-center'>
                                    检测失败
                                  </div>
                                );
                              } else if (videoInfo.quality !== '未知') {
                                // 根据分辨率设置不同颜色和图标
                                const is4K = videoInfo.quality === '4K';
                                const is2K = videoInfo.quality === '2K';
                                const is1080p = videoInfo.quality === '1080p';
                                const is720p = videoInfo.quality === '720p';

                                let bgColor = 'bg-gray-500/10 dark:bg-gray-400/20';
                                let textColor = 'text-gray-600 dark:text-gray-400';

                                if (is4K || is2K) {
                                  bgColor = 'bg-purple-500/10 dark:bg-purple-400/20';
                                  textColor = 'text-purple-600 dark:text-purple-400';
                                } else if (is1080p || is720p) {
                                  bgColor = 'bg-green-500/10 dark:bg-green-400/20';
                                  textColor = 'text-green-600 dark:text-green-400';
                                } else if (videoInfo.quality === '480p' || videoInfo.quality === 'SD') {
                                  bgColor = 'bg-yellow-500/10 dark:bg-yellow-400/20';
                                  textColor = 'text-yellow-600 dark:text-yellow-400';
                                }

                                return (
                                  <div className={`absolute bottom-0 right-0 flex items-center gap-1 ${bgColor} ${textColor} px-2 py-0.5 rounded text-xs shrink-0 font-semibold`}>
                                    <Wifi className='w-3 h-3' />
                                    <span>{videoInfo.quality}</span>
                                  </div>
                                );
                              } else if (videoInfo.status === 'ok' || videoInfo.playable) {
                                return (
                                  <div className='absolute bottom-0 right-0 flex items-center gap-1 bg-green-500/10 dark:bg-green-400/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded text-xs shrink-0'>
                                    <Wifi className='w-3 h-3' />
                                    <span>已连通</span>
                                  </div>
                                );
                              }
                            }

                            return null;
                          })()}
                        </div>
                      </div>
                    );
                  })}
                <div className='shrink-0 mt-auto pt-2 border-t border-gray-400 dark:border-gray-700'>
                  <button
                    onClick={() => {
                      if (videoTitle) {
                        router.push(
                          `/search?q=${encodeURIComponent(videoTitle)}`
                        );
                      }
                    }}
                    className='w-full text-center text-xs text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors py-2'
                  >
                    影片匹配有误？点击去搜索
                  </button>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default EpisodeSelector;
