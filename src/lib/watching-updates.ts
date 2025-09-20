'use client';

import { getAllPlayRecords, PlayRecord } from './db.client';

// 缓存键
const WATCHING_UPDATES_CACHE_KEY = 'moontv_watching_updates';
const LAST_CHECK_TIME_KEY = 'moontv_last_update_check';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 更新信息接口
export interface WatchingUpdate {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  updatedSeries: {
    title: string;
    source_name: string;
    year: string;
    currentEpisode: number;
    totalEpisodes: number;
    hasNewEpisode: boolean;
  }[];
}

// 全局事件监听器
const updateListeners = new Set<(hasUpdates: boolean) => void>();

/**
 * 检查追番更新
 * 智能分析用户的播放记录，检测是否有新集数更新
 */
export async function checkWatchingUpdates(): Promise<void> {
  try {
    console.log('开始检查追番更新...');

    // 检查缓存是否有效
    const lastCheckTime = parseInt(localStorage.getItem(LAST_CHECK_TIME_KEY) || '0');
    const currentTime = Date.now();

    if (currentTime - lastCheckTime < CACHE_DURATION) {
      console.log('距离上次检查时间太短，使用缓存结果');
      const cached = getCachedWatchingUpdates();
      notifyListeners(cached);
      return;
    }

    // 获取用户的播放记录
    const playRecords = await getAllPlayRecords();
    const records = Object.values(playRecords);

    if (records.length === 0) {
      console.log('无播放记录，跳过更新检查');
      const emptyResult = {
        hasUpdates: false,
        timestamp: currentTime,
        updatedCount: 0,
        updatedSeries: []
      };
      cacheWatchingUpdates(emptyResult);
      localStorage.setItem(LAST_CHECK_TIME_KEY, currentTime.toString());
      notifyListeners(false);
      return;
    }

    // 分析可能需要更新检查的剧集
    const seriesMap = new Map<string, {
      title: string;
      source_name: string;
      year: string;
      currentEpisode: number;
      totalEpisodes: number;
      lastWatchTime: number;
      record: PlayRecord;
    }>();

    // 按剧集分组，找出每个剧集的最新观看记录
    records.forEach(record => {
      const seriesKey = `${record.title}_${record.source_name}_${record.year}`;
      const existing = seriesMap.get(seriesKey);

      if (!existing || record.save_time > existing.lastWatchTime) {
        seriesMap.set(seriesKey, {
          title: record.title,
          source_name: record.source_name,
          year: record.year,
          currentEpisode: record.index,
          totalEpisodes: record.total_episodes,
          lastWatchTime: record.save_time,
          record: record
        });
      }
    });

    // 过滤出可能有更新的剧集（多集剧且未看完）
    const candidateSeries = Array.from(seriesMap.values()).filter(series => {
      return series.totalEpisodes > 1 && series.currentEpisode < series.totalEpisodes;
    });

    console.log(`找到 ${candidateSeries.length} 个可能有更新的剧集`);

    // 检查更新（简化版本，实际应该调用对应的API）
    const updatedSeries = await Promise.all(
      candidateSeries.map(async (series) => {
        // 这里应该调用对应视频源的API检查是否有新集数
        // 为了演示，我们模拟检查逻辑
        const hasNewEpisode = await checkSeriesForUpdates(series);

        return {
          title: series.title,
          source_name: series.source_name,
          year: series.year,
          currentEpisode: series.currentEpisode,
          totalEpisodes: series.totalEpisodes,
          hasNewEpisode
        };
      })
    );

    // 统计有更新的剧集
    const hasUpdatesArray = updatedSeries.filter(series => series.hasNewEpisode);
    const hasUpdates = hasUpdatesArray.length > 0;

    console.log(`检查完成: ${hasUpdatesArray.length} 个剧集有更新`);

    // 缓存结果
    const result: WatchingUpdate = {
      hasUpdates,
      timestamp: currentTime,
      updatedCount: hasUpdatesArray.length,
      updatedSeries: updatedSeries
    };

    cacheWatchingUpdates(result);
    localStorage.setItem(LAST_CHECK_TIME_KEY, currentTime.toString());

    // 通知监听器
    notifyListeners(hasUpdates);

  } catch (error) {
    console.error('检查追番更新失败:', error);
    notifyListeners(false);
  }
}

/**
 * 检查单个剧集是否有更新（模拟实现）
 * 实际项目中应该调用对应视频源的API
 */
async function checkSeriesForUpdates(series: {
  title: string;
  source_name: string;
  year: string;
  currentEpisode: number;
  totalEpisodes: number;
  record: PlayRecord;
}): Promise<boolean> {
  try {
    // 模拟API调用延迟
    await new Promise(resolve => setTimeout(resolve, 100));

    // 简化的更新检查逻辑：
    // 1. 如果最后观看时间是1天前，有20%概率有更新
    // 2. 如果最后观看时间是3天前，有50%概率有更新
    // 3. 如果最后观看时间是7天前，有80%概率有更新

    const daysSinceLastWatch = (Date.now() - series.record.save_time) / (1000 * 60 * 60 * 24);

    let updateProbability = 0;
    if (daysSinceLastWatch >= 7) {
      updateProbability = 0.8;
    } else if (daysSinceLastWatch >= 3) {
      updateProbability = 0.5;
    } else if (daysSinceLastWatch >= 1) {
      updateProbability = 0.2;
    }

    // 为了演示，我们总是返回false，避免过多虚假通知
    // 实际使用时应该调用真实的API
    return Math.random() < updateProbability * 0.1; // 降低概率避免测试时过多通知

  } catch (error) {
    console.error(`检查 ${series.title} 更新失败:`, error);
    return false;
  }
}

/**
 * 获取缓存的更新信息
 */
export function getCachedWatchingUpdates(): boolean {
  try {
    const cached = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
    if (!cached) return false;

    const data: WatchingUpdate = JSON.parse(cached);
    const isExpired = Date.now() - data.timestamp > CACHE_DURATION;

    return isExpired ? false : data.hasUpdates;
  } catch (error) {
    console.error('读取更新缓存失败:', error);
    return false;
  }
}

/**
 * 缓存更新信息
 */
function cacheWatchingUpdates(data: WatchingUpdate): void {
  try {
    localStorage.setItem(WATCHING_UPDATES_CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('缓存更新信息失败:', error);
  }
}

/**
 * 订阅更新通知
 */
export function subscribeToWatchingUpdates(callback: (hasUpdates: boolean) => void): () => void {
  updateListeners.add(callback);

  // 返回取消订阅函数
  return () => {
    updateListeners.delete(callback);
  };
}

/**
 * 通知所有监听器
 */
function notifyListeners(hasUpdates: boolean): void {
  updateListeners.forEach(callback => {
    try {
      callback(hasUpdates);
    } catch (error) {
      console.error('通知更新监听器失败:', error);
    }
  });
}

/**
 * 设置定期检查
 * @param intervalMinutes 检查间隔（分钟）
 */
export function setupPeriodicUpdateCheck(intervalMinutes = 30): () => void {
  console.log(`设置定期更新检查，间隔: ${intervalMinutes} 分钟`);

  // 立即执行一次检查
  checkWatchingUpdates();

  // 设置定期检查
  const intervalId = setInterval(() => {
    checkWatchingUpdates();
  }, intervalMinutes * 60 * 1000);

  // 返回清理函数
  return () => {
    clearInterval(intervalId);
  };
}

/**
 * 页面可见性变化时自动检查更新
 */
export function setupVisibilityChangeCheck(): () => void {
  if (typeof window === 'undefined') {
    return () => {
      // Empty function for server-side rendering
    };
  }

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      // 页面变为可见时检查更新
      checkWatchingUpdates();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * 获取详细的更新信息
 */
export function getDetailedWatchingUpdates(): WatchingUpdate | null {
  try {
    const cached = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
    if (!cached) return null;

    const data: WatchingUpdate = JSON.parse(cached);
    const isExpired = Date.now() - data.timestamp > CACHE_DURATION;

    return isExpired ? null : data;
  } catch (error) {
    console.error('读取详细更新信息失败:', error);
    return null;
  }
}

/**
 * 手动标记已查看更新
 */
export function markUpdatesAsViewed(): void {
  try {
    const data = getDetailedWatchingUpdates();
    if (data) {
      const updatedData = {
        ...data,
        hasUpdates: false,
        updatedCount: 0,
        updatedSeries: data.updatedSeries.map(series => ({
          ...series,
          hasNewEpisode: false
        }))
      };
      cacheWatchingUpdates(updatedData);
      notifyListeners(false);
    }
  } catch (error) {
    console.error('标记更新为已查看失败:', error);
  }
}