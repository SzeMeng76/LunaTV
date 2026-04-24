/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any,@typescript-eslint/no-non-null-assertion,no-empty */
'use client';

import { ChevronUp, Grid2x2, List, Play, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, experimental_streamedQuery as streamedQuery } from '@tanstack/react-query';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';

// ─── streamedQuery 类型 ───────────────────────────────────────────────────────

type SSEChunk =
  | { type: 'start'; totalSources: number }
  | { type: 'source_result'; results: SearchResult[] }  // 80ms 批量
  | { type: 'source_progress' }                          // 进度 +1（无数据）
  | { type: 'source_error' }
  | { type: 'complete'; completedSources: number };

type StreamedState = {
  results: SearchResult[];
  totalSources: number;
  completedSources: number;
};

const STREAMED_INITIAL: StreamedState = { results: [], totalSources: 0, completedSources: 0 };

/**
 * 将 EventSource 包装为 AsyncIterable<SSEChunk>
 *
 * 缓冲策略：
 * - source_result 数据积入 pending，每 80ms 批量 yield 一次
 * - complete 到达时同步 flush pending，确保数据不丢失
 * - 进度（completedSources）通过独立的 source_progress chunk 实时更新
 */
function eventSourceIterable(url: string, signal?: AbortSignal): AsyncIterable<SSEChunk> {
  return {
    [Symbol.asyncIterator]() {
      type Item = { value: SSEChunk; done: false } | { value: undefined; done: true };
      const queue: Item[] = [];
      let waiting: ((item: Item) => void) | null = null;
      let closed = false;

      let pending: SearchResult[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const enqueue = (chunk: SSEChunk) => {
        if (closed) return;
        const item: Item = { value: chunk, done: false };
        if (waiting) { const w = waiting; waiting = null; w(item); }
        else queue.push(item);
      };

      const flushPending = () => {
        flushTimer = null;
        if (pending.length === 0) return;
        enqueue({ type: 'source_result', results: pending });
        pending = [];
      };

      const close = (completedSources?: number) => {
        if (closed) return;
        // 同步 flush 剩余缓冲
        if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
        if (pending.length > 0) {
          enqueue({ type: 'source_result', results: pending });
          pending = [];
        }
        if (completedSources !== undefined) {
          enqueue({ type: 'complete', completedSources });
        }
        closed = true;
        const done: Item = { value: undefined, done: true };
        if (waiting) { const w = waiting; waiting = null; w(done); }
        else queue.push(done);
      };

      const es = new EventSource(url);

      es.onmessage = (event) => {
        if (!event.data || closed) return;
        try {
          const payload = JSON.parse(event.data);
          switch (payload.type) {
            case 'start':
              enqueue({ type: 'start', totalSources: payload.totalSources || 0 });
              break;
            case 'source_result':
              // 进度立即更新
              enqueue({ type: 'source_progress' });
              // 数据缓冲 80ms 批量
              if (Array.isArray(payload.results) && payload.results.length > 0) {
                pending.push(...(payload.results as SearchResult[]));
                if (flushTimer === null) {
                  flushTimer = setTimeout(flushPending, 80);
                }
              }
              break;
            case 'source_error':
              enqueue({ type: 'source_error' });
              break;
            case 'complete':
              try { es.close(); } catch {}
              close(payload.completedSources ?? 0);
              break;
          }
        } catch {}
      };

      es.onerror = () => {
        try { es.close(); } catch {}
        close();
      };

      signal?.addEventListener('abort', () => {
        try { es.close(); } catch {}
        close();
      });

      return {
        next(): Promise<IteratorResult<SSEChunk>> {
          if (queue.length > 0) return Promise.resolve(queue.shift()!);
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => { waiting = resolve; });
        },
      };
    },
  };
}

import ImageViewer from '@/components/ImageViewer';
import PageLayout from '@/components/PageLayout';
import SearchResultFilter, { SearchFilterCategory } from '@/components/SearchResultFilter';
import SearchSuggestions from '@/components/SearchSuggestions';
import VideoCard, { VideoCardHandle } from '@/components/VideoCard';
import VirtualGrid from '@/components/VirtualGrid';
import NetDiskSearchResults from '@/components/NetDiskSearchResults';
import YouTubeVideoCard from '@/components/YouTubeVideoCard';
import DirectYouTubePlayer from '@/components/DirectYouTubePlayer';
import TMDBFilterPanel, { TMDBFilterState } from '@/components/TMDBFilterPanel';
import AcgSearch from '@/components/AcgSearch';
import stcasc from 'switch-chinese';

const chineseConverter = stcasc();

function SearchPageClient() {
  // 根据 type_name 推断内容类型的辅助函数
  const inferTypeFromName = (typeName?: string, episodeCount?: number): string => {
    if (!typeName) {
      // 如果没有 type_name，使用集数判断（向后兼容）
      return episodeCount && episodeCount > 1 ? 'tv' : 'movie';
    }
    const lowerType = typeName.toLowerCase();
    if (lowerType.includes('综艺') || lowerType.includes('variety')) return 'variety';
    if (lowerType.includes('电影') || lowerType.includes('movie')) return 'movie';
    if (lowerType.includes('电视剧') || lowerType.includes('剧集') || lowerType.includes('tv') || lowerType.includes('series')) return 'tv';
    if (lowerType.includes('动漫') || lowerType.includes('动画') || lowerType.includes('anime')) return 'anime';
    if (lowerType.includes('纪录片') || lowerType.includes('documentary')) return 'documentary';
    // 默认根据集数判断
    return episodeCount && episodeCount > 1 ? 'tv' : 'movie';
  };

  const getSearchResultUrl = (params: {
    title: string;
    year?: string;
    type?: string;
    source?: string;
    id?: string;
    query?: string;
    isAggregate?: boolean;
    doubanId?: number;
  }) => {
    const yearParam = params.year && params.year !== 'unknown' ? `&year=${params.year}` : '';
    const queryParam = params.query ? `&stitle=${encodeURIComponent(params.query.trim())}` : '';
    const typeParam = params.type ? `&stype=${params.type}` : '';
    const preferParam = params.isAggregate ? '&prefer=true' : '';
    const doubanParam = params.doubanId && params.doubanId > 0 ? `&douban_id=${params.doubanId}` : '';
    if (params.isAggregate || !params.source || !params.id) {
      return `/play?title=${encodeURIComponent(params.title.trim())}${yearParam}${typeParam}${preferParam}${queryParam}${doubanParam}`;
    }
    return `/play?source=${params.source}&id=${params.id}&title=${encodeURIComponent(params.title.trim())}${yearParam}${preferParam}${queryParam}${typeParam}${doubanParam}`;
  };

  const renderTag = (label: string, className: string) => (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );

  const renderListItem = (item: {
    key: string;
    title: string;
    poster: string;
    year?: string;
    type: 'movie' | 'tv';
    episodes?: number;
    sourceName?: string;
    sourceNames?: string[];
    doubanId?: number;
    desc?: string;
    vodRemarks?: string;
    isAggregate?: boolean;
    source?: string;
    id?: string;
    query?: string;
  }) => {
    const yearText = item.year && item.year !== 'unknown' ? item.year : '';
    const sourceTags = item.isAggregate
      ? Array.from(new Set(item.sourceNames || []))
      : item.sourceName ? [item.sourceName] : [];
    const isExpanded = !!expandedSourceTags[item.key];
    const maxVisibleSourceTags = 3;
    const visibleSourceTags = isExpanded ? sourceTags : sourceTags.slice(0, maxVisibleSourceTags);
    const hiddenSourceCount = Math.max(0, sourceTags.length - visibleSourceTags.length);
    const description = (item.desc || '').trim();
    const itemUrl = getSearchResultUrl({
      title: item.title,
      year: item.year,
      type: item.type,
      source: item.source,
      id: item.id,
      query: item.query,
      isAggregate: item.isAggregate,
      doubanId: item.doubanId,
    });

    return (
      <button
        key={item.key}
        type='button'
        onClick={() => router.push(itemUrl)}
        className='group w-full rounded-2xl border border-gray-200/80 bg-white/90 p-3 text-left shadow-sm transition-all hover:border-green-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900/70 dark:hover:border-green-700'
      >
        <div className='flex items-start gap-4'>
          <div className='relative h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.poster}
              alt={item.title}
              className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]'
              loading='lazy'
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImage({ url: item.poster, alt: item.title });
              }}
            />
          </div>
          <div className='min-w-0 flex-1'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0 flex-1'>
                <h3 className='line-clamp-2 text-base font-semibold text-gray-900 dark:text-gray-100'>
                  {item.title}
                </h3>
                <div className='mt-2 flex flex-wrap gap-2'>
                  {renderTag(
                    item.type === 'movie' ? '电影' : '剧集',
                    'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  )}
                  {yearText && renderTag(yearText, 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}
                  {item.episodes && item.episodes > 0 && renderTag(
                    `${item.episodes}集`,
                    'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  )}
                  {item.vodRemarks && renderTag(
                    item.vodRemarks,
                    'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  )}
                  {item.doubanId && item.doubanId > 0 && renderTag(
                    '豆瓣',
                    'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  )}
                </div>
                {description && (
                  <p className='mt-3 line-clamp-3 text-sm leading-6 text-gray-600 dark:text-gray-400'>
                    {description}
                  </p>
                )}
              </div>
              <div className='shrink-0 self-center'>
                <div className='flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white shadow-md transition-transform group-hover:scale-110 group-hover:bg-green-600'>
                  <Play className='h-4 w-4 translate-x-0.5' fill='currentColor' />
                </div>
              </div>
            </div>
          </div>
        </div>
        {sourceTags.length > 0 && (
          <div className={`mt-3 flex gap-2 ${isExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'}`}>
            {visibleSourceTags.map((sourceName) => (
              <span
                key={`${item.key}-${sourceName}`}
                className='inline-flex max-w-full shrink-0 items-center truncate rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                title={sourceName}
              >
                {sourceName}
              </span>
            ))}
            {hiddenSourceCount > 0 && (
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedSourceTags((prev) => ({ ...prev, [item.key]: true }));
                }}
                className='inline-flex shrink-0 items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50'
              >
                +{hiddenSourceCount}
              </button>
            )}
          </div>
        )}
      </button>
    );
  };

  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQueryRef = useRef<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [useFluidSearch, setUseFluidSearch] = useState(true);
  // 虚拟化开关状态
  const [useVirtualization, setUseVirtualization] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('useVirtualization');
      return saved !== null ? JSON.parse(saved) : true; // 默认启用
    }
    return true;
  });
  // 精确搜索开关
  const [exactSearch, setExactSearch] = useState(true);

  // 网盘搜索相关状态
  const [searchType, setSearchType] = useState<'video' | 'netdisk' | 'youtube' | 'tmdb-actor'>('video');
  const [netdiskResourceType, setNetdiskResourceType] = useState<'netdisk' | 'acg'>('netdisk'); // 网盘资源类型：普通网盘或动漫磁力
  const [netdiskResults, setNetdiskResults] = useState<{ [key: string]: any[] } | null>(null);
  const [netdiskLoading, setNetdiskLoading] = useState(false);
  const [netdiskError, setNetdiskError] = useState<string | null>(null);
  const [netdiskTotal, setNetdiskTotal] = useState(0);

  // ACG动漫磁力搜索相关状态
  const [acgTriggerSearch, setAcgTriggerSearch] = useState<boolean>();
  const [acgError, setAcgError] = useState<string | null>(null);
  
  // YouTube搜索相关状态
  const [youtubeResults, setYoutubeResults] = useState<any[] | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeWarning, setYoutubeWarning] = useState<string | null>(null);
  const [youtubeContentType, setYoutubeContentType] = useState<'all' | 'music' | 'movie' | 'educational' | 'gaming' | 'sports' | 'news'>('all');
  const [youtubeSortOrder, setYoutubeSortOrder] = useState<'relevance' | 'date' | 'rating' | 'viewCount' | 'title'>('relevance');
  const [youtubeMode, setYoutubeMode] = useState<'search' | 'direct'>('search'); // 新增：YouTube模式

  // TMDB演员搜索相关状态
  const [tmdbActorResults, setTmdbActorResults] = useState<any[] | null>(null);
  const [tmdbActorLoading, setTmdbActorLoading] = useState(false);
  const [tmdbActorError, setTmdbActorError] = useState<string | null>(null);
  const [tmdbActorType, setTmdbActorType] = useState<'movie' | 'tv'>('movie');

  // TMDB筛选状态
  const [tmdbFilterState, setTmdbFilterState] = useState<TMDBFilterState>({
    startYear: undefined,
    endYear: undefined,
    minRating: undefined,
    maxRating: undefined,
    minPopularity: undefined,
    maxPopularity: undefined,
    minVoteCount: undefined,
    minEpisodeCount: undefined,
    genreIds: [],
    languages: [],
    onlyRated: false,
    sortBy: 'popularity',
    sortOrder: 'desc',
    limit: undefined // 移除默认限制，显示所有结果
  });

  // TMDB筛选面板显示状态
  const [tmdbFilterVisible, setTmdbFilterVisible] = useState(false);
  // 聚合卡片 refs 与聚合统计缓存
  const groupRefs = useRef<Map<string, React.RefObject<VideoCardHandle>>>(new Map());
  const groupStatsRef = useRef<Map<string, { douban_id?: number; episodes?: number; source_names: string[] }>>(new Map());

  const getGroupRef = (key: string) => {
    let ref = groupRefs.current.get(key);
    if (!ref) {
      ref = React.createRef<VideoCardHandle>();
      groupRefs.current.set(key, ref);
    }
    return ref;
  };

  const computeGroupStats = (group: SearchResult[]) => {
    const episodes = (() => {
      const countMap = new Map<number, number>();
      group.forEach((g) => {
        const len = g.episodes?.length || 0;
        if (len > 0) countMap.set(len, (countMap.get(len) || 0) + 1);
      });
      let max = 0;
      let res = 0;
      countMap.forEach((v, k) => {
        if (v > max) { max = v; res = k; }
      });
      return res;
    })();
    const source_names = Array.from(new Set(group.map((g) => g.source_name).filter(Boolean))) as string[];

    const douban_id = (() => {
      const countMap = new Map<number, number>();
      group.forEach((g) => {
        if (g.douban_id && g.douban_id > 0) {
          countMap.set(g.douban_id, (countMap.get(g.douban_id) || 0) + 1);
        }
      });
      let max = 0;
      let res: number | undefined;
      countMap.forEach((v, k) => {
        if (v > max) { max = v; res = k; }
      });
      return res;
    })();

    return { episodes, source_names, douban_id };
  };
  // 过滤器：非聚合与聚合
  const [filterAll, setFilterAll] = useState<{ source: string; title: string; year: string; yearOrder: 'none' | 'asc' | 'desc' }>({
    source: 'all',
    title: 'all',
    year: 'all',
    yearOrder: 'none',
  });
  const [filterAgg, setFilterAgg] = useState<{ source: string; title: string; year: string; yearOrder: 'none' | 'asc' | 'desc' }>({
    source: 'all',
    title: 'all',
    year: 'all',
    yearOrder: 'none',
  });

  // 获取默认聚合设置：只读取用户本地设置，默认为 true
  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) {
        return JSON.parse(userSetting);
      }
    }
    return true; // 默认启用聚合
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() => {
    return getDefaultAggregate() ? 'agg' : 'all';
  });
  const [resultDisplayMode, setResultDisplayMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('searchResultDisplayMode');
      if (saved === 'card' || saved === 'list') return saved;
    }
    return 'card';
  });
  const [expandedSourceTags, setExpandedSourceTags] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);

  // 保存虚拟化设置
  const toggleVirtualization = () => {
    const newValue = !useVirtualization;
    setUseVirtualization(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem('useVirtualization', JSON.stringify(newValue));
    }
  };

  // 简化的年份排序：unknown/空值始终在最后
  const compareYear = (aYear: string, bYear: string, order: 'none' | 'asc' | 'desc') => {
    // 如果是无排序状态，返回0（保持原顺序）
    if (order === 'none') return 0;

    // 处理空值和unknown
    const aIsEmpty = !aYear || aYear === 'unknown';
    const bIsEmpty = !bYear || bYear === 'unknown';

    if (aIsEmpty && bIsEmpty) return 0;
    if (aIsEmpty) return 1; // a 在后
    if (bIsEmpty) return -1; // b 在后

    // 都是有效年份，按数字比较
    const aNum = parseInt(aYear, 10);
    const bNum = parseInt(bYear, 10);

    return order === 'asc' ? aNum - bNum : bNum - aNum;
  };

  // 辅助函数：检查标题是否包含搜索词（用于精确搜索）
  const titleContainsQuery = (title: string, query: string): boolean => {
    if (!exactSearch) return true;
    if (!query || !title) return true;

    const normalizedTitle = title.toLowerCase();
    const normalizedQuery = query.toLowerCase();

    if (normalizedTitle.includes(normalizedQuery)) return true;

    // 繁简互转匹配：仅当输入为繁体时，转换为简体再匹配
    if (chineseConverter.detect(normalizedQuery) === 1) {
      const simplifiedQuery = chineseConverter.simplized(normalizedQuery);
      return normalizedTitle.includes(simplifiedQuery);
    }

    return false;
  };

  // ─── TanStack Query 驱动搜索 ────────────────────────────────────────────────
  const trimmedQuery = useMemo(() => (searchParams.get('q') || '').trim(), [searchParams]);

  // 流式搜索
  const streamedSearchQuery = useQuery<StreamedState>({
    queryKey: ['search', 'streamed', trimmedQuery],
    queryFn: streamedQuery<SSEChunk, StreamedState>({
      streamFn: (ctx) => eventSourceIterable(
        `/api/search/ws?q=${encodeURIComponent(trimmedQuery)}`,
        ctx.signal,
      ),
      refetchMode: 'reset',
      reducer: (acc: StreamedState, chunk: SSEChunk): StreamedState => {
        switch (chunk.type) {
          case 'start':
            return { results: [], totalSources: chunk.totalSources, completedSources: 0 };
          case 'source_result':
            return { ...acc, results: acc.results.concat(chunk.results) };
          case 'source_progress':
            return { ...acc, completedSources: acc.completedSources + 1 };
          case 'source_error':
            return { ...acc, completedSources: acc.completedSources + 1 };
          case 'complete':
            return { ...acc, completedSources: chunk.completedSources || acc.totalSources };
        }
      },
      initialValue: STREAMED_INITIAL,
    }),
    enabled: !!trimmedQuery && useFluidSearch,
    staleTime: 0,
    gcTime: 0,
  });

  // 传统搜索
  const traditionalSearchQuery = useQuery<SearchResult[]>({
    queryKey: ['search', 'traditional', trimmedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`);
      const data = await res.json();
      return Array.isArray(data.results) ? (data.results as SearchResult[]) : [];
    },
    enabled: !!trimmedQuery && !useFluidSearch,
    staleTime: 0,
    gcTime: 0,
  });

  // 派生统一搜索状态
  const searchResults: SearchResult[] = useFluidSearch
    ? (streamedSearchQuery.data?.results ?? [])
    : (traditionalSearchQuery.data ?? []);
  const totalSources = useFluidSearch ? (streamedSearchQuery.data?.totalSources ?? 0) : 1;
  const completedSources = useFluidSearch
    ? (streamedSearchQuery.data?.completedSources ?? 0)
    : (traditionalSearchQuery.isSuccess ? 1 : 0);
  const isLoading = useFluidSearch
    ? streamedSearchQuery.isFetching
    : traditionalSearchQuery.isFetching;

  // 聚合后的结果（按标题和年份分组）
  const aggregatedResults = useMemo(() => {
    // 首先应用精确搜索过滤
    const filteredResults = exactSearch
      ? searchResults.filter(item => titleContainsQuery(item.title, currentQueryRef.current))
      : searchResults;

    const map = new Map<string, SearchResult[]>();
    const keyOrder: string[] = []; // 记录键出现的顺序

    filteredResults.forEach((item) => {
      // 使用 title + year + type 作为键，year 必然存在，但依然兜底 'unknown'
      const key = `${item.title.replaceAll(' ', '')}-${item.year || 'unknown'
        }-${item.episodes.length === 1 ? 'movie' : 'tv'}`;
      const arr = map.get(key) || [];

      // 如果是新的键，记录其顺序
      if (arr.length === 0) {
        keyOrder.push(key);
      }

      arr.push(item);
      map.set(key, arr);
    });

    // 按出现顺序返回聚合结果
    return keyOrder.map(key => [key, map.get(key)!] as [string, SearchResult[]]);
  }, [searchResults, exactSearch]);

  // 当聚合结果变化时，如果某个聚合已存在，则调用其卡片 ref 的 set 方法增量更新
  useEffect(() => {
    aggregatedResults.forEach(([mapKey, group]) => {
      const stats = computeGroupStats(group);
      const prev = groupStatsRef.current.get(mapKey);
      if (!prev) {
        // 第一次出现，记录初始值，不调用 ref（由初始 props 渲染）
        groupStatsRef.current.set(mapKey, stats);
        return;
      }
      // 对比变化并调用对应的 set 方法
      const ref = groupRefs.current.get(mapKey);
      if (ref && ref.current) {
        if (prev.episodes !== stats.episodes) {
          ref.current.setEpisodes(stats.episodes);
        }
        const prevNames = (prev.source_names || []).join('|');
        const nextNames = (stats.source_names || []).join('|');
        if (prevNames !== nextNames) {
          ref.current.setSourceNames(stats.source_names);
        }
        if (prev.douban_id !== stats.douban_id) {
          ref.current.setDoubanId(stats.douban_id);
        }
        groupStatsRef.current.set(mapKey, stats);
      }
    });
  }, [aggregatedResults]);

  // 构建筛选选项
  const filterOptions = useMemo(() => {
    const sourcesSet = new Map<string, string>();
    const titlesSet = new Set<string>();
    const yearsSet = new Set<string>();

    searchResults.forEach((item) => {
      if (item.source && item.source_name) {
        sourcesSet.set(item.source, item.source_name);
      }
      if (item.title) titlesSet.add(item.title);
      if (item.year) yearsSet.add(item.year);
    });

    const sourceOptions: { label: string; value: string }[] = [
      { label: '全部来源', value: 'all' },
      ...Array.from(sourcesSet.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ label, value })),
    ];

    const titleOptions: { label: string; value: string }[] = [
      { label: '全部标题', value: 'all' },
      ...Array.from(titlesSet.values())
        .sort((a, b) => a.localeCompare(b))
        .map((t) => ({ label: t, value: t })),
    ];

    // 年份: 将 unknown 放末尾
    const years = Array.from(yearsSet.values());
    const knownYears = years.filter((y) => y !== 'unknown').sort((a, b) => parseInt(b) - parseInt(a));
    const hasUnknown = years.includes('unknown');
    const yearOptions: { label: string; value: string }[] = [
      { label: '全部年份', value: 'all' },
      ...knownYears.map((y) => ({ label: y, value: y })),
      ...(hasUnknown ? [{ label: '未知', value: 'unknown' }] : []),
    ];

    const categoriesAll: SearchFilterCategory[] = [
      { key: 'source', label: '来源', options: sourceOptions },
      { key: 'title', label: '标题', options: titleOptions },
      { key: 'year', label: '年份', options: yearOptions },
    ];

    const categoriesAgg: SearchFilterCategory[] = [
      { key: 'source', label: '来源', options: sourceOptions },
      { key: 'title', label: '标题', options: titleOptions },
      { key: 'year', label: '年份', options: yearOptions },
    ];

    return { categoriesAll, categoriesAgg };
  }, [searchResults]);

  // 非聚合：应用筛选与排序
  const filteredAllResults = useMemo(() => {
    const { source, title, year, yearOrder } = filterAll;

    // 首先应用精确搜索过滤
    const exactSearchFiltered = exactSearch
      ? searchResults.filter(item => titleContainsQuery(item.title, currentQueryRef.current))
      : searchResults;

    const filtered = exactSearchFiltered.filter((item) => {
      if (source !== 'all' && item.source !== source) return false;
      if (title !== 'all' && item.title !== title) return false;
      if (year !== 'all' && item.year !== year) return false;
      return true;
    });

    // 如果是无排序状态，按精确匹配优先+年份倒序排列（保留来源到达顺序的相对位置）
    if (yearOrder === 'none') {
      const q = currentQueryRef.current.trim();
      return filtered.slice().sort((a, b) => {
        const aExact = (a.title || '').trim() === q;
        const bExact = (b.title || '').trim() === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aNum = Number.parseInt(a.year as any, 10);
        const bNum = Number.parseInt(b.year as any, 10);
        const aValid = !Number.isNaN(aNum);
        const bValid = !Number.isNaN(bNum);
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        if (aValid && bValid) return bNum - aNum;
        return 0;
      });
    }

    // 简化排序：1. 年份排序，2. 年份相同时精确匹配在前，3. 标题排序
    return filtered.sort((a, b) => {
      // 首先按年份排序
      const yearComp = compareYear(a.year, b.year, yearOrder);
      if (yearComp !== 0) return yearComp;

      // 年份相同时，精确匹配在前
      const aExactMatch = a.title === searchQuery.trim();
      const bExactMatch = b.title === searchQuery.trim();
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      // 最后按标题排序，正序时字母序，倒序时反字母序
      return yearOrder === 'asc' ?
        a.title.localeCompare(b.title) :
        b.title.localeCompare(a.title);
    });
  }, [searchResults, filterAll, searchQuery, exactSearch]);

  // 聚合：应用筛选与排序
  const filteredAggResults = useMemo(() => {
    const { source, title, year, yearOrder } = filterAgg as any;
    const filtered = aggregatedResults.filter(([_, group]) => {
      const gTitle = group[0]?.title ?? '';
      const gYear = group[0]?.year ?? 'unknown';
      const hasSource = source === 'all' ? true : group.some((item) => item.source === source);
      if (!hasSource) return false;
      if (title !== 'all' && gTitle !== title) return false;
      if (year !== 'all' && gYear !== year) return false;
      return true;
    });

    // 如果是无排序状态，按精确匹配优先+年份倒序排列
    if (yearOrder === 'none') {
      const q = currentQueryRef.current.trim();
      return filtered.slice().sort((a, b) => {
        const aTitle = (a[1][0]?.title || '').trim();
        const bTitle = (b[1][0]?.title || '').trim();
        const aExact = aTitle === q;
        const bExact = bTitle === q;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aNum = Number.parseInt(a[1][0]?.year as any, 10);
        const bNum = Number.parseInt(b[1][0]?.year as any, 10);
        const aValid = !Number.isNaN(aNum);
        const bValid = !Number.isNaN(bNum);
        if (aValid && !bValid) return -1;
        if (!aValid && bValid) return 1;
        if (aValid && bValid) return bNum - aNum;
        return 0;
      });
    }

    // 简化排序：1. 年份排序，2. 年份相同时精确匹配在前，3. 标题排序
    return filtered.sort((a, b) => {
      // 首先按年份排序
      const aYear = a[1][0].year;
      const bYear = b[1][0].year;
      const yearComp = compareYear(aYear, bYear, yearOrder);
      if (yearComp !== 0) return yearComp;

      // 年份相同时，精确匹配在前
      const aExactMatch = a[1][0].title === searchQuery.trim();
      const bExactMatch = b[1][0].title === searchQuery.trim();
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      // 最后按标题排序，正序时字母序，倒序时反字母序
      const aTitle = a[1][0].title;
      const bTitle = b[1][0].title;
      return yearOrder === 'asc' ?
        aTitle.localeCompare(bTitle) :
        bTitle.localeCompare(aTitle);
    });
  }, [aggregatedResults, filterAgg, searchQuery]);

  useEffect(() => {
    // 无搜索参数时聚焦搜索框
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();

    // 初始加载搜索历史
    getSearchHistory().then(setSearchHistory);

    // 检查URL参数并处理初始搜索
    const initialQuery = searchParams.get('q');
    if (initialQuery) {
      setSearchQuery(initialQuery);
      setShowResults(true);
      // 如果当前是网盘搜索模式，触发网盘搜索
      if (searchType === 'netdisk') {
        handleNetDiskSearch(initialQuery);
      }
    }

    // 读取流式搜索设置
    if (typeof window !== 'undefined') {
      const savedFluidSearch = localStorage.getItem('fluidSearch');
      const defaultFluidSearch =
        (window as any).RUNTIME_CONFIG?.FLUID_SEARCH !== false;
      if (savedFluidSearch !== null) {
        setUseFluidSearch(JSON.parse(savedFluidSearch));
      } else if (defaultFluidSearch !== undefined) {
        setUseFluidSearch(defaultFluidSearch);
      }

      // 读取精确搜索设置
      const savedExactSearch = localStorage.getItem('exactSearch');
      if (savedExactSearch !== null) {
        setExactSearch(savedExactSearch === 'true');
      }
    }

    // 监听搜索历史更新事件
    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

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
      unsubscribe();
      isRunning = false; // 停止 requestAnimationFrame 循环

      // 移除 body 滚动事件监听器
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 监听搜索类型变化，如果切换到网盘/YouTube/TMDB演员搜索且有搜索词，立即搜索
  useEffect(() => {
    if ((searchType === 'netdisk' || searchType === 'youtube' || searchType === 'tmdb-actor') && showResults) {
      const currentQuery = searchQuery.trim() || searchParams.get('q');
      if (currentQuery) {
        if (searchType === 'netdisk' && netdiskResourceType === 'netdisk' && !netdiskLoading && !netdiskResults && !netdiskError) {
          handleNetDiskSearch(currentQuery);
        } else if (searchType === 'netdisk' && netdiskResourceType === 'acg') {
          // ACG 搜索：触发 AcgSearch 组件搜索
          setAcgTriggerSearch(prev => !prev);
        } else if (searchType === 'youtube' && !youtubeLoading && !youtubeResults && !youtubeError) {
          handleYouTubeSearch(currentQuery);
        } else if (searchType === 'tmdb-actor' && !tmdbActorLoading && !tmdbActorResults && !tmdbActorError) {
          handleTmdbActorSearch(currentQuery, tmdbActorType, tmdbFilterState);
        }
      }
    }
  }, [searchType, netdiskResourceType, showResults, searchQuery, searchParams, netdiskLoading, netdiskResults, netdiskError, youtubeLoading, youtubeResults, youtubeError, tmdbActorLoading, tmdbActorResults, tmdbActorError]);

  useEffect(() => {
    // 当搜索参数变化时更新 UI 状态（数据获取由 TanStack Query 驱动）
    const query = searchParams.get('q') || '';
    currentQueryRef.current = query.trim();

    if (query) {
      setSearchQuery(query);
      setShowResults(true);
      setShowSuggestions(false);

      // 每次搜索时重新读取流式搜索设置
      if (typeof window !== 'undefined') {
        const savedFluidSearch = localStorage.getItem('fluidSearch');
        const next = savedFluidSearch !== null
          ? JSON.parse(savedFluidSearch)
          : (window as any).RUNTIME_CONFIG?.FLUID_SEARCH !== false;
        if (next !== useFluidSearch) setUseFluidSearch(next);
      }

      addSearchHistory(query);
    } else {
      setShowResults(false);
      setShowSuggestions(false);
    }
  }, [searchParams]);

  // 输入框内容变化时触发，显示搜索建议
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    // 如果输入框为空，隐藏搜索结果，显示搜索历史
    if (!value.trim()) {
      setShowResults(false);
    }

    // 无论输入框是否为空，都显示建议（空时显示搜索历史）
    setShowSuggestions(true);
  };

  // 搜索框聚焦时触发，显示搜索建议
  const handleInputFocus = () => {
    // 聚焦时始终显示建议（空时显示搜索历史）
    setShowSuggestions(true);
  };

  // YouTube搜索函数
  const handleYouTubeSearch = async (query: string, contentType = youtubeContentType, sortOrder = youtubeSortOrder) => {
    if (!query.trim()) return;

    setYoutubeLoading(true);
    setYoutubeError(null);
    setYoutubeWarning(null);
    setYoutubeResults(null);

    try {
      // 构建搜索URL，包含内容类型和排序参数
      let searchUrl = `/api/youtube/search?q=${encodeURIComponent(query.trim())}`;
      if (contentType && contentType !== 'all') {
        searchUrl += `&contentType=${contentType}`;
      }
      if (sortOrder && sortOrder !== 'relevance') {
        searchUrl += `&order=${sortOrder}`;
      }
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (response.ok && data.success) {
        setYoutubeResults(data.videos || []);
        // 如果有警告信息，设置警告状态
        if (data.warning) {
          setYoutubeWarning(data.warning);
        }
      } else {
        setYoutubeError(data.error || 'YouTube搜索失败');
      }
    } catch (error: any) {
      console.error('YouTube搜索请求失败:', error);
      // 尝试提取具体的错误消息
      let errorMessage = 'YouTube搜索请求失败，请稍后重试';
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      setYoutubeError(errorMessage);
    } finally {
      setYoutubeLoading(false);
    }
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

      // 检查响应状态和success字段
      if (response.ok && data.success) {
        setNetdiskResults(data.data.merged_by_type || {});
        setNetdiskTotal(data.data.total || 0);
      } else {
        // 处理错误情况（包括功能关闭、配置错误等）
        setNetdiskError(data.error || '网盘搜索失败');
      }
    } catch (error: any) {
      console.error('网盘搜索请求失败:', error);
      setNetdiskError('网盘搜索请求失败，请稍后重试');
    } finally {
      setNetdiskLoading(false);
    }
  };

  // TMDB演员搜索函数
  const handleTmdbActorSearch = async (query: string, type = tmdbActorType, filterState = tmdbFilterState) => {
    if (!query.trim()) return;

    console.log(`🚀 [前端TMDB] 开始搜索: ${query}, type=${type}`);

    setTmdbActorLoading(true);
    setTmdbActorError(null);
    setTmdbActorResults(null);

    try {
      // 构建筛选参数
      const params = new URLSearchParams({
        actor: query.trim(),
        type: type
      });

      // 只有设置了limit且大于0时才添加limit参数
      if (filterState.limit && filterState.limit > 0) {
        params.append('limit', filterState.limit.toString());
      }

      // 添加筛选参数
      if (filterState.startYear) params.append('startYear', filterState.startYear.toString());
      if (filterState.endYear) params.append('endYear', filterState.endYear.toString());
      if (filterState.minRating) params.append('minRating', filterState.minRating.toString());
      if (filterState.maxRating) params.append('maxRating', filterState.maxRating.toString());
      if (filterState.minPopularity) params.append('minPopularity', filterState.minPopularity.toString());
      if (filterState.maxPopularity) params.append('maxPopularity', filterState.maxPopularity.toString());
      if (filterState.minVoteCount) params.append('minVoteCount', filterState.minVoteCount.toString());
      if (filterState.minEpisodeCount) params.append('minEpisodeCount', filterState.minEpisodeCount.toString());
      if (filterState.genreIds && filterState.genreIds.length > 0) params.append('genreIds', filterState.genreIds.join(','));
      if (filterState.languages && filterState.languages.length > 0) params.append('languages', filterState.languages.join(','));
      if (filterState.onlyRated) params.append('onlyRated', 'true');
      if (filterState.sortBy) params.append('sortBy', filterState.sortBy);
      if (filterState.sortOrder) params.append('sortOrder', filterState.sortOrder);

      // 调用TMDB API端点
      const response = await fetch(`/api/tmdb/actor?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.code === 200) {
        setTmdbActorResults(data.list || []);
      } else {
        setTmdbActorError(data.error || data.message || '搜索演员失败');
      }
    } catch (error: any) {
      console.error('TMDB演员搜索请求失败:', error);
      setTmdbActorError('搜索演员失败，请稍后重试');
    } finally {
      setTmdbActorLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    // 回显搜索框
    setSearchQuery(trimmed);
    setShowSuggestions(false);
    setShowResults(true);

    if (searchType === 'netdisk') {
      // 网盘搜索 - 也更新URL保持一致性
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      if (netdiskResourceType === 'netdisk') {
        handleNetDiskSearch(trimmed);
      } else {
        // ACG 搜索：触发 AcgSearch 组件搜索
        setAcgTriggerSearch(prev => !prev);
      }
    } else if (searchType === 'youtube') {
      // YouTube搜索
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      handleYouTubeSearch(trimmed);
    } else if (searchType === 'tmdb-actor') {
      // TMDB演员搜索
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      handleTmdbActorSearch(trimmed, tmdbActorType, tmdbFilterState);
    } else {
      // 原有的影视搜索逻辑
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      // 其余由 searchParams 变化的 effect 处理
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);

    // 自动执行搜索
    setShowResults(true);

    router.push(`/search?q=${encodeURIComponent(suggestion)}`);
    // 其余由 searchParams 变化的 effect 处理
  };

  // 返回顶部功能 - 同时滚动页面和重置虚拟列表
  const scrollToTop = () => {
    try {
      // 1. 滚动页面到顶部
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  return (
    <PageLayout activePath='/search'>
      <div className='overflow-visible mb-10 -mt-6 md:mt-0'>
        {/* 搜索框区域 - 美化版 */}
        <div className='mb-8'>
          {/* 搜索类型选项卡 - 移动优先响应式设计 */}
          <div className='max-w-3xl mx-auto mb-6 px-3 sm:px-0'>
            {/* 移动端：可滚动横向布局；桌面端：居中排列 */}
            <div className='overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0'>
              <div className='inline-flex sm:flex items-center justify-start sm:justify-center min-w-full sm:min-w-0 bg-gradient-to-r from-gray-100 via-white to-gray-100 dark:from-gray-800/95 dark:via-gray-750/95 dark:to-gray-800/95 rounded-2xl p-2 gap-2 sm:gap-2.5 shadow-xl border-2 border-gray-200/70 dark:border-gray-600/70 backdrop-blur-md'>
                <button
                  type='button'
                  onClick={() => {
                    setSearchType('video');
                    // 切换到影视搜索时，清除网盘、YouTube和TMDB演员搜索状态
                    setNetdiskResults(null);
                    setNetdiskError(null);
                    setNetdiskTotal(0);
                    setYoutubeResults(null);
                    setYoutubeError(null);
                    setTmdbActorResults(null);
                    setTmdbActorError(null);
                    // 如果有搜索词且当前显示结果，触发影视搜索
                    const currentQuery = searchQuery.trim() || searchParams?.get('q');
                    if (currentQuery && showResults) {
                      router.push(`/search?q=${encodeURIComponent(currentQuery)}`);
                    }
                  }}
                  className={`flex-shrink-0 px-4 sm:px-6 py-3 text-sm sm:text-base font-bold rounded-xl transition-all duration-300 whitespace-nowrap min-w-[110px] sm:min-w-0 ${
                    searchType === 'video'
                      ? 'bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/50 scale-105 ring-2 ring-green-400/60 dark:ring-green-500/80'
                      : 'bg-gray-200/60 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 border-2 border-gray-300/50 dark:border-gray-600/50 shadow-md hover:bg-gray-300/80 dark:hover:bg-gray-600/90 hover:scale-105 hover:shadow-lg active:scale-100'
                  }`}
                >
                  🎬 影视资源
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setSearchType('netdisk');
                    // 清除之前的网盘搜索状态，确保重新开始
                    setNetdiskError(null);
                    setNetdiskResults(null);
                    setYoutubeResults(null);
                    setYoutubeError(null);
                    setTmdbActorResults(null);
                    setTmdbActorError(null);
                    // 如果当前有搜索词，立即触发网盘搜索
                    const currentQuery = searchQuery.trim() || searchParams?.get('q');
                    if (currentQuery && showResults) {
                      handleNetDiskSearch(currentQuery);
                    }
                  }}
                  className={`flex-shrink-0 px-4 sm:px-6 py-3 text-sm sm:text-base font-bold rounded-xl transition-all duration-300 whitespace-nowrap min-w-[110px] sm:min-w-0 ${
                    searchType === 'netdisk'
                      ? 'bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/50 scale-105 ring-2 ring-blue-400/60 dark:ring-blue-500/80'
                      : 'bg-gray-200/60 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 border-2 border-gray-300/50 dark:border-gray-600/50 shadow-md hover:bg-gray-300/80 dark:hover:bg-gray-600/90 hover:scale-105 hover:shadow-lg active:scale-100'
                  }`}
                >
                  💾 网盘资源
                </button>
                <button
                  type='button'
                  onClick={() => {
                    const wasAlreadyYoutube = searchType === 'youtube';
                    setSearchType('youtube');
                    // 清除之前的YouTube搜索状态，确保重新开始
                    setYoutubeError(null);
                    setYoutubeWarning(null);
                    setYoutubeResults(null);
                    // 注意：不重置排序和内容类型，保持用户选择
                    setNetdiskResults(null);
                    setNetdiskError(null);
                    setNetdiskTotal(0);
                    setTmdbActorResults(null);
                    setTmdbActorError(null);
                    // 如果当前有搜索词，立即触发YouTube搜索
                    const currentQuery = searchQuery.trim() || searchParams?.get('q');
                    if (currentQuery && showResults) {
                      // 如果已经在YouTube标签，或者是新切换，都强制重新搜索
                      setTimeout(() => handleYouTubeSearch(currentQuery), 0);
                    }
                  }}
                  className={`flex-shrink-0 px-4 sm:px-6 py-3 text-sm sm:text-base font-bold rounded-xl transition-all duration-300 whitespace-nowrap min-w-[110px] sm:min-w-0 ${
                    searchType === 'youtube'
                      ? 'bg-gradient-to-br from-red-400 via-red-500 to-rose-600 text-white shadow-lg shadow-red-500/50 scale-105 ring-2 ring-red-400/60 dark:ring-red-500/80'
                      : 'bg-gray-200/60 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 border-2 border-gray-300/50 dark:border-gray-600/50 shadow-md hover:bg-gray-300/80 dark:hover:bg-gray-600/90 hover:scale-105 hover:shadow-lg active:scale-100'
                  }`}
                >
                  📺 YouTube
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setSearchType('tmdb-actor');
                    // 清除之前的搜索状态
                    setTmdbActorError(null);
                    setTmdbActorResults(null);
                    setNetdiskResults(null);
                    setNetdiskError(null);
                    setNetdiskTotal(0);
                    setYoutubeResults(null);
                    setYoutubeError(null);
                    // 如果当前有搜索词，立即触发TMDB演员搜索
                    const currentQuery = searchQuery.trim() || searchParams?.get('q');
                    if (currentQuery && showResults) {
                      handleTmdbActorSearch(currentQuery, tmdbActorType, tmdbFilterState);
                    }
                  }}
                  className={`flex-shrink-0 px-4 sm:px-6 py-3 text-sm sm:text-base font-bold rounded-xl transition-all duration-300 whitespace-nowrap min-w-[110px] sm:min-w-0 ${
                    searchType === 'tmdb-actor'
                      ? 'bg-gradient-to-br from-purple-400 via-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/50 scale-105 ring-2 ring-purple-400/60 dark:ring-purple-500/80'
                      : 'bg-gray-200/60 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 border-2 border-gray-300/50 dark:border-gray-600/50 shadow-md hover:bg-gray-300/80 dark:hover:bg-gray-600/90 hover:scale-105 hover:shadow-lg active:scale-100'
                  }`}
                >
                  🎬 TMDB演员
                </button>
              </div>
            </div>
          </div>

          <form onSubmit={handleSearch} className='max-w-2xl mx-auto'>
            <div className='relative group'>
              {/* 搜索图标 - 增强动画 */}
              <Search className='absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-all duration-300 group-focus-within:text-green-500 dark:group-focus-within:text-green-400 group-focus-within:scale-110' />

              {/* 搜索框 - 美化版 */}
              <input
                id='searchInput'
                type='text'
                value={searchQuery}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                placeholder={searchType === 'video' ? '🎬 搜索电影、电视剧...' : searchType === 'netdisk' ? '💾 搜索网盘资源...' : searchType === 'youtube' ? '📺 搜索YouTube视频...' : '🎭 搜索演员姓名...'}
                autoComplete="off"
                className='w-full h-14 rounded-xl bg-white/90 py-4 pl-12 pr-14 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:bg-white border-2 border-gray-200/80 shadow-lg hover:shadow-xl focus:shadow-2xl focus:border-green-400 transition-all duration-300 dark:bg-gray-800/90 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-800 dark:border-gray-700 dark:focus:border-green-500 backdrop-blur-sm'
              />

              {/* 清除按钮 - 美化版 */}
              {searchQuery && (
                <button
                  type='button'
                  onClick={() => {
                    setSearchQuery('');
                    setShowResults(false); // 隐藏搜索结果，显示搜索历史
                    setShowSuggestions(true); // 清空后显示搜索历史
                    document.getElementById('searchInput')?.focus();
                  }}
                  className='absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-gray-200/80 hover:bg-red-500 text-gray-500 hover:text-white transition-all duration-300 hover:scale-110 hover:rotate-90 dark:bg-gray-700/80 dark:text-gray-400 dark:hover:bg-red-600 shadow-sm hover:shadow-md'
                  aria-label='清除搜索内容'
                >
                  <X className='h-4 w-4' />
                </button>
              )}

              {/* 搜索建议 */}
              <SearchSuggestions
                query={searchQuery}
                isVisible={showSuggestions}
                onSelect={handleSuggestionSelect}
                onClose={() => setShowSuggestions(false)}
                onEnterKey={() => {
                  // 当用户按回车键时，使用搜索框的实际内容进行搜索
                  const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
                  if (!trimmed) return;

                  // 回显搜索框
                  setSearchQuery(trimmed);
                  setShowResults(true);
                  setShowSuggestions(false);

                  router.push(`/search?q=${encodeURIComponent(trimmed)}`);
                }}
              />
            </div>
          </form>
        </div>

        {/* 搜索结果或搜索历史 */}
        <div className='max-w-[95%] mx-auto mt-12 overflow-visible'>
          {showResults ? (
            <section className='mb-12'>
              {searchType === 'netdisk' ? (
                /* 网盘搜索结果 */
                <>
                  <div className='mb-4'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      资源搜索
                      {netdiskLoading && netdiskResourceType === 'netdisk' && (
                        <span className='ml-2 inline-block align-middle'>
                          <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin'></span>
                        </span>
                      )}
                    </h2>

                    {/* 资源类型切换器 */}
                    <div className='mt-3 flex items-center gap-2'>
                      <span className='text-sm text-gray-600 dark:text-gray-400'>资源类型：</span>
                      <div className='flex gap-2'>
                        <button
                          onClick={() => {
                            setNetdiskResourceType('netdisk');
                            setAcgError(null);
                            const currentQuery = searchQuery.trim() || searchParams?.get('q');
                            if (currentQuery) {
                              handleNetDiskSearch(currentQuery);
                            }
                          }}
                          className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                            netdiskResourceType === 'netdisk'
                              ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
                          }`}
                        >
                          💾 网盘资源
                        </button>
                        <button
                          onClick={() => {
                            setNetdiskResourceType('acg');
                            setNetdiskResults(null);
                            setNetdiskError(null);
                            const currentQuery = searchQuery.trim() || searchParams?.get('q');
                            if (currentQuery) {
                              setAcgTriggerSearch(prev => !prev);
                            }
                          }}
                          className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                            netdiskResourceType === 'acg'
                              ? 'bg-purple-500 text-white border-purple-500 shadow-md'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
                          }`}
                        >
                          🎌 动漫磁力
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 根据资源类型显示不同的搜索结果 */}
                  {netdiskResourceType === 'netdisk' ? (
                    <NetDiskSearchResults
                      results={netdiskResults}
                      loading={netdiskLoading}
                      error={netdiskError}
                      total={netdiskTotal}
                    />
                  ) : (
                    <AcgSearch
                      keyword={searchQuery.trim() || searchParams?.get('q') || ''}
                      triggerSearch={acgTriggerSearch}
                      onError={(error) => setAcgError(error)}
                    />
                  )}
                </>
              ) : searchType === 'tmdb-actor' ? (
                /* TMDB演员搜索结果 */
                <>
                  <div className='mb-4'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      TMDB演员搜索结果
                      {tmdbActorLoading && (
                        <span className='ml-2 inline-block align-middle'>
                          <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
                        </span>
                      )}
                    </h2>

                    {/* 电影/电视剧类型选择器 */}
                    <div className='mt-3 flex items-center gap-2'>
                      <span className='text-sm text-gray-600 dark:text-gray-400'>类型：</span>
                      <div className='flex gap-2'>
                        {[
                          { key: 'movie', label: '电影' },
                          { key: 'tv', label: '电视剧' }
                        ].map((type) => (
                          <button
                            key={type.key}
                            onClick={() => {
                              setTmdbActorType(type.key as 'movie' | 'tv');
                              const currentQuery = searchQuery.trim() || searchParams?.get('q');
                              if (currentQuery) {
                                handleTmdbActorSearch(currentQuery, type.key as 'movie' | 'tv', tmdbFilterState);
                              }
                            }}
                            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                              tmdbActorType === type.key
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
                            }`}
                            disabled={tmdbActorLoading}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* TMDB筛选面板 */}
                    <div className='mt-4'>
                      <TMDBFilterPanel
                        contentType={tmdbActorType}
                        filters={tmdbFilterState}
                        onFiltersChange={(newFilterState) => {
                          setTmdbFilterState(newFilterState);
                          const currentQuery = searchQuery.trim() || searchParams?.get('q');
                          if (currentQuery) {
                            handleTmdbActorSearch(currentQuery, tmdbActorType, newFilterState);
                          }
                        }}
                        isVisible={tmdbFilterVisible}
                        onToggleVisible={() => setTmdbFilterVisible(!tmdbFilterVisible)}
                        resultCount={tmdbActorResults?.length || 0}
                      />
                    </div>
                  </div>

                  {tmdbActorError ? (
                    <div className='text-center py-8'>
                      <div className='text-red-500 mb-2'>{tmdbActorError}</div>
                      <button
                        onClick={() => {
                          const currentQuery = searchQuery.trim() || searchParams?.get('q');
                          if (currentQuery) {
                            handleTmdbActorSearch(currentQuery, tmdbActorType, tmdbFilterState);
                          }
                        }}
                        className='px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors'
                      >
                        重试
                      </button>
                    </div>
                  ) : tmdbActorResults && tmdbActorResults.length > 0 ? (
                    <div className='grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                      {tmdbActorResults.map((item, index) => (
                        <div key={item.id || index} className='w-full'>
                          <VideoCard
                            title={item.title}
                            poster={item.poster}
                            year={item.year}
                            rate={item.rate}
                            from='douban'
                            type={tmdbActorType}
                          />
                        </div>
                      ))}
                    </div>
                  ) : !tmdbActorLoading ? (
                    <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
                      未找到相关演员作品
                    </div>
                  ) : null}
                </>
              ) : searchType === 'youtube' ? (
                /* YouTube搜索结果 */
                <>
                  <div className='mb-4'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      YouTube视频
                      {youtubeLoading && youtubeMode === 'search' && (
                        <span className='ml-2 inline-block align-middle'>
                          <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin'></span>
                        </span>
                      )}
                    </h2>
                    
                    {/* YouTube模式切换 */}
                    <div className='mt-3 flex items-center gap-2'>
                      <div className='inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 space-x-1'>
                        <button
                          type='button'
                          onClick={() => {
                            setYoutubeMode('search');
                            // 切换到搜索模式时清除直接播放相关状态
                            setYoutubeError(null);
                            setYoutubeWarning(null);
                          }}
                          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            youtubeMode === 'search'
                              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          🔍 搜索视频
                        </button>
                        <button
                          type='button'
                          onClick={() => {
                            setYoutubeMode('direct');
                            // 切换到直接播放模式时清除搜索结果
                            setYoutubeResults(null);
                            setYoutubeError(null);
                            setYoutubeWarning(null);
                          }}
                          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            youtubeMode === 'direct'
                              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          🔗 直接播放
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* YouTube内容区域 */}
                  {youtubeMode === 'direct' ? (
                    /* 直接播放模式 */
                    <div className='space-y-4'>
                      <div className='bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-900/20 dark:border-blue-800'>
                        <div className='flex items-center text-blue-800 dark:text-blue-200 mb-2'>
                          <svg className='w-5 h-5 mr-2' fill='currentColor' viewBox='0 0 20 20'>
                            <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
                          </svg>
                          <span className='font-medium'>💡 直接播放YouTube视频</span>
                        </div>
                        <p className='text-blue-700 dark:text-blue-300 text-sm'>
                          粘贴任意YouTube链接，无需搜索即可直接播放视频。支持所有常见的YouTube链接格式。
                        </p>
                      </div>
                      <DirectYouTubePlayer />
                    </div>
                  ) : (
                    /* 搜索模式 */
                    <>
                      {/* 内容类型选择器 */}
                      <div className='mt-3 flex flex-wrap gap-2'>
                        {[
                          { key: 'all', label: '全部' },
                          { key: 'music', label: '音乐' },
                          { key: 'movie', label: '电影' },
                          { key: 'educational', label: '教育' },
                          { key: 'gaming', label: '游戏' },
                          { key: 'sports', label: '体育' },
                          { key: 'news', label: '新闻' }
                        ].map((type) => (
                          <button
                            key={type.key}
                            onClick={() => {
                              setYoutubeContentType(type.key as any);
                              const currentQuery = searchQuery.trim() || searchParams?.get('q');
                              if (currentQuery) {
                                handleYouTubeSearch(currentQuery, type.key as any, youtubeSortOrder);
                              }
                            }}
                            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                              youtubeContentType === type.key
                                ? 'bg-red-500 text-white border-red-500'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
                            }`}
                            disabled={youtubeLoading}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>
                      
                      {/* 排序选择器 */}
                      <div className='mt-3 flex items-center gap-3'>
                        <span className='text-sm text-gray-600 dark:text-gray-400'>排序：</span>
                        <div className='flex flex-wrap gap-2'>
                          {[
                            { key: 'relevance', label: '相关性' },
                            { key: 'date', label: '最新发布', icon: '🕒' },
                            { key: 'viewCount', label: '观看次数', icon: '👀' },
                            { key: 'rating', label: '评分', icon: '⭐' },
                            { key: 'title', label: '标题', icon: '🔤' }
                          ].map((sort) => (
                            <button
                              key={sort.key}
                              onClick={() => {
                                setYoutubeSortOrder(sort.key as any);
                                const currentQuery = searchQuery.trim() || searchParams?.get('q');
                                if (currentQuery) {
                                  handleYouTubeSearch(currentQuery, youtubeContentType, sort.key as any);
                                }
                              }}
                              className={`px-2 py-1 text-xs rounded border transition-colors flex items-center gap-1 ${
                                youtubeSortOrder === sort.key
                                  ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700'
                              }`}
                              disabled={youtubeLoading}
                            >
                              {sort.icon && <span>{sort.icon}</span>}
                              <span>{sort.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* 警告信息显示 */}
                      {youtubeWarning && (
                        <div className='mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-900/20 dark:border-yellow-800'>
                          <div className='flex items-center text-yellow-800 dark:text-yellow-200'>
                            <svg className='w-4 h-4 mr-2' fill='currentColor' viewBox='0 0 20 20'>
                              <path fillRule='evenodd' d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z' clipRule='evenodd' />
                            </svg>
                            <span className='text-sm'>{youtubeWarning}</span>
                          </div>
                        </div>
                      )}
                      
                      {youtubeError ? (
                        <div className='text-center py-8'>
                          <div className='text-red-500 mb-2'>{youtubeError}</div>
                          <button
                            onClick={() => {
                              const currentQuery = searchQuery.trim() || searchParams?.get('q');
                              if (currentQuery) {
                                handleYouTubeSearch(currentQuery, youtubeContentType, youtubeSortOrder);
                              }
                            }}
                            className='px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors'
                          >
                            重试
                          </button>
                        </div>
                      ) : youtubeResults && youtubeResults.length > 0 ? (
                        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                          {youtubeResults.map((video, index) => (
                            <YouTubeVideoCard key={video.videoId || index} video={video} />
                          ))}
                        </div>
                      ) : !youtubeLoading ? (
                        <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
                          未找到相关YouTube视频
                        </div>
                      ) : null}
                    </>
                  )}
                </>
              ) : (
                /* 原有的影视搜索结果 */
                <>
                  {/* 标题 */}
                  <div className='mb-4'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      搜索结果
                      {totalSources > 0 && useFluidSearch && (
                        <span className='ml-2 text-sm font-normal text-gray-500 dark:text-gray-400'>
                          {completedSources}/{totalSources}
                        </span>
                      )}
                      {isLoading && useFluidSearch && (
                        <span className='ml-2 inline-block align-middle'>
                          <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin'></span>
                        </span>
                      )}
                    </h2>
                  </div>
              {/* 筛选器 + 开关控件 */}
              <div className='mb-8 space-y-4'>
                {/* 筛选器 */}
                <div className='flex-1 min-w-0'>
                  {viewMode === 'agg' ? (
                    <SearchResultFilter
                      categories={filterOptions.categoriesAgg}
                      values={filterAgg}
                      onChange={(v) => setFilterAgg(v as any)}
                    />
                  ) : (
                    <SearchResultFilter
                      categories={filterOptions.categoriesAll}
                      values={filterAll}
                      onChange={(v) => setFilterAll(v as any)}
                    />
                  )}
                </div>
                
                {/* 开关控件行 */}
                <div className='flex items-center justify-end gap-4'>
                  {/* 卡片/列表视图切换 */}
                  <div className='flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden'>
                    <button
                      type='button'
                      onClick={() => {
                        setResultDisplayMode('card');
                        localStorage.setItem('searchResultDisplayMode', 'card');
                      }}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
                        resultDisplayMode === 'card'
                          ? 'bg-green-500 text-white'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                      aria-label='切换为卡片视图'
                    >
                      <Grid2x2 className='h-4 w-4' />
                    </button>
                    <button
                      type='button'
                      onClick={() => {
                        setResultDisplayMode('list');
                        localStorage.setItem('searchResultDisplayMode', 'list');
                      }}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
                        resultDisplayMode === 'list'
                          ? 'bg-green-500 text-white'
                          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                      aria-label='切换为列表视图'
                    >
                      <List className='h-4 w-4' />
                    </button>
                  </div>
                  {/* 虚拟化开关 */}
                  <label className='flex items-center gap-3 cursor-pointer select-none shrink-0 group'>
                    <span className='text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
                      ⚡ 虚拟滑动
                    </span>
                    <div className='relative'>
                      <input
                        type='checkbox'
                        className='sr-only peer'
                        checked={useVirtualization}
                        onChange={toggleVirtualization}
                      />
                      <div className='w-11 h-6 bg-linear-to-r from-gray-200 to-gray-300 rounded-full peer-checked:from-blue-400 peer-checked:to-purple-500 transition-all duration-300 dark:from-gray-600 dark:to-gray-700 dark:peer-checked:from-blue-500 dark:peer-checked:to-purple-600 shadow-inner'></div>
                      <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 peer-checked:translate-x-5 shadow-lg peer-checked:shadow-blue-300 dark:peer-checked:shadow-blue-500/50 peer-checked:scale-105'></div>
                      {/* 开关内图标 */}
                      <div className='absolute top-1.5 left-1.5 w-3 h-3 flex items-center justify-center pointer-events-none transition-all duration-300 peer-checked:translate-x-5'>
                        <span className='text-[10px] peer-checked:text-white text-gray-500'>
                          {useVirtualization ? '✨' : '○'}
                        </span>
                      </div>
                    </div>
                  </label>

                  {/* 聚合开关 */}
                  <label className='flex items-center gap-3 cursor-pointer select-none shrink-0 group'>
                    <span className='text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors'>
                      🔄 聚合
                    </span>
                    <div className='relative'>
                      <input
                        type='checkbox'
                        className='sr-only peer'
                        checked={viewMode === 'agg'}
                        onChange={() => setViewMode(viewMode === 'agg' ? 'all' : 'agg')}
                      />
                      <div className='w-11 h-6 bg-linear-to-r from-gray-200 to-gray-300 rounded-full peer-checked:from-emerald-400 peer-checked:to-green-500 transition-all duration-300 dark:from-gray-600 dark:to-gray-700 dark:peer-checked:from-emerald-500 dark:peer-checked:to-green-600 shadow-inner'></div>
                      <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 peer-checked:translate-x-5 shadow-lg peer-checked:shadow-emerald-300 dark:peer-checked:shadow-emerald-500/50 peer-checked:scale-105'></div>
                      {/* 开关内图标 */}
                      <div className='absolute top-1.5 left-1.5 w-3 h-3 flex items-center justify-center pointer-events-none transition-all duration-300 peer-checked:translate-x-5'>
                        <span className='text-[10px] peer-checked:text-white text-gray-500'>
                          {viewMode === 'agg' ? '🔗' : '○'}
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
              {/* 搜索结果网格/列表 */}
              {useVirtualization && resultDisplayMode === 'card' ? (
                <div key={`search-results-${viewMode}`}>
                  {viewMode === 'agg' ? (
                    <VirtualGrid
                      items={filteredAggResults}
                      className='grid-cols-3 gap-x-2 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'
                      rowGapClass='pb-14 sm:pb-20'
                      estimateRowHeight={320}
                      renderItem={([mapKey, group]) => {
                        const title = group[0]?.title || '';
                        const poster = group[0]?.poster || '';
                        const year = group[0]?.year || 'unknown';
                        const { episodes, source_names, douban_id } = computeGroupStats(group);
                        const type = episodes === 1 ? 'movie' : 'tv';
                        if (!groupStatsRef.current.has(mapKey)) {
                          groupStatsRef.current.set(mapKey, { episodes, source_names, douban_id });
                        }
                        return (
                          <div key={`agg-${mapKey}`} className='w-full'>
                            <VideoCard
                              ref={getGroupRef(mapKey)}
                              from='search'
                              isAggregate={true}
                              title={title}
                              poster={poster}
                              year={year}
                              episodes={episodes}
                              source_names={source_names}
                              douban_id={douban_id}
                              query={searchQuery.trim() !== title ? searchQuery.trim() : ''}
                              type={type}
                            />
                          </div>
                        );
                      }}
                    />
                  ) : (
                    <VirtualGrid
                      items={filteredAllResults}
                      className='grid-cols-3 gap-x-2 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'
                      rowGapClass='pb-14 sm:pb-20'
                      estimateRowHeight={320}
                      renderItem={(item) => (
                        <div key={`all-${item.source}-${item.id}`} className='w-full'>
                          <VideoCard
                            id={item.id}
                            title={item.title}
                            poster={item.poster}
                            episodes={item.episodes.length}
                            source={item.source}
                            source_name={item.source_name}
                            douban_id={item.douban_id}
                            query={searchQuery.trim() !== item.title ? searchQuery.trim() : ''}
                            year={item.year}
                            from='search'
                            type={inferTypeFromName(item.type_name, item.episodes.length)}
                            remarks={item.remarks}
                          />
                        </div>
                      )}
                    />
                  )}
                </div>
              ) : (
                <div
                  key={`search-results-${viewMode}-${resultDisplayMode}`}
                  className={resultDisplayMode === 'list'
                    ? 'space-y-4'
                    : 'justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'
                  }
                >
                  {viewMode === 'agg'
                    ? filteredAggResults.map(([mapKey, group]) => {
                      const title = group[0]?.title || '';
                      const poster = group[0]?.poster || '';
                      const year = group[0]?.year || 'unknown';
                      const desc = group.find((e) => e.desc?.trim())?.desc || '';
                      const vodRemarks = group.find((e) => (e as any).remarks?.trim())?.remarks || '';
                      const { episodes, source_names, douban_id } = computeGroupStats(group);
                      const type = episodes === 1 ? 'movie' : 'tv';
                      if (!groupStatsRef.current.has(mapKey)) {
                        groupStatsRef.current.set(mapKey, { episodes, source_names, douban_id });
                      }
                      if (resultDisplayMode === 'list') {
                        return renderListItem({
                          key: `agg-${mapKey}`,
                          title, poster, year, type, episodes,
                          sourceNames: source_names,
                          doubanId: douban_id,
                          desc,
                          vodRemarks,
                          isAggregate: true,
                          query: searchQuery.trim() !== title ? searchQuery.trim() : '',
                        });
                      }
                      return (
                        <div key={`agg-${mapKey}`} className='w-full'>
                          <VideoCard
                            ref={getGroupRef(mapKey)}
                            from='search'
                            isAggregate={true}
                            title={title}
                            poster={poster}
                            year={year}
                            episodes={episodes}
                            source_names={source_names}
                            douban_id={douban_id}
                            query={searchQuery.trim() !== title ? searchQuery.trim() : ''}
                            type={type}
                          />
                        </div>
                      );
                    })
                    : filteredAllResults.map((item) => {
                      const type = inferTypeFromName(item.type_name, item.episodes.length) as 'movie' | 'tv';
                      if (resultDisplayMode === 'list') {
                        return renderListItem({
                          key: `all-${item.source}-${item.id}`,
                          id: item.id,
                          title: item.title,
                          poster: item.poster,
                          episodes: item.episodes.length,
                          source: item.source,
                          sourceName: item.source_name,
                          doubanId: item.douban_id,
                          query: searchQuery.trim() !== item.title ? searchQuery.trim() : '',
                          year: item.year,
                          type,
                          desc: (item as any).desc,
                          vodRemarks: item.remarks,
                        });
                      }
                      return (
                        <div key={`all-${item.source}-${item.id}`} className='w-full'>
                          <VideoCard
                            id={item.id}
                            title={item.title}
                            poster={item.poster}
                            episodes={item.episodes.length}
                            source={item.source}
                            source_name={item.source_name}
                            douban_id={item.douban_id}
                            query={searchQuery.trim() !== item.title ? searchQuery.trim() : ''}
                            year={item.year}
                            from='search'
                            type={inferTypeFromName(item.type_name, item.episodes.length)}
                            remarks={item.remarks}
                          />
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Footer */}
              {isLoading && (filteredAggResults.length > 0 || filteredAllResults.length > 0) ? (
                <div className='fixed bottom-0 left-0 right-0 z-50 flex justify-center py-3 bg-white/98 dark:bg-gray-900/98 border-t border-gray-200/80 dark:border-gray-700/80'>
                  <div className='flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400'>
                    <div className='animate-spin rounded-full h-4 w-4 border-2 border-gray-300 dark:border-gray-600 border-t-green-500 dark:border-t-green-400'></div>
                    <span>正在搜索更多结果...</span>
                  </div>
                </div>
              ) : !isLoading && (filteredAggResults.length > 0 || filteredAllResults.length > 0) ? (
                <div className='flex justify-center mt-8 py-8'>
                  <div className='relative px-8 py-5 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 shadow-lg overflow-hidden'>
                    <div className='absolute inset-0 bg-gradient-to-br from-blue-100/20 to-purple-100/20 dark:from-blue-800/10 dark:to-purple-800/10'></div>
                    <div className='relative flex flex-col items-center gap-2'>
                      <div className='relative'>
                        <div className='w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg'>
                          <svg className='w-7 h-7 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M5 13l4 4L19 7'></path>
                          </svg>
                        </div>
                        <div className='absolute inset-0 rounded-full bg-blue-400/30 animate-ping'></div>
                      </div>
                      <div className='text-center'>
                        <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>搜索完成</p>
                        <p className='text-xs text-gray-600 dark:text-gray-400'>
                          共找到 {viewMode === 'agg' ? filteredAggResults.length : filteredAllResults.length} 个结果
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
                </>
              )}
            </section>
          ) : (
            /* 搜索历史或YouTube无搜索状态 */
            <>
              {/* 搜索历史 - 优先显示 */}
              {searchHistory.length > 0 && (
                <section className='mb-12'>
                  <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                    搜索历史
                    {searchHistory.length > 0 && (
                      <button
                        onClick={() => {
                          clearSearchHistory(); // 事件监听会自动更新界面
                        }}
                        className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                      >
                        清空
                      </button>
                    )}
                  </h2>
                  <div className='flex flex-wrap gap-2'>
                    {searchHistory.map((item) => (
                      <div key={item} className='relative group'>
                        <button
                          onClick={() => {
                            setSearchQuery(item);
                            router.push(
                              `/search?q=${encodeURIComponent(item.trim())}`
                            );
                          }}
                          className='px-4 py-2 bg-gray-500/10 hover:bg-gray-300 rounded-full text-sm text-gray-700 transition-colors duration-200 dark:bg-gray-700/50 dark:hover:bg-gray-600 dark:text-gray-300'
                        >
                          {item}
                        </button>
                        {/* 删除按钮 */}
                        <button
                          aria-label='删除搜索历史'
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            deleteSearchHistory(item); // 事件监听会自动更新界面
                          }}
                          className='absolute -top-1 -right-1 w-4 h-4 opacity-0 group-hover:opacity-100 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] transition-colors'
                        >
                          <X className='w-3 h-3' />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* YouTube特殊模式显示 - 在搜索历史之后 */}
              {searchType === 'youtube' && (
                <section className='mb-12'>
                  <div className='mb-4'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      YouTube视频
                    </h2>
                    
                    {/* YouTube模式切换 */}
                    <div className='mt-3 flex items-center gap-2'>
                      <div className='inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 space-x-1'>
                        <button
                          type='button'
                          onClick={() => {
                            setYoutubeMode('search');
                            setYoutubeError(null);
                            setYoutubeWarning(null);
                          }}
                          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            youtubeMode === 'search'
                              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          🔍 搜索视频
                        </button>
                        <button
                          type='button'
                          onClick={() => {
                            setYoutubeMode('direct');
                            setYoutubeResults(null);
                            setYoutubeError(null);
                            setYoutubeWarning(null);
                          }}
                          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            youtubeMode === 'direct'
                              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}
                        >
                          🔗 直接播放
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* YouTube内容区域 */}
                  {youtubeMode === 'direct' ? (
                    /* 直接播放模式 */
                    <div className='space-y-4'>
                      <div className='bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-900/20 dark:border-blue-800'>
                        <div className='flex items-center text-blue-800 dark:text-blue-200 mb-2'>
                          <svg className='w-5 h-5 mr-2' fill='currentColor' viewBox='0 0 20 20'>
                            <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
                          </svg>
                          <span className='font-medium'>💡 直接播放YouTube视频</span>
                        </div>
                        <p className='text-blue-700 dark:text-blue-300 text-sm'>
                          粘贴任意YouTube链接，无需搜索即可直接播放视频。支持所有常见的YouTube链接格式。
                        </p>
                      </div>
                      <DirectYouTubePlayer />
                    </div>
                  ) : (
                    /* 搜索模式提示 */
                    <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
                      <div className='mb-4'>
                        <svg className='w-16 h-16 mx-auto text-gray-300 dark:text-gray-600' fill='currentColor' viewBox='0 0 20 20'>
                          <path fillRule='evenodd' d='M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z' clipRule='evenodd' />
                        </svg>
                      </div>
                      <p className='text-lg mb-2'>在上方搜索框输入关键词</p>
                      <p className='text-sm'>开始搜索YouTube视频</p>
                    </div>
                  )}
                </section>
              )}

            </>
          )}
        </div>
      </div>

      {previewImage && (
        <ImageViewer
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
          imageUrl={previewImage.url}
          alt={previewImage.alt}
        />
      )}

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 right-6 md:bottom-6 z-50 w-12 h-12 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center ${showBackToTop
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6' />
      </button>
    </PageLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
