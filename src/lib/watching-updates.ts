'use client';

import { getAllPlayRecords, PlayRecord, generateStorageKey } from './db.client';

// 缓存键
const WATCHING_UPDATES_CACHE_KEY = 'moontv_watching_updates';
const LAST_CHECK_TIME_KEY = 'moontv_last_update_check';
const ORIGINAL_EPISODES_CACHE_KEY = 'moontv_original_episodes'; // 新增：记录观看时的总集数
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 事件名称
export const WATCHING_UPDATES_EVENT = 'watchingUpdatesChanged';

// 更新信息接口
export interface WatchingUpdate {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  continueWatchingCount: number; // 新增：需要继续观看的剧集数量
  updatedSeries: {
    title: string;
    source_name: string;
    year: string;
    cover: string; // 添加封面属性
    sourceKey: string; // 添加source key
    videoId: string; // 添加video id
    currentEpisode: number;
    totalEpisodes: number;
    hasNewEpisode: boolean;
    hasContinueWatching: boolean; // 新增：是否需要继续观看
    newEpisodes?: number;
    remainingEpisodes?: number; // 新增：剩余集数
    latestEpisodes?: number;
  }[];
}

interface WatchingUpdatesCache {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  continueWatchingCount: number;
  updatedSeries: WatchingUpdate['updatedSeries'];
}

interface ExtendedPlayRecord extends PlayRecord {
  id: string;
  hasUpdate?: boolean;
  newEpisodes?: number;
}

// 全局事件监听器
const updateListeners = new Set<(hasUpdates: boolean) => void>();

/**
 * 检查追番更新
 * 真实API调用检查用户的播放记录，检测是否有新集数更新
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
    const recordsObj = await getAllPlayRecords();
    const records = Object.entries(recordsObj).map(([key, record]) => ({
      ...record,
      id: key
    }));

    if (records.length === 0) {
      console.log('无播放记录，跳过更新检查');
      const emptyResult: WatchingUpdate = {
        hasUpdates: false,
        timestamp: currentTime,
        updatedCount: 0,
        continueWatchingCount: 0,
        updatedSeries: []
      };
      cacheWatchingUpdates(emptyResult);
      localStorage.setItem(LAST_CHECK_TIME_KEY, currentTime.toString());
      notifyListeners(false);
      return;
    }

    // 筛选多集剧的记录（与Alpha版本保持一致，不限制是否看完）
    const candidateRecords = records.filter(record => {
      return record.total_episodes > 1;
    });

    console.log(`找到 ${candidateRecords.length} 个可能有更新的剧集`);
    console.log('候选记录详情:', candidateRecords.map(r => ({ title: r.title, index: r.index, total: r.total_episodes })));

    let hasAnyUpdates = false;
    let updatedCount = 0;
    let continueWatchingCount = 0;
    const updatedSeries: WatchingUpdate['updatedSeries'] = [];

    // 并发检查所有记录的更新状态
    const updatePromises = candidateRecords.map(async (record) => {
      try {
        // 从存储key中解析出videoId
        const [sourceName, videoId] = record.id.split('+');
        const updateInfo = await checkSingleRecordUpdate(record, videoId);

        // 使用从 checkSingleRecordUpdate 返回的 protectedTotalEpisodes（已经包含了保护机制）
        const protectedTotalEpisodes = updateInfo.latestEpisodes;

        const seriesInfo = {
          title: record.title,
          source_name: record.source_name,
          year: record.year,
          cover: record.cover,
          sourceKey: sourceName,
          videoId: videoId,
          currentEpisode: record.index,
          totalEpisodes: protectedTotalEpisodes,
          hasNewEpisode: updateInfo.hasUpdate,
          hasContinueWatching: updateInfo.hasContinueWatching,
          newEpisodes: updateInfo.newEpisodes,
          remainingEpisodes: updateInfo.remainingEpisodes,
          latestEpisodes: updateInfo.latestEpisodes
        };

        updatedSeries.push(seriesInfo);

        if (updateInfo.hasUpdate) {
          hasAnyUpdates = true;
          updatedCount++;
        }

        if (updateInfo.hasContinueWatching) {
          hasAnyUpdates = true;
          continueWatchingCount++;
          console.log(`${record.title} 计入继续观看计数，当前总数: ${continueWatchingCount}`);
        }

        console.log(`${record.title} 检查结果: hasUpdate=${updateInfo.hasUpdate}, hasContinueWatching=${updateInfo.hasContinueWatching}`);
        return seriesInfo;
      } catch (error) {
        console.error(`检查 ${record.title} 更新失败:`, error);
        // 返回默认状态
        const [sourceName, videoId] = record.id.split('+');
        const seriesInfo = {
          title: record.title,
          source_name: record.source_name,
          year: record.year,
          cover: record.cover,
          sourceKey: sourceName,
          videoId: videoId,
          currentEpisode: record.index,
          totalEpisodes: record.total_episodes, // 错误时保持原有集数
          hasNewEpisode: false,
          hasContinueWatching: false,
          newEpisodes: 0,
          remainingEpisodes: 0,
          latestEpisodes: record.total_episodes
        };
        updatedSeries.push(seriesInfo);
        return seriesInfo;
      }
    });

    await Promise.all(updatePromises);

    console.log(`检查完成: ${hasAnyUpdates ? `发现${updatedCount}部剧集有新集数更新，${continueWatchingCount}部剧集需要继续观看` : '暂无更新'}`);

    // 缓存结果
    const result: WatchingUpdate = {
      hasUpdates: hasAnyUpdates,
      timestamp: currentTime,
      updatedCount,
      continueWatchingCount,
      updatedSeries
    };

    cacheWatchingUpdates(result);
    localStorage.setItem(LAST_CHECK_TIME_KEY, currentTime.toString());

    // 通知监听器
    notifyListeners(hasAnyUpdates);

    // 触发全局事件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(WATCHING_UPDATES_EVENT, {
        detail: { hasUpdates: hasAnyUpdates, updatedCount }
      }));
    }

  } catch (error) {
    console.error('检查追番更新失败:', error);
    notifyListeners(false);
  }
}

/**
 * 检查单个剧集的更新状态（调用真实API）
 */
async function checkSingleRecordUpdate(record: PlayRecord, videoId: string): Promise<{ hasUpdate: boolean; hasContinueWatching: boolean; newEpisodes: number; remainingEpisodes: number; latestEpisodes: number }> {
  try {
    let sourceKey = record.source_name;

    // 先尝试获取可用数据源进行映射
    try {
      const sourcesResponse = await fetch('/api/sources');
      if (sourcesResponse.ok) {
        const sources = await sourcesResponse.json();

        // 查找匹配的数据源
        const matchedSource = sources.find((source: any) =>
          source.key === record.source_name ||
          source.name === record.source_name
        );

        if (matchedSource) {
          sourceKey = matchedSource.key;
          console.log(`映射数据源: ${record.source_name} -> ${sourceKey}`);
        } else {
          console.warn(`找不到数据源 ${record.source_name} 的映射，使用原始名称`);
        }
      }
    } catch (mappingError) {
      console.warn('数据源映射失败，使用原始名称:', mappingError);
    }

    // 使用映射后的key调用API（API已默认不缓存，确保集数信息实时更新）
    const apiUrl = `/api/detail?source=${sourceKey}&id=${videoId}`;
    console.log(`${record.title} 调用API获取最新详情:`, apiUrl);
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.warn(`获取${record.title}详情失败:`, response.status);
      return { hasUpdate: false, hasContinueWatching: false, newEpisodes: 0, remainingEpisodes: 0, latestEpisodes: record.total_episodes };
    }

    const detailData = await response.json();
    const latestEpisodes = detailData.episodes ? detailData.episodes.length : 0;

    // 添加详细调试信息
    console.log(`${record.title} API检查详情:`, {
      'API返回集数': latestEpisodes,
      '当前观看到': record.index,
      '播放记录集数': record.total_episodes
    });

    // 获取观看时的原始总集数（不会被自动更新影响）
    const originalTotalEpisodes = getOriginalEpisodes(record, videoId);

    console.log(`${record.title} 集数对比:`, {
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

    // 如果API返回的集数少于原始记录的集数，说明可能是API缓存问题
    if (latestEpisodes < originalTotalEpisodes) {
      console.warn(`${record.title} API返回集数(${latestEpisodes})少于原始记录(${originalTotalEpisodes})，可能是API缓存问题`);
    }

    if (hasUpdate) {
      console.log(`${record.title} 发现新集数: ${originalTotalEpisodes} -> ${latestEpisodes} 集，新增${newEpisodes}集`);
    }

    if (hasContinueWatching) {
      console.log(`${record.title} 继续观看提醒: 当前第${record.index}集，共${protectedTotalEpisodes}集，还有${remainingEpisodes}集未看`);
    }

    // 输出详细的检测结果
    console.log(`${record.title} 最终检测结果:`, {
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
      hasContinueWatching,
      newEpisodes,
      remainingEpisodes,
      latestEpisodes: protectedTotalEpisodes
    };
  } catch (error) {
    console.error(`检查${record.title}更新失败:`, error);
    return { hasUpdate: false, hasContinueWatching: false, newEpisodes: 0, remainingEpisodes: 0, latestEpisodes: record.total_episodes };
  }
}

/**
 * 获取观看时的原始总集数，如果没有记录则使用当前播放记录中的集数
 */
function getOriginalEpisodes(record: PlayRecord, videoId: string): number {
  // 优先使用播放记录中保存的原始集数
  if (record.original_episodes && record.original_episodes > 0) {
    console.log(`📚 从播放记录读取原始集数: ${record.title} = ${record.original_episodes}集 (当前播放记录: ${record.total_episodes}集)`);
    return record.original_episodes;
  }

  // 如果没有原始集数记录，尝试从localStorage读取（向后兼容）
  try {
    const recordKey = generateStorageKey(record.source_name, videoId);
    const cached = localStorage.getItem(ORIGINAL_EPISODES_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      if (data[recordKey] !== undefined) {
        const originalEpisodes = data[recordKey];
        console.log(`📚 从localStorage读取原始集数: ${record.title} = ${originalEpisodes}集 (向后兼容)`);
        return originalEpisodes;
      }
    }
  } catch (error) {
    console.warn('从localStorage读取原始集数失败:', error);
  }

  // 都没有的话，使用当前播放记录集数
  console.log(`⚠️ 该剧集未找到原始集数记录，使用当前播放记录集数: ${record.title} = ${record.total_episodes}集`);
  return record.total_episodes;
}

/**
 * 获取缓存的更新信息
 */
export function getCachedWatchingUpdates(): boolean {
  try {
    const cached = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
    if (!cached) return false;

    const data: WatchingUpdatesCache = JSON.parse(cached);
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
    const cacheData: WatchingUpdatesCache = {
      hasUpdates: data.hasUpdates,
      timestamp: data.timestamp,
      updatedCount: data.updatedCount,
      continueWatchingCount: data.continueWatchingCount,
      updatedSeries: data.updatedSeries
    };
    console.log('准备缓存的数据:', cacheData);
    localStorage.setItem(WATCHING_UPDATES_CACHE_KEY, JSON.stringify(cacheData));
    console.log('数据已写入缓存');

    // 验证写入结果
    const verification = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
    console.log('缓存验证 - 实际存储的数据:', verification);
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
    // 服务器端渲染时返回空操作函数
    return () => void 0;
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
    console.log('从缓存读取原始数据:', cached);
    if (!cached) {
      console.log('缓存为空');
      return null;
    }

    const data: WatchingUpdatesCache = JSON.parse(cached);
    console.log('解析后的缓存数据:', data);
    const isExpired = Date.now() - data.timestamp > CACHE_DURATION;

    if (isExpired) {
      console.log('缓存已过期');
      return null;
    }

    const result = {
      hasUpdates: data.hasUpdates,
      timestamp: data.timestamp,
      updatedCount: data.updatedCount,
      continueWatchingCount: data.continueWatchingCount,
      updatedSeries: data.updatedSeries
    };
    console.log('返回给页面的数据:', result);
    return result;
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
      const updatedData: WatchingUpdate = {
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

      // 触发全局事件
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(WATCHING_UPDATES_EVENT, {
          detail: { hasUpdates: false, updatedCount: 0 }
        }));
      }
    }
  } catch (error) {
    console.error('标记更新为已查看失败:', error);
  }
}

/**
 * 清除新集数更新状态（来自Alpha版本）
 */
export function clearWatchingUpdates(): void {
  try {
    localStorage.removeItem(WATCHING_UPDATES_CACHE_KEY);
    localStorage.removeItem(LAST_CHECK_TIME_KEY);

    // 通知监听器
    notifyListeners(false);

    // 触发事件通知状态变化
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(WATCHING_UPDATES_EVENT, {
        detail: { hasUpdates: false, updatedCount: 0 }
      }));
    }
  } catch (error) {
    console.error('清除新集数更新状态失败:', error);
  }
}

/**
 * 检查特定视频的更新状态（用于视频详情页面）
 */
export async function checkVideoUpdate(sourceName: string, videoId: string): Promise<void> {
  try {
    const recordsObj = await getAllPlayRecords();
    const storageKey = generateStorageKey(sourceName, videoId);
    const targetRecord = recordsObj[storageKey];

    if (!targetRecord) {
      return;
    }

    const updateInfo = await checkSingleRecordUpdate(targetRecord, videoId);

    if (updateInfo.hasUpdate) {
      // 如果发现这个视频有更新，重新检查所有更新状态
      await checkWatchingUpdates();
    }
  } catch (error) {
    console.error('检查视频更新失败:', error);
  }
}

/**
 * 订阅新集数更新事件（来自Alpha版本）
 */
export function subscribeToWatchingUpdatesEvent(callback: (hasUpdates: boolean, updatedCount: number) => void): () => void {
  if (typeof window === 'undefined') {
    return () => void 0;
  }

  const handleUpdate = (event: CustomEvent) => {
    const { hasUpdates, updatedCount } = event.detail;
    callback(hasUpdates, updatedCount);
  };

  window.addEventListener(WATCHING_UPDATES_EVENT, handleUpdate as EventListener);

  return () => {
    window.removeEventListener(WATCHING_UPDATES_EVENT, handleUpdate as EventListener);
  };
}