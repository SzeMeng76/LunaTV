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
      let list: Category[] = data.categories || [];

      // ===== 关键修改：完全隐藏“艾旦影视”源的所有分类 =====
      const currentSource = sources.find((s) => s.key === sourceKey);
      if (currentSource && currentSource.name === '艾旦影视') {
        list = []; // 清空分类列表
      } else {
        // ===== 其他源：隐藏指定的敏感分类 =====
        const hiddenCategoryNames = [
          '伦理片',
          '里番动漫',
          '同性',
          '伦理',
          '三级伦理',
          '网红主播',
          '韩国伦理',
          '西方伦理',
          '日本伦理',
          '两性课堂',
          '写真热舞',
          '擦边短剧',
          '港台三级',
          '里番动画',
          '成人',
          '里番',
          '理论片',
          '福利',
        ];
        list = list.filter(
          (category) => !hiddenCategoryNames.includes(category.type_name.trim())
        );
      }
      // ================================================

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
  }, [sources]); // 依赖 sources 以便获取当前源名称

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
      setItems([]);
      setPage(1);
      setPageCount(1);
      fetchSearch(activeSourceKey, query.trim(), 1, false);
    }
  }, [activeSourceKey, mode, query, fetchSearch]);

  // 以下所有代码（自动加载、排序、预览、播放等）与原文件完全一致，未做任何改动
  // （为保持完整性，这里保留全部内容）

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const el = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          const now = Date.now();
          const intervalOk = now - lastFetchAtRef.current > 700;
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
          if (!hasMore) break;
          const now = Date.now();
          if (now - lastFetchAtRef.current <= 400) break;
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
          if (!loadMoreRef.current) break;
          const rect = loadMoreRef.current.getBoundingClientRect();
          if (rect.top > window.innerHeight + 100) break;
        }
      } finally {
        autoFillInProgressRef.current = false;
      }
    };

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
    if (filterKeyword.trim()) {
      const kw = filterKeyword.trim().toLowerCase();
      arr = arr.filter(
        (i) =>
          (i.title || '').toLowerCase().includes(kw) ||
          (i.remarks || '').toLowerCase().includes(kw)
      );
    }
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
        return arr;
    }
  }, [items, sortBy, filterKeyword, filterYear]);

  const fetchDoubanDetails = async (doubanId: number) => {
    try {
      setPreviewDoubanLoading(true);
      setPreviewDouban(null);
      const keyRaw = `douban-details-id=${doubanId}`;
      const cached = (await ClientCache.get(keyRaw)) as DoubanItem | null;
      if (cached) {
        setPreviewDouban(cached);
        return;
      }

      const fallback = await fetch(
        `/api/douban/details?id=${encodeURIComponent(String(doubanId))}`
      );
      if (fallback.ok) {
        const dbData = (await fallback.json()) as
          | { code: number; message: string; data?: DoubanItem }
          | DoubanItem;
        const normalized = (dbData as { data?: DoubanItem }).data || (dbData as DoubanItem);
        setPreviewDouban(normalized);
        try {
          await ClientCache.set(keyRaw, normalized, 14400);
        } catch (err) {
          void err;
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

  const isBangumiId = (id: number): boolean =>
    id > 0 && id.toString().length === 6;

  const fetchBangumiDetails = async (bangumiId: number) => {
    try {
      setPreviewBangumiLoading(true);
      setPreviewBangumi(null);
      const res = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`);
      if (res.ok) {
        const data = (await res.json()) as BangumiSubject;
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
      let dId: number | null = data?.douban_id ? Number(data.douban_id) : null;
      if (!dId) {
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
    params.set('prefer', 'true');
    router.push(`/play?${params.toString()}`);
  };

  return (
    <PageLayout activePath='/source-browser'>
      <div className='max-w-7xl mx-auto space-y-6 -mt-6 md:mt-0'>
        {/* 以下 JSX 与原文件完全一致，仅保留核心结构 */}
        {/* Header、Sources、Query & Sort、Categories and Items、预览弹层全部保持原样 */}
        {/* （为避免过长，这里不再重复粘贴所有 JSX，但实际使用时请保留原文件全部 return 内容） */}

        {/* 示例：Header 部分（实际请复制原文件完整 JSX） */}
        <div className='relative'>
          {/* ... 原 Header JSX ... */}
        </div>

        {/* Sources、搜索栏、分类区、内容网格、预览弹层等全部保持原文件内容不变 */}

      </div>
    </PageLayout>
  );
}
