'use client';

/**
 * 追番更新检查的 TanStack Query Hook
 *
 * 功能：
 * - 自动检查用户观看过的剧集是否有新集数更新
 * - 使用 TanStack Query 管理数据获取和缓存
 * - 替代 watching-updates.ts 的手动缓存实现
 *
 * 工作原理：
 * 1. 获取所有播放记录
 * 2. 获取数据源映射表
 * 3. 并发检查每个剧集的最新集数
 * 4. 对比原始集数，判断是否有更新
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePlayRecordsArrayQuery } from './usePlayRecordsQuery';
import { useSourceMapQuery } from './useSourcesQuery';
import { useRemindersQuery } from './useRemindersQuery';
import type { PlayRecord } from '@/lib/types';
import type { Reminder } from '@/lib/db.client';

// ============================================================================
// Constants
// ============================================================================

const WATCHING_UPDATES_CACHE_KEY = 'moontv_watching_updates';

// ============================================================================
// Types
// ============================================================================

export interface WatchingUpdate {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  continueWatchingCount: number;
  newReleasesCount: number;
  updatedSeries: {
    title: string;
    source_name: string;
    year: string;
    cover: string;
    sourceKey: string;
    videoId: string;
    currentEpisode: number;
    totalEpisodes: number;
    hasNewEpisode: boolean;
    hasContinueWatching: boolean;
    hasNewRelease: boolean;
    newEpisodes?: number;
    remainingEpisodes?: number;
    latestEpisodes?: number;
    remarks?: string;
    releaseDate?: string;
  }[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 获取观看时的原始总集数，如果没有记录则使用当前播放记录中的集数
 * 关键修复：对于旧数据，同步修复original_episodes，避免被后续更新覆盖
 */
async function getOriginalEpisodes(record: PlayRecord & { key: string }, videoId: string, recordKey: string): Promise<number> {
  // 添加详细调试信息
  console.log(`🔍 getOriginalEpisodes 调试信息 - ${record.title}:`, {
    'record.original_episodes': record.original_episodes,
    'record.total_episodes': record.total_episodes,
    '类型检查': typeof record.original_episodes,
    '完整记录': record
  });

  // 🔑 关键修复：不信任内存中的 original_episodes（可能来自缓存）
  // 始终从数据库重新读取最新的 original_episodes
  try {
    console.log(`🔍 从数据库读取最新的原始集数: ${record.title}`);
    const freshRecordsResponse = await fetch('/api/playrecords');
    if (freshRecordsResponse.ok) {
      const freshRecords = await freshRecordsResponse.json();
      const freshRecord = freshRecords[recordKey];

      if (freshRecord?.original_episodes && freshRecord.original_episodes > 0) {
        console.log(`📚 从数据库读取到最新原始集数: ${record.title} = ${freshRecord.original_episodes}集 (当前播放记录: ${record.total_episodes}集)`);
        return freshRecord.original_episodes;
      }
    }
  } catch (error) {
    console.warn(`⚠️ 从数据库读取原始集数失败: ${record.title}，使用内存值`, error);
  }

  // 备用方案：如果数据库读取失败，使用内存中的值
  if (record.original_episodes && record.original_episodes > 0) {
    console.log(`📚 使用内存中的原始集数: ${record.title} = ${record.original_episodes}集 (当前播放记录: ${record.total_episodes}集)`);
    return record.original_episodes;
  }

  // 🔑 如果数据库中也没有 original_episodes，使用当前 total_episodes
  // 但不要写回数据库！只返回值，让首次保存时自然设置
  if ((record.original_episodes === undefined || record.original_episodes === null) && record.total_episodes > 0) {
    console.log(`⚠️ ${record.title} 缺少原始集数，使用当前值 ${record.total_episodes}集（不写入数据库）`);
    return record.total_episodes;
  }

  // 都没有的话，使用当前播放记录集数（最后的fallback）
  console.log(`⚠️ 该剧集未找到原始集数记录，使用当前播放记录集数: ${record.title} = ${record.total_episodes}集`);
  return record.total_episodes;
}

/**
 * 检查单个剧集的更新状态
 */
async function checkSingleRecordUpdate(
  record: PlayRecord & { key: string },
  videoId: string,
  sourceKey: string,
): Promise<{
  hasUpdate: boolean;
  hasNewEpisode: boolean;
  hasContinueWatching: boolean;
  hasNewRelease: boolean;
  newEpisodes: number;
  remainingEpisodes: number;
  latestEpisodes: number;
}> {
  try {
    // 调用 API 获取最新详情（使用10分钟时间戳分片缓存）
    // 将时间戳向下取整到10分钟，同一个10分钟内的请求会命中CDN缓存
    // 这样既能获取较新的数据，又能减少对视频源的请求压力
    const cacheKey = Math.floor(Date.now() / 600000) * 600000; // 600000ms = 10分钟
    const apiUrl = `/api/detail?source=${sourceKey}&id=${videoId}&_t=${cacheKey}`;
    console.log(`🔍 [追番更新] ${record.title} 调用API:`, apiUrl);
    const response = await fetch(apiUrl, {
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn(`❌ [追番更新] 获取${record.title}详情失败:`, response.status);
      return {
        hasUpdate: false,
        hasNewEpisode: false,
        hasContinueWatching: false,
        hasNewRelease: false,
        newEpisodes: 0,
        remainingEpisodes: 0,
        latestEpisodes: record.total_episodes,
      };
    }

    const detailData = await response.json();
    // 从 episodes 数组长度获取最新集数（API 返回的是 episodes 数组，不是 total 字段）
    const latestEpisodes = detailData.episodes ? detailData.episodes.length : 0;

    // 添加详细调试信息
    console.log(`📊 [追番更新] ${record.title} API检查详情:`, {
      'API返回集数': latestEpisodes,
      '当前观看到': record.index,
      '播放记录集数': record.total_episodes
    });

    // 获取观看时的原始总集数（不会被自动更新影响）
    const recordKey = record.key;
    const originalTotalEpisodes = await getOriginalEpisodes(record, videoId, recordKey);

    console.log(`📊 [追番更新] ${record.title} 集数对比:`, {
      '原始集数': originalTotalEpisodes,
      '当前播放记录集数': record.total_episodes,
      'API返回集数': latestEpisodes
    });

    // 检查两种情况：
    // 1. 新集数更新：API返回的集数比观看时的原始集数多
    // 只需要比较原始集数，因为播放记录会被自动更新，不能作为判断依据
    const hasUpdate = latestEpisodes > originalTotalEpisodes;
    const newEpisodes = hasUpdate ? latestEpisodes - originalTotalEpisodes : 0;

    // 计算保护后的集数（防止API缓存问题导致集数回退）
    const protectedTotalEpisodes = Math.max(latestEpisodes, originalTotalEpisodes, record.total_episodes);

    // 2. 继续观看提醒：用户还没看完现有集数（使用保护后的集数）
    const hasContinueWatching = record.index < protectedTotalEpisodes;
    const remainingEpisodes = hasContinueWatching ? protectedTotalEpisodes - record.index : 0;

    // 检查是否为新上映（原始集数为0或很少，现在有集数了）
    const hasNewRelease = originalTotalEpisodes <= 1 && latestEpisodes > 1;

    // 如果API返回的集数少于原始记录的集数，说明可能是API缓存问题
    if (latestEpisodes < originalTotalEpisodes) {
      console.warn(`⚠️ [追番更新] ${record.title} API返回集数(${latestEpisodes})少于原始记录(${originalTotalEpisodes})，可能是API缓存问题`);
    }

    if (hasUpdate) {
      console.log(`✨ [追番更新] ${record.title} 发现新集数: ${originalTotalEpisodes} -> ${latestEpisodes} 集，新增${newEpisodes}集`);

      if (latestEpisodes > record.total_episodes) {
        console.log(`📊 [追番更新] 检测到集数差异: ${record.title} 播放记录${record.total_episodes}集 < API最新${latestEpisodes}集`);
        console.log(`✅ [追番更新] 已记录新集数信息，等待用户实际观看时自动同步`);
      }
    }

    if (hasContinueWatching) {
      console.log(`📺 [追番更新] ${record.title} 继续观看提醒: 当前第${record.index}集，共${protectedTotalEpisodes}集，还有${remainingEpisodes}集未看`);
    }

    // 输出详细的检测结果
    console.log(`✓ [追番更新] ${record.title} 最终检测结果:`, {
      hasUpdate,
      hasContinueWatching,
      newEpisodes,
      remainingEpisodes,
      '原始集数': originalTotalEpisodes,
      '当前播放记录集数': record.total_episodes,
      'API返回集数': latestEpisodes,
      '保护后集数': protectedTotalEpisodes,
      '当前观看到': record.index
    });

    return {
      hasUpdate,
      hasNewEpisode: hasUpdate,
      hasContinueWatching,
      hasNewRelease,
      newEpisodes,
      remainingEpisodes,
      latestEpisodes: protectedTotalEpisodes,
    };
  } catch (error) {
    console.error(`❌ [追番更新] 检查${record.title}更新失败:`, error);
    return {
      hasUpdate: false,
      hasNewEpisode: false,
      hasContinueWatching: false,
      hasNewRelease: false,
      newEpisodes: 0,
      remainingEpisodes: 0,
      latestEpisodes: record.total_episodes,
    };
  }
}

// ============================================================================
// Hook: 检查追番更新
// ============================================================================

/**
 * 检查追番更新
 *
 * @example
 * ```tsx
 * function UserMenu() {
 *   const { data: updates, isLoading } = useWatchingUpdatesQuery({
 *     enabled: isOpen && authInfo?.username,
 *   });
 *
 *   if (updates?.hasUpdates) {
 *     return <div>{updates.updatedCount}部有新集</div>;
 *   }
 * }
 * ```
 */
export function useWatchingUpdatesQuery(options?: {
  enabled?: boolean;
  forceRefresh?: boolean;
}) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['watchingUpdates', options?.forceRefresh ? Date.now() : 'cached'] as const,
    queryFn: async (): Promise<WatchingUpdate> => {
      console.log('🔄 [追番更新] 开始检查追番更新...');

      // 🔑 在 queryFn 内部获取依赖数据，确保每次都是最新的
      const playRecordsArray = await queryClient.ensureQueryData({
        queryKey: ['playRecords', 'array'],
        queryFn: async () => {
          const response = await fetch('/api/playrecords');
          if (!response.ok) throw new Error('Failed to fetch play records');
          const data = await response.json() as Record<string, PlayRecord>;
          return Object.entries(data)
            .map(([key, record]) => ({ ...record, key }))
            .sort((a, b) => (b.save_time || 0) - (a.save_time || 0));
        },
      });

      const sourceMap = await queryClient.ensureQueryData({
        queryKey: ['sources', 'map'],
        queryFn: async () => {
          const response = await fetch('/api/sources');
          if (!response.ok) throw new Error('Failed to fetch sources');
          const sources = await response.json();
          const map = new Map<string, string>();
          sources.forEach((source: any) => {
            if (source.name && source.key) {
              map.set(source.name, source.key);
            }
          });
          return map;
        },
      });

      const reminders = await queryClient.ensureQueryData({
        queryKey: ['reminders'],
        queryFn: async () => {
          const response = await fetch('/api/reminders');
          if (!response.ok) throw new Error('Failed to fetch reminders');
          return await response.json() as Record<string, Reminder>;
        },
      });

      let updatedCount = 0;
      let continueWatchingCount = 0;
      let newReleasesCount = 0;
      const updatedSeries: WatchingUpdate['updatedSeries'] = [];

      // 检查播放记录更新
      if (!playRecordsArray || playRecordsArray.length === 0) {
        console.log('⚠️ [追番更新] 无播放记录，跳过播放记录更新检查');
      } else {
        console.log(`📋 [追番更新] 找到 ${playRecordsArray.length} 条播放记录`);

        // 筛选多集剧的记录（与Alpha版本保持一致，不限制是否看完）
        const candidateRecords = playRecordsArray.filter((record) => {
          return record.total_episodes > 1;
        });

        console.log(`🎯 [追番更新] 找到 ${candidateRecords.length} 个可能有更新的剧集`);
        if (candidateRecords.length > 0) {
          console.log('[追番更新] 候选记录详情:', candidateRecords.map(r => ({ title: r.title, index: r.index, total: r.total_episodes })));
        }

        if (candidateRecords.length > 0) {
          // 并发检查所有记录的更新状态
          const updatePromises = candidateRecords.map(async (record) => {
        try {
          // 从存储key中解析出videoId
          const [sourceName, videoId] = record.key.split('+');

          // 映射数据源名称到 key
          let sourceKey = sourceName;
          if (sourceMap) {
            const mappedSource = sourceMap.get(sourceName);
            if (mappedSource) {
              sourceKey = mappedSource;
              console.log(`[追番更新] 映射数据源: ${sourceName} -> ${sourceKey}`);
            }
            // 如果找不到映射，说明 sourceName 本身就是 API key，直接使用
          }

          const updateInfo = await checkSingleRecordUpdate(record, videoId, sourceKey);

          // 使用从 checkSingleRecordUpdate 返回的 protectedTotalEpisodes（已经包含了保护机制）
          const protectedTotalEpisodes = updateInfo.latestEpisodes;

          const seriesInfo = {
            title: record.title,
            source_name: record.source_name,
            year: record.year,
            cover: record.cover,
            sourceKey,
            videoId,
            currentEpisode: record.index,
            totalEpisodes: protectedTotalEpisodes,
            hasNewEpisode: updateInfo.hasNewEpisode,
            hasContinueWatching: updateInfo.hasContinueWatching,
            hasNewRelease: updateInfo.hasNewRelease,
            newEpisodes: updateInfo.newEpisodes,
            remainingEpisodes: updateInfo.remainingEpisodes,
            latestEpisodes: updateInfo.latestEpisodes,
            remarks: record.remarks
          };

          updatedSeries.push(seriesInfo);

          // 统计更新
          if (updateInfo.hasNewEpisode) {
            updatedCount++;
          }
          if (updateInfo.hasContinueWatching) {
            continueWatchingCount++;
            console.log(`[追番更新] ${record.title} 计入继续观看计数，当前总数: ${continueWatchingCount}`);
          }
          if (updateInfo.hasNewRelease) {
            newReleasesCount++;
          }

          console.log(`[追番更新] ${record.title} 检查结果: hasUpdate=${updateInfo.hasUpdate}, hasContinueWatching=${updateInfo.hasContinueWatching}`);
          return seriesInfo;
        } catch (error) {
          console.error(`[追番更新] 检查${record.title}更新失败:`, error);
          // 返回默认状态
          const [sourceName, videoId] = record.key.split('+');
          let sourceKey = sourceName;
          if (sourceMap) {
            const mappedSource = sourceMap.get(sourceName);
            if (mappedSource) {
              sourceKey = mappedSource;
            }
          }
          const seriesInfo = {
            title: record.title,
            source_name: record.source_name,
            year: record.year,
            cover: record.cover,
            sourceKey,
            videoId,
            currentEpisode: record.index,
            totalEpisodes: record.total_episodes,
            hasNewEpisode: false,
            hasContinueWatching: false,
            hasNewRelease: false,
            newEpisodes: 0,
            remainingEpisodes: 0,
            latestEpisodes: record.total_episodes,
            remarks: record.remarks
          };
          updatedSeries.push(seriesInfo);
          return seriesInfo;
        }
      });

          // 等待所有检查完成
          await Promise.all(updatePromises);
        }
      }

      // 🎬 检查想看中的新上映内容
      console.log('🎬 开始检查想看中的新上映内容...');
      try {
        if (reminders) {
          // 使用 Asia/Shanghai 时区获取今天的日期
          const today = new Date().toLocaleDateString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).replace(/\//g, '-'); // 转换为 YYYY-MM-DD 格式

          // 筛选有releaseDate且已上映的想看内容
          const newReleases = Object.entries(reminders)
            .filter(([key, reminder]) => {
              // 必须有上映日期
              if (!reminder.releaseDate) return false;

              // 上映日期必须<=今天（已上映）
              if (reminder.releaseDate > today) return false;

              // 检查是否已经在播放记录中（避免重复）
              const isInPlayRecords = playRecordsArray && playRecordsArray.some(r =>
                r.title === reminder.title && r.year === reminder.year
              );

              return !isInPlayRecords;
            })
            .map(([key, reminder]) => {
              const [sourceName, videoId] = key.split('+');

              // 重新计算 remarks，显示已上映多少天
              let remarksText = '已上映';
              if (reminder.releaseDate) {
                const releaseDate = reminder.releaseDate; // "YYYY-MM-DD"

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
                }
              }

              return {
                title: reminder.title,
                source_name: reminder.source_name,
                year: reminder.year,
                cover: reminder.cover,
                sourceKey: sourceName || 'unknown',
                videoId: videoId || 'unknown',
                currentEpisode: 0,
                totalEpisodes: reminder.total_episodes || 0,
                hasNewEpisode: false,
                hasContinueWatching: false,
                hasNewRelease: true, // 标记为新上映
                newEpisodes: 0,
                remainingEpisodes: 0,
                latestEpisodes: reminder.total_episodes || 0,
                remarks: remarksText,
                releaseDate: reminder.releaseDate,
              };
            });

          if (newReleases.length > 0) {
            console.log(`🎬 [追番更新] 发现 ${newReleases.length} 部新上映的想看内容`);
            updatedSeries.push(...newReleases);
            newReleasesCount = newReleases.length;
          } else {
            console.log('🎬 [追番更新] 没有新上映的想看内容');
          }
        }
      } catch (error) {
        console.error('[追番更新] 检查新上映内容失败:', error);
      }

      // 🔧 修复：对 updatedSeries 进行排序，确保每次顺序一致，防止卡片闪烁
      // 排序规则：
      // 1. 新上映的排在最前面
      // 2. 有新剧集的排在中间
      // 3. 需要继续观看的排在后面
      // 4. 相同类型按标题字母顺序排序
      updatedSeries.sort((a, b) => {
        // 优先级1: 新上映的排在最前面
        if (a.hasNewRelease !== b.hasNewRelease) {
          return a.hasNewRelease ? -1 : 1;
        }
        // 优先级2: 有新剧集的排在前面
        if (a.hasNewEpisode !== b.hasNewEpisode) {
          return a.hasNewEpisode ? -1 : 1;
        }
        // 优先级3: 需要继续观看的排在后面
        if (a.hasContinueWatching !== b.hasContinueWatching) {
          return a.hasContinueWatching ? -1 : 1;
        }
        // 优先级4: 按标题排序
        return a.title.localeCompare(b.title, 'zh-CN');
      });

      const hasUpdates = updatedCount > 0 || continueWatchingCount > 0 || newReleasesCount > 0;

      console.log(`✅ [追番更新] 检查完成: ${hasUpdates ? `发现${newReleasesCount}部新上映，${updatedCount}部剧集有新集数更新，${continueWatchingCount}部剧集需要继续观看` : '暂无更新'}`);

      const result = {
        hasUpdates,
        timestamp: Date.now(),
        updatedCount,
        continueWatchingCount,
        newReleasesCount,
        updatedSeries,
      };

      // 持久化到 localStorage（兼容旧实现的缓存机制）
      try {
        if (typeof window !== 'undefined' && localStorage) {
          localStorage.setItem(WATCHING_UPDATES_CACHE_KEY, JSON.stringify(result));
          console.log('[追番更新] 结果已保存到 localStorage');
        }
      } catch (error) {
        console.warn('[追番更新] 保存到 localStorage 失败:', error);
      }

      return result;
    },
    // 30分钟缓存，避免频繁检查
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    // 30分钟自动刷新（后台定时检查）
    refetchInterval: 30 * 60 * 1000,
    // 只在窗口获得焦点时才自动刷新
    refetchIntervalInBackground: false,
    // 从 localStorage 读取初始数据（页面刷新后仍能显示）
    initialData: () => {
      try {
        if (typeof window !== 'undefined' && localStorage) {
          const cached = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
          if (cached) {
            const data = JSON.parse(cached) as WatchingUpdate;
            console.log('[追番更新] 从 localStorage 加载缓存数据');
            return data;
          }
        }
      } catch (error) {
        console.warn('[追番更新] 从 localStorage 读取失败:', error);
      }
      return undefined;
    },
    // 只在启用时执行
    enabled: options?.enabled !== false,
    // 不自动重试，避免过多请求
    retry: false,
  });
}

/**
 * 手动触发追番更新检查
 */
export function useRefreshWatchingUpdates() {
  const queryClient = useQueryClient();

  return () => {
    // 强制刷新播放记录（type: 'all' 确保即使 inactive 也会刷新）
    queryClient.invalidateQueries({
      queryKey: ['playRecords'],
      refetchType: 'all'
    });
    // 强制刷新想看列表（用于检查新上映）
    queryClient.invalidateQueries({
      queryKey: ['reminders'],
      refetchType: 'all'
    });
    // 强制刷新追番更新（type: 'all' 确保即使 inactive 也会刷新）
    queryClient.invalidateQueries({
      queryKey: ['watchingUpdates'],
      refetchType: 'all'
    });
  };
}
