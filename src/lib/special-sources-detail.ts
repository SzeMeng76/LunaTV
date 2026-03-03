/* eslint-disable @typescript-eslint/no-explicit-any */

import { getConfig } from '@/lib/config';
import { SearchResult } from '@/lib/types';

/**
 * 获取 Emby 源的视频详情
 */
export async function getEmbyDetail(
  source: string,
  id: string
): Promise<SearchResult> {
  const config = await getConfig();

  // 检查是否有启用的 Emby 源
  if (!config.EmbyConfig?.Sources || config.EmbyConfig.Sources.length === 0) {
    throw new Error('Emby 未配置或未启用');
  }

  // 解析 embyKey
  let embyKey: string | undefined;
  if (source.startsWith('emby_')) {
    embyKey = source.substring(5); // 'emby_'.length = 5
  }

  // 使用 EmbyManager 获取客户端和配置
  const { embyManager } = await import('@/lib/emby-manager');
  const sources = await embyManager.getEnabledSources();
  const sourceConfig = sources.find((s) => s.key === embyKey);
  const sourceName = sourceConfig?.name || 'Emby';

  const client = await embyManager.getClient(embyKey);

  // 获取媒体详情
  const item = await client.getItem(id);

  // 根据类型处理
  if (item.Type === 'Movie') {
    // 电影
    const subtitles = client.getSubtitles(item);

    return {
      source: source, // 保持与请求一致（emby 或 emby_key）
      source_name: sourceName,
      id: item.Id,
      title: item.Name,
      poster: client.getImageUrl(item.Id, 'Primary'),
      year: item.ProductionYear?.toString() || '',
      douban_id: 0,
      desc: item.Overview || '',
      episodes: [await client.getStreamUrl(item.Id)],
      episodes_titles: [item.Name],
    };
  } else if (item.Type === 'Series') {
    // 剧集 - 获取所有季和集
    const seasons = await client.getSeasons(item.Id);
    const allEpisodes: any[] = [];

    for (const season of seasons) {
      const episodes = await client.getEpisodes(item.Id, season.Id);
      allEpisodes.push(...episodes);
    }

    // 按季和集排序
    allEpisodes.sort((a, b) => {
      if (a.ParentIndexNumber !== b.ParentIndexNumber) {
        return (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0);
      }
      return (a.IndexNumber || 0) - (b.IndexNumber || 0);
    });

    return {
      source: source, // 保持与请求一致（emby 或 emby_key）
      source_name: sourceName,
      id: item.Id,
      title: item.Name,
      poster: client.getImageUrl(item.Id, 'Primary'),
      year: item.ProductionYear?.toString() || '',
      douban_id: 0,
      desc: item.Overview || '',
      episodes: await Promise.all(
        allEpisodes.map((ep) => client.getStreamUrl(ep.Id))
      ),
      episodes_titles: allEpisodes.map((ep) => {
        const seasonNum = ep.ParentIndexNumber || 1;
        const episodeNum = ep.IndexNumber || 1;
        return `S${seasonNum.toString().padStart(2, '0')}E${episodeNum.toString().padStart(2, '0')}`;
      }),
    };
  } else {
    throw new Error('不支持的媒体类型');
  }
}

/**
 * 统一的特殊源详情获取接口
 * 根据 source 类型自动调用对应的获取函数
 */
export async function getSpecialSourceDetail(
  source: string,
  id: string
): Promise<SearchResult | null> {
  try {
    // Emby 源（包括 emby 和 emby_xxx）
    if (source === 'emby' || source.startsWith('emby_')) {
      return await getEmbyDetail(source, id);
    }

    // 不是特殊源，返回 null
    return null;
  } catch (error) {
    console.error(`获取特殊源详情失败 (${source}+${id}):`, error);
    throw error;
  }
}

/**
 * 检查是否是特殊源
 */
export function isSpecialSource(source: string): boolean {
  return (
    source === 'emby' ||
    source.startsWith('emby_')
  );
}
