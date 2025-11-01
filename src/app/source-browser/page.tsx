/* eslint-disable @next/next/no-img-element */

'use client';

import { ExternalLink, Layers, Server, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ClientCache } from '@/lib/client-cache';
import PageLayout from '@/components/PageLayout';
import type { DoubanItem, SearchResult as GlobalSearchResult } from '@/lib/types';

type Source = { key: string; name: string; api: string };
type Category = { type_id: string | number; type_name: string };
type Item = {
  id: string;
  title: string;
  poster: string;
  year: string;
  type_name?: string;
  remarks?: string;
};

export default function SourceBrowserPage() {
  const router = useRouter();

  const [sources, setSources] = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [activeSourceKey, setActiveSourceKey] = useState('');
  const activeSource = useMemo(
    () => sources.find((s) => s.key === activeSourceKey),
    [sources, activeSourceKey]
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | number>('');

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const hasMore = page < pageCount;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const lastFetchAtRef = useRef(0);
  const autoFillInProgressRef = useRef(false);

  // 搜索与排序
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'category' | 'search'>('category');
  const [sortBy, setSortBy] = useState<
    'default' | 'title-asc' | 'title-desc' | 'year-asc' | 'year-desc'
  >('default');
  const [debounceId, setDebounceId] = useState<NodeJS.Timeout | null>(null);

  // 二级筛选（地区 / 年份 / 关键词）
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  // 详情预览
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<GlobalSearchResult | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [previewDouban, setPreviewDouban] = useState<DoubanItem | null>(null);
  const [previewDoubanLoading, setPreviewDoubanLoading] = useState(false);
  const [previewDoubanId, setPreviewDoubanId] = useState<number | null>(null);
  type BangumiTag = { name: string };
  type BangumiInfoboxValue = string | { v: string } | Array<string | { v: string }>;
  type BangumiInfoboxEntry = { key: string; value: BangumiInfoboxValue };
  type BangumiSubject = {
    name?: string;
    name_cn?: string;
    date?: string;
    rating?: { score?: number };
    tags?: BangumiTag[];
    infobox?: BangumiInfoboxEntry[];
    summary?: string;
  };
  const [previewBangumi, setPreviewBangumi] = useState<BangumiSubject | null>(null);
  const [previewBangumiLoading, setPreviewBangumiLoading] = useState(false);
  const [previewSearchPick, setPreviewSearchPick] = useState<GlobalSearchResult | null>(null);

  const fetchSources = useCallback(async () => {
    setLoadingSources(true);
    setSourceError(null);
    try {
      const res = await fetch('/api/source-browser/sites', {
        cache: 'no-store',
      });
      if (res.status === 401) {
        throw new Error('登录状态已失效，请重新登录');
      }
      if (res.status === 403) {
        throw new Error('当前账号暂无可用资源站点');
      }
      if (!res.ok) throw new Error('获取源失败');
      const data = await res.json();
      const list: Source[] = data.sources || [];
      setSources(list);
      if (list.length > 0) {
        setActiveSourceKey(list[0].key);
      }
    } catch (e: unknown) {
      setSourceError(e instanceof Error ? e.message : '获取源失败');
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const fetchCategories = useCallback(async (sourceKey: string) => {
    if (!sourceKey) return;
    setLoadingCategories(true);
    setCategoryError(null);
    try {
      const res = await fetch(
        `/api/source-browser/categories?source=${encodeURIComponent(sourceKey)}`
      );
      if (!res.ok) throw new Error('获取分类失败');
      const data = await res.json();
      const list: Category[] = data.categories || [];
      setCategories(list);
      if (list.length > 0) {
        setActiveCategory(list[0].type_id);
      } else {
        setActiveCategory('');
      }
    } catch (e: unknown) {
      setCategoryError(e instanceof Error ? e.message : '获取分类失败');
      setCategories([]);
      setActiveCategory('');
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const fetchItems = useCallback(
    async (
      sourceKey: string,
      typeId: string | number,
      p = 1,
      append = false
    ) => {
      if (!sourceKey || !typeId) return;
      if (append) setLoadingMore(true);
      else setLoadingItems(true);
      setItemsError(null);
      try {
        const res = await fetch(
          `/api/source-browser/list?source=${encodeURIComponent(
            sourceKey
          )}&type_id=${encodeURIComponent(String(typeId))}&page=${p}`
        );
        if (!res.ok) throw new Error('获取列表失败');
        const data = (await res.json()) as {
          items?: Item[];
          meta?: { page?: number; pagecount?: number };
        };
        const list: Item[] = data.items || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(data.meta?.page || p));
        setPageCount(Number(data.meta?.pagecount || 1));
        // 更新可选年份
        const years = Array.from(
          new Set(list.map((i) => (i.year || '').trim()).filter(Boolean))
        );
        years.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
        setAvailableYears(years);
      } catch (e: unknown) {
        setItemsError(e instanceof Error ? e.message : '获取列表失败');
        if (!append) setItems([]);
        setPage(1);
        setPageCount(1);
        setAvailableYears([]);
      } finally {
        if (append) setLoadingMore(false);
        else setLoadingItems(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);
  useEffect(() => {
    if (activeSourceKey) fetchCategories(activeSourceKey);
  }, [activeSourceKey, fetchCategories]);
  useEffect(() => {
    if (activeSourceKey && activeCategory && mode === 'category') {
      // 重置列表并加载第一页
      setItems([]);
      setPage(1);
      setPageCount(1);
      fetchItems(activeSourceKey, activeCategory, 1, false);
    }
  }, [activeSourceKey, activeCategory, mode, fetchItems]);

  const fetchSearch = useCallback(
    async (sourceKey: string, q: string, p = 1, append = false) => {
      if (!sourceKey || !q) return;
      if (append) setLoadingMore(true);
      else setLoadingItems(true);
      setItemsError(null);
      try {
        const res = await fetch(
          `/api/source-browser/search?source=${encodeURIComponent(
            sourceKey
          )}&q=${encodeURIComponent(q)}&page=${p}`
        );
        if (!res.ok) throw new Error('搜索失败');
        const data = (await res.json()) as {
          items?: Item[];
          meta?: { page?: number; pagecount?: number };
        };
        const list: Item[] = data.items || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(data.meta?.page || p));
        setPageCount(Number(data.meta?.pagecount || 1));
        const years = Array.from(
          new Set(list.map((i) => (i.year || '').trim()).filter(Boolean))
        );
        years.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
        setAvailableYears(years);
      } catch (e: unknown) {
        setItemsError(e instanceof Error ? e.message : '搜索失败');
        if (!append) setItems([]);
        setPage(1);
        setPageCount(1);
        setAvailableYears([]);
      } finally {
        if (append) setLoadingMore(false);
        else setLoadingItems(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeSourceKey && mode === 'search' && query.trim()) {
      // 重置列表并加载第一页
      setItems([]);
      setPage(1);
      setPageCount(1);
      fetchSearch(activeSourceKey, query.trim(), 1, false);
    }
  }, [activeSourceKey, mode, query, fetchSearch]);

  // IntersectionObserver 处理自动翻页（含简单节流）
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const el = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          const now = Date.now();
          const intervalOk = now - lastFetchAtRef.current > 700; // 700ms 节流
          if (
            !loadingItems &&
            !loadingMore &&
            hasMore &&
            activeSourceKey &&
            intervalOk
          ) {
            lastFetchAtRef.current = now;
            const next = page + 1;
            if (mode === 'search' && query.trim()) {
              fetchSearch(activeSourceKey, query.trim(), next, true);
            } else if (mode === 'category' && activeCategory) {
              fetchItems(activeSourceKey, activeCategory, next, true);
            }
          }
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    loadingItems,
    loadingMore,
    hasMore,
    page,
    mode,
    activeSourceKey,
    activeCategory,
    query,
    fetchItems,
    fetchSearch,
  ]);

  // 首屏填充：若列表高度不足以产生滚动且仍有更多，则自动连续翻页尝试填满视口
  useEffect(() => {
    const tryAutoFill = async () => {
      if (autoFillInProgressRef.current) return;
      if (!loadMoreRef.current) return;
      if (loadingItems || loadingMore || !hasMore) return;
      const sentinel = loadMoreRef.current.getBoundingClientRect();
      const inViewport = sentinel.top <= window.innerHeight + 100;
      if (!inViewport) return;

      autoFillInProgressRef.current = true;
      try {
        let iterations = 0;
        while (iterations < 5) {
          // 最多连续加载5页以防过载
          if (!hasMore) break;
          const now = Date.now();
          if (now - lastFetchAtRef.current <= 400) break; // 避免过于频繁
          lastFetchAtRef.current = now;
          const next = page + iterations + 1;
          if (mode === 'search' && query.trim()) {
            await fetchSearch(activeSourceKey, query.trim(), next, true);
          } else if (mode === 'category' && activeCategory) {
            await fetchItems(activeSourceKey, activeCategory, next, true);
          } else {
            break;
          }
          iterations++;

          // 重新检测是否还在视口之内（内容增长可能已挤出视口）
          if (!loadMoreRef.current) break;
          const rect = loadMoreRef.current.getBoundingClientRect();
          if (rect.top > window.innerHeight + 100) break;
        }
      } finally {
        autoFillInProgressRef.current = false;
      }
    };

    // 异步执行以等待布局更新
    const id = setTimeout(tryAutoFill, 50);
    return () => clearTimeout(id);
  }, [
    items,
    page,
    pageCount,
    hasMore,
    loadingItems,
    loadingMore,
    mode,
    activeSourceKey,
    activeCategory,
    query,
    fetchItems,
    fetchSearch,
  ]);

  const filteredAndSorted = useMemo(() => {
    let arr = [...items];
    // 关键词/地区筛选（包含于标题或备注）
    if (filterKeyword.trim()) {
      const kw = filterKeyword.trim().toLowerCase();
      arr = arr.filter(
        (i) =>
          (i.title || '').toLowerCase().includes(kw) ||
          (i.remarks || '').toLowerCase().includes(kw)
      );
    }
    // 年份筛选（精确匹配）
    if (filterYear) {
      arr = arr.filter((i) => (i.year || '').trim() === filterYear);
    }
    switch (sortBy) {
      case 'title-asc':
        return arr.sort((a, b) => a.title.localeCompare(b.title));
      case 'title-desc':
        return arr.sort((a, b) => b.title.localeCompare(a.title));
      case 'year-asc':
        return arr.sort(
          (a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0)
        );
      case 'year-desc':
        return arr.sort(
          (a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0)
        );
      default:
        return arr; // 保持上游顺序
    }
  }, [items, sortBy, filterKeyword, filterYear]);

  const fetchDoubanDetails = async (doubanId: number) => {
    try {
      setPreviewDoubanLoading(true);
      setPreviewDouban(null);
      const keyRaw = `douban-details-id=${doubanId}`;
      // 1) 先查缓存（与全站一致的 ClientCache）
      const cached = (await ClientCache.get(keyRaw)) as DoubanItem | null;
      if (cached) {
        setPreviewDouban(cached);
        return;
      }

      // 2) 缓存未命中，回源请求 /api/douban/details
      const fallback = await fetch(
        `/api/douban/details?id=${encodeURIComponent(String(doubanId))}`
      );
      if (fallback.ok) {
        const dbData = (await fallback.json()) as
          | { code: number; message: string; data?: DoubanItem }
          | DoubanItem;
        const normalized = (dbData as { data?: DoubanItem }).data || (dbData as DoubanItem);
        setPreviewDouban(normalized);
        // 3) 回写缓存（4小时）
        try {
          await ClientCache.set(keyRaw, normalized, 14400);
        } catch (err) {
          void err; // ignore cache write failure
        }
      } else {
        setPreviewDouban(null);
      }
    } catch (e) {
      // ignore
    } finally {
      setPreviewDoubanLoading(false);
    }
  };

  // bangumi工具
  const isBangumiId = (id: number): boolean =>
    id > 0 && id.toString().length === 6;
  const fetchBangumiDetails = async (bangumiId: number) => {
    try {
      setPreviewBangumiLoading(true);
      setPreviewBangumi(null);
      const res = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`);
      if (res.ok) {
        const data = (await res.json()) as {
          name?: string;
          name_cn?: string;
          date?: string;
          rating?: { score?: number };
          tags?: { name: string }[];
          infobox?: { key: string; value: BangumiInfoboxValue }[];
          summary?: string;
        };
        setPreviewBangumi(data);
      }
    } catch (e) {
      // ignore
    } finally {
      setPreviewBangumiLoading(false);
    }
  };

  const openPreview = async (item: Item) => {
    setPreviewItem(item);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    setPreviewDouban(null);
    setPreviewDoubanId(null);
    setPreviewBangumi(null);
    setPreviewSearchPick(null);
    try {
      const res = await fetch(
        `/api/detail?source=${encodeURIComponent(
          activeSourceKey
        )}&id=${encodeURIComponent(item.id)}`
      );
      if (!res.ok) throw new Error('获取详情失败');
      const data = (await res.json()) as GlobalSearchResult;
      setPreviewData(data);
      // 处理 douban_id：优先 /api/detail，其次通过 /api/search/one 指定站点精确匹配推断
      let dId: number | null = data?.douban_id ? Number(data.douban_id) : null;
      if (!dId) {
        // 在当前源内精确搜索标题以获取带有 douban_id 的条目
        const normalize = (s: string) =>
          (s || '').replace(/\s+/g, '').toLowerCase();
        const variants = Array.from(
          new Set([item.title, (item.title || '').replace(/\s+/g, '')])
        ).filter(Boolean) as string[];

        for (const v of variants) {
          try {
            const res = await fetch(
              `/api/search/one?resourceId=${encodeURIComponent(
                activeSourceKey
              )}&q=${encodeURIComponent(v)}`
            );
            if (!res.ok) continue;
            const payload = (await res.json()) as {
              results?: GlobalSearchResult[];
            };
            const list: GlobalSearchResult[] = payload.results || [];
            // 优先标题+年份匹配
            const tNorm = normalize(item.title);
            const matchStrict = list.find(
              (r) =>
                normalize(r.title) === tNorm &&
                (!item.year ||
                  (r.year &&
                    String(r.year).toLowerCase() ===
                      String(item.year).toLowerCase())) &&
                r.douban_id
            );
            const matchTitleOnly = list.find(
              (r) => normalize(r.title) === tNorm && r.douban_id
            );
            const pick = matchStrict || matchTitleOnly || null;
            if (pick && pick.douban_id) {
              dId = Number(pick.douban_id);
              setPreviewSearchPick(pick);
              break;
            }
          } catch {
            // ignore
          }
        }
      }
      if (dId && dId > 0) {
        setPreviewDoubanId(dId);
        if (isBangumiId(dId)) {
          await fetchBangumiDetails(dId);
        } else {
          await fetchDoubanDetails(dId);
        }
      }
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : '获取详情失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const goPlay = (item: Item) => {
    const params = new URLSearchParams();
    params.set('source', activeSourceKey);
    params.set('id', item.id);
    const mergedTitle = (previewData?.title || item.title || '').toString();
    const mergedYear = (previewData?.year || item.year || '').toString();
    if (mergedTitle) params.set('title', mergedTitle);
    if (mergedYear) params.set('year', mergedYear);
    if (previewDoubanId) params.set('douban_id', String(previewDoubanId));
    // params.set('prefer', 'true');
    router.push(`/play?${params.toString()}`);
  };

  return (
    <PageLayout activePath='/source-browser'>
      <div className='max-w-7xl mx-auto space-y-6 -mt-6 md:mt-0'>
        {/* Header - 美化版 */}
        <div className='relative'>
          <div className='absolute inset-0 bg-gradient-to-r from-emerald-400/10 via-green-400/10 to-teal-400/10 rounded-2xl blur-3xl'></div>
          <div className='relative flex items-center gap-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-xl'>
            <div className='relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 flex items-center justify-center shadow-lg group hover:scale-110 transition-transform duration-300'>
              <div className='absolute inset-0 bg-emerald-400 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity'></div>
              <Layers className='relative w-8 h-8 text-white drop-shadow-lg' />
            </div>
            <div className='flex-1'>
              <h1 className='text-3xl md:text-4xl font-bold bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 dark:from-emerald-400 dark:via-green-400 dark:to-teal-400 bg-clip-text text-transparent'>
                源浏览器
              </h1>
              <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
                按来源站与分类浏览内容，探索海量影视资源
              </p>
            </div>
            {sources.length > 0 && (
              <div className='hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'>
                <Server className='w-4 h-4 text-emerald-600 dark:text-emerald-400' />
                <span className='text-sm font-medium text-emerald-700 dark:text-emerald-300'>
                  {sources.length} 个源可用
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sources - 美化版 */}
        <div className='bg-gradient-to-br from-white via-emerald-50/30 to-white dark:from-gray-800 dark:via-emerald-900/10 dark:to-gray-800 rounded-2xl shadow-lg border border-gray-200/80 dark:border-gray-700/80 backdrop-blur-sm'>
          <div className='px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between'>
            <div className='flex items-center gap-2.5 font-semibold text-gray-900 dark:text-white'>
              <div className='w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center'>
                <Server className='w-4 h-4 text-emerald-600 dark:text-emerald-400' />
              </div>
              <span>选择来源站</span>
            </div>
            {!loadingSources && sources.length > 0 && (
              <span className='text-xs px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium'>
                {sources.length} 个
              </span>
            )}
          </div>
          <div className='p-5'>
            {loadingSources ? (
              <div className='flex items-center gap-2 text-sm text-gray-500'>
                <div className='w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin'></div>
                加载中...
              </div>
            ) : sourceError ? (
              <div className='flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'>
                <span className='text-sm text-red-600 dark:text-red-400'>{sourceError}</span>
              </div>
            ) : sources.length === 0 ? (
              <div className='text-center py-8'>
                <div className='w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center'>
                  <Server className='w-8 h-8 text-gray-400' />
                </div>
                <p className='text-sm text-gray-500'>暂无可用来源</p>
              </div>
            ) : (
              <div className='flex flex-wrap gap-2.5'>
                {sources.map((s, index) => (
                  <button
                    key={s.key}
                    onClick={() => setActiveSourceKey(s.key)}
                    className={`group relative px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all duration-300 transform hover:scale-105 ${
                      activeSourceKey === s.key
                        ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white border-transparent shadow-lg shadow-emerald-500/30'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-50 dark:hover:from-emerald-900/20 dark:hover:to-green-900/20 hover:border-emerald-300 dark:hover:border-emerald-700'
                    }`}
                    style={{
                      animation: `fadeInUp 0.3s ease-out ${index * 0.05}s both`,
                    }}
                  >
                    {activeSourceKey === s.key && (
                      <div className='absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-400 to-green-400 blur-lg opacity-50 -z-10'></div>
                    )}
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Query & Sort */}
        {activeSource && (
          <div className='bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700'>
            <div className='px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-3'>
              {/* 第一行：搜索框 + 清除按钮 + 模式显示 */}
              <div className='flex items-center gap-2'>
                <input
                  value={query}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuery(val);
                    if (debounceId) clearTimeout(debounceId);
                    const id = setTimeout(() => {
                      setMode(val.trim() ? 'search' : 'category');
                      if (val.trim()) {
                        fetchSearch(activeSourceKey, val.trim(), 1);
                      } else if (activeCategory) {
                        fetchItems(activeSourceKey, activeCategory, 1);
                      }
                    }, 500);
                    setDebounceId(id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setMode(query.trim() ? 'search' : 'category');
                    }
                  }}
                  placeholder='输入关键词并回车进行搜索；清空回车恢复分类'
                  className='flex-1 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm'
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery('');
                      setMode('category');
                      if (activeCategory)
                        fetchItems(activeSourceKey, activeCategory, 1);
                    }}
                    className='px-3 py-2 text-xs border rounded-md whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700'
                    title='清除'
                  >
                    清除
                  </button>
                )}
                <div className='hidden sm:block text-xs text-gray-500 whitespace-nowrap'>
                  {mode === 'search' ? '搜索' : '分类'}
                </div>
              </div>

              {/* 第二行：筛选控件（移动端优化布局） */}
              <div className='grid grid-cols-2 sm:flex sm:flex-wrap gap-2'>
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as
                        | 'default'
                        | 'title-asc'
                        | 'title-desc'
                        | 'year-asc'
                        | 'year-desc'
                    )
                  }
                  className='sm:flex-1 sm:min-w-[120px] px-2 sm:px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs sm:text-sm'
                  title='排序'
                >
                  <option value='default'>默认</option>
                  <option value='title-asc'>标题 A→Z</option>
                  <option value='title-desc'>标题 Z→A</option>
                  <option value='year-asc'>年份↑</option>
                  <option value='year-desc'>年份↓</option>
                </select>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className='sm:flex-1 sm:min-w-[100px] px-2 sm:px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs sm:text-sm'
                  title='年份'
                >
                  <option value=''>全部年份</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <input
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  placeholder='地区/关键词'
                  className='col-span-2 sm:flex-1 sm:min-w-[140px] px-2 sm:px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs sm:text-sm'
                />
              </div>
            </div>
          </div>
        )}

        {/* Categories and Items */}
        {activeSource && (
          <div className='bg-gradient-to-br from-white via-blue-50/20 to-white dark:from-gray-800 dark:via-blue-900/5 dark:to-gray-800 rounded-2xl shadow-lg border border-gray-200/80 dark:border-gray-700/80 backdrop-blur-sm'>
            <div className='px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between'>
              <div className='flex items-center gap-2.5 font-semibold text-gray-900 dark:text-white'>
                <div className='w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center'>
                  <Tv className='w-4 h-4 text-blue-600 dark:text-blue-400' />
                </div>
                <span>{activeSource.name} 分类</span>
              </div>
              {categories.length > 0 && (
                <span className='text-xs px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'>
                  {categories.length} 个分类
                </span>
              )}
            </div>
            <div className='p-5 space-y-5'>
              {mode === 'category' && (
                <div className='flex flex-wrap gap-2.5'>
                  {loadingCategories ? (
                    <div className='flex items-center gap-2 text-sm text-gray-500'>
                      <div className='w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
                      加载分类...
                    </div>
                  ) : categoryError ? (
                    <div className='flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400'>
                      {categoryError}
                    </div>
                  ) : categories.length === 0 ? (
                    <div className='text-center w-full py-6'>
                      <div className='w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center'>
                        <Tv className='w-8 h-8 text-gray-400' />
                      </div>
                      <p className='text-sm text-gray-500'>暂无分类</p>
                    </div>
                  ) : (
                    categories.map((c, index) => (
                      <button
                        key={String(c.type_id)}
                        onClick={() => setActiveCategory(c.type_id)}
                        className={`group relative px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all duration-300 transform hover:scale-105 ${
                          activeCategory === c.type_id
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-transparent shadow-lg shadow-blue-500/30'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 hover:border-blue-300 dark:hover:border-blue-700'
                        }`}
                        style={{
                          animation: `fadeInUp 0.3s ease-out ${index * 0.03}s both`,
                        }}
                      >
                        {activeCategory === c.type_id && (
                          <div className='absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400 to-indigo-400 blur-lg opacity-50 -z-10'></div>
                        )}
                        {c.type_name}
                      </button>
                    ))
                  )}
                </div>
              )}

              <div>
                {loadingItems ? (
                  <div className='flex items-center gap-2 text-sm text-gray-500'>
                    <div className='w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
                    加载内容...
                  </div>
                ) : itemsError ? (
                  <div className='flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400'>
                    {itemsError}
                  </div>
                ) : items.length === 0 ? (
                  <div className='text-center py-12'>
                    <div className='w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center'>
                      <Tv className='w-10 h-10 text-gray-400' />
                    </div>
                    <p className='text-sm text-gray-500'>暂无内容</p>
                  </div>
                ) : (
                  <>
                    <div className='grid gap-3 grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
                      {filteredAndSorted.map((item, index) => (
                        <div
                          key={item.id}
                          className='group relative rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-300 bg-white dark:bg-gray-800 cursor-pointer hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-1'
                          onClick={() => openPreview(item)}
                          role='button'
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') openPreview(item);
                          }}
                          style={{
                            animation: `fadeInUp 0.4s ease-out ${index * 0.02}s both`,
                          }}
                        >
                          {/* 发光效果 */}
                          <div className='absolute inset-0 bg-gradient-to-t from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:via-blue-500/5 group-hover:to-transparent transition-all duration-300 pointer-events-none z-10'></div>

                          <div className='aspect-[2/3] bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-700 dark:via-gray-800 dark:to-gray-700 overflow-hidden relative'>
                            {item.poster ? (
                              <img
                                src={item.poster}
                                alt={item.title}
                                className='w-full h-full object-cover group-hover:scale-110 transition-transform duration-500'
                                loading='lazy'
                              />
                            ) : (
                              <div className='w-full h-full flex items-center justify-center text-gray-400 text-xs sm:text-sm'>
                                <div className='text-center'>
                                  <Tv className='w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-1 sm:mb-2 opacity-50' />
                                  <div className='text-[10px] sm:text-sm'>无封面</div>
                                </div>
                              </div>
                            )}
                            {/* 渐变遮罩 */}
                            <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>

                            {/* 年份标签 */}
                            {item.year && (
                              <div className='absolute top-1 right-1 sm:top-2 sm:right-2 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg bg-black/70 backdrop-blur-sm text-white text-[10px] sm:text-xs font-medium'>
                                {item.year}
                              </div>
                            )}

                            {/* 分类标签 */}
                            {item.type_name && (
                              <div className='absolute bottom-1 left-1 sm:bottom-2 sm:left-2 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg bg-blue-500/90 backdrop-blur-sm text-white text-[10px] sm:text-xs font-medium'>
                                {item.type_name}
                              </div>
                            )}
                          </div>

                          <div className='p-1.5 sm:p-3 space-y-1 sm:space-y-1.5 relative z-20'>
                            <div className='font-medium text-xs sm:text-sm text-gray-900 dark:text-white line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug min-h-[2rem] sm:min-h-[2.5rem]'>
                              {item.title}
                            </div>
                            {item.remarks && (
                              <div className='text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 line-clamp-1'>
                                {item.remarks}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Infinite loader sentinel */}
                    <div
                      ref={loadMoreRef}
                      className='mt-4 flex items-center justify-center py-4'
                    >
                      {loadingMore ? (
                        <div className='text-sm text-gray-500'>加载更多...</div>
                      ) : hasMore ? (
                        <div className='text-xs text-gray-400'>
                          下拉加载更多
                        </div>
                      ) : (
                        <div className='text-xs text-gray-400'>没有更多了</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 预览弹层 */}
        {previewOpen && (
          <div
            className='fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-3 py-6 sm:p-4 pb-20 md:pb-4 animate-fadeIn'
            role='dialog'
            aria-modal='true'
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className='w-full max-w-5xl bg-gradient-to-br from-white via-blue-50/20 to-white dark:from-gray-800 dark:via-blue-900/10 dark:to-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] md:max-h-[90vh] border-2 border-gray-200/50 dark:border-gray-700/50 animate-scaleIn'
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className='relative flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm'>
                <div className='flex items-center gap-3 flex-1 min-w-0'>
                  <div className='w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg'>
                    <Tv className='w-5 h-5 text-white' />
                  </div>
                  <div className='font-bold text-lg sm:text-xl text-gray-900 dark:text-white truncate'>
                    {previewItem?.title || '详情预览'}
                  </div>
                </div>
                <button
                  className='ml-3 flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
                  onClick={() => setPreviewOpen(false)}
                  title='关闭'
                >
                  <svg className='w-5 h-5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                  </svg>
                </button>
              </div>
              {/* 内容区 */}
              <div className='p-5 sm:p-6 overflow-auto flex-1'>
                {previewLoading ? (
                  <div className='flex flex-col items-center justify-center py-12'>
                    <div className='w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4'></div>
                    <div className='text-sm text-gray-500'>加载详情...</div>
                  </div>
                ) : previewError ? (
                  <div className='flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400'>
                    <svg className='w-5 h-5 flex-shrink-0' fill='currentColor' viewBox='0 0 20 20'>
                      <path fillRule='evenodd' d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z' clipRule='evenodd' />
                    </svg>
                    {previewError}
                  </div>
                ) : !previewData ? (
                  <div className='text-center py-12'>
                    <div className='w-20 h-20 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center'>
                      <Tv className='w-10 h-10 text-gray-400' />
                    </div>
                    <div className='text-sm text-gray-500'>暂无详情</div>
                  </div>
                ) : (
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 md:gap-6'>
                    {/* 左侧封面 - 移动端紧凑显示 */}
                    <div className='md:col-span-1'>
                      <div className='md:sticky md:top-0'>
                        {previewItem?.poster ? (
                          <div className='relative rounded-xl md:rounded-2xl overflow-hidden shadow-lg md:shadow-2xl border border-gray-200 dark:border-gray-700 md:border-2 group max-w-[200px] mx-auto md:max-w-none'>
                            <img
                              src={previewItem.poster}
                              alt={previewItem.title}
                              className='w-full group-hover:scale-105 transition-transform duration-300'
                            />
                            <div className='absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity'></div>
                          </div>
                        ) : (
                          <div className='w-full max-w-[200px] mx-auto md:max-w-none aspect-[2/3] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-xl md:rounded-2xl flex items-center justify-center border border-gray-200 dark:border-gray-700 md:border-2'>
                            <div className='text-center text-gray-400'>
                              <Tv className='w-12 h-12 md:w-16 md:h-16 mx-auto mb-2 opacity-50' />
                              <div className='text-xs md:text-sm'>暂无封面</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className='md:col-span-2 space-y-2'>
                      <div className='flex items-center gap-2 sm:gap-3 flex-wrap'>
                        <div className='text-base sm:text-lg font-semibold text-gray-900 dark:text-white'>
                          {previewData.title || previewItem?.title}
                        </div>
                        {/* 评分徽章 */}
                        {(() => {
                          const d = previewDouban;
                          if (d?.rate) {
                            return (
                              <span className='px-2 py-0.5 rounded-md text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'>
                                豆瓣 {d.rate}
                              </span>
                            );
                          }
                          if (previewBangumi?.rating?.score) {
                            return (
                              <span className='px-2 py-0.5 rounded-md text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'>
                                Bangumi {previewBangumi.rating.score}
                              </span>
                            );
                          }
                          return null;
                        })()}
                        {/* 外链按钮 */}
                        {(() => {
                          const d = previewDouban;
                          if (d?.id) {
                            return (
                              <a
                                href={`https://movie.douban.com/subject/${d.id}/`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline'
                                title='打开豆瓣页面'
                              >
                                <ExternalLink className='w-3.5 h-3.5' /> 豆瓣
                              </a>
                            );
                          }
                          if (previewBangumi && previewDoubanId) {
                            return (
                              <a
                                href={`https://bgm.tv/subject/${previewDoubanId}`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-300 hover:underline'
                                title='打开 Bangumi 页面'
                              >
                                <ExternalLink className='w-3.5 h-3.5' /> Bangumi
                              </a>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className='text-xs sm:text-sm text-gray-600 dark:text-gray-300'>
                        年份：{previewData.year || previewItem?.year || '—'}
                      </div>
                      <div className='text-xs sm:text-sm text-gray-600 dark:text-gray-300'>
                        来源：{activeSource?.name}
                      </div>
                      <div className='flex flex-wrap gap-2 text-xs'>
                        {previewItem?.type_name && (
                          <span className='px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700'>
                            {previewItem.type_name}
                          </span>
                        )}
                        {previewData?.class && (
                          <span className='px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700'>
                            {previewData.class}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const desc =
                          (previewData?.desc && previewData.desc.trim()) ||
                          (previewSearchPick?.desc &&
                            String(previewSearchPick.desc).trim()) ||
                          (previewItem?.remarks && previewItem.remarks.trim());
                        return desc ? (
                          <div className='mt-1 border rounded-md p-2 sm:p-3 bg-gray-50 dark:bg-gray-900 text-xs sm:text-sm text-gray-700 dark:text-gray-300 max-h-32 sm:max-h-40 overflow-auto whitespace-pre-line'>
                            {desc}
                          </div>
                        ) : null;
                      })()}
                      {/* 按需：应你的要求，预览不再展示集数选择列表，保持布局紧凑 */}
                      {/* Douban/Bangumi 扩展信息 */}
                      <div className='pt-2 space-y-2'>
                        {/* Douban */}
                        {previewDoubanLoading && !previewBangumiLoading && (
                          <div className='text-sm text-gray-500'>
                            加载豆瓣信息...
                          </div>
                        )}
                        {previewDouban &&
                          (() => {
                            const d = previewDouban;
                            return (
                              <div className='text-sm text-gray-700 dark:text-gray-300 space-y-1'>
                                <div className='font-semibold'>豆瓣信息</div>
                                {d.title && (
                                  <div>
                                    标题：{d.title}
                                    {d.rate ? (
                                      <span>（评分 {d.rate}）</span>
                                    ) : null}
                                  </div>
                                )}
                                {d.directors && d.directors.length > 0 && (
                                  <div>导演：{d.directors.join('、')}</div>
                                )}
                                {d.screenwriters &&
                                  d.screenwriters.length > 0 && (
                                    <div>
                                      编剧：{d.screenwriters.join('、')}
                                    </div>
                                  )}
                                {d.cast && d.cast.length > 0 && (
                                  <div>
                                    主演：{d.cast.slice(0, 8).join('、')}
                                    {d.cast.length > 8 ? '…' : ''}
                                  </div>
                                )}
                                <div className='flex flex-wrap gap-2 text-xs'>
                                  {d.genres &&
                                    d.genres.map((g: string) => (
                                      <span
                                        key={g}
                                        className='px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700'
                                      >
                                        {g}
                                      </span>
                                    ))}
                                  {d.countries &&
                                    d.countries.map((c: string) => (
                                      <span
                                        key={c}
                                        className='px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700'
                                      >
                                        {c}
                                      </span>
                                    ))}
                                  {d.languages &&
                                    d.languages.map((l: string) => (
                                      <span
                                        key={l}
                                        className='px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700'
                                      >
                                        {l}
                                      </span>
                                    ))}
                                </div>
                                {d.first_aired && (
                                  <div>首播/上映：{d.first_aired}</div>
                                )}
                                {(d.episodes ||
                                  d.episode_length ||
                                  d.movie_duration) && (
                                  <div className='text-xs text-gray-600 dark:text-gray-400'>
                                    {d.episodes ? `集数：${d.episodes} ` : ''}
                                    {d.episode_length
                                      ? `单集：${d.episode_length} 分钟 `
                                      : ''}
                                    {d.movie_duration
                                      ? `片长：${d.movie_duration} 分钟`
                                      : ''}
                                  </div>
                                )}
                                {d.plot_summary && (
                                  <div className='text-xs text-gray-600 dark:text-gray-400 leading-relaxed'>
                                    {d.plot_summary}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                        {/* Bangumi */}
                        {previewBangumiLoading && (
                          <div className='text-sm text-gray-500'>
                            加载 Bangumi 信息...
                          </div>
                        )}
                        {previewBangumi && (
                          <div className='text-sm text-gray-700 dark:text-gray-300 space-y-1'>
                            <div className='font-semibold'>Bangumi 信息</div>
                            <div>
                              标题：
                              {previewBangumi.name_cn || previewBangumi.name}
                              {previewBangumi.rating?.score ? (
                                <span>
                                  （评分 {previewBangumi.rating.score}）
                                </span>
                              ) : null}
                            </div>
                            {previewBangumi.date && (
                              <div>首播：{previewBangumi.date}</div>
                            )}
                            {Array.isArray(previewBangumi.tags) &&
                              previewBangumi.tags.length > 0 && (
                                <div className='flex flex-wrap gap-2 text-xs'>
                                  {previewBangumi.tags
                                    .slice(0, 10)
                                    .map((t) => (
                                      <span
                                        key={t.name}
                                        className='px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700'
                                      >
                                        {t.name}
                                      </span>
                                    ))}
                                </div>
                              )}
                            {Array.isArray(previewBangumi.infobox) &&
                              previewBangumi.infobox.length > 0 && (
                                <div className='text-xs space-y-0.5'>
                                  {previewBangumi.infobox
                                    .slice(0, 10)
                                    .map((info, idx: number) => (
                                      <div key={idx}>
                                        {info.key}：
                                        {Array.isArray(info.value)
                                          ? info.value
                                              .map((v) =>
                                                typeof v === 'string' ? v : v.v
                                              )
                                              .join('、')
                                          : typeof info.value === 'string'
                                          ? info.value
                                          : info.value.v}
                                      </div>
                                    ))}
                                </div>
                              )}
                            {previewBangumi.summary && (
                              <div className='text-xs text-gray-600 dark:text-gray-400 leading-relaxed'>
                                {previewBangumi.summary}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* 底部操作栏 */}
              <div className='px-5 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white/90 via-blue-50/50 to-white/90 dark:from-gray-800/90 dark:via-blue-900/10 dark:to-gray-800/90 backdrop-blur-md flex items-center justify-between gap-3'>
                <div className='text-xs sm:text-sm text-gray-500 dark:text-gray-400'>
                  {previewData?.class && (
                    <span className='inline-flex items-center gap-1.5'>
                      <span className='w-1.5 h-1.5 rounded-full bg-blue-500'></span>
                      {previewData.class}
                    </span>
                  )}
                </div>
                <div className='flex items-center gap-2 sm:gap-3'>
                  <button
                    onClick={() => setPreviewOpen(false)}
                    className='px-3 sm:px-4 py-2 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium transition-colors'
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      if (previewItem) goPlay(previewItem);
                    }}
                    className='group relative inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-300 hover:scale-105'
                  >
                    <div className='absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400 to-indigo-400 blur-lg opacity-0 group-hover:opacity-50 transition-opacity -z-10'></div>
                    <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 20 20'>
                      <path d='M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z' />
                    </svg>
                    立即播放
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
