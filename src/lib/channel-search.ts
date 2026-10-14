// 智能频道搜索相关的工具函数和类型定义

// 直播频道接口
export interface LiveChannel {
  id: string;
  tvgId: string;
  name: string;
  logo: string;
  group: string;
  url: string;
}

// 直播源接口
export interface LiveSource {
  key: string;
  name: string;
  url: string;
  ua?: string;
  epg?: string;
  from: 'config' | 'custom';
  channelNumber?: number;
  disabled?: boolean;
}

// 搜索结果频道（包含源信息）
export interface SearchChannelResult extends LiveChannel {
  sourceName: string; // 来源直播源名称
  sourceKey: string; // 来源直播源key
}

// 聚合后的频道（处理不同源相同频道）
export interface AggregatedChannel {
  id: string; // 聚合频道ID
  displayName: string; // 显示名称（使用最常见的名称）
  logo: string; // 频道图标
  group: string; // 频道分组
  sources: Array<{
    // 多个源
    sourceKey: string;
    sourceName: string;
    channelId: string;
    channel: LiveChannel;
  }>;
}

/**
 * 基础频道名称标准化（不依赖映射）
 * @param name 原始频道名称
 * @returns 标准化后的名称
 */
export function basicNormalize(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '') // 去空格
    .replace(/-+/g, '') // 去连字符
    .replace(/\++/g, '') // 去加号
    .replace(/\.+/g, '') // 去点号
    .replace(/hd$/g, '') // 去HD后缀
    .replace(/4k$/g, '') // 去4K后缀
    .replace(/uhd$/g, '') // 去UHD后缀
    .replace(/高清$/g, '') // 去高清后缀
    .replace(/超清$/g, '') // 去超清后缀
    .replace(/频道$/g, '') // 去频道后缀
    .replace(/电视台$/g, '') // 去电视台后缀
    .replace(/台$/g, ''); // 去台后缀
}

/**
 * 计算两个字符串的相似度（使用编辑距离算法）
 * @param str1 字符串1
 * @param str2 字符串2
 * @returns 相似度分数 (0-1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * 计算编辑距离（Levenshtein distance）
 * @param str1 字符串1
 * @param str2 字符串2
 * @returns 编辑距离
 */
function getEditDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * 判断两个频道是否为同一频道
 * @param name1 频道名称1
 * @param name2 频道名称2
 * @returns 是否为同一频道
 */
export function isSameChannel(name1: string, name2: string): boolean {
  const normalized1 = basicNormalize(name1);
  const normalized2 = basicNormalize(name2);

  // 完全相同
  if (normalized1 === normalized2) return true;

  // 一个包含另一个
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }

  // 高相似度 (>80%)
  const similarity = calculateSimilarity(normalized1, normalized2);
  return similarity > 0.8;
}

/**
 * 聚合频道数据，智能去重相同频道
 * @param channelsWithSource 带源信息的频道列表
 * @returns 聚合后的频道列表
 */
export function aggregateChannels(
  channelsWithSource: SearchChannelResult[],
): AggregatedChannel[] {
  const aggregatedChannels: AggregatedChannel[] = [];
  const processedChannels = new Set<string>();

  channelsWithSource.forEach((channel) => {
    if (processedChannels.has(channel.id)) return;

    // 查找所有相似的频道
    const similarChannels = channelsWithSource.filter((otherChannel) => {
      if (processedChannels.has(otherChannel.id)) return false;
      return isSameChannel(channel.name, otherChannel.name);
    });

    // 创建聚合频道
    const sources = similarChannels.map((ch) => ({
      sourceKey: ch.sourceKey,
      sourceName: ch.sourceName,
      channelId: ch.id,
      channel: ch,
    }));

    // 选择最好的显示名称（最短且非空的名称）
    const displayName =
      similarChannels
        .map((ch) => ch.name)
        .filter((name) => name.trim())
        .sort((a, b) => a.length - b.length)[0] || channel.name;

    // 选择最好的logo（优先选择非空的logo）
    const logo =
      similarChannels
        .map((ch) => ch.logo)
        .find((logo) => logo && logo.trim()) || '';

    // 选择最常见的分组
    const groupCounts = new Map<string, number>();
    similarChannels.forEach((ch) => {
      const group = ch.group || '其他';
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    });
    const group =
      Array.from(groupCounts.entries()).sort(([, a], [, b]) => b - a)[0]?.[0] ||
      '其他';

    aggregatedChannels.push({
      id: `aggregated_${channel.id}`,
      displayName,
      logo,
      group,
      sources,
    });

    // 标记所有相似频道为已处理
    similarChannels.forEach((ch) => processedChannels.add(ch.id));
  });

  return aggregatedChannels.sort((a, b) => {
    // 按源数量降序排列，多源频道排在前面
    if (a.sources.length !== b.sources.length) {
      return b.sources.length - a.sources.length;
    }
    // 源数量相同时按名称排序
    return a.displayName.localeCompare(b.displayName, 'zh-CN');
  });
}

/**
 * 搜索频道（模糊匹配）
 * @param channels 频道列表
 * @param searchQuery 搜索关键词
 * @returns 匹配的频道列表
 */
export function searchChannels(
  channels: AggregatedChannel[],
  searchQuery: string,
): AggregatedChannel[] {
  if (!searchQuery.trim()) {
    return channels;
  }

  const query = searchQuery.toLowerCase().trim();
  const normalizedQuery = basicNormalize(query);

  return channels
    .filter((channel) => {
      // 1. 精确匹配显示名称
      if (channel.displayName.toLowerCase().includes(query)) {
        return true;
      }

      // 2. 标准化名称匹配
      const normalizedDisplayName = basicNormalize(channel.displayName);
      if (normalizedDisplayName.includes(normalizedQuery)) {
        return true;
      }

      // 3. 分组匹配
      if (channel.group.toLowerCase().includes(query)) {
        return true;
      }

      // 4. 搜索所有源的频道名称
      const sourceMatch = channel.sources.some((source) => {
        const channelName = source.channel.name.toLowerCase();
        const normalizedChannelName = basicNormalize(source.channel.name);

        return (
          channelName.includes(query) ||
          normalizedChannelName.includes(normalizedQuery) ||
          source.sourceName.toLowerCase().includes(query)
        );
      });

      if (sourceMatch) return true;

      // 5. 相似度匹配（低阈值，用于模糊搜索）
      const similarity = calculateSimilarity(
        normalizedDisplayName,
        normalizedQuery,
      );
      return similarity > 0.3;
    })
    .sort((a, b) => {
      // 按匹配度排序
      const aExactMatch = a.displayName.toLowerCase().includes(query);
      const bExactMatch = b.displayName.toLowerCase().includes(query);

      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      // 都是精确匹配或都不是，按源数量和名称排序
      if (a.sources.length !== b.sources.length) {
        return b.sources.length - a.sources.length;
      }
      return a.displayName.localeCompare(b.displayName, 'zh-CN');
    });
}

/**
 * 高亮匹配的文本（返回HTML字符串）
 * @param text 原始文本
 * @param searchQuery 搜索关键词
 * @returns HTML字符串
 */
export function highlightMatch(text: string, searchQuery: string): string {
  if (!searchQuery.trim()) {
    return text;
  }

  const query = searchQuery.toLowerCase();
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi',
  );

  return text.replace(
    regex,
    '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">$1</mark>',
  );
}

/**
 * 防抖函数
 * @param func 要执行的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * 获取所有频道数据（跨源）
 * @param liveSources 直播源列表
 * @param getCachedLiveChannels 获取缓存频道数据的函数
 * @returns 所有频道的搜索结果
 */
export async function getAllChannelsAcrossSources(
  liveSources: LiveSource[],
  getCachedLiveChannels: (
    key: string,
  ) => Promise<{ channels: LiveChannel[] } | null>,
): Promise<SearchChannelResult[]> {
  const allChannels: SearchChannelResult[] = [];

  for (const source of liveSources) {
    try {
      const channelData = await getCachedLiveChannels(source.key);
      if (channelData && channelData.channels) {
        const channelsWithSource: SearchChannelResult[] =
          channelData.channels.map((channel) => ({
            ...channel,
            sourceName: source.name,
            sourceKey: source.key,
          }));
        allChannels.push(...channelsWithSource);
      }
    } catch {
      // 忽略错误，继续处理其他源
    }
  }

  return allChannels;
}
