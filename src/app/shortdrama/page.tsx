/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronUp, Filter, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getShortDramaCategories,
  getShortDramaList,
  searchShortDramas,
} from '@/lib/shortdrama.client';
import { cleanExpiredCache } from '@/lib/shortdrama-cache';
import { ShortDramaCategory, ShortDramaItem } from '@/lib/types';

import PageLayout from '@/components/PageLayout';
import ShortDramaCard from '@/components/ShortDramaCard';

export default function ShortDramaPage() {
  const [categories, setCategories] = useState<ShortDramaCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number>(1);
  const [dramas, setDramas] = useState<ShortDramaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  const observer = useRef<IntersectionObserver>();
  const lastDramaElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setPage((prevPage) => prevPage + 1);
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, hasMore]
  );

  // 获取分类列表
  useEffect(() => {
    // 清理过期缓存
    cleanExpiredCache().catch(console.error);

    const fetchCategories = async () => {
      const cats = await getShortDramaCategories();
      setCategories(cats);
    };
    fetchCategories();
  }, []);

  // 监听滚动位置，控制返回顶部按钮显示
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
      isRunning = false;
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 加载短剧列表
  const loadDramas = useCallback(
    async (pageNum: number, reset = false) => {
      if (!hasMore && !reset) return;

      setLoading(true);
      try {
        let result: { list: ShortDramaItem[]; hasMore: boolean };
        if (isSearchMode && searchQuery) {
          result = await searchShortDramas(searchQuery, pageNum, 20);
        } else {
          result = await getShortDramaList(selectedCategory, pageNum, 20);
        }

        if (reset) {
          setDramas(result.list);
        } else {
          setDramas((prev) => [...prev, ...result.list]);
        }
        setHasMore(result.hasMore);
      } catch (error) {
        console.error('加载短剧失败:', error);
      } finally {
        setLoading(false);
      }
    },
    [selectedCategory, searchQuery, isSearchMode, hasMore]
  );

  // 当分类变化时重新加载
  useEffect(() => {
    if (selectedCategory && !isSearchMode) {
      setPage(1);
      setHasMore(true);
      loadDramas(1, true);
    }
  }, [selectedCategory, isSearchMode]);

  // 当页码变化时加载更多
  useEffect(() => {
    if (page > 1) {
      loadDramas(page, false);
    }
  }, [page]);

  // 处理搜索
  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      setIsSearchMode(!!query);
      setPage(1);
      setHasMore(true);

      if (query) {
        const result = await searchShortDramas(query, 1, 20);
        setDramas(result.list);
        setHasMore(result.hasMore);
      } else {
        // 退出搜索模式，重新加载分类数据
        loadDramas(1, true);
      }
    },
    [loadDramas]
  );

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

  return (
    <PageLayout activePath="/shortdrama">
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          {/* 页面标题 */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              短剧频道
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              精彩短剧，一刷到底
            </p>
          </div>

          {/* 搜索栏 */}
          <div className="mb-6">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-all duration-300 group-focus-within:text-purple-500 dark:group-focus-within:text-purple-400 group-focus-within:scale-110" />
              <input
                type="text"
                placeholder="搜索短剧名称..."
                className="w-full rounded-xl border border-gray-200 bg-white/80 pl-11 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent focus:bg-white shadow-sm hover:shadow-md focus:shadow-lg dark:bg-gray-800/80 dark:text-white dark:placeholder-gray-500 dark:border-gray-700 dark:focus:bg-gray-800 dark:focus:ring-purple-500 transition-all duration-300"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          </div>

          {/* 分类筛选 */}
          {!isSearchMode && (
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
                  <Filter className="h-4 w-4 text-white" />
                </div>
                <span className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  分类筛选
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {categories.map((category) => (
                  <button
                    key={category.type_id}
                    onClick={() => setSelectedCategory(category.type_id)}
                    className={`relative rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                      selectedCategory === category.type_id
                        ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 text-white shadow-lg shadow-purple-500/50 scale-105'
                        : 'bg-gray-100 text-gray-700 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 hover:text-purple-700 hover:shadow-md dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-purple-300'
                    }`}
                  >
                    {selectedCategory === category.type_id && (
                      <div className="absolute inset-0 rounded-full bg-white/20 animate-ping"></div>
                    )}
                    <span className="relative">{category.type_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 短剧网格 */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {dramas.map((drama, index) => (
              <div
                key={`${drama.id}-${index}`}
                ref={index === dramas.length - 1 ? lastDramaElementRef : null}
              >
                <ShortDramaCard drama={drama} />
              </div>
            ))}
          </div>

          {/* 加载状态 */}
          {loading && (
            <div className="mt-8">
              <div className="flex justify-center mb-6">
                <div className='flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border border-purple-200/50 dark:border-purple-700/50 shadow-md'>
                  <div className='animate-spin rounded-full h-5 w-5 border-2 border-purple-300 border-t-purple-600 dark:border-purple-700 dark:border-t-purple-400'></div>
                  <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>加载更多短剧...</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="relative overflow-hidden">
                    <div className="aspect-[2/3] w-full rounded-lg bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800">
                      <div className='absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent'></div>
                    </div>
                    <div className="mt-2 h-4 rounded bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 relative overflow-hidden">
                      <div className='absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent'></div>
                    </div>
                    <div className="mt-1 h-3 w-2/3 rounded bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 relative overflow-hidden">
                      <div className='absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent'></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 无更多数据提示 */}
          {!loading && !hasMore && dramas.length > 0 && (
            <div className='flex justify-center mt-12 py-8'>
              <div className='relative px-8 py-5 rounded-2xl bg-gradient-to-r from-purple-50 via-pink-50 to-rose-50 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-rose-900/20 border border-purple-200/50 dark:border-purple-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
                {/* 装饰性背景 */}
                <div className='absolute inset-0 bg-gradient-to-br from-purple-100/20 to-pink-100/20 dark:from-purple-800/10 dark:to-pink-800/10'></div>

                {/* 内容 */}
                <div className='relative flex flex-col items-center gap-2'>
                  {/* 完成图标 */}
                  <div className='relative'>
                    <div className='w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg'>
                      <svg className='w-7 h-7 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M5 13l4 4L19 7'></path>
                      </svg>
                    </div>
                    {/* 光圈效果 */}
                    <div className='absolute inset-0 rounded-full bg-purple-400/30 animate-ping'></div>
                  </div>

                  {/* 文字 */}
                  <div className='text-center'>
                    <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>
                      已经到底了～
                    </p>
                    <p className='text-xs text-gray-600 dark:text-gray-400'>
                      共 {dramas.length} 部短剧
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 无搜索结果 */}
          {!loading && dramas.length === 0 && isSearchMode && (
            <div className='flex justify-center py-16'>
              <div className='relative px-12 py-10 rounded-3xl bg-gradient-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 shadow-xl backdrop-blur-sm overflow-hidden max-w-md'>
                {/* 装饰性元素 */}
                <div className='absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-purple-200/20 to-pink-200/20 rounded-full blur-3xl'></div>
                <div className='absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-200/20 to-teal-200/20 rounded-full blur-3xl'></div>

                {/* 内容 */}
                <div className='relative flex flex-col items-center gap-4'>
                  {/* 搜索图标 */}
                  <div className='relative'>
                    <div className='w-24 h-24 rounded-full bg-gradient-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 flex items-center justify-center shadow-lg'>
                      <svg className='w-12 h-12 text-gray-400 dark:text-gray-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'></path>
                      </svg>
                    </div>
                    {/* 浮动小点装饰 */}
                    <div className='absolute -top-1 -right-1 w-3 h-3 bg-purple-400 rounded-full animate-ping'></div>
                    <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-pink-400 rounded-full animate-pulse'></div>
                  </div>

                  {/* 文字内容 */}
                  <div className='text-center space-y-2'>
                    <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      没有找到相关短剧
                    </h3>
                    <p className='text-sm text-gray-600 dark:text-gray-400 max-w-xs'>
                      换个关键词试试，或者浏览其他分类
                    </p>
                  </div>

                  {/* 按钮 */}
                  <button
                    onClick={() => handleSearch('')}
                    className='mt-2 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105'
                  >
                    清除搜索条件
                  </button>

                  {/* 装饰线 */}
                  <div className='w-16 h-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600 rounded-full'></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-purple-500/90 hover:bg-purple-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${showBackToTop
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
      </button>
    </PageLayout>
  );
}