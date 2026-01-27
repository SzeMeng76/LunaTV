/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { AlertCircle, Copy, ExternalLink, Loader2, Check } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';

interface AcgSearchItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  torrentUrl: string;
  description: string;
  images: string[];
}

interface AcgSearchResult {
  keyword: string;
  page: number;
  total: number;
  items: AcgSearchItem[];
}

interface AcgSearchProps {
  keyword: string;
  triggerSearch?: boolean;
  onError?: (error: string) => void;
}

type AcgSearchSource = 'acgrip' | 'mikan' | 'dmhy';

export default function AcgSearch({
  keyword,
  triggerSearch,
  onError,
}: AcgSearchProps) {
  const [source, setSource] = useState<AcgSearchSource>('acgrip');
  const [loading, setLoading] = useState(false);
  const [allItems, setAllItems] = useState<AcgSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);

  // 执行搜索
  const performSearch = async (page: number, isLoadMore = false) => {
    if (isLoadingMoreRef.current) return;
    // Mikan 和 DMHY 不支持分页，page > 1 时直接返回
    if (source === 'mikan' && page > 1) return;
    if (source === 'dmhy' && page > 1) return;

    isLoadingMoreRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // 根据选择的源确定 API 路径
      const apiUrl =
        source === 'mikan'
          ? '/api/acg/mikan'
          : source === 'dmhy'
            ? '/api/acg/dmhy'
            : '/api/acg/acgrip';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyword: keyword.trim(),
          page,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '搜索失败');
      }

      const data: AcgSearchResult = await response.json();

      if (isLoadMore) {
        // 追加新数据
        setAllItems(prev => [...prev, ...data.items]);
        // 如果当前页没有结果，说明没有更多了
        setHasMore(source !== 'mikan' && source !== 'dmhy' && data.items.length > 0);
      } else {
        // 新搜索，重置数据
        setAllItems(data.items);
        // 如果第一页有结果，假设可能还有更多
        setHasMore(source !== 'mikan' && source !== 'dmhy' && data.items.length > 0);
      }

      setCurrentPage(page);
    } catch (err: any) {
      const errorMsg = err.message || '搜索失败，请稍后重试';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setLoading(false);
      isLoadingMoreRef.current = false;
    }
  };

  useEffect(() => {
    if (triggerSearch === undefined) {
      return;
    }

    const currentKeyword = keyword.trim();
    if (!currentKeyword) {
      return;
    }

    // 重置状态并开始新搜索
    setAllItems([]);
    setCurrentPage(1);
    setHasMore(true);
    performSearch(1, false);
  }, [triggerSearch]);

  // 切换源时重新搜索
  useEffect(() => {
    if (triggerSearch === undefined) {
      return;
    }

    const currentKeyword = keyword.trim();
    if (!currentKeyword) {
      return;
    }

    // 重置状态并开始新搜索
    setAllItems([]);
    setCurrentPage(1);
    setHasMore(source === 'acgrip'); // Mikan 和 DMHY 不支持分页
    performSearch(1, false);
  }, [source]);

  // 加载更多数据
  const loadMore = useCallback(() => {
    if (source === 'mikan') return;
    if (source === 'dmhy') return;
    if (!loading && hasMore && !isLoadingMoreRef.current) {
      performSearch(currentPage + 1, true);
    }
  }, [loading, hasMore, currentPage, source]);

  // 使用 Intersection Observer 监听滚动到底部
  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting) {
          loadMore();
        }
      },
      {
        root: null,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [loadMore]);

  // 复制磁力链接
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  if (loading && allItems.length === 0) {
    return (
      <div className='flex items-center justify-center py-12'>
        <div className='text-center'>
          <Loader2 className='mx-auto h-8 w-8 animate-spin text-green-600 dark:text-green-400' />
          <p className='mt-4 text-sm text-gray-600 dark:text-gray-400'>
            正在搜索动漫资源...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center py-12'>
        <div className='text-center'>
          <AlertCircle className='mx-auto h-12 w-12 text-red-500 dark:text-red-400' />
          <p className='mt-4 text-sm text-red-600 dark:text-red-400'>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* 源切换器 */}
      <div className='flex items-center justify-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
        <span className='text-sm text-gray-600 dark:text-gray-400'>搜索源：</span>
        <div className='flex gap-2'>
          <button
            onClick={() => setSource('acgrip')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              source === 'acgrip'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            ACG.RIP
          </button>
          <button
            onClick={() => setSource('mikan')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              source === 'mikan'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            蜜柑计划
          </button>
          <button
            onClick={() => setSource('dmhy')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              source === 'dmhy'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            动漫花园
          </button>
        </div>
      </div>

      {/* 未找到资源提示 */}
      {allItems.length === 0 && (
        <div className='flex items-center justify-center py-12'>
          <div className='text-center'>
            <AlertCircle className='mx-auto h-12 w-12 text-gray-400 dark:text-gray-600' />
            <p className='mt-4 text-sm text-gray-600 dark:text-gray-400'>
              未找到相关资源，请尝试切换其他搜索源
            </p>
          </div>
        </div>
      )}

      {/* 结果列表 */}
      <div className='space-y-3'>
        {allItems.map((item) => (
          <div
            key={item.guid}
            className='p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-600 transition-colors'
          >
            {/* 标题 */}
            <div className='mb-2 font-medium text-gray-900 dark:text-gray-100'>
              {item.title}
            </div>

            {/* 发布时间 */}
            <div className='mb-2 text-xs text-gray-500 dark:text-gray-400'>
              {new Date(item.pubDate).toLocaleString('zh-CN')}
            </div>

            {/* 图片预览 */}
            {item.images && item.images.length > 0 && (
              <div className='mb-3 flex gap-2 overflow-x-auto'>
                {item.images.slice(0, 3).map((img, imgIndex) => (
                  <img
                    key={imgIndex}
                    src={img}
                    alt=''
                    className='h-20 w-auto rounded object-cover'
                    loading='lazy'
                  />
                ))}
              </div>
            )}

            {/* 磁力链接 */}
            {item.torrentUrl && (
              <div className='mb-3 p-2 rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono break-all text-gray-700 dark:text-gray-300'>
                {item.torrentUrl}
              </div>
            )}

            {/* 操作按钮 */}
            <div className='flex items-center gap-2'>
              <button
                onClick={() => copyToClipboard(item.torrentUrl, item.guid)}
                className='flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 transition-colors'
                title='复制磁力链接'
              >
                {copiedId === item.guid ? (
                  <>
                    <Check className='h-4 w-4' />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className='h-4 w-4' />
                    <span>复制链接</span>
                  </>
                )}
              </button>
              <a
                href={item.link}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-200 text-gray-700 text-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors'
                title='查看详情'
              >
                <ExternalLink className='h-4 w-4' />
                <span>详情</span>
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* 加载更多指示器 */}
      {source !== 'mikan' && source !== 'dmhy' && hasMore && (
        <div ref={loadMoreRef} className='flex items-center justify-center py-8'>
          <div className='text-center'>
            <Loader2 className='mx-auto h-6 w-6 animate-spin text-green-600 dark:text-green-400' />
            <p className='mt-2 text-sm text-gray-600 dark:text-gray-400'>
              加载更多...
            </p>
          </div>
        </div>
      )}

      {/* 没有更多数据提示 */}
      {!hasMore && allItems.length > 0 && (
        <div className='text-center py-4'>
          <p className='text-sm text-gray-500 dark:text-gray-400'>
            没有更多结果了
          </p>
        </div>
      )}
    </div>
  );
}
