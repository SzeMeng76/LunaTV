/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { Brain, ChevronRight, Film, Tv, Calendar, Sparkles, Play } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { getRecommendedShortDramas } from '@/lib/shortdrama.client';
import { cleanExpiredCache } from '@/lib/shortdrama-cache';
import { ShortDramaItem, ReleaseCalendarItem } from '@/lib/types';
// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories, getDoubanDetails } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

import AIRecommendModal from '@/components/AIRecommendModal';
import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import HeroBanner from '@/components/HeroBanner';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import SectionTitle from '@/components/SectionTitle';
import ShortDramaCard from '@/components/ShortDramaCard';
import SkeletonCard from '@/components/SkeletonCard';
import { useSite } from '@/components/SiteProvider';
import { TelegramWelcomeModal } from '@/components/TelegramWelcomeModal';
import VideoCard from '@/components/VideoCard';

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [hotShortDramas, setHotShortDramas] = useState<ShortDramaItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [upcomingReleases, setUpcomingReleases] = useState<ReleaseCalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { announcement } = useSite();
  const [username, setUsername] = useState<string>('');

  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showAIRecommendModal, setShowAIRecommendModal] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(true); // 默认显示，检查后再决定
  const [aiCheckTriggered, setAiCheckTriggered] = useState(false); // 标记是否已检查AI状态

  // 合并初始化逻辑 - 优化性能，减少重渲染
  useEffect(() => {
    // 获取用户名
    const authInfo = getAuthInfoFromBrowserCookie();
    if (authInfo?.username) {
      setUsername(authInfo.username);
    }

    // 检查公告弹窗状态
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // 延迟检查AI功能状态，避免阻塞页面初始渲染
  useEffect(() => {
    if (aiCheckTriggered || typeof window === 'undefined') return;

    let idleCallbackId: number | undefined;
    let timeoutId: number | undefined;
    let cancelled = false;

    const checkAIStatus = async () => {
      if (cancelled) return;
      try {
        const response = await fetch('/api/ai-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'test' }],
          }),
        });
        if (!cancelled) {
          setAiEnabled(response.status !== 403);
        }
      } catch (error) {
        if (!cancelled) {
          setAiEnabled(true);
        }
      } finally {
        if (!cancelled) {
          setAiCheckTriggered(true);
        }
      }
    };

    const win = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      idleCallbackId = win.requestIdleCallback(() => {
        checkAIStatus().catch(() => {
          // 错误已在内部处理
        });
      }, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(() => {
        checkAIStatus().catch(() => {
          // 错误已在内部处理
        });
      }, 800);
    }

    return () => {
      cancelled = true;
      if (idleCallbackId !== undefined && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [aiCheckTriggered]);

  // 收藏夹数据
  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
    origin?: 'vod' | 'live';
  };

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    // 清理过期缓存
    cleanExpiredCache().catch(console.error);

    const fetchRecommendData = async () => {
      try {
        setLoading(true);

        // 并行获取热门电影、热门剧集、热门综艺、热门短剧和即将上映
        const [moviesData, tvShowsData, varietyShowsData, shortDramasData, bangumiCalendarData, upcomingReleasesData] =
          await Promise.allSettled([
            getDoubanCategories({
              kind: 'movie',
              category: '热门',
              type: '全部',
            }),
            getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
            getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
            getRecommendedShortDramas(undefined, 8),
            GetBangumiCalendarData(),
            fetch('/api/release-calendar?limit=100').then(res => {
              if (!res.ok) {
                console.error('获取即将上映数据失败，状态码:', res.status);
                return { items: [] };
              }
              return res.json();
            }),
          ]);

        // 处理电影数据并获取前2条的详情
        if (moviesData.status === 'fulfilled' && moviesData.value?.code === 200) {
          const movies = moviesData.value.list;
          setHotMovies(movies);

          // 异步获取前2条电影的详情（用于Hero Banner）
          Promise.all(
            movies.slice(0, 2).map(async (movie) => {
              try {
                const detailsRes = await getDoubanDetails(movie.id);
                if (detailsRes.code === 200 && detailsRes.data?.plot_summary) {
                  return { id: movie.id, plot_summary: detailsRes.data.plot_summary };
                }
              } catch (error) {
                console.warn(`获取电影 ${movie.id} 详情失败:`, error);
              }
              return null;
            })
          ).then((results) => {
            setHotMovies(prev =>
              prev.map(m => {
                const detail = results.find(r => r?.id === m.id);
                return detail ? { ...m, plot_summary: detail.plot_summary } : m;
              })
            );
          });
        } else {
          console.warn('获取热门电影失败:', moviesData.status === 'rejected' ? moviesData.reason : '数据格式错误');
        }

        // 处理剧集数据并获取前2条的详情
        if (tvShowsData.status === 'fulfilled' && tvShowsData.value?.code === 200) {
          const tvShows = tvShowsData.value.list;
          setHotTvShows(tvShows);

          // 异步获取前2条剧集的详情（用于Hero Banner）
          Promise.all(
            tvShows.slice(0, 2).map(async (show) => {
              try {
                const detailsRes = await getDoubanDetails(show.id);
                if (detailsRes.code === 200 && detailsRes.data?.plot_summary) {
                  return { id: show.id, plot_summary: detailsRes.data.plot_summary };
                }
              } catch (error) {
                console.warn(`获取剧集 ${show.id} 详情失败:`, error);
              }
              return null;
            })
          ).then((results) => {
            setHotTvShows(prev =>
              prev.map(s => {
                const detail = results.find(r => r?.id === s.id);
                return detail ? { ...s, plot_summary: detail.plot_summary } : s;
              })
            );
          });
        } else {
          console.warn('获取热门剧集失败:', tvShowsData.status === 'rejected' ? tvShowsData.reason : '数据格式错误');
        }

        // 处理综艺数据并获取第1条的详情
        if (varietyShowsData.status === 'fulfilled' && varietyShowsData.value?.code === 200) {
          const varietyShows = varietyShowsData.value.list;
          setHotVarietyShows(varietyShows);

          // 异步获取第1条综艺的详情（用于Hero Banner）
          if (varietyShows.length > 0) {
            const show = varietyShows[0];
            getDoubanDetails(show.id)
              .then((detailsRes) => {
                if (detailsRes.code === 200 && detailsRes.data?.plot_summary) {
                  setHotVarietyShows(prev =>
                    prev.map(s => s.id === show.id
                      ? { ...s, plot_summary: detailsRes.data!.plot_summary }
                      : s
                    )
                  );
                }
              })
              .catch((error) => {
                console.warn(`获取综艺 ${show.id} 详情失败:`, error);
              });
          }
        } else {
          console.warn('获取热门综艺失败:', varietyShowsData.status === 'rejected' ? varietyShowsData.reason : '数据格式错误');
        }

        // 处理短剧数据并获取前2条的详情
        if (shortDramasData.status === 'fulfilled') {
          const dramas = shortDramasData.value;
          setHotShortDramas(dramas);

          // 异步获取前2条短剧的详情（用于Hero Banner）
          Promise.all(
            dramas.slice(0, 2).map(async (drama) => {
              try {
                const response = await fetch(`/api/shortdrama/detail?id=${drama.id}&episode=1`);
                if (response.ok) {
                  const detailData = await response.json();
                  if (detailData.desc) {
                    return { id: drama.id, description: detailData.desc };
                  }
                }
              } catch (error) {
                console.warn(`获取短剧 ${drama.id} 详情失败:`, error);
              }
              return null;
            })
          ).then((results) => {
            setHotShortDramas(prev =>
              prev.map(d => {
                const detail = results.find(r => r?.id === d.id);
                return detail ? { ...d, description: detail.description } : d;
              })
            );
          });
        } else {
          console.warn('获取热门短剧失败:', shortDramasData.reason);
          setHotShortDramas([]);
        }

        // 处理bangumi数据，防止接口失败导致页面崩溃
        if (bangumiCalendarData.status === 'fulfilled' && Array.isArray(bangumiCalendarData.value)) {
          const bangumiData = bangumiCalendarData.value;
          setBangumiCalendarData(bangumiData);

          // 获取今天的番剧并尝试获取详情（用于Hero Banner）
          const today = new Date();
          const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const currentWeekday = weekdays[today.getDay()];
          const todayAnimes = bangumiData.find(
            (item) => item.weekday.en === currentWeekday
          )?.items || [];

          // 如果今天有番剧且第一个番剧没有summary，尝试获取详情
          if (todayAnimes.length > 0 && !todayAnimes[0].summary) {
            const anime = todayAnimes[0];
            try {
              const response = await fetch(`https://api.bgm.tv/v0/subjects/${anime.id}`);
              if (response.ok) {
                const detailData = await response.json();
                if (detailData.summary) {
                  // 更新 bangumiCalendarData 中对应的番剧
                  setBangumiCalendarData(prev =>
                    prev.map(dayData => {
                      if (dayData.weekday.en === currentWeekday) {
                        return {
                          ...dayData,
                          items: dayData.items.map(item =>
                            item.id === anime.id
                              ? { ...item, summary: detailData.summary }
                              : item
                          )
                        };
                      }
                      return dayData;
                    })
                  );
                }
              }
            } catch (error) {
              console.warn(`获取番剧 ${anime.id} 详情失败:`, error);
            }
          }
        } else {
          console.warn('Bangumi接口失败或返回数据格式错误:',
            bangumiCalendarData.status === 'rejected' ? bangumiCalendarData.reason : '数据格式错误');
          setBangumiCalendarData([]);
        }

        // 处理即将上映数据
        if (upcomingReleasesData.status === 'fulfilled' && upcomingReleasesData.value?.items) {
          const releases = upcomingReleasesData.value.items;
          console.log('📅 获取到的即将上映数据:', releases.length, '条');

          // 过滤出即将上映和刚上映的作品（过去7天到未来90天）
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const ninetyDaysLater = new Date(today);
          ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);

          console.log('📅 7天前日期:', sevenDaysAgo.toISOString().split('T')[0]);
          console.log('📅 今天日期:', today.toISOString().split('T')[0]);
          console.log('📅 90天后日期:', ninetyDaysLater.toISOString().split('T')[0]);

          const upcoming = releases.filter((item: ReleaseCalendarItem) => {
            // 修复时区问题：使用字符串比较而不是Date对象比较
            const releaseDateStr = item.releaseDate; // 格式: "2025-11-07"
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
            const ninetyDaysStr = ninetyDaysLater.toISOString().split('T')[0];
            const isUpcoming = releaseDateStr >= sevenDaysAgoStr && releaseDateStr <= ninetyDaysStr;
            return isUpcoming;
          });

          console.log('📅 日期过滤后的数据:', upcoming.length, '条');
          console.log('📅 过滤后的标题:', upcoming.map((i: ReleaseCalendarItem) => `${i.title} (${i.releaseDate})`));

          // 去重：基于标题去重，保留最早的那条记录
          const uniqueUpcoming = upcoming.reduce((acc: ReleaseCalendarItem[], current: ReleaseCalendarItem) => {
            const existingItem = acc.find(item => item.title === current.title);
            if (!existingItem) {
              acc.push(current);
            } else {
              // 如果已存在，保留上映日期更早的
              const existingIndex = acc.findIndex(item => item.title === current.title);
              if (new Date(current.releaseDate) < new Date(existingItem.releaseDate)) {
                acc[existingIndex] = current;
              }
            }
            return acc;
          }, []);

          console.log('📅 去重后的即将上映数据:', uniqueUpcoming.length, '条');

          // 智能分配：按更细的时间段分类，确保时间分散
          const todayStr = today.toISOString().split('T')[0];
          const sevenDaysLaterStr = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const thirtyDaysLaterStr = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          // 更细致的时间段划分
          const recentlyReleased = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate < todayStr); // 已上映
          const releasingToday = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate === todayStr); // 今日上映
          const nextSevenDays = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate > todayStr && i.releaseDate <= sevenDaysLaterStr); // 未来7天
          const nextThirtyDays = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate > sevenDaysLaterStr && i.releaseDate <= thirtyDaysLaterStr); // 8-30天
          const laterReleasing = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate > thirtyDaysLaterStr); // 30天后

          // 智能分配：总共10个，按时间段分散选取
          const maxTotal = 10;
          let selectedItems: ReleaseCalendarItem[] = [];

          // 配额分配策略：2已上映 + 1今日(限制) + 4近期(7天) + 2中期(30天) + 1远期
          // 今日上映限制最多3个，避免全是今天的
          const maxTodayLimit = 3;
          const recentQuota = Math.min(2, recentlyReleased.length);
          const todayQuota = Math.min(1, releasingToday.length);
          const sevenDayQuota = Math.min(4, nextSevenDays.length);
          const thirtyDayQuota = Math.min(2, nextThirtyDays.length);
          const laterQuota = Math.min(1, laterReleasing.length);

          selectedItems = [
            ...recentlyReleased.slice(0, recentQuota),
            ...releasingToday.slice(0, todayQuota),
            ...nextSevenDays.slice(0, sevenDayQuota),
            ...nextThirtyDays.slice(0, thirtyDayQuota),
            ...laterReleasing.slice(0, laterQuota),
          ];

          // 如果没填满10个，按优先级补充（但限制今日上映总数）
          if (selectedItems.length < maxTotal) {
            const remaining = maxTotal - selectedItems.length;
            const currentTodayCount = selectedItems.filter((i: ReleaseCalendarItem) => i.releaseDate === todayStr).length;

            // 优先从近期7天补充
            const additionalSeven = nextSevenDays.slice(sevenDayQuota, sevenDayQuota + remaining);
            selectedItems = [...selectedItems, ...additionalSeven];

            // 还不够就从30天内补充
            if (selectedItems.length < maxTotal) {
              const stillRemaining = maxTotal - selectedItems.length;
              const additionalThirty = nextThirtyDays.slice(thirtyDayQuota, thirtyDayQuota + stillRemaining);
              selectedItems = [...selectedItems, ...additionalThirty];
            }

            // 还不够就从远期补充
            if (selectedItems.length < maxTotal) {
              const stillRemaining = maxTotal - selectedItems.length;
              const additionalLater = laterReleasing.slice(laterQuota, laterQuota + stillRemaining);
              selectedItems = [...selectedItems, ...additionalLater];
            }

            // 还不够就从已上映补充
            if (selectedItems.length < maxTotal) {
              const stillRemaining = maxTotal - selectedItems.length;
              const additionalRecent = recentlyReleased.slice(recentQuota, recentQuota + stillRemaining);
              selectedItems = [...selectedItems, ...additionalRecent];
            }

            // 最后实在不够才从今日上映补充（但限制总数不超过maxTodayLimit）
            if (selectedItems.length < maxTotal) {
              const currentTodayCount = selectedItems.filter((i: ReleaseCalendarItem) => i.releaseDate === todayStr).length;
              const todayRemaining = maxTodayLimit - currentTodayCount;
              if (todayRemaining > 0) {
                const stillRemaining = Math.min(maxTotal - selectedItems.length, todayRemaining);
                const additionalToday = releasingToday.slice(todayQuota, todayQuota + stillRemaining);
                selectedItems = [...selectedItems, ...additionalToday];
              }
            }
          }

          console.log('📅 分配结果:', {
            已上映: recentlyReleased.length,
            今日上映: releasingToday.length,
            '7天内': nextSevenDays.length,
            '8-30天': nextThirtyDays.length,
            '30天后': laterReleasing.length,
            最终显示: selectedItems.length
          });

          setUpcomingReleases(selectedItems);
        } else {
          console.warn('获取即将上映数据失败:', upcomingReleasesData.status === 'rejected' ? upcomingReleasesData.reason : '数据格式错误');
          setUpcomingReleases([]);
        }
      } catch (error) {
        console.error('获取推荐数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendData();
  }, []);

  // 处理收藏数据更新的函数
  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    // 根据保存时间排序（从近到远）
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        // 查找对应的播放记录，获取当前集数
        const playRecord = allPlayRecords[key];
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode,
          search_title: fav?.search_title,
          origin: fav?.origin,
        } as FavoriteItem;
      });
    setFavoriteItems(sorted);
  };

  // 当切换到收藏夹时加载收藏数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    const loadFavorites = async () => {
      const allFavorites = await getAllFavorites();
      await updateFavoriteItems(allFavorites);
    };

    loadFavorites();

    // 监听收藏更新事件
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      }
    );

    return unsubscribe;
  }, [activeTab]);

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  return (
    <PageLayout>
      {/* Telegram 新用户欢迎弹窗 */}
      <TelegramWelcomeModal />

      <div className='overflow-visible -mt-6 md:mt-0'>
        {/* 欢迎横幅 - 现代化精简设计 */}
        <div className='mb-6 relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500/90 via-purple-500/90 to-pink-500/90 backdrop-blur-sm shadow-xl border border-white/20'>
          <div className='relative p-4 sm:p-5'>
            {/* 动态渐变背景 */}
            <div className='absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/5'></div>

            <div className='relative z-10 flex items-center justify-between gap-4'>
              <div className='flex-1 min-w-0'>
                <h2 className='text-lg sm:text-xl font-bold text-white mb-1 flex items-center gap-2 flex-wrap'>
                  <span>
                    {(() => {
                      const hour = new Date().getHours();
                      if (hour < 12) return '早上好';
                      if (hour < 18) return '下午好';
                      return '晚上好';
                    })()}
                    {username && '，'}
                  </span>
                  {username && (
                    <span className='text-yellow-300 font-semibold'>
                      {username}
                    </span>
                  )}
                  <span className='inline-block animate-wave origin-bottom-right'>👋</span>
                </h2>
                <p className='text-sm text-white/90'>
                  发现更多精彩影视内容 ✨
                </p>
              </div>

              {/* 装饰图标 - 更小更精致 */}
              <div className='hidden md:flex items-center justify-center flex-shrink-0 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20'>
                <Film className='w-6 h-6 text-white' />
              </div>
            </div>
          </div>
        </div>

        {/* 顶部 Tab 切换 */}
        <div className='mb-8 flex flex-col sm:flex-row items-center justify-center gap-4'>
          <CapsuleSwitch
            options={[
              { label: '首页', value: 'home' },
              { label: '收藏夹', value: 'favorites' },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
          />

          {/* AI推荐按钮 - 只在功能启用时显示，添加脉冲动画 */}
          {aiEnabled && (
            <button
              onClick={() => setShowAIRecommendModal(true)}
              className='relative flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full font-medium transition-all transform hover:scale-105 shadow-lg hover:shadow-xl group overflow-hidden'
              title='AI影视推荐'
            >
              {/* 脉冲光环 */}
              <div className='absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 opacity-0 group-hover:opacity-100 animate-ping'></div>

              {/* 闪烁背景 */}
              <div className='absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 opacity-20 animate-pulse'></div>

              <Brain className='h-4 w-4 relative z-10 group-hover:rotate-12 transition-transform duration-300' />
              <span className='relative z-10'>AI推荐</span>
            </button>
          )}
        </div>

        <div className='w-full mx-auto'>
          {activeTab === 'favorites' ? (
            // 收藏夹视图
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  我的收藏
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    onClick={async () => {
                      await clearAllFavorites();
                      setFavoriteItems([]);
                    }}
                  >
                    清空
                  </button>
                )}
              </div>
              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                {favoriteItems.map((item) => (
                  <div key={item.id + item.source} className='w-full'>
                    <VideoCard
                      query={item.search_title}
                      {...item}
                      from='favorite'
                      type={item.episodes > 1 ? 'tv' : ''}
                    />
                  </div>
                ))}
                {favoriteItems.length === 0 && (
                  <div className='col-span-full flex flex-col items-center justify-center py-16 px-4'>
                    {/* SVG 插画 - 空收藏夹 */}
                    <div className='mb-6 relative'>
                      <div className='absolute inset-0 bg-gradient-to-r from-pink-300 to-purple-300 dark:from-pink-600 dark:to-purple-600 opacity-20 blur-3xl rounded-full animate-pulse'></div>
                      <svg className='w-32 h-32 relative z-10' viewBox='0 0 200 200' fill='none' xmlns='http://www.w3.org/2000/svg'>
                        {/* 心形主体 */}
                        <path d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                          className='fill-gray-300 dark:fill-gray-600 stroke-gray-400 dark:stroke-gray-500 transition-colors duration-300'
                          strokeWidth='3'
                        />
                        {/* 虚线边框 */}
                        <path d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='2'
                          strokeDasharray='5,5'
                          className='text-gray-400 dark:text-gray-500'
                        />
                      </svg>
                    </div>

                    {/* 文字提示 */}
                    <h3 className='text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                      收藏夹空空如也
                    </h3>
                    <p className='text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs'>
                      快去发现喜欢的影视作品，点击 ❤️ 添加到收藏吧！
                    </p>
                  </div>
                )}
              </div>
            </section>
          ) : (
            // 首页视图
            <>
              {/* Hero Banner 轮播 */}
              {!loading && (hotMovies.length > 0 || hotTvShows.length > 0 || hotVarietyShows.length > 0 || hotShortDramas.length > 0) && (
                <section className='mb-8'>
                  <HeroBanner
                    items={[
                      // 豆瓣电影
                      ...hotMovies.slice(0, 2).map((movie) => ({
                        id: movie.id,
                        title: movie.title,
                        poster: movie.poster,
                        description: movie.plot_summary,
                        year: movie.year,
                        rate: movie.rate,
                        douban_id: Number(movie.id),
                        type: 'movie',
                      })),
                      // 豆瓣电视剧
                      ...hotTvShows.slice(0, 2).map((show) => ({
                        id: show.id,
                        title: show.title,
                        poster: show.poster,
                        description: show.plot_summary,
                        year: show.year,
                        rate: show.rate,
                        douban_id: Number(show.id),
                        type: 'tv',
                      })),
                      // 豆瓣综艺
                      ...hotVarietyShows.slice(0, 1).map((show) => ({
                        id: show.id,
                        title: show.title,
                        poster: show.poster,
                        description: show.plot_summary,
                        year: show.year,
                        rate: show.rate,
                        douban_id: Number(show.id),
                        type: 'variety',
                      })),
                      // 短剧（非豆瓣）
                      ...hotShortDramas.slice(0, 2).map((drama) => ({
                        id: drama.id,
                        title: drama.name,
                        poster: drama.cover,
                        description: drama.description,
                        year: '',
                        rate: drama.score ? drama.score.toString() : '',
                        type: 'shortdrama',
                      })),
                      // 番剧（非豆瓣，来自 bangumi）
                      ...(bangumiCalendarData.length > 0
                        ? (() => {
                            const today = new Date();
                            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                            const currentWeekday = weekdays[today.getDay()];
                            const todayAnimes = bangumiCalendarData.find(
                              (item) => item.weekday.en === currentWeekday
                            )?.items || [];
                            return todayAnimes.slice(0, 1).map((anime) => ({
                              id: anime.id,
                              title: anime.name_cn || anime.name,
                              poster: anime.images?.large || anime.images?.common || anime.images?.medium || '/placeholder-poster.jpg',
                              description: anime.summary,
                              year: anime.air_date?.split('-')?.[0] || '',
                              rate: anime.rating?.score?.toFixed(1) || '',
                              douban_id: anime.id,
                              type: 'anime',
                            }));
                          })()
                        : [])
                    ]}
                    autoPlayInterval={5000}
                    showControls={true}
                    showIndicators={true}
                  />
                </section>
              )}

              {/* 继续观看 */}
              <ContinueWatching />

              {/* 即将上映 */}
              {(() => {
                console.log('🔍 即将上映 section 渲染检查:', { loading, upcomingReleasesCount: upcomingReleases.length });
                return null;
              })()}
              {!loading && upcomingReleases.length > 0 && (
                <section className='mb-8'>
                  <div className='mb-4 flex items-center justify-between'>
                    <SectionTitle title="即将上映" icon={Calendar} iconColor="text-orange-500" />
                    <Link
                      href='/release-calendar'
                      className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                    >
                      查看更多
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>
                  <ScrollableRow>
                    {upcomingReleases.map((release, index) => {
                      // 计算距离上映还有几天
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const releaseDate = new Date(release.releaseDate);
                      const daysDiff = Math.ceil((releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                      // 根据天数差异显示不同文字
                      let remarksText;
                      if (daysDiff < 0) {
                        remarksText = `已上映${Math.abs(daysDiff)}天`;
                      } else if (daysDiff === 0) {
                        remarksText = '今日上映';
                      } else {
                        remarksText = `${daysDiff}天后上映`;
                      }

                      return (
                        <div
                          key={`${release.id}-${index}`}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            source='upcoming_release'
                            id={release.id}
                            source_name='即将上映'
                            from='douban'
                            title={release.title}
                            poster={release.cover || '/placeholder-poster.jpg'}
                            year={release.releaseDate.split('-')[0]}
                            type={release.type}
                            remarks={remarksText}
                            query={release.title}
                            episodes={release.type === 'tv' ? 99 : 1}
                          />
                        </div>
                      );
                    })}
                  </ScrollableRow>
                </section>
              )}

              {/* 热门电影 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle title="热门电影" icon={Film} iconColor="text-red-500" />
                  <Link
                    href='/douban?type=movie'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加载状态显示灰色占位数据
                    Array.from({ length: 8 }).map((_, index) => (
                      <SkeletonCard key={index} />
                    ))
                    : // 显示真实数据
                    hotMovies.map((movie, index) => (
                      <div
                        key={index}
                        className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                      >
                        <VideoCard
                          from='douban'
                          title={movie.title}
                          poster={movie.poster}
                          douban_id={Number(movie.id)}
                          rate={movie.rate}
                          year={movie.year}
                          type='movie'
                        />
                      </div>
                    ))}
                </ScrollableRow>
              </section>

              {/* 热门剧集 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle title="热门剧集" icon={Tv} iconColor="text-blue-500" />
                  <Link
                    href='/douban?type=tv'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加载状态显示灰色占位数据
                    Array.from({ length: 8 }).map((_, index) => (
                      <SkeletonCard key={index} />
                    ))
                    : // 显示真实数据
                    hotTvShows.map((show, index) => (
                      <div
                        key={index}
                        className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                      >
                        <VideoCard
                          from='douban'
                          title={show.title}
                          poster={show.poster}
                          douban_id={Number(show.id)}
                          rate={show.rate}
                          year={show.year}
                        />
                      </div>
                    ))}
                </ScrollableRow>
              </section>

              {/* 每日新番放送 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle title="新番放送" icon={Calendar} iconColor="text-purple-500" />
                  <Link
                    href='/douban?type=anime'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加载状态显示灰色占位数据
                    Array.from({ length: 8 }).map((_, index) => (
                      <SkeletonCard key={index} />
                    ))
                    : // 展示当前日期的番剧
                    (() => {
                      // 获取当前日期对应的星期
                      const today = new Date();
                      const weekdays = [
                        'Sun',
                        'Mon',
                        'Tue',
                        'Wed',
                        'Thu',
                        'Fri',
                        'Sat',
                      ];
                      const currentWeekday = weekdays[today.getDay()];

                      // 找到当前星期对应的番剧数据
                      const todayAnimes =
                        bangumiCalendarData.find(
                          (item) => item.weekday.en === currentWeekday
                        )?.items || [];

                      return todayAnimes.map((anime, index) => (
                        <div
                          key={`${anime.id}-${index}`}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            title={anime.name_cn || anime.name}
                            poster={
                              anime.images?.large ||
                              anime.images?.common ||
                              anime.images?.medium ||
                              anime.images?.small ||
                              anime.images?.grid ||
                              '/placeholder-poster.jpg'
                            }
                            douban_id={anime.id}
                            rate={anime.rating?.score?.toFixed(1) || ''}
                            year={anime.air_date?.split('-')?.[0] || ''}
                            isBangumi={true}
                          />
                        </div>
                      ));
                    })()}
                </ScrollableRow>
              </section>

              {/* 热门综艺 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle title="热门综艺" icon={Sparkles} iconColor="text-pink-500" />
                  <Link
                    href='/douban?type=show'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加载状态显示灰色占位数据
                    Array.from({ length: 8 }).map((_, index) => (
                      <SkeletonCard key={index} />
                    ))
                    : // 显示真实数据
                    hotVarietyShows.map((show, index) => (
                      <div
                        key={index}
                        className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                      >
                        <VideoCard
                          from='douban'
                          title={show.title}
                          poster={show.poster}
                          douban_id={Number(show.id)}
                          rate={show.rate}
                          year={show.year}
                        />
                      </div>
                    ))}
                </ScrollableRow>
              </section>

              {/* 热门短剧 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle title="热门短剧" icon={Play} iconColor="text-orange-500" />
                  <Link
                    href='/shortdrama'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加载状态显示灰色占位数据
                    Array.from({ length: 8 }).map((_, index) => (
                      <SkeletonCard key={index} />
                    ))
                    : // 显示真实数据
                    hotShortDramas.map((drama, index) => (
                      <div
                        key={index}
                        className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                      >
                        <ShortDramaCard drama={drama} />
                      </div>
                    ))}
                </ScrollableRow>
              </section>
            </>
          )}
        </div>
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${showAnnouncement ? '' : 'opacity-0 pointer-events-none'
            }`}
          onTouchStart={(e) => {
            // 如果点击的是背景区域，阻止触摸事件冒泡，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => {
            // 如果触摸的是背景区域，阻止触摸移动，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onTouchEnd={(e) => {
            // 如果触摸的是背景区域，阻止触摸结束事件，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          style={{
            touchAction: 'none', // 禁用所有触摸操作
          }}
        >
          <div
            className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'
            onTouchMove={(e) => {
              // 允许公告内容区域正常滚动，阻止事件冒泡到外层
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto', // 允许内容区域的正常触摸操作
            }}
          >
            <div className='flex justify-between items-start mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
                提示
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors'
                aria-label='关闭'
              ></button>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {announcement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className='w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
            >
              我知道了
            </button>
          </div>
        </div>
      )}

      {/* AI推荐模态框 */}
      <AIRecommendModal
        isOpen={showAIRecommendModal}
        onClose={() => setShowAIRecommendModal(false)}
      />
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
