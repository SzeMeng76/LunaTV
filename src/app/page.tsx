/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight, Film, Tv, Calendar, Sparkles, Play, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState, useRef, useMemo, useReducer, useTransition } from 'react';
import { useQuery, queryOptions } from '@tanstack/react-query';

import {
  BangumiCalendarData,
} from '@/lib/bangumi.client';
import { cleanExpiredCache, clearRecommendsCache } from '@/lib/shortdrama-cache';
import { ShortDramaItem, ReleaseCalendarItem } from '@/lib/types';
// 客户端收藏 API
import {
  getAllFavorites,
  getAllPlayRecords,
  getAllReminders,
} from '@/lib/db.client';
// 🚀 TanStack Query Mutations
import { useClearFavoritesMutation } from '@/hooks/useFavoritesMutations';
import { useClearRemindersMutation } from '@/hooks/useRemindersMutations';
import { useHomePageQueries } from '@/hooks/useHomePageQueries';
import { getDoubanDetails } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

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
import { ConfirmDialog } from '@/components/ConfirmDialog';

// 🎯 优化：合并状态管理 - 使用 useReducer 减少重渲染
interface HomeState {
  activeTab: 'home' | 'favorites' | 'reminders';
  hotMovies: DoubanItem[];
  hotTvShows: DoubanItem[];
  hotVarietyShows: DoubanItem[];
  hotAnime: DoubanItem[];
  hotShortDramas: ShortDramaItem[];
  bangumiCalendarData: BangumiCalendarData[];
  upcomingReleases: ReleaseCalendarItem[];
  loading: boolean;
  username: string;
  showAnnouncement: boolean;
}

type HomeAction =
  | { type: 'SET_ACTIVE_TAB'; payload: 'home' | 'favorites' | 'reminders' }
  | { type: 'SET_HOT_MOVIES'; payload: DoubanItem[] }
  | { type: 'SET_HOT_TV_SHOWS'; payload: DoubanItem[] }
  | { type: 'SET_HOT_VARIETY_SHOWS'; payload: DoubanItem[] }
  | { type: 'SET_HOT_ANIME'; payload: DoubanItem[] }
  | { type: 'SET_HOT_SHORT_DRAMAS'; payload: ShortDramaItem[] }
  | { type: 'SET_BANGUMI_CALENDAR_DATA'; payload: BangumiCalendarData[] }
  | { type: 'SET_UPCOMING_RELEASES'; payload: ReleaseCalendarItem[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USERNAME'; payload: string }
  | { type: 'SET_SHOW_ANNOUNCEMENT'; payload: boolean }
  | { type: 'UPDATE_HOT_MOVIES'; payload: (prev: DoubanItem[]) => DoubanItem[] }
  | { type: 'UPDATE_HOT_TV_SHOWS'; payload: (prev: DoubanItem[]) => DoubanItem[] }
  | { type: 'UPDATE_HOT_VARIETY_SHOWS'; payload: (prev: DoubanItem[]) => DoubanItem[] }
  | { type: 'UPDATE_HOT_ANIME'; payload: (prev: DoubanItem[]) => DoubanItem[] }
  | { type: 'UPDATE_HOT_SHORT_DRAMAS'; payload: (prev: ShortDramaItem[]) => ShortDramaItem[] };

const homeReducer = (state: HomeState, action: HomeAction): HomeState => {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_HOT_MOVIES':
      return { ...state, hotMovies: action.payload };
    case 'SET_HOT_TV_SHOWS':
      return { ...state, hotTvShows: action.payload };
    case 'SET_HOT_VARIETY_SHOWS':
      return { ...state, hotVarietyShows: action.payload };
    case 'SET_HOT_ANIME':
      return { ...state, hotAnime: action.payload };
    case 'SET_HOT_SHORT_DRAMAS':
      return { ...state, hotShortDramas: action.payload };
    case 'SET_BANGUMI_CALENDAR_DATA':
      return { ...state, bangumiCalendarData: action.payload };
    case 'SET_UPCOMING_RELEASES':
      return { ...state, upcomingReleases: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_USERNAME':
      return { ...state, username: action.payload };
    case 'SET_SHOW_ANNOUNCEMENT':
      return { ...state, showAnnouncement: action.payload };
    case 'UPDATE_HOT_MOVIES':
      return { ...state, hotMovies: action.payload(state.hotMovies) };
    case 'UPDATE_HOT_TV_SHOWS':
      return { ...state, hotTvShows: action.payload(state.hotTvShows) };
    case 'UPDATE_HOT_VARIETY_SHOWS':
      return { ...state, hotVarietyShows: action.payload(state.hotVarietyShows) };
    case 'UPDATE_HOT_ANIME':
      return { ...state, hotAnime: action.payload(state.hotAnime) };
    case 'UPDATE_HOT_SHORT_DRAMAS':
      return { ...state, hotShortDramas: action.payload(state.hotShortDramas) };
    default:
      return state;
  }
};

// Query Options 工厂函数
const allFavoritesOptions = () => queryOptions({
  queryKey: ['favorites'],
  queryFn: () => getAllFavorites(),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
});

const allPlayRecordsOptions = () => queryOptions({
  queryKey: ['playRecords'],
  queryFn: () => getAllPlayRecords(),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
});

const allRemindersOptions = () => queryOptions({
  queryKey: ['reminders'],
  queryFn: () => getAllReminders(),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
});

function HomeClient() {
  // 🚀 TanStack Query - 首页数据查询（替代 GlobalCache）
  const {
    data: homeData,
    isLoading: homeLoading,
    isFetching: homeFetching,
    errors: homeErrors,
    refetch: refetchHomeData,
  } = useHomePageQueries();

  // 🎯 优化：使用 useTransition 让 tab 切换不阻塞 UI
  const [isPending, startTransition] = useTransition();

  // 🎯 优化：使用 useReducer 合并本地状态
  const [state, dispatch] = useReducer(homeReducer, {
    activeTab: 'home',
    hotMovies: [],
    hotTvShows: [],
    hotVarietyShows: [],
    hotAnime: [],
    hotShortDramas: [],
    bangumiCalendarData: [],
    upcomingReleases: [],
    loading: true,
    username: '',
    showAnnouncement: false,
  });

  const { announcement } = useSite();

  // 解构状态以便使用
  const {
    activeTab,
    upcomingReleases,
    username,
    showAnnouncement,
  } = state;

  // 🚀 从 TanStack Query 获取首页数据，本地状态作为详情增强
  const hotMovies = useMemo(() => {
    const cached = homeData?.hotMovies || [];
    // 合并本地详情数据
    if (state.hotMovies.length > 0 && cached.length > 0) {
      return cached.map(m => {
        const local = state.hotMovies.find(lm => lm.id === m.id);
        return local ? { ...m, ...local } : m;
      });
    }
    return cached;
  }, [homeData?.hotMovies, state.hotMovies]);

  const hotTvShows = useMemo(() => {
    const cached = homeData?.hotTvShows || [];
    if (state.hotTvShows.length > 0 && cached.length > 0) {
      return cached.map(s => {
        const local = state.hotTvShows.find(ls => ls.id === s.id);
        return local ? { ...s, ...local } : s;
      });
    }
    return cached;
  }, [homeData?.hotTvShows, state.hotTvShows]);

  const hotVarietyShows = useMemo(() => {
    const cached = homeData?.hotVarietyShows || [];
    if (state.hotVarietyShows.length > 0 && cached.length > 0) {
      return cached.map(s => {
        const local = state.hotVarietyShows.find(ls => ls.id === s.id);
        return local ? { ...s, ...local } : s;
      });
    }
    return cached;
  }, [homeData?.hotVarietyShows, state.hotVarietyShows]);

  const hotAnime = useMemo(() => {
    const cached = homeData?.hotAnime || [];
    if (state.hotAnime.length > 0 && cached.length > 0) {
      return cached.map(a => {
        const local = state.hotAnime.find(la => la.id === a.id);
        return local ? { ...a, ...local } : a;
      });
    }
    return cached;
  }, [homeData?.hotAnime, state.hotAnime]);

  const hotShortDramas = useMemo(() => {
    const cached = homeData?.hotShortDramas || [];
    if (state.hotShortDramas.length > 0 && cached.length > 0) {
      return cached.map(d => {
        const local = state.hotShortDramas.find(ld => ld.id === d.id);
        return local ? { ...d, ...local } : d;
      });
    }
    return cached;
  }, [homeData?.hotShortDramas, state.hotShortDramas]);

  const bangumiCalendarData = homeData?.bangumiCalendar || [];

  // 🚀 计算 loading 状态：首次加载时显示 loading
  const loading = homeLoading;

  // 🚀 Web Worker引用
  const workerRef = useRef<Worker | null>(null);

  // 🎯 优化：缓存问候语计算
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }, []); // 空依赖数组，只在组件挂载时计算一次

  // 🎯 优化：缓存今日番剧计算
  const todayAnimes = useMemo(() => {
    const today = new Date();
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentWeekday = weekdays[today.getDay()];

    return bangumiCalendarData.find(
      (item) => item.weekday.en === currentWeekday
    )?.items || [];
  }, [bangumiCalendarData]); // 依赖bangumiCalendarData，数据变化时重新计算

  // 🎯 优化：缓存今天的日期（用于上映日期计算）
  const today = useMemo(() => {
    // 使用 Asia/Shanghai 时区，返回 YYYY-MM-DD 格式字符串（与 watching-updates.ts 保持一致）
    const dateStr = new Date().toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return dateStr.replace(/\//g, '-'); // "2026/04/02" -> "2026-04-02"
  }, []); // 空依赖，只在组件挂载时计算一次

  // 合并初始化逻辑 - 优化性能，减少重渲染
  useEffect(() => {
    // 获取用户名
    const authInfo = getAuthInfoFromBrowserCookie();
    if (authInfo?.username) {
      dispatch({ type: 'SET_USERNAME', payload: authInfo.username });
    }

    // 读取清空确认设置
    if (typeof window !== 'undefined') {
      const savedRequireClearConfirmation = localStorage.getItem('requireClearConfirmation');
      if (savedRequireClearConfirmation !== null) {
        setRequireClearConfirmation(JSON.parse(savedRequireClearConfirmation));
      }
    }

    // 检查公告弹窗状态
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        dispatch({ type: 'SET_SHOW_ANNOUNCEMENT', payload: true });
      } else {
        dispatch({ type: 'SET_SHOW_ANNOUNCEMENT', payload: Boolean(!hasSeenAnnouncement && announcement) });
      }
    }
  }, [announcement]);

  // 🚀 TanStack Query - 使用 useQuery 获取收藏数据（自动缓存，跨页面持久化）
  const { data: allFavorites = {} } = useQuery(allFavoritesOptions());

  // 🚀 TanStack Query - 使用 useQuery 获取播放记录（自动缓存，跨页面持久化）
  const { data: allPlayRecords = {} } = useQuery(allPlayRecordsOptions());

  // 🚀 TanStack Query - 使用 useQuery 获取提醒数据（自动缓存，跨页面持久化）
  const { data: allReminders = {} } = useQuery(allRemindersOptions());

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
    type?: string;
    releaseDate?: string;
    remarks?: string;
  };

  // 🚀 TanStack Query - 使用 useMemo 计算收藏列表（自动响应数据变化）
  const favoriteItems = useMemo(() => {
    // 根据保存时间排序（从近到远）
    return Object.entries(allFavorites)
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
          type: fav?.type,
          releaseDate: fav?.releaseDate,
          remarks: fav?.remarks,
        } as FavoriteItem;
      });
  }, [allFavorites, allPlayRecords]);

  // 🚀 TanStack Query - 使用 useMemo 计算提醒列表（自动响应数据变化）
  const reminderItems = useMemo(() => {
    // 根据保存时间排序（从近到远）
    return Object.entries(allReminders)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, reminder]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        return {
          id,
          source,
          title: reminder.title,
          year: reminder.year,
          poster: reminder.cover,
          episodes: reminder.total_episodes,
          source_name: reminder.source_name,
          search_title: reminder?.search_title,
          origin: reminder?.origin,
          type: reminder?.type,
          releaseDate: reminder.releaseDate,
          remarks: reminder?.remarks,
        };
      });
  }, [allReminders]);

  const [favoriteFilter, setFavoriteFilter] = useState<'all' | 'movie' | 'tv' | 'anime' | 'shortdrama' | 'live' | 'variety'>('all');
  const [favoriteSortBy, setFavoriteSortBy] = useState<'recent' | 'title' | 'rating'>('recent');
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [reminderFilter, setReminderFilter] = useState<'all' | 'upcoming' | 'today' | 'released'>('all');
  const [showClearFavoritesDialog, setShowClearFavoritesDialog] = useState(false);
  const [showClearRemindersDialog, setShowClearRemindersDialog] = useState(false);
  const [requireClearConfirmation, setRequireClearConfirmation] = useState(false);

  // 🎯 优化：缓存收藏夹统计信息计算
  const favoriteStats = useMemo(() => {
    if (favoriteItems.length === 0) return null;

    return {
      total: favoriteItems.length,
      movie: favoriteItems.filter(item => {
        if (item.type) return item.type === 'movie';
        if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes === 1;
      }).length,
      tv: favoriteItems.filter(item => {
        if (item.type) return item.type === 'tv';
        if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
        if (item.source === 'bangumi') return false;
        if (item.origin === 'live') return false;
        return item.episodes > 1;
      }).length,
      anime: favoriteItems.filter(item => {
        if (item.type) return item.type === 'anime';
        return item.source === 'bangumi';
      }).length,
      shortdrama: favoriteItems.filter(item => {
        if (item.type) return item.type === 'shortdrama';
        return item.source === 'shortdrama' || item.source_name === '短剧';
      }).length,
      live: favoriteItems.filter(item => item.origin === 'live').length,
      variety: favoriteItems.filter(item => {
        if (item.type) return item.type === 'variety';
        return false;
      }).length,
    };
  }, [favoriteItems]);

  useEffect(() => {
    // 清理过期缓存
    cleanExpiredCache().catch(console.error);

    // 清除可能缓存了空数据的短剧推荐缓存
    clearRecommendsCache().catch(console.error);

    // 🚀 TanStack Query 会自动加载数据，无需手动调用

    // 🚀 清理Web Worker
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
        console.log('📅 [Main] Web Worker已清理');
      }
    };
  }, []);

  // 如果首页数据加载完成但热门短剧为空，强制刷新（可能之前缓存了空数据）
  useEffect(() => {
    if (homeData && homeData.hotShortDramas.length === 0 && !homeLoading) {
      console.log('[TanStack Query] 热门短剧为空，强制刷新首页数据');
      refetchHomeData();
    }
  }, [homeData, homeLoading, refetchHomeData]);

  // 🚀 当 GlobalCache 数据加载完成后，延迟加载详情数据
  useEffect(() => {
    if (!homeData) return;

    // 延迟加载电影详情
    if (homeData.hotMovies.length > 0) {
      setTimeout(() => {
        Promise.all(
          homeData.hotMovies.slice(0, 2).map(async (movie) => {
            try {
              const detailsRes = await getDoubanDetails(movie.id);
              if (detailsRes.code === 200 && detailsRes.data) {
                return {
                  id: movie.id,
                  plot_summary: detailsRes.data.plot_summary,
                  backdrop: detailsRes.data.backdrop,
                  trailerUrl: detailsRes.data.trailerUrl,
                };
              }
            } catch (error) {
              console.warn(`获取电影 ${movie.id} 详情失败:`, error);
            }
            return null;
          })
        ).then((results) => {
          dispatch({
            type: 'UPDATE_HOT_MOVIES',
            payload: (prev) => {
              const base = prev.length > 0 ? prev : homeData.hotMovies;
              return base.map(m => {
                const detail = results.find(r => r?.id === m.id);
                return detail ? { ...m, ...detail } : m;
              });
            }
          });
        });
      }, 2000);
    }

    // 延迟加载剧集详情
    if (homeData.hotTvShows.length > 0) {
      setTimeout(() => {
        Promise.all(
          homeData.hotTvShows.slice(0, 2).map(async (show) => {
            try {
              const detailsRes = await getDoubanDetails(show.id);
              if (detailsRes.code === 200 && detailsRes.data) {
                return {
                  id: show.id,
                  plot_summary: detailsRes.data.plot_summary,
                  backdrop: detailsRes.data.backdrop,
                  trailerUrl: detailsRes.data.trailerUrl,
                };
              }
            } catch (error) {
              console.warn(`获取剧集 ${show.id} 详情失败:`, error);
            }
            return null;
          })
        ).then((results) => {
          dispatch({
            type: 'UPDATE_HOT_TV_SHOWS',
            payload: (prev) => {
              const base = prev.length > 0 ? prev : homeData.hotTvShows;
              return base.map(s => {
                const detail = results.find(r => r?.id === s.id);
                return detail ? { ...s, ...detail } : s;
              });
            }
          });
        });
      }, 2000);
    }

    // 延迟加载动漫详情
    if (homeData.hotAnime.length > 0) {
      setTimeout(() => {
        const anime = homeData.hotAnime[0];
        getDoubanDetails(anime.id)
          .then((detailsRes) => {
            if (detailsRes.code === 200 && detailsRes.data) {
              dispatch({
                type: 'UPDATE_HOT_ANIME',
                payload: (prev) => {
                  const base = prev.length > 0 ? prev : homeData.hotAnime;
                  return base.map(a => a.id === anime.id ? { ...a, ...detailsRes.data } : a);
                }
              });
            }
          })
          .catch((error) => {
            console.warn(`获取动漫 ${anime.id} 详情失败:`, error);
          });
      }, 3000);
    }

    // 延迟加载综艺详情
    if (homeData.hotVarietyShows.length > 0) {
      setTimeout(() => {
        const show = homeData.hotVarietyShows[0];
        getDoubanDetails(show.id)
          .then((detailsRes) => {
            if (detailsRes.code === 200 && detailsRes.data) {
              dispatch({
                type: 'UPDATE_HOT_VARIETY_SHOWS',
                payload: (prev) => {
                  const base = prev.length > 0 ? prev : homeData.hotVarietyShows;
                  return base.map(s => s.id === show.id ? { ...s, ...detailsRes.data } : s);
                }
              });
            }
          })
          .catch((error) => {
            console.warn(`获取综艺 ${show.id} 详情失败:`, error);
          });
      }, 3000);
    }

    // 延迟加载短剧详情
    if (homeData.hotShortDramas.length > 0) {
      setTimeout(() => {
        Promise.all(
          homeData.hotShortDramas.slice(0, 2).map(async (drama) => {
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
          dispatch({
            type: 'UPDATE_HOT_SHORT_DRAMAS',
            payload: (prev) => {
              const base = prev.length > 0 ? prev : homeData.hotShortDramas;
              return base.map(d => {
                const detail = results.find(r => r?.id === d.id);
                return detail ? { ...d, description: detail.description } : d;
              });
            }
          });
        });
      }, 3000);
    }

    // 🔄 异步加载即将上映数据
    fetch('/api/release-calendar?limit=100')
      .then(res => {
        if (!res.ok) {
          console.error('获取即将上映数据失败，状态码:', res.status);
          return { items: [] };
        }
        return res.json();
      })
      .then(upcomingData => {
        if (upcomingData?.items) {
          const releases = upcomingData.items;
          console.log('📅 获取到的即将上映数据:', releases.length, '条');

          // 初始化Web Worker
          if (!workerRef.current && typeof window !== 'undefined' && window.Worker) {
            try {
              workerRef.current = new Worker(new URL('../workers/releaseCalendar.worker.ts', import.meta.url));

              workerRef.current.onmessage = (e: MessageEvent) => {
                const { selectedItems, stats, error } = e.data;

                if (error) {
                  console.error('📅 [Worker] 处理失败:', error);
                  dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
                  return;
                }

                console.log('📅 [Main] Worker处理完成，分配结果:', stats);
                dispatch({ type: 'SET_UPCOMING_RELEASES', payload: selectedItems });
              };

              workerRef.current.onerror = (error) => {
                console.error('📅 [Worker] 错误:', error);
                dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
              };
            } catch (error) {
              console.error('📅 [Worker] 初始化失败:', error);
              dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
            }
          }

          // 发送数据到Worker处理
          if (workerRef.current) {
            // 使用 Asia/Shanghai 时区
            const todayStr = new Date().toLocaleDateString('zh-CN', {
              timeZone: 'Asia/Shanghai',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).split('/').join('-'); // 转换为 YYYY-MM-DD 格式

            workerRef.current.postMessage({
              releases,
              today: todayStr,
            });
          } else {
            console.warn('📅 Web Worker不可用，跳过即将上映数据处理');
            dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
          }
        }
      })
      .catch(error => {
        console.warn('获取即将上映数据失败:', error);
        dispatch({ type: 'SET_UPCOMING_RELEASES', payload: [] });
      });
  }, [homeData]);

  // 🚀 TanStack Query - 使用 useMutation 管理清空收藏操作
  // 特性：乐观更新（立即清空 UI）+ 错误回滚（失败时恢复数据）
  const clearFavoritesMutation = useClearFavoritesMutation();

  // 🚀 TanStack Query - 使用 useMutation 管理清空提醒操作
  const clearRemindersMutation = useClearRemindersMutation();

  const handleCloseAnnouncement = (announcement: string) => {
    dispatch({ type: 'SET_SHOW_ANNOUNCEMENT', payload: false });
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  return (
    <PageLayout>
      {/* Telegram 新用户欢迎弹窗 */}
      <TelegramWelcomeModal />

      <div className='overflow-visible -mt-6 md:mt-0 pb-32 md:pb-safe-bottom'>
        {/* 欢迎横幅 - 现代化精简设计 */}
        <div className='mb-6 relative overflow-hidden rounded-xl bg-linear-to-r from-blue-500/90 via-purple-500/90 to-pink-500/90 backdrop-blur-sm shadow-xl border border-white/20'>
          <div className='relative p-4 sm:p-5'>
            {/* 动态渐变背景 */}
            <div className='absolute inset-0 bg-linear-to-br from-white/5 via-transparent to-black/5'></div>

            <div className='relative z-10 flex items-center justify-between gap-4'>
              <div className='flex-1 min-w-0'>
                <h2 className='text-lg sm:text-xl font-bold text-white mb-1 flex items-center gap-2 flex-wrap'>
                  <span>
                    {greeting}
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
              <div className='hidden md:flex items-center justify-center shrink-0 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20'>
                <Film className='w-6 h-6 text-white' />
              </div>
            </div>
          </div>
        </div>

        {/* 顶部 Tab 切换 - AI 按钮已移至右上角导航栏 */}
        <div className='mb-8 flex items-center justify-center'>
          <CapsuleSwitch
            options={[
              { label: '首页', value: 'home' },
              { label: '收藏夹', value: 'favorites' },
              { label: '想看', value: 'reminders' },
            ]}
            active={activeTab}
            onChange={(value) => startTransition(() => dispatch({ type: 'SET_ACTIVE_TAB', payload: value as 'home' | 'favorites' | 'reminders' }))}
          />
        </div>

        <div className={`w-full mx-auto ${isPending ? 'opacity-70 transition-opacity duration-150' : ''}`}>
          {activeTab === 'reminders' ? (
            // 想看视图
            <section className='mb-8'>
              <div className='mb-6 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  我想看
                </h2>
                {reminderItems.length > 0 && (
                  <button
                    className='flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 dark:text-red-400 dark:hover:text-white dark:hover:bg-red-500 border border-red-300 dark:border-red-700 hover:border-red-600 dark:hover:border-red-500 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md'
                    onClick={() => {
                      if (requireClearConfirmation) {
                        setShowClearRemindersDialog(true);
                      } else {
                        clearRemindersMutation.mutate();
                      }
                    }}
                  >
                    <Trash2 className='w-4 h-4' />
                    <span>清空想看</span>
                  </button>
                )}
              </div>

              {/* 筛选标签 */}
              {reminderItems.length > 0 && (
                <div className='mb-4 flex flex-wrap gap-2'>
                  {[
                    { key: 'all' as const, label: '全部', icon: '📚' },
                    { key: 'upcoming' as const, label: '即将上映', icon: '⏰' },
                    { key: 'today' as const, label: '今日上映', icon: '🎉' },
                    { key: 'released' as const, label: '已上映', icon: '✅' },
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setReminderFilter(key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        reminderFilter === key
                          ? 'bg-linear-to-r from-orange-500 to-red-500 text-white shadow-lg scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className='mr-1'>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                {(() => {
                  // 筛选
                  let filtered = reminderItems;
                  if (reminderFilter === 'upcoming') {
                    filtered = reminderItems.filter(item => {
                      if (!item.releaseDate) return false;
                      return item.releaseDate > today;
                    });
                  } else if (reminderFilter === 'today') {
                    filtered = reminderItems.filter(item => {
                      if (!item.releaseDate) return false;
                      return item.releaseDate === today;
                    });
                  } else if (reminderFilter === 'released') {
                    filtered = reminderItems.filter(item => {
                      if (!item.releaseDate) return false;
                      return item.releaseDate < today;
                    });
                  }

                  return filtered.map((item) => {
                    // 智能计算上映状态
                    let calculatedRemarks = item.remarks;

                    if (item.releaseDate) {
                      // 使用字符串比较（YYYY-MM-DD 格式可以直接比较）
                      const releaseDate = item.releaseDate; // "YYYY-MM-DD"

                      if (releaseDate < today) {
                        // 已上映：计算天数差
                        const releaseParts = releaseDate.split('-').map(Number);
                        const todayParts = today.split('-').map(Number);
                        const releaseMs = new Date(releaseParts[0], releaseParts[1] - 1, releaseParts[2]).getTime();
                        const todayMs = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
                        const daysAgo = Math.floor((todayMs - releaseMs) / (1000 * 60 * 60 * 24));
                        calculatedRemarks = `已上映${daysAgo}天`;
                      } else if (releaseDate === today) {
                        calculatedRemarks = '今日上映';
                      } else {
                        // 即将上映：计算天数差
                        const releaseParts = releaseDate.split('-').map(Number);
                        const todayParts = today.split('-').map(Number);
                        const releaseMs = new Date(releaseParts[0], releaseParts[1] - 1, releaseParts[2]).getTime();
                        const todayMs = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
                        const daysUntil = Math.ceil((releaseMs - todayMs) / (1000 * 60 * 60 * 24));
                        calculatedRemarks = `${daysUntil}天后上映`;
                      }
                    }

                    return (
                      <div key={item.id + item.source} className='w-full'>
                        <VideoCard
                          query={item.search_title}
                          {...item}
                          from='reminder'
                          remarks={calculatedRemarks}
                          releaseDate={item.releaseDate}
                        />
                      </div>
                    );
                  });
                })()}
                {reminderItems.length === 0 && (
                  <div className='col-span-full flex flex-col items-center justify-center py-16 px-4'>
                    <div className='mb-6 relative'>
                      <div className='absolute inset-0 bg-linear-to-r from-orange-300 to-red-300 dark:from-orange-600 dark:to-red-600 opacity-20 blur-3xl rounded-full animate-pulse'></div>
                      <svg className='w-32 h-32 relative z-10' viewBox='0 0 200 200' fill='none' xmlns='http://www.w3.org/2000/svg'>
                        <path d='M100 50 L100 120 M100 50 L130 80'
                          className='stroke-gray-400 dark:stroke-gray-500'
                          strokeWidth='8'
                          strokeLinecap='round'
                          strokeLinejoin='round'
                        />
                        <circle cx='100' cy='100' r='70'
                          className='fill-gray-300 dark:fill-gray-600 stroke-gray-400 dark:stroke-gray-500'
                          strokeWidth='3'
                        />
                        <path d='M100 50 L100 120 M100 50 L130 80'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='2'
                          strokeDasharray='5,5'
                          className='text-gray-400 dark:text-gray-500'
                        />
                      </svg>
                    </div>

                    <h3 className='text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                      暂无想看内容
                    </h3>
                    <p className='text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs'>
                      发现即将上映的内容，点击 🔔 标记想看吧！
                    </p>
                  </div>
                )}
              </div>

              {/* 确认对话框 */}
              <ConfirmDialog
                isOpen={showClearRemindersDialog}
                title="确认清空想看"
                message={`确定要清空所有想看内容吗？\n\n这将删除 ${reminderItems.length} 项内容，此操作无法撤销。`}
                confirmText="确认清空"
                cancelText="取消"
                variant="danger"
                onConfirm={() => {
                  clearRemindersMutation.mutate();
                  setShowClearRemindersDialog(false);
                }}
                onCancel={() => setShowClearRemindersDialog(false)}
              />
            </section>
          ) : activeTab === 'favorites' ? (
            // 收藏夹视图
            <section className='mb-8'>
              <div className='mb-6 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  我的收藏
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    className='flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 dark:text-red-400 dark:hover:text-white dark:hover:bg-red-500 border border-red-300 dark:border-red-700 hover:border-red-600 dark:hover:border-red-500 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md'
                    onClick={() => {
                      // 根据用户设置决定是否显示确认对话框
                      if (requireClearConfirmation) {
                        setShowClearFavoritesDialog(true);
                      } else {
                        // 🚀 使用 mutation.mutate() 清空收藏
                        // 特性：立即清空 UI（乐观更新），失败时自动回滚
                        clearFavoritesMutation.mutate();
                      }
                    }}
                  >
                    <Trash2 className='w-4 h-4' />
                    <span>清空收藏</span>
                  </button>
                )}
              </div>

              {/* 统计信息 */}
              {favoriteStats && (
                <div className='mb-4 flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400'>
                  <span className='px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full'>
                    共 <strong className='text-gray-900 dark:text-gray-100'>{favoriteStats.total}</strong> 项
                  </span>
                  {favoriteStats.movie > 0 && (
                    <span className='px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full'>
                      电影 {favoriteStats.movie}
                    </span>
                  )}
                  {favoriteStats.tv > 0 && (
                    <span className='px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full'>
                      剧集 {favoriteStats.tv}
                    </span>
                  )}
                  {favoriteStats.anime > 0 && (
                    <span className='px-3 py-1 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded-full'>
                      动漫 {favoriteStats.anime}
                    </span>
                  )}
                  {favoriteStats.shortdrama > 0 && (
                    <span className='px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 rounded-full'>
                      短剧 {favoriteStats.shortdrama}
                    </span>
                  )}
                  {favoriteStats.live > 0 && (
                    <span className='px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-full'>
                      直播 {favoriteStats.live}
                    </span>
                  )}
                  {favoriteStats.variety > 0 && (
                    <span className='px-3 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-full'>
                      综艺 {favoriteStats.variety}
                    </span>
                  )}
                </div>
              )}

              {/* 筛选标签 */}
              {favoriteItems.length > 0 && (
                <div className='mb-4 flex flex-wrap gap-2'>
                  {[
                    { key: 'all' as const, label: '全部', icon: '📚' },
                    { key: 'movie' as const, label: '电影', icon: '🎬' },
                    { key: 'tv' as const, label: '剧集', icon: '📺' },
                    { key: 'anime' as const, label: '动漫', icon: '🎌' },
                    { key: 'shortdrama' as const, label: '短剧', icon: '🎭' },
                    { key: 'live' as const, label: '直播', icon: '📡' },
                    { key: 'variety' as const, label: '综艺', icon: '🎪' },
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setFavoriteFilter(key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        favoriteFilter === key
                          ? 'bg-linear-to-r from-blue-500 to-purple-500 text-white shadow-lg scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className='mr-1'>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* 排序选项 */}
              {favoriteItems.length > 0 && (
                <div className='mb-4 flex items-center gap-2 text-sm'>
                  <span className='text-gray-600 dark:text-gray-400'>排序：</span>
                  <div className='flex gap-2'>
                    {[
                      { key: 'recent' as const, label: '最近添加' },
                      { key: 'title' as const, label: '标题 A-Z' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setFavoriteSortBy(key)}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          favoriteSortBy === key
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                {(() => {
                  // 筛选
                  let filtered = favoriteItems;
                  if (favoriteFilter === 'movie') {
                    filtered = favoriteItems.filter(item => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'movie';
                      // 向后兼容：没有 type 时用 episodes 判断
                      if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
                      if (item.source === 'bangumi') return false; // 排除动漫
                      if (item.origin === 'live') return false; // 排除直播
                      // vod 来源：按集数判断
                      return item.episodes === 1;
                    });
                  } else if (favoriteFilter === 'tv') {
                    filtered = favoriteItems.filter(item => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'tv';
                      // 向后兼容：没有 type 时用 episodes 判断
                      if (item.source === 'shortdrama' || item.source_name === '短剧') return false;
                      if (item.source === 'bangumi') return false; // 排除动漫
                      if (item.origin === 'live') return false; // 排除直播
                      // vod 来源：按集数判断
                      return item.episodes > 1;
                    });
                  } else if (favoriteFilter === 'anime') {
                    filtered = favoriteItems.filter(item => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'anime';
                      // 向后兼容：用 source 判断
                      return item.source === 'bangumi';
                    });
                  } else if (favoriteFilter === 'shortdrama') {
                    filtered = favoriteItems.filter(item => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'shortdrama';
                      // 向后兼容：用 source 判断
                      return item.source === 'shortdrama' || item.source_name === '短剧';
                    });
                  } else if (favoriteFilter === 'live') {
                    filtered = favoriteItems.filter(item => item.origin === 'live');
                  } else if (favoriteFilter === 'variety') {
                    filtered = favoriteItems.filter(item => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'variety';
                      // 向后兼容：暂无 fallback
                      return false;
                    });
                  }

                  // 排序
                  if (favoriteSortBy === 'title') {
                    filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
                  }
                  // 'recent' 已经在 updateFavoriteItems 中按 save_time 排序了

                  return filtered.map((item) => {
                  // 智能计算即将上映状态
                  let calculatedRemarks = item.remarks;

                  if (item.releaseDate) {
                    // 使用字符串比较（YYYY-MM-DD 格式可以直接比较）
                    const releaseDate = item.releaseDate; // "YYYY-MM-DD"

                    if (releaseDate < today) {
                      // 已上映：计算天数差
                      const releaseParts = releaseDate.split('-').map(Number);
                      const todayParts = today.split('-').map(Number);
                      const releaseMs = new Date(releaseParts[0], releaseParts[1] - 1, releaseParts[2]).getTime();
                      const todayMs = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
                      const daysAgo = Math.floor((todayMs - releaseMs) / (1000 * 60 * 60 * 24));
                      calculatedRemarks = `已上映${daysAgo}天`;
                    } else if (releaseDate === today) {
                      calculatedRemarks = '今日上映';
                    } else {
                      // 即将上映：计算天数差
                      const releaseParts = releaseDate.split('-').map(Number);
                      const todayParts = today.split('-').map(Number);
                      const releaseMs = new Date(releaseParts[0], releaseParts[1] - 1, releaseParts[2]).getTime();
                      const todayMs = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
                      const daysUntil = Math.ceil((releaseMs - todayMs) / (1000 * 60 * 60 * 24));
                      calculatedRemarks = `${daysUntil}天后上映`;
                    }
                  }

                  return (
                    <div key={item.id + item.source} className='w-full'>
                      <VideoCard
                        query={item.search_title}
                        {...item}
                        from='favorite'
                        remarks={calculatedRemarks}
                      />
                    </div>
                  );
                })})()}
                {favoriteItems.length === 0 && (
                  <div className='col-span-full flex flex-col items-center justify-center py-16 px-4'>
                    {/* SVG 插画 - 空收藏夹 */}
                    <div className='mb-6 relative'>
                      <div className='absolute inset-0 bg-linear-to-r from-pink-300 to-purple-300 dark:from-pink-600 dark:to-purple-600 opacity-20 blur-3xl rounded-full animate-pulse'></div>
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

              {/* 确认对话框 */}
              <ConfirmDialog
                isOpen={showClearFavoritesDialog}
                title="确认清空收藏"
                message={`确定要清空所有收藏吗？\n\n这将删除 ${favoriteItems.length} 项收藏，此操作无法撤销。`}
                confirmText="确认清空"
                cancelText="取消"
                variant="danger"
                onConfirm={() => {
                  // 🚀 使用 mutation.mutate() 清空收藏
                  // 特性：立即清空 UI（乐观更新），失败时自动回滚
                  clearFavoritesMutation.mutate();
                  setShowClearFavoritesDialog(false);
                }}
                onCancel={() => setShowClearFavoritesDialog(false)}
              />
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
                        backdrop: movie.backdrop,
                        trailerUrl: movie.trailerUrl,
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
                        backdrop: show.backdrop,
                        trailerUrl: show.trailerUrl,
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
                        backdrop: show.backdrop,
                        trailerUrl: show.trailerUrl,
                        description: show.plot_summary,
                        year: show.year,
                        rate: show.rate,
                        douban_id: Number(show.id),
                        type: 'variety',
                      })),
                      // 豆瓣动漫
                      ...hotAnime.slice(0, 1).map((anime) => ({
                        id: anime.id,
                        title: anime.title,
                        poster: anime.poster,
                        backdrop: anime.backdrop,
                        trailerUrl: anime.trailerUrl,
                        description: anime.plot_summary,
                        year: anime.year,
                        rate: anime.rate,
                        douban_id: Number(anime.id),
                        type: 'anime',
                      }))
                    ]}
                    autoPlayInterval={8000}
                    showControls={true}
                    showIndicators={true}
                    enableVideo={!(window as any).RUNTIME_CONFIG?.DISABLE_HERO_TRAILER}
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

                  {/* Tab 切换 */}
                  <div className='mb-4 flex gap-2'>
                    {[
                      { key: 'all', label: '全部', count: upcomingReleases.length },
                      { key: 'movie', label: '电影', count: upcomingReleases.filter(r => r.type === 'movie').length },
                      { key: 'tv', label: '电视剧', count: upcomingReleases.filter(r => r.type === 'tv').length },
                    ].map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() => setUpcomingFilter(key as 'all' | 'movie' | 'tv')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          upcomingFilter === key
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                        {count > 0 && (
                          <span className={`ml-1.5 text-xs ${
                            upcomingFilter === key
                              ? 'text-white/80'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            ({count})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <ScrollableRow enableVirtualization={true}>
                    {upcomingReleases
                      .filter(release => upcomingFilter === 'all' || release.type === upcomingFilter)
                      .map((release, index) => {
                        // 计算距离上映还有几天（使用字符串比较）
                        const releaseDate = release.releaseDate; // "YYYY-MM-DD"

                        let remarksText;
                        if (releaseDate < today) {
                          // 已上映：计算天数差
                          const releaseParts = releaseDate.split('-').map(Number);
                          const todayParts = today.split('-').map(Number);
                          const releaseMs = new Date(releaseParts[0], releaseParts[1] - 1, releaseParts[2]).getTime();
                          const todayMs = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
                          const daysAgo = Math.floor((todayMs - releaseMs) / (1000 * 60 * 60 * 24));
                          remarksText = `已上映${daysAgo}天`;
                        } else if (releaseDate === today) {
                          remarksText = '今日上映';
                        } else {
                          // 即将上映：计算天数差
                          const releaseParts = releaseDate.split('-').map(Number);
                          const todayParts = today.split('-').map(Number);
                          const releaseMs = new Date(releaseParts[0], releaseParts[1] - 1, releaseParts[2]).getTime();
                          const todayMs = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
                          const daysUntil = Math.ceil((releaseMs - todayMs) / (1000 * 60 * 60 * 24));
                          remarksText = `${daysUntil}天后上映`;
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
                            releaseDate={release.releaseDate}
                            query={release.title}
                            episodes={release.episodes || (release.type === 'tv' ? undefined : 1)}
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
                <ScrollableRow enableVirtualization={true}>
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
                          source='douban'
                          id={movie.id}
                          source_name='豆瓣'
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
                <ScrollableRow enableVirtualization={true}>
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
                          source='douban'
                          id={show.id}
                          source_name='豆瓣'
                          title={show.title}
                          poster={show.poster}
                          douban_id={Number(show.id)}
                          rate={show.rate}
                          year={show.year}
                          type='tv'
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
                <ScrollableRow enableVirtualization={true}>
                  {loading
                    ? // 加载状态显示灰色占位数据
                    Array.from({ length: 8 }).map((_, index) => (
                      <SkeletonCard key={index} />
                    ))
                    : // 展示当前日期的番剧
                    todayAnimes.map((anime, index) => (
                        <div
                          key={`${anime.id}-${index}`}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='bangumi'
                            id={anime.id.toString()}
                            source_name='Bangumi'
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
                      ))}
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
                <ScrollableRow enableVirtualization={true}>
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
                          source='douban'
                          id={show.id}
                          source_name='豆瓣'
                          title={show.title}
                          poster={show.poster}
                          douban_id={Number(show.id)}
                          rate={show.rate}
                          year={show.year}
                          type='variety'
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
                <ScrollableRow enableVirtualization={true}>
                  {loading
                    ? // 加载状态显示灰色占位数据
                    Array.from({ length: 8 }).map((_, index) => (
                      <SkeletonCard key={index} />
                    ))
                    : // 显示真实数据
                    hotShortDramas.map((drama, index) => (
                      <ShortDramaCard
                        key={index}
                        drama={drama}
                        className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                      />
                    ))}
                </ScrollableRow>
              </section>
            </>
          )}
        </div>
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${showAnnouncement ? '' : 'opacity-0 pointer-events-none'
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
            <div className='mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
                提示
              </h3>
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
              className='w-full rounded-lg bg-linear-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
            >
              我知道了
            </button>
          </div>
        </div>
      )}
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
