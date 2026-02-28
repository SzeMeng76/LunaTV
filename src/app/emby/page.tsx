/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Film, RefreshCw, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface EmbySourceOption {
  key: string;
  name: string;
}

interface Video {
  id: string;
  folder?: string;
  tmdbId?: number;
  title: string;
  poster: string;
  releaseDate?: string;
  year?: string;
  overview?: string;
  voteAverage?: number;
  rating?: number;
  mediaType: 'movie' | 'tv';
}

interface EmbyView {
  id: string;
  name: string;
  type: string;
}

interface EmbyListPage {
  list: Video[];
  totalPages: number;
  currentPage: number;
  total: number;
}

const PAGE_SIZE = 20;

export default function PrivateLibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runtimeConfig = useMemo(() => {
    if (typeof window !== 'undefined' && (window as any).RUNTIME_CONFIG) {
      return (window as any).RUNTIME_CONFIG;
    }
    return { EMBY_ENABLED: false };
  }, []);

  const parseSourceParam = (sourceParam: string | null): { embyKey?: string } => {
    if (!sourceParam) return {};
    if (sourceParam.includes(':')) {
      const [, key] = sourceParam.split(':');
      return { embyKey: key };
    }
    return {};
  };

  const [embyKey, setEmbyKey] = useState<string | undefined>(() => {
    // SSR-safe: will be corrected on mount via useEffect below
    return undefined;
  });
  const [selectedView, setSelectedView] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('emby_sortBy') ?? 'PremiereDate';
    }
    return 'PremiereDate';
  });
  const [sortOrder, setSortOrder] = useState<'Ascending' | 'Descending'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('emby_sortOrder');
      if (saved === 'Ascending' || saved === 'Descending') return saved;
    }
    return 'Descending';
  });
  const [mounted, setMounted] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 从 URL 读取 source 参数
  useEffect(() => {
    const sourceParam = searchParams.get('source');
    const { embyKey: parsedEmbyKey } = parseSourceParam(sourceParam);
    setEmbyKey(parsedEmbyKey);
  }, [searchParams]);

  const embyEnabled = runtimeConfig.EMBY_ENABLED && mounted;

  // ── 1. Emby 源列表 ────────────────────────────────────────────────────────
  const { data: sourcesData } = useQuery({
    queryKey: ['emby', 'sources'],
    queryFn: async () => {
      const res = await fetch('/api/emby/sources');
      const data = await res.json();
      return (data.sources ?? []) as EmbySourceOption[];
    },
    enabled: embyEnabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const embySourceOptions = sourcesData ?? [];
  const currentEmbySource = embySourceOptions.find(s => s.key === embyKey);
  const embySourceName = currentEmbySource?.name || 'Emby';

  // 源列表加载完成后，如果还没有选中的 key，自动选第一个
  useEffect(() => {
    if (!embyKey && embySourceOptions.length > 0) {
      setEmbyKey(embySourceOptions[0].key);
    }
  }, [embyKey, embySourceOptions]);

  // ── 2. Emby 媒体库 Views ──────────────────────────────────────────────────
  const { data: viewsData, isLoading: loadingViews } = useQuery({
    queryKey: ['emby', 'views', embyKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (embyKey) params.append('embyKey', embyKey);
      const res = await fetch(`/api/emby/views?${params.toString()}`);
      const data = await res.json();
      return (data.success ? data.views : []) as EmbyView[];
    },
    enabled: embyEnabled && !!embyKey,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const embyViews = viewsData ?? [];

  // ── 3. Emby 视频列表（无限滚动）────────────────────────────────────────────
  const {
    data: listData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loading,
    isError,
    error: listError,
  } = useInfiniteQuery({
    queryKey: ['emby', 'list', embyKey, selectedView, sortBy, sortOrder],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
        sortBy,
        sortOrder,
      });
      if (selectedView !== 'all') params.append('parentId', selectedView);
      if (embyKey) params.append('embyKey', embyKey);

      const res = await fetch(`/api/emby/list?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('获取列表失败');
      const data = await res.json();

      return {
        list: (data.list ?? []).map((item: any): Video => ({
          id: item.id,
          title: item.title,
          poster: item.poster,
          year: item.year,
          rating: item.rating,
          mediaType: item.mediaType,
        })),
        totalPages: data.totalPages ?? 0,
        currentPage: data.currentPage ?? pageParam,
        total: data.total ?? 0,
      } satisfies EmbyListPage;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.currentPage < lastPage.totalPages ? lastPage.currentPage + 1 : undefined,
    enabled: embyEnabled && !!embyKey,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // 把所有分页数据拍平成一个列表
  const videos = useMemo(
    () => listData?.pages.flatMap((p) => p.list) ?? [],
    [listData]
  );

  // 无限滚动：监听底部元素进入视口
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const target = observerTarget.current;
    if (target) observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── 4. Emby 搜索 ──────────────────────────────────────────────────────────
  const { data: searchData, isFetching: isSearching } = useQuery({
    queryKey: ['emby', 'search', embyKey, selectedView, searchKeyword],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ keyword: searchKeyword });
      if (embyKey) params.append('embyKey', embyKey);
      if (selectedView && selectedView !== 'all') params.append('parentId', selectedView);
      const res = await fetch(`/api/emby/search?${params.toString()}`, { signal });
      if (!res.ok) throw new Error('搜索失败');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return (data.videos ?? []) as Video[];
    },
    enabled: embyEnabled && !!embyKey && searchKeyword.trim().length > 0,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const searchResults = searchData ?? [];
  const isSearchMode = searchKeyword.trim().length > 0;

  // ── UI helpers ────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['emby'] });
    setIsRefreshing(false);
  };

  const sortOptions = [
    { value: 'SortName', label: '名称', icon: ArrowUpNarrowWide },
    { value: 'DateCreated', label: '添加时间', icon: ArrowDownWideNarrow },
    { value: 'PremiereDate', label: '上映时间', icon: ArrowDownWideNarrow },
  ];

  const toggleSortOrder = () => {
    setSortOrder((prev) => {
      const next = prev === 'Ascending' ? 'Descending' : 'Ascending';
      localStorage.setItem('emby_sortOrder', next);
      return next;
    });
  };

  const errorMessage = isError ? (listError as Error)?.message || '获取列表失败，请稍后重试' : '';

  if (!mounted) return null;

  if (!runtimeConfig.EMBY_ENABLED) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Film className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500">Emby功能未启用</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-6">
        {/* 标题和源选择 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Emby</h1>
              {!loading && listData && listData.pages[0]?.total > 0 && !isSearchMode && (
                <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                  共 {listData.pages[0].total} 部
                </span>
              )}
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="刷新列表"
              className={`group relative overflow-hidden flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 transform hover:scale-105
                ${isRefreshing
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                  : 'bg-linear-to-r from-emerald-500 via-green-500 to-teal-500 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50'
                }`}
            >
              {!isRefreshing && (
                <div className="absolute inset-0 rounded-xl bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              )}
              <RefreshCw className={`h-4 w-4 relative z-10 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              <span className="relative z-10">{isRefreshing ? '刷新中...' : '刷新'}</span>
            </button>
          </div>

          {/* Emby 源选择 */}
          {embySourceOptions.length > 1 && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">选择 Emby 源</label>
              <select
                value={embyKey || ''}
                onChange={(e) => {
                  const newKey = e.target.value || undefined;
                  setEmbyKey(newKey);
                  const sourceParam = newKey ? `emby:${newKey}` : 'emby';
                  router.push(`/emby?source=${sourceParam}`);
                }}
                className="px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
              >
                {embySourceOptions.map((source) => (
                  <option key={source.key} value={source.key}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 媒体库筛选 */}
          {embyViews.length > 0 && (
            <div className="mb-4">
              <CapsuleSwitch
                options={[
                  { value: 'all', label: '全部' },
                  ...embyViews.map((view) => ({
                    value: view.id,
                    label: view.name,
                  })),
                ]}
                active={selectedView}
                onChange={setSelectedView}
              />
            </div>
          )}

          {/* 搜索栏 */}
          <div className="mb-6">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-all duration-300 group-focus-within:text-green-500 dark:group-focus-within:text-green-400 group-focus-within:scale-110" />
              <input
                type="text"
                placeholder="搜索 Emby 视频..."
                className="w-full rounded-xl border border-gray-200 bg-white/80 pl-11 pr-11 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent focus:bg-white shadow-sm hover:shadow-md focus:shadow-lg dark:bg-gray-800/80 dark:text-white dark:placeholder-gray-500 dark:border-gray-700 dark:focus:bg-gray-800 dark:focus:ring-green-500 transition-all duration-300"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* 排序选择 */}
          <div className="mb-6">
            <div className="flex items-center space-x-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-green-500 via-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                <ArrowUpNarrowWide className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                排序方式
              </span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {sortOptions.map((option, index) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => { setSortBy(option.value); localStorage.setItem('emby_sortBy', option.value); }}
                    className={`group relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 transform hover:scale-105 ${
                      sortBy === option.value
                        ? 'bg-linear-to-r from-green-500 via-emerald-600 to-teal-500 text-white shadow-lg shadow-green-500/40'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-600 hover:shadow-md'
                    }`}
                    style={{
                      animation: `fadeInUp 0.3s ease-out ${index * 0.03}s both`,
                    }}
                  >
                    {sortBy === option.value && (
                      <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                    )}
                    {sortBy !== option.value && (
                      <div className="absolute inset-0 bg-linear-to-r from-green-50 via-emerald-50 to-green-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-green-900/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </span>
                  </button>
                );
              })}

              {/* 排序顺序按钮 */}
              <button
                onClick={toggleSortOrder}
                className="group relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-300 transform hover:scale-105 bg-linear-to-r from-blue-500 via-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/40"
              >
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                <span className="relative z-10 flex items-center gap-1.5">
                  {sortOrder === 'Ascending' ? (
                    <>
                      <ArrowUpNarrowWide className="h-4 w-4" />
                      升序
                    </>
                  ) : (
                    <>
                      <ArrowDownWideNarrow className="h-4 w-4" />
                      降序
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {errorMessage && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
            {errorMessage}
          </div>
        )}

        {/* 加载状态 */}
        {loading && (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-500">加载中...</p>
            </div>
          </div>
        )}

        {/* 搜索结果 */}
        {isSearchMode && searchResults.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                搜索结果 ({isSearching ? '...' : searchResults.length})
              </h3>
              <button
                onClick={() => setSearchKeyword('')}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                清除搜索
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {searchResults.map((video) => (
                <VideoCard
                  key={video.id}
                  id={video.id}
                  title={video.title}
                  poster={video.poster}
                  year={video.year}
                  source={embyKey ? `emby_${embyKey}` : 'emby'}
                  source_name={embySourceName}
                  from="search"
                />
              ))}
            </div>
          </div>
        )}

        {/* 无搜索结果 */}
        {isSearchMode && !isSearching && searchResults.length === 0 && (
          <div className='flex justify-center py-16'>
            <div className='relative px-12 py-10 rounded-3xl bg-linear-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 shadow-xl backdrop-blur-sm overflow-hidden max-w-md'>
              <div className='absolute top-0 left-0 w-32 h-32 bg-linear-to-br from-green-200/20 to-teal-200/20 rounded-full blur-3xl'></div>
              <div className='absolute bottom-0 right-0 w-32 h-32 bg-linear-to-br from-blue-200/20 to-green-200/20 rounded-full blur-3xl'></div>
              <div className='relative flex flex-col items-center gap-4'>
                <div className='relative'>
                  <div className='w-24 h-24 rounded-full bg-linear-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 flex items-center justify-center shadow-lg'>
                    <svg className='w-12 h-12 text-gray-400 dark:text-gray-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'></path>
                    </svg>
                  </div>
                  <div className='absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping'></div>
                  <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-teal-400 rounded-full animate-pulse'></div>
                </div>
                <div className='text-center space-y-2'>
                  <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    没有找到相关视频
                  </h3>
                  <p className='text-sm text-gray-600 dark:text-gray-400 max-w-xs'>
                    换个关键词试试，或者浏览 Emby 媒体库
                  </p>
                </div>
                <button
                  onClick={() => setSearchKeyword('')}
                  className='mt-2 px-6 py-2.5 bg-linear-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105'
                >
                  清除搜索条件
                </button>
                <div className='w-16 h-1 bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600 rounded-full'></div>
              </div>
            </div>
          </div>
        )}

        {/* 视频列表 */}
        {!loading && videos.length > 0 && !isSearchMode && (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                已加载 {videos.length} / {listData?.pages[0]?.total ?? 0} 部
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  id={video.id}
                  title={video.title}
                  poster={video.poster}
                  year={video.year}
                  source={embyKey ? `emby_${embyKey}` : 'emby'}
                  source_name={embySourceName}
                  from="search"
                />
              ))}
            </div>
          </>
        )}

        {/* 空状态 */}
        {!loading && videos.length === 0 && !errorMessage && !isSearchMode && (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center">
              <Film className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500">暂无内容</p>
            </div>
          </div>
        )}

        {/* 加载更多 */}
        {isFetchingNextPage && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* 无限滚动触发器 */}
        <div ref={observerTarget} className="h-4" />
      </div>
    </PageLayout>
  );
}
