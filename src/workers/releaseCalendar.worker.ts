/* eslint-disable @typescript-eslint/no-explicit-any */

// 🚀 Web Worker for processing release calendar data
// Offloads CPU-intensive operations from main thread

interface ReleaseCalendarItem {
  id: string;
  title: string;
  cover?: string;
  releaseDate: string;
  type: 'movie' | 'tv';
  episodes?: number;
}

interface WorkerInput {
  releases: ReleaseCalendarItem[];
  today: string; // ISO date string
}

interface WorkerOutput {
  selectedItems: ReleaseCalendarItem[];
  stats: {
    已上映: number;
    今日上映: number;
    '7天内': number;
    '8-30天': number;
    '30天后': number;
    最终显示: number;
  };
}

// 缓存正则表达式
const seasonRegex = /第[一二三四五六七八九十\d]+季|Season\s*\d+|S\d+/gi;

function normalizeTitle(title: string): string {
  // 合并多个replace操作，减少字符串创建
  let normalized = title.replace(/[：:]/g, ':').trim();

  // 处理副标题
  const colonIndex = normalized.lastIndexOf(':');
  if (colonIndex !== -1) {
    normalized = normalized.substring(colonIndex + 1).trim();
  }

  // 一次性移除季数标记和空格
  return normalized.replace(seasonRegex, '').replace(/\s+/g, '').trim();
}

function processReleaseCalendar(input: WorkerInput): WorkerOutput {
  const { releases, today } = input;

  console.log('📅 [Worker] 开始处理数据:', releases.length, '条');

  // 过滤出即将上映和刚上映的作品（过去7天到未来90天）
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(todayDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const ninetyDaysLater = new Date(todayDate);
  ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);

  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
  const ninetyDaysStr = ninetyDaysLater.toISOString().split('T')[0];

  const upcoming = releases.filter((item: ReleaseCalendarItem) => {
    const releaseDateStr = item.releaseDate;
    return releaseDateStr >= sevenDaysAgoStr && releaseDateStr <= ninetyDaysStr;
  });

  console.log('📅 [Worker] 日期过滤后:', upcoming.length, '条');

  // 使用Map替代reduce+find，O(n)复杂度替代O(n²)
  const uniqueMap = new Map<string, ReleaseCalendarItem>();
  const normalizedCache = new Map<string, string>();
  const seasonCache = new Map<string, boolean>();

  for (const item of upcoming) {
    const exactKey = item.title;

    // 检查精确匹配
    if (uniqueMap.has(exactKey)) {
      const existing = uniqueMap.get(exactKey)!;
      if (item.releaseDate < existing.releaseDate) {
        uniqueMap.set(exactKey, item);
      }
      continue;
    }

    // 检查归一化匹配
    const normalizedKey = normalizeTitle(item.title);
    normalizedCache.set(item.title, normalizedKey);

    let foundSimilar = false;
    for (const [key, existing] of uniqueMap.entries()) {
      const existingNormalized = normalizedCache.get(key) || normalizeTitle(key);
      if (!normalizedCache.has(key)) {
        normalizedCache.set(key, existingNormalized);
      }

      if (normalizedKey === existingNormalized) {
        foundSimilar = true;

        // 缓存季数检测结果
        const itemHasSeason = seasonCache.get(item.title) ?? seasonRegex.test(item.title);
        const existingHasSeason = seasonCache.get(key) ?? seasonRegex.test(key);
        seasonCache.set(item.title, itemHasSeason);
        seasonCache.set(key, existingHasSeason);

        // 优先保留无季数标记的，其次保留日期更早的
        if (!itemHasSeason && existingHasSeason) {
          uniqueMap.delete(key);
          uniqueMap.set(item.title, item);
        } else if (itemHasSeason === existingHasSeason && item.releaseDate < existing.releaseDate) {
          uniqueMap.delete(key);
          uniqueMap.set(item.title, item);
        }
        break;
      }
    }

    if (!foundSimilar) {
      uniqueMap.set(exactKey, item);
    }
  }

  const uniqueUpcoming = Array.from(uniqueMap.values());
  console.log('📅 [Worker] 去重后:', uniqueUpcoming.length, '条');

  // 智能分配：按更细的时间段分类
  const todayStr = todayDate.toISOString().split('T')[0];
  const sevenDaysLaterStr = new Date(todayDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const thirtyDaysLaterStr = new Date(todayDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const recentlyReleased = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate < todayStr);
  const releasingToday = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate === todayStr);
  const nextSevenDays = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate > todayStr && i.releaseDate <= sevenDaysLaterStr);
  const nextThirtyDays = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate > sevenDaysLaterStr && i.releaseDate <= thirtyDaysLaterStr);
  const laterReleasing = uniqueUpcoming.filter((i: ReleaseCalendarItem) => i.releaseDate > thirtyDaysLaterStr);

  // 智能分配：总共10个，按时间段分散选取
  const maxTotal = 10;
  const recentQuota = Math.min(2, recentlyReleased.length);
  const todayQuota = Math.min(1, releasingToday.length);
  const sevenDayQuota = Math.min(4, nextSevenDays.length);
  const thirtyDayQuota = Math.min(2, nextThirtyDays.length);
  const laterQuota = Math.min(1, laterReleasing.length);

  let selectedItems: ReleaseCalendarItem[] = [
    ...recentlyReleased.slice(0, recentQuota),
    ...releasingToday.slice(0, todayQuota),
    ...nextSevenDays.slice(0, sevenDayQuota),
    ...nextThirtyDays.slice(0, thirtyDayQuota),
    ...laterReleasing.slice(0, laterQuota),
  ];

  // 如果没填满10个，按优先级补充
  if (selectedItems.length < maxTotal) {
    const remaining = maxTotal - selectedItems.length;

    const additionalSeven = nextSevenDays.slice(sevenDayQuota, sevenDayQuota + remaining);
    selectedItems = [...selectedItems, ...additionalSeven];

    if (selectedItems.length < maxTotal) {
      const stillRemaining = maxTotal - selectedItems.length;
      const additionalThirty = nextThirtyDays.slice(thirtyDayQuota, thirtyDayQuota + stillRemaining);
      selectedItems = [...selectedItems, ...additionalThirty];
    }

    if (selectedItems.length < maxTotal) {
      const stillRemaining = maxTotal - selectedItems.length;
      const additionalLater = laterReleasing.slice(laterQuota, laterQuota + stillRemaining);
      selectedItems = [...selectedItems, ...additionalLater];
    }

    if (selectedItems.length < maxTotal) {
      const stillRemaining = maxTotal - selectedItems.length;
      const additionalRecent = recentlyReleased.slice(recentQuota, recentQuota + stillRemaining);
      selectedItems = [...selectedItems, ...additionalRecent];
    }

    // 最后从今日上映补充（限制最多3个）
    if (selectedItems.length < maxTotal) {
      const maxTodayLimit = 3;
      const currentTodayCount = selectedItems.filter((i: ReleaseCalendarItem) => i.releaseDate === todayStr).length;
      const todayRemaining = maxTodayLimit - currentTodayCount;
      if (todayRemaining > 0) {
        const stillRemaining = Math.min(maxTotal - selectedItems.length, todayRemaining);
        const additionalToday = releasingToday.slice(todayQuota, todayQuota + stillRemaining);
        selectedItems = [...selectedItems, ...additionalToday];
      }
    }
  }

  const stats = {
    已上映: recentlyReleased.length,
    今日上映: releasingToday.length,
    '7天内': nextSevenDays.length,
    '8-30天': nextThirtyDays.length,
    '30天后': laterReleasing.length,
    最终显示: selectedItems.length,
  };

  console.log('📅 [Worker] 分配结果:', stats);

  return { selectedItems, stats };
}

// Worker message handler
self.addEventListener('message', (e: MessageEvent<WorkerInput>) => {
  try {
    const result = processReleaseCalendar(e.data);
    self.postMessage(result);
  } catch (error) {
    console.error('📅 [Worker] 处理失败:', error);
    self.postMessage({ error: String(error) });
  }
});

// Export for TypeScript (won't be used at runtime)
export {};
