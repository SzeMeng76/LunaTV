/* eslint-disable no-console */
'use client';

import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { PlayRecord } from '@/lib/db.client';
import {
  clearAllPlayRecords,
  getAllPlayRecords,
  subscribeToDataUpdates,
  forceRefreshPlayRecordsCache,
} from '@/lib/db.client';
import {
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
  checkWatchingUpdates,
  type WatchingUpdate,
} from '@/lib/watching-updates';

import ScrollableRow from '@/components/ScrollableRow';
import SectionTitle from '@/components/SectionTitle';
import VideoCard from '@/components/VideoCard';

interface ContinueWatchingProps {
  className?: string;
}

export default function ContinueWatching({ className }: ContinueWatchingProps) {
  const [playRecords, setPlayRecords] = useState<
    (PlayRecord & { key: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(null);

  // 处理播放记录数据更新的函数
  const updatePlayRecords = (allRecords: Record<string, PlayRecord>) => {
    // 将记录转换为数组并根据 save_time 由近到远排序
    const recordsArray = Object.entries(allRecords).map(([key, record]) => ({
      ...record,
      key,
    }));

    // 按 save_time 降序排序（最新的在前面）
    const sortedRecords = recordsArray.sort(
      (a, b) => b.save_time - a.save_time
    );

    setPlayRecords(sortedRecords);
  };

  useEffect(() => {
    const fetchPlayRecords = async () => {
      try {
        setLoading(true);

        // 从缓存或API获取所有播放记录
        const allRecords = await getAllPlayRecords();
        updatePlayRecords(allRecords);
      } catch (error) {
        console.error('获取播放记录失败:', error);
        setPlayRecords([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayRecords();

    // 监听播放记录更新事件
    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
      }
    );

    return unsubscribe;
  }, []);

  // 获取watching updates数据（仅当有播放记录时）
  useEffect(() => {
    // 只有在有播放记录时才检查更新
    if (loading || playRecords.length === 0) {
      return;
    }

    const updateWatchingUpdates = async () => {
      console.log('ContinueWatching: 开始获取更新数据...');

      // 先尝试从缓存加载（快速显示）
      let updates = getDetailedWatchingUpdates();
      console.log('ContinueWatching: 缓存数据:', updates);

      if (updates) {
        setWatchingUpdates(updates);
        console.log('ContinueWatching: 使用缓存数据');
      }

      // 如果缓存为空，主动检查一次
      if (!updates) {
        console.log('ContinueWatching: 缓存为空，主动检查更新...');
        try {
          await checkWatchingUpdates();
          updates = getDetailedWatchingUpdates();
          setWatchingUpdates(updates);
          console.log('ContinueWatching: 主动检查完成，获得数据:', updates);
        } catch (error) {
          console.error('ContinueWatching: 主动检查更新失败:', error);
        }
      }
    };

    // 初始加载
    updateWatchingUpdates();

    // 🔧 优化：订阅播放记录更新事件，实时同步数据
    const unsubscribePlayRecords = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        console.log('ContinueWatching: 收到播放记录更新事件，立即同步数据');
        updatePlayRecords(newRecords);
      }
    );

    // 订阅watching updates事件
    const unsubscribeWatchingUpdates = subscribeToWatchingUpdatesEvent(() => {
      console.log('ContinueWatching: 收到watching updates更新事件');
      const updates = getDetailedWatchingUpdates();
      setWatchingUpdates(updates);
    });

    return () => {
      unsubscribePlayRecords();
      unsubscribeWatchingUpdates();
    };
  }, [loading, playRecords.length]); // 依赖播放记录加载状态

  // 如果没有播放记录，则不渲染组件
  if (!loading && playRecords.length === 0) {
    return null;
  }

  // 计算播放进度百分比
  const getProgress = (record: PlayRecord) => {
    if (record.total_time === 0) return 0;
    return (record.play_time / record.total_time) * 100;
  };

  // 从 key 中解析 source 和 id
  const parseKey = (key: string) => {
    const [source, id] = key.split('+');
    return { source, id };
  };

  // 检查播放记录是否有新集数更新
  const getNewEpisodesCount = (record: PlayRecord & { key: string }): number => {
    if (!watchingUpdates || !watchingUpdates.updatedSeries) return 0;

    const { source, id } = parseKey(record.key);

    // 在watchingUpdates中查找匹配的剧集
    const matchedSeries = watchingUpdates.updatedSeries.find(series =>
      series.sourceKey === source &&
      series.videoId === id &&
      series.hasNewEpisode
    );

    return matchedSeries ? (matchedSeries.newEpisodes || 0) : 0;
  };

  // 获取最新的总集数（用于显示，不修改原始数据）
  const getLatestTotalEpisodes = (record: PlayRecord & { key: string }): number => {
    if (!watchingUpdates || !watchingUpdates.updatedSeries) return record.total_episodes;

    const { source, id } = parseKey(record.key);

    // 在watchingUpdates中查找匹配的剧集
    const matchedSeries = watchingUpdates.updatedSeries.find(series =>
      series.sourceKey === source &&
      series.videoId === id
    );

    // 如果找到匹配的剧集且有最新集数信息，返回最新集数；否则返回原始集数
    return matchedSeries && matchedSeries.totalEpisodes
      ? matchedSeries.totalEpisodes
      : record.total_episodes;
  };

  return (
    <section className={`mb-8 ${className || ''}`}>
      <div className='mb-4 flex items-center justify-between'>
        <SectionTitle title="继续观看" icon={Clock} iconColor="text-green-500" />
        {!loading && playRecords.length > 0 && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            onClick={async () => {
              await clearAllPlayRecords();
              setPlayRecords([]);
            }}
          >
            清空
          </button>
        )}
      </div>
      <ScrollableRow>
        {loading
          ? // 加载状态显示灰色占位数据
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                  <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                </div>
                <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                <div className='mt-1 h-3 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
              </div>
            ))
          : // 显示真实数据
            playRecords.map((record) => {
              const { source, id } = parseKey(record.key);
              const newEpisodesCount = getNewEpisodesCount(record);
              const latestTotalEpisodes = getLatestTotalEpisodes(record);
              return (
                <div
                  key={record.key}
                  className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44 relative'
                >
                  <VideoCard
                    id={id}
                    title={record.title}
                    poster={record.cover}
                    year={record.year}
                    source={source}
                    source_name={record.source_name}
                    progress={getProgress(record)}
                    episodes={latestTotalEpisodes}
                    currentEpisode={record.index}
                    query={record.search_title}
                    from='playrecord'
                    onDelete={() =>
                      setPlayRecords((prev) =>
                        prev.filter((r) => r.key !== record.key)
                      )
                    }
                    type={latestTotalEpisodes > 1 ? 'tv' : ''}
                    remarks={record.remarks}
                  />
                  {/* 新集数徽章 */}
                  {newEpisodesCount > 0 && (
                    <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-50'>
                      +{newEpisodesCount}集
                    </div>
                  )}
                </div>
              );
            })}
      </ScrollableRow>
    </section>
  );
}
