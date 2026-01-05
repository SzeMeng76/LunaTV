/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { ChevronUp } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { GetBangumiCalendarData } from '@/lib/bangumi.client';
import {
  getDoubanCategories,
  getDoubanList,
  getDoubanRecommends,
} from '@/lib/douban.client';
import { DoubanItem, DoubanResult } from '@/lib/types';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import DoubanCustomSelector from '@/components/DoubanCustomSelector';
import DoubanSelector from '@/components/DoubanSelector';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';
import VirtualDoubanGrid, { VirtualDoubanGridRef } from '@/components/VirtualDoubanGrid';

function DoubanPageClient() {
  const searchParams = useSearchParams();
  const [doubanData, setDoubanData] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectorsReady, setSelectorsReady] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);
  // VirtualDoubanGrid ref for scroll control
  const virtualGridRef = useRef<VirtualDoubanGridRef>(null);

  // 虚拟化开关状态
  const [useVirtualization, setUseVirtualization] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('useDoubanVirtualization');
      return saved !== null ? JSON.parse(saved) : true; // 默认启用
    }
    return true;
  });

  // 用于存储最新参数值的 refs
  const currentParamsRef = useRef({
    type: '',
    primarySelection: '',
    secondarySelection: '',
    multiLevelSelection: {} as Record<string, string>,
    selectedWeekday: '',
    currentPage: 0,
  });

  const type = searchParams.get('type') || 'movie';

  // 获取 runtimeConfig 中的自定义分类数据
  const [customCategories, setCustomCategories] = useState<
    Array<{ name: string; type: 'movie' | 'tv'; query: string }>
  >([]);

  // 选择器状态 - 完全独立，不依赖URL参数
  const [primarySelection, setPrimarySelection] = useState<string>(() => {
    if (type === 'movie') return '热门';
    if (type === 'tv' || type === 'show') return '最近热门';
    if (type === 'anime') return '每日放送';
    return '';
  });
  const [secondarySelection, setSecondarySelection] = useState<string>(() => {
    if (type === 'movie') return '全部';
    if (type === 'tv') return 'tv';
    if (type === 'show') return 'show';
    return '全部';
  });

  // MultiLevelSelector 状态
  const [multiLevelValues, setMultiLevelValues] = useState<
    Record<string, string>
  >({
    type: 'all',
    region: 'all',
    year: 'all',
    platform: 'all',
    label: 'all',
    sort: 'T',
  });

  // 星期选择器状态
  const [selectedWeekday, setSelectedWeekday] = useState<string>('');

  // 页面级别的AI权限检测状态
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiCheckComplete, setAiCheckComplete] = useState(false);

  // 保存虚拟化设置
  const toggleVirtualization = () => {
    const newValue = !useVirtualization;
    setUseVirtualization(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem('useDoubanVirtualization', JSON.stringify(newValue));
    }
    
    // 切换虚拟化模式时，立即同步参数引用，避免一致性检查失败
    currentParamsRef.current = {
      type,
      primarySelection,
      secondarySelection,
      multiLevelSelection: multiLevelValues,
      selectedWeekday,
      currentPage,
    };
  };

  // 获取自定义分类数据
  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setCustomCategories(runtimeConfig.CUSTOM_CATEGORIES);
    }
  }, []);

  // 页面级别的AI权限检测 - 只检测一次
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/ai-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });
        if (!cancelled) {
          setAiEnabled(response.status !== 403);
          setAiCheckComplete(true);
        }
      } catch (error) {
        if (!cancelled) {
          setAiEnabled(false);
          setAiCheckComplete(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // 只在组件挂载时检测一次


  // 同步最新参数值到 ref
  useEffect(() => {
    currentParamsRef.current = {
      type,
      primarySelection,
      secondarySelection,
      multiLevelSelection: multiLevelValues,
      selectedWeekday,
      currentPage,
    };
  }, [
    type,
    primarySelection,
    secondarySelection,
    multiLevelValues,
    selectedWeekday,
    currentPage,
  ]);

  // 初始化时标记选择器为准备好状态
  useEffect(() => {
    // 短暂延迟确保初始状态设置完成
    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []); // 只在组件挂载时执行一次

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

  // type变化时立即重置selectorsReady（最高优先级）
  useEffect(() => {
    setSelectorsReady(false);
    setLoading(true); // 立即显示loading状态
  }, [type]);

  // 当type变化时重置选择器状态
  useEffect(() => {
    if (type === 'custom' && customCategories.length > 0) {
      // 自定义分类模式：优先选择 movie，如果没有 movie 则选择 tv
      const types = Array.from(
        new Set(customCategories.map((cat) => cat.type))
      );
      if (types.length > 0) {
        // 优先选择 movie，如果没有 movie 则选择 tv
        let selectedType = types[0]; // 默认选择第一个
        if (types.includes('movie')) {
          selectedType = 'movie';
        } else {
          selectedType = 'tv';
        }
        setPrimarySelection(selectedType);

        // 设置选中类型的第一个分类的 query 作为二级选择
        const firstCategory = customCategories.find(
          (cat) => cat.type === selectedType
        );
        if (firstCategory) {
          setSecondarySelection(firstCategory.query);
        }
      }
    } else {
      // 原有逻辑
      if (type === 'movie') {
        setPrimarySelection('热门');
        setSecondarySelection('全部');
      } else if (type === 'tv') {
        setPrimarySelection('最近热门');
        setSecondarySelection('tv');
      } else if (type === 'show') {
        setPrimarySelection('最近热门');
        setSecondarySelection('show');
      } else if (type === 'anime') {
        setPrimarySelection('每日放送');
        setSecondarySelection('全部');
      } else {
        setPrimarySelection('');
        setSecondarySelection('全部');
      }
    }

    // 清空 MultiLevelSelector 状态
    setMultiLevelValues({
      type: 'all',
      region: 'all',
      year: 'all',
      platform: 'all',
      label: 'all',
      sort: 'T',
    });

    // 使用短暂延迟确保状态更新完成后标记选择器准备好
    const timer = setTimeout(() => {
      setSelectorsReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, [type, customCategories]);

  // 生成骨架屏数据
  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  // 参数快照比较函数
  const isSnapshotEqual = useCallback(
    (
      snapshot1: {
        type: string;
        primarySelection: string;
        secondarySelection: string;
        multiLevelSelection: Record<string, string>;
        selectedWeekday: string;
        currentPage: number;
      },
      snapshot2: {
        type: string;
        primarySelection: string;
        secondarySelection: string;
        multiLevelSelection: Record<string, string>;
        selectedWeekday: string;
        currentPage: number;
      }
    ) => {
      return (
        snapshot1.type === snapshot2.type &&
        snapshot1.primarySelection === snapshot2.primarySelection &&
        snapshot1.secondarySelection === snapshot2.secondarySelection &&
        snapshot1.selectedWeekday === snapshot2.selectedWeekday &&
        snapshot1.currentPage === snapshot2.currentPage &&
        JSON.stringify(snapshot1.multiLevelSelection) ===
        JSON.stringify(snapshot2.multiLevelSelection)
      );
    },
    []
  );

  // 生成API请求参数的辅助函数
  const getRequestParams = useCallback(
    (pageStart: number) => {
      // 当type为tv或show时，kind统一为'tv'，category使用type本身
      if (type === 'tv' || type === 'show') {
        return {
          kind: 'tv' as const,
          category: type,
          type: secondarySelection,
          pageLimit: 25,
          pageStart,
        };
      }

      // 电影类型保持原逻辑
      return {
        kind: type as 'tv' | 'movie',
        category: primarySelection,
        type: secondarySelection,
        pageLimit: 25,
        pageStart,
      };
    },
    [type, primarySelection, secondarySelection]
  );

  // 防抖的数据加载函数
  const loadInitialData = useCallback(async () => {
    // 创建当前参数的快照
    const requestSnapshot = {
      type,
      primarySelection,
      secondarySelection,
      multiLevelSelection: multiLevelValues,
      selectedWeekday,
      currentPage: 0,
    };

    try {
      setLoading(true);
      // 确保在加载初始数据时重置页面状态
      setDoubanData([]);
      setCurrentPage(0);
      setHasMore(true);
      setIsLoadingMore(false);

      let data: DoubanResult;

      if (type === 'custom') {
        // 自定义分类模式：根据选中的一级和二级选项获取对应的分类
        const selectedCategory = customCategories.find(
          (cat) =>
            cat.type === primarySelection && cat.query === secondarySelection
        );

        if (selectedCategory) {
          data = await getDoubanList({
            tag: selectedCategory.query,
            type: selectedCategory.type,
            pageLimit: 25,
            pageStart: 0,
          });
        } else {
          throw new Error('没有找到对应的分类');
        }
      } else if (type === 'anime' && primarySelection === '每日放送') {
        const calendarData = await GetBangumiCalendarData();
        const weekdayData = calendarData.find(
          (item) => item.weekday.en === selectedWeekday
        );
        if (weekdayData) {
          data = {
            code: 200,
            message: 'success',
            list: weekdayData.items.map((item) => ({
              id: item.id?.toString() || '',
              title: item.name_cn || item.name,
              poster:
                item.images?.large ||
                item.images?.common ||
                item.images?.medium ||
                item.images?.small ||
                item.images?.grid ||
                '/placeholder-poster.jpg',
              rate: item.rating?.score?.toFixed(1) || '',
              year: item.air_date?.split('-')?.[0] || '',
            })),
          };
        } else {
          throw new Error('没有找到对应的日期');
        }
      } else if (type === 'anime') {
        data = await getDoubanRecommends({
          kind: primarySelection === '番剧' ? 'tv' : 'movie',
          pageLimit: 25,
          pageStart: 0,
          category: '动画',
          format: primarySelection === '番剧' ? '电视剧' : '',
          region: multiLevelValues.region
            ? (multiLevelValues.region as string)
            : '',
          year: multiLevelValues.year ? (multiLevelValues.year as string) : '',
          platform: multiLevelValues.platform
            ? (multiLevelValues.platform as string)
            : '',
          sort: multiLevelValues.sort ? (multiLevelValues.sort as string) : '',
          label: multiLevelValues.label
            ? (multiLevelValues.label as string)
            : '',
        });
      } else if (primarySelection === '全部') {
        data = await getDoubanRecommends({
          kind: type === 'show' ? 'tv' : (type as 'tv' | 'movie'),
          pageLimit: 25,
          pageStart: 0, // 初始数据加载始终从第一页开始
          category: multiLevelValues.type
            ? (multiLevelValues.type as string)
            : '',
          format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
          region: multiLevelValues.region
            ? (multiLevelValues.region as string)
            : '',
          year: multiLevelValues.year ? (multiLevelValues.year as string) : '',
          platform: multiLevelValues.platform
            ? (multiLevelValues.platform as string)
            : '',
          sort: multiLevelValues.sort ? (multiLevelValues.sort as string) : '',
          label: multiLevelValues.label
            ? (multiLevelValues.label as string)
            : '',
        });
      } else {
        data = await getDoubanCategories(getRequestParams(0));
      }

      if (data.code === 200) {
        // 更宽松的参数检查：只检查关键参数，忽略currentPage的差异
        const currentSnapshot = { ...currentParamsRef.current };
        const keyParamsMatch = (
          requestSnapshot.type === currentSnapshot.type &&
          requestSnapshot.primarySelection === currentSnapshot.primarySelection &&
          requestSnapshot.secondarySelection === currentSnapshot.secondarySelection &&
          requestSnapshot.selectedWeekday === currentSnapshot.selectedWeekday &&
          JSON.stringify(requestSnapshot.multiLevelSelection) === JSON.stringify(currentSnapshot.multiLevelSelection)
        );

        if (keyParamsMatch) {
          setDoubanData(data.list);
          setHasMore(data.list.length !== 0);
          setLoading(false);
        } else {
          console.log('关键参数不一致，不执行任何操作，避免设置过期数据');
        }
        // 如果参数不一致，不执行任何操作，避免设置过期数据
      } else {
        throw new Error(data.message || '获取数据失败');
      }
    } catch (err) {
      console.error(err);
      setLoading(false); // 发生错误时总是停止loading状态
    }
  }, [
    type,
    primarySelection,
    secondarySelection,
    multiLevelValues,
    selectedWeekday,
    getRequestParams,
    customCategories,
  ]);

  // 只在选择器准备好后才加载数据
  useEffect(() => {
    // 只有在选择器准备好时才开始加载
    if (!selectorsReady) {
      return;
    }

    // 清除之前的防抖定时器
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // 使用防抖机制加载数据，避免连续状态更新触发多次请求
    debounceTimeoutRef.current = setTimeout(() => {
      loadInitialData();
    }, 100); // 100ms 防抖延迟

    // 清理函数
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [
    selectorsReady,
    type,
    primarySelection,
    secondarySelection,
    multiLevelValues,
    selectedWeekday,
    loadInitialData,
  ]);

  // 单独处理 currentPage 变化（加载更多）
  useEffect(() => {
    if (currentPage > 0) {
      const fetchMoreData = async () => {
        // 创建当前参数的快照
        const requestSnapshot = {
          type,
          primarySelection,
          secondarySelection,
          multiLevelSelection: multiLevelValues,
          selectedWeekday,
          currentPage,
        };

        // 立即更新currentParamsRef，避免异步更新导致的一致性检查失败
        currentParamsRef.current = requestSnapshot;

        try {
          setIsLoadingMore(true);

          let data: DoubanResult;
          if (type === 'custom') {
            // 自定义分类模式：根据选中的一级和二级选项获取对应的分类
            const selectedCategory = customCategories.find(
              (cat) =>
                cat.type === primarySelection &&
                cat.query === secondarySelection
            );

            if (selectedCategory) {
              data = await getDoubanList({
                tag: selectedCategory.query,
                type: selectedCategory.type,
                pageLimit: 25,
                pageStart: currentPage * 25,
              });
            } else {
              throw new Error('没有找到对应的分类');
            }
          } else if (type === 'anime' && primarySelection === '每日放送') {
            // 每日放送模式下，不进行数据请求，返回空数据
            data = {
              code: 200,
              message: 'success',
              list: [],
            };
          } else if (type === 'anime') {
            data = await getDoubanRecommends({
              kind: primarySelection === '番剧' ? 'tv' : 'movie',
              pageLimit: 25,
              pageStart: currentPage * 25,
              category: '动画',
              format: primarySelection === '番剧' ? '电视剧' : '',
              region: multiLevelValues.region
                ? (multiLevelValues.region as string)
                : '',
              year: multiLevelValues.year
                ? (multiLevelValues.year as string)
                : '',
              platform: multiLevelValues.platform
                ? (multiLevelValues.platform as string)
                : '',
              sort: multiLevelValues.sort
                ? (multiLevelValues.sort as string)
                : '',
              label: multiLevelValues.label
                ? (multiLevelValues.label as string)
                : '',
            });
          } else if (primarySelection === '全部') {
            data = await getDoubanRecommends({
              kind: type === 'show' ? 'tv' : (type as 'tv' | 'movie'),
              pageLimit: 25,
              pageStart: currentPage * 25,
              category: multiLevelValues.type
                ? (multiLevelValues.type as string)
                : '',
              format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
              region: multiLevelValues.region
                ? (multiLevelValues.region as string)
                : '',
              year: multiLevelValues.year
                ? (multiLevelValues.year as string)
                : '',
              platform: multiLevelValues.platform
                ? (multiLevelValues.platform as string)
                : '',
              sort: multiLevelValues.sort
                ? (multiLevelValues.sort as string)
                : '',
              label: multiLevelValues.label
                ? (multiLevelValues.label as string)
                : '',
            });
          } else {
            data = await getDoubanCategories(
              getRequestParams(currentPage * 25)
            );
          }

          if (data.code === 200) {
            // 更宽松的参数检查：只检查关键参数，忽略currentPage的差异
            const currentSnapshot = { ...currentParamsRef.current };
            const keyParamsMatch = (
              requestSnapshot.type === currentSnapshot.type &&
              requestSnapshot.primarySelection === currentSnapshot.primarySelection &&
              requestSnapshot.secondarySelection === currentSnapshot.secondarySelection &&
              requestSnapshot.selectedWeekday === currentSnapshot.selectedWeekday &&
              JSON.stringify(requestSnapshot.multiLevelSelection) === JSON.stringify(currentSnapshot.multiLevelSelection)
            );

            if (keyParamsMatch) {
              // 🔧 双重去重逻辑：防止跨批次和批次内重复数据
              setDoubanData((prev) => {
                const existingIds = new Set(prev.map((item) => item.id));
                const uniqueNewItems: DoubanItem[] = [];

                for (const item of data.list) {
                  if (!existingIds.has(item.id)) {
                    existingIds.add(item.id);  // 立即添加，防止批次内重复
                    uniqueNewItems.push(item);
                  }
                }

                console.log(
                  `📊 Batch: ${data.list.length}, Added: ${uniqueNewItems.length}, Duplicates removed: ${data.list.length - uniqueNewItems.length}`
                );

                if (uniqueNewItems.length === 0) return prev;
                return [...prev, ...uniqueNewItems];
              });
              setHasMore(data.list.length !== 0);
            } else {
              console.log('关键参数不一致，不执行任何操作，避免设置过期数据');
            }
          } else {
            throw new Error(data.message || '获取数据失败');
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingMore(false);
        }
      };

      fetchMoreData();
    }
  }, [
    currentPage,
    type,
    primarySelection,
    secondarySelection,
    customCategories,
    multiLevelValues,
    selectedWeekday,
  ]);

  // 设置滚动监听（只在非虚拟化模式下启用）
  useEffect(() => {
    // 如果启用了虚拟化，则不使用传统的滚动监听
    if (useVirtualization) {
      return;
    }

    // 如果没有更多数据或正在加载，则不设置监听
    if (!hasMore || isLoadingMore || loading) {
      return;
    }

    // 确保 loadingRef 存在
    if (!loadingRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setCurrentPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, loading, useVirtualization]);

  // 处理选择器变化
  const handlePrimaryChange = useCallback(
    (value: string) => {
      // 只有当值真正改变时才设置loading状态
      if (value !== primarySelection) {
        setLoading(true);
        // 立即重置页面状态，防止基于旧状态的请求
        setCurrentPage(0);
        setDoubanData([]);
        setHasMore(true);
        setIsLoadingMore(false);

        // 清空 MultiLevelSelector 状态
        setMultiLevelValues({
          type: 'all',
          region: 'all',
          year: 'all',
          platform: 'all',
          label: 'all',
          sort: 'T',
        });

        // 如果是自定义分类模式，同时更新一级和二级选择器
        if (type === 'custom' && customCategories.length > 0) {
          const firstCategory = customCategories.find(
            (cat) => cat.type === value
          );
          if (firstCategory) {
            // 批量更新状态，避免多次触发数据加载
            setPrimarySelection(value);
            setSecondarySelection(firstCategory.query);
          } else {
            setPrimarySelection(value);
          }
        } else {
          // 电视剧和综艺切换到"最近热门"时，重置二级分类为第一个选项
          if ((type === 'tv' || type === 'show') && value === '最近热门') {
            setPrimarySelection(value);
            if (type === 'tv') {
              setSecondarySelection('tv');
            } else if (type === 'show') {
              setSecondarySelection('show');
            }
          } else {
            setPrimarySelection(value);
          }
        }
      }
    },
    [primarySelection, type, customCategories]
  );

  const handleSecondaryChange = useCallback(
    (value: string) => {
      // 只有当值真正改变时才设置loading状态
      if (value !== secondarySelection) {
        setLoading(true);
        // 立即重置页面状态，防止基于旧状态的请求
        setCurrentPage(0);
        setDoubanData([]);
        setHasMore(true);
        setIsLoadingMore(false);
        setSecondarySelection(value);
      }
    },
    [secondarySelection]
  );

  const handleMultiLevelChange = useCallback(
    (values: Record<string, string>) => {
      // 比较两个对象是否相同，忽略顺序
      const isEqual = (
        obj1: Record<string, string>,
        obj2: Record<string, string>
      ) => {
        const keys1 = Object.keys(obj1).sort();
        const keys2 = Object.keys(obj2).sort();

        if (keys1.length !== keys2.length) return false;

        return keys1.every((key) => obj1[key] === obj2[key]);
      };

      // 如果相同，则不设置loading状态
      if (isEqual(values, multiLevelValues)) {
        return;
      }

      setLoading(true);
      // 立即重置页面状态，防止基于旧状态的请求
      setCurrentPage(0);
      setDoubanData([]);
      setHasMore(true);
      setIsLoadingMore(false);
      setMultiLevelValues(values);
    },
    [multiLevelValues]
  );

  const handleWeekdayChange = useCallback((weekday: string) => {
    setSelectedWeekday(weekday);
  }, []);

  // 处理虚拟化组件的加载更多请求
  const handleVirtualLoadMore = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      setCurrentPage(prev => prev + 1);
    }
  }, [hasMore, isLoadingMore]);

  const getPageTitle = () => {
    // 根据 type 生成标题
    return type === 'movie'
      ? '电影'
      : type === 'tv'
        ? '电视剧'
        : type === 'anime'
          ? '动漫'
          : type === 'show'
            ? '综艺'
            : '自定义';
  };

  const getPageDescription = () => {
    if (type === 'anime' && primarySelection === '每日放送') {
      return '来自 Bangumi 番组计划的精选内容';
    }
    return '来自豆瓣的精选内容';
  };

  const getActivePath = () => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);

    const queryString = params.toString();
    const activePath = `/douban${queryString ? `?${queryString}` : ''}`;
    return activePath;
  };

  // 返回顶部功能 - 同时滚动页面和重置虚拟列表
  const scrollToTop = () => {
    try {
      // 1. 滚动页面到顶部
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

      // 2. 重置虚拟列表到第一项
      if (virtualGridRef.current) {
        virtualGridRef.current.scrollToTop();
      }
    } catch (error) {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  return (
    <PageLayout activePath={getActivePath()}>
      <div className='overflow-visible -mt-6 md:mt-0'>
        {/* 页面标题和选择器 */}
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          {/* 页面标题 */}
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
              {getPageTitle()}
            </h1>
            <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
              {getPageDescription()}
            </p>
          </div>

          {/* 选择器组件 */}
          {type !== 'custom' ? (
            <div className='relative bg-linear-to-br from-white/80 via-blue-50/30 to-purple-50/30 dark:from-gray-800/60 dark:via-blue-900/20 dark:to-purple-900/20 rounded-2xl p-4 sm:p-6 border border-blue-200/40 dark:border-blue-700/40 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300'>
              {/* 装饰性光晕 */}
              <div className='absolute -top-20 -right-20 w-40 h-40 bg-linear-to-br from-blue-300/20 to-purple-300/20 rounded-full blur-3xl pointer-events-none'></div>
              <div className='absolute -bottom-20 -left-20 w-40 h-40 bg-linear-to-br from-green-300/20 to-teal-300/20 rounded-full blur-3xl pointer-events-none'></div>

              <div className='relative'>
                <DoubanSelector
                  type={type as 'movie' | 'tv' | 'show' | 'anime'}
                  primarySelection={primarySelection}
                  secondarySelection={secondarySelection}
                  onPrimaryChange={handlePrimaryChange}
                  onSecondaryChange={handleSecondaryChange}
                  onMultiLevelChange={handleMultiLevelChange}
                  onWeekdayChange={handleWeekdayChange}
                />
              </div>
            </div>
          ) : (
            <div className='relative bg-linear-to-br from-white/80 via-blue-50/30 to-purple-50/30 dark:from-gray-800/60 dark:via-blue-900/20 dark:to-purple-900/20 rounded-2xl p-4 sm:p-6 border border-blue-200/40 dark:border-blue-700/40 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300'>
              {/* 装饰性光晕 */}
              <div className='absolute -top-20 -right-20 w-40 h-40 bg-linear-to-br from-blue-300/20 to-purple-300/20 rounded-full blur-3xl pointer-events-none'></div>
              <div className='absolute -bottom-20 -left-20 w-40 h-40 bg-linear-to-br from-green-300/20 to-teal-300/20 rounded-full blur-3xl pointer-events-none'></div>

              <div className='relative'>
                <DoubanCustomSelector
                  customCategories={customCategories}
                  primarySelection={primarySelection}
                  secondarySelection={secondarySelection}
                  onPrimaryChange={handlePrimaryChange}
                  onSecondaryChange={handleSecondaryChange}
                />
              </div>
            </div>
          )}

          {/* 虚拟化开关 */}
          <div className='flex justify-end'>
            <label className='flex items-center gap-3 cursor-pointer select-none group'>
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
          </div>
        </div>

        {/* 内容展示区域 */}
        <div className='max-w-[95%] mx-auto mt-8 overflow-visible'>
          {/* 条件渲染：虚拟化 vs 传统网格 */}
          {useVirtualization ? (
            <VirtualDoubanGrid
              ref={virtualGridRef}
              doubanData={doubanData}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              onLoadMore={handleVirtualLoadMore}
              type={type}
              loading={loading || !selectorsReady}
              primarySelection={primarySelection}
              isBangumi={type === 'anime' && primarySelection === '每日放送'}
              aiEnabled={aiEnabled}
              aiCheckComplete={aiCheckComplete}
            />
          ) : (
            <>
              {/* 传统网格渲染 */}
              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
                {loading || !selectorsReady
                  ? // 显示骨架屏
                  skeletonData.map((index) => <DoubanCardSkeleton key={index} />)
                  : // 显示实际数据
                  doubanData.map((item, index) => {
                    const mappedType = type === 'movie' ? 'movie' : type === 'show' ? 'variety' : type === 'tv' ? 'tv' : type === 'anime' ? 'anime' : '';
                    return (
                      <div key={`${item.title}-${index}`} className='w-full'>
                        <VideoCard
                          from='douban'
                          source='douban'
                          id={item.id}
                          source_name='豆瓣'
                          title={item.title}
                          poster={item.poster}
                          douban_id={Number(item.id)}
                          rate={item.rate}
                          year={item.year}
                          type={mappedType}
                          isBangumi={
                            type === 'anime' && primarySelection === '每日放送'
                          }
                          aiEnabled={aiEnabled}
                          aiCheckComplete={aiCheckComplete}
                        />
                      </div>
                    );
                  })}
              </div>

              {/* 加载更多指示器 */}
              {hasMore && !loading && (
                <div
                  ref={(el) => {
                    if (el && el.offsetParent !== null) {
                      (
                        loadingRef as React.MutableRefObject<HTMLDivElement | null>
                      ).current = el;
                    }
                  }}
                  className='flex justify-center mt-12 py-8'
                >
                  {isLoadingMore && (
                    <div className='relative px-8 py-4 rounded-2xl bg-linear-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border border-green-200/50 dark:border-green-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
                      {/* 动画背景 */}
                      <div className='absolute inset-0 bg-linear-to-r from-green-400/10 via-emerald-400/10 to-teal-400/10 animate-pulse'></div>

                      {/* 内容 */}
                      <div className='relative flex items-center gap-3'>
                        {/* 旋转圈 */}
                        <div className='relative'>
                          <div className='animate-spin rounded-full h-8 w-8 border-[3px] border-green-200 dark:border-green-800'></div>
                          <div className='absolute inset-0 animate-spin rounded-full h-8 w-8 border-[3px] border-transparent border-t-green-500 dark:border-t-green-400'></div>
                        </div>

                        {/* 文字和点动画 */}
                        <div className='flex items-center gap-1'>
                          <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>加载中</span>
                          <span className='flex gap-0.5'>
                            <span className='animate-bounce' style={{ animationDelay: '0ms' }}>.</span>
                            <span className='animate-bounce' style={{ animationDelay: '150ms' }}>.</span>
                            <span className='animate-bounce' style={{ animationDelay: '300ms' }}>.</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 没有更多数据提示 */}
              {!hasMore && doubanData.length > 0 && (
                <div className='flex justify-center mt-12 py-8'>
                  <div className='relative px-8 py-5 rounded-2xl bg-linear-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 shadow-lg backdrop-blur-sm overflow-hidden'>
                    {/* 装饰性背景 */}
                    <div className='absolute inset-0 bg-linear-to-br from-blue-100/20 to-purple-100/20 dark:from-blue-800/10 dark:to-purple-800/10'></div>

                    {/* 内容 */}
                    <div className='relative flex flex-col items-center gap-2'>
                      {/* 完成图标 */}
                      <div className='relative'>
                        <div className='w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg'>
                          <svg className='w-7 h-7 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M5 13l4 4L19 7'></path>
                          </svg>
                        </div>
                        {/* 光圈效果 */}
                        <div className='absolute inset-0 rounded-full bg-blue-400/30 animate-ping'></div>
                      </div>

                      {/* 文字 */}
                      <div className='text-center'>
                        <p className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-1'>
                          已加载全部内容
                        </p>
                        <p className='text-xs text-gray-600 dark:text-gray-400'>
                          共 {doubanData.length} 项
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 空状态 */}
              {!loading && doubanData.length === 0 && (
                <div className='flex justify-center py-16'>
                  <div className='relative px-12 py-10 rounded-3xl bg-linear-to-br from-gray-50 via-slate-50 to-gray-100 dark:from-gray-800/40 dark:via-slate-800/40 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 shadow-xl backdrop-blur-sm overflow-hidden max-w-md'>
                    {/* 装饰性元素 */}
                    <div className='absolute top-0 left-0 w-32 h-32 bg-linear-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl'></div>
                    <div className='absolute bottom-0 right-0 w-32 h-32 bg-linear-to-br from-pink-200/20 to-orange-200/20 rounded-full blur-3xl'></div>

                    {/* 内容 */}
                    <div className='relative flex flex-col items-center gap-4'>
                      {/* 插图图标 */}
                      <div className='relative'>
                        <div className='w-24 h-24 rounded-full bg-linear-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 flex items-center justify-center shadow-lg'>
                          <svg className='w-12 h-12 text-gray-400 dark:text-gray-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='1.5' d='M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4'></path>
                          </svg>
                        </div>
                        {/* 浮动小点装饰 */}
                        <div className='absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping'></div>
                        <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse'></div>
                      </div>

                      {/* 文字内容 */}
                      <div className='text-center space-y-2'>
                        <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                          暂无相关内容
                        </h3>
                        <p className='text-sm text-gray-600 dark:text-gray-400 max-w-xs'>
                          尝试调整筛选条件或切换其他分类查看更多内容
                        </p>
                      </div>

                      {/* 装饰线 */}
                      <div className='w-16 h-1 bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600 rounded-full'></div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-500 w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${showBackToTop
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

export default function DoubanPage() {
  return (
    <Suspense>
      <DoubanPageClient />
    </Suspense>
  );
}
