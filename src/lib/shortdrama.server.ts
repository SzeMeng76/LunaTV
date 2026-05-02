/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { getConfig } from './config';
import { DEFAULT_USER_AGENT } from './user-agent';
import { ShortDramaItem } from './types';

// 从单个短剧源获取数据（通过分类名称查找）
async function fetchFromShortDramaSource(
  api: string,
  size: number
): Promise<ShortDramaItem[]> {
  // Step 1: 获取分类列表，找到"短剧"分类的ID
  const listUrl = `${api}?ac=list`;

  const listResponse = await fetch(listUrl, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!listResponse.ok) {
    throw new Error(`HTTP error! status: ${listResponse.status}`);
  }

  const listData = await listResponse.json();
  const categories = listData.class || [];

  // 查找"短剧"分类（只要包含"短剧"两个字即可）
  const shortDramaCategory = categories.find((cat: any) =>
    cat.type_name && cat.type_name.includes('短剧')
  );

  if (!shortDramaCategory) {
    console.log(`该源没有短剧分类`);
    return [];
  }

  const categoryId = shortDramaCategory.type_id;
  console.log(`找到短剧分类ID: ${categoryId}`);

  // Step 2: 获取该分类的短剧列表
  const apiUrl = `${api}?ac=detail&t=${categoryId}&pg=1`;

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const items = data.list || [];

  return items.slice(0, size).map((item: any) => ({
    id: item.vod_id,
    name: item.vod_name,
    cover: item.vod_pic || '',
    update_time: item.vod_time || new Date().toISOString(),
    score: parseFloat(item.vod_score) || 0,
    episode_count: parseInt(item.vod_remarks?.replace(/[^\d]/g, '') || '1'),
    description: item.vod_content || item.vod_blurb || '',
    author: item.vod_actor || '',
    backdrop: item.vod_pic_slide || item.vod_pic || '',
    vote_average: parseFloat(item.vod_score) || 0,
  }));
}

// 服务端专用函数，从所有短剧源聚合数据
export async function getRecommendedShortDramas(
  category?: number,
  size = 10
): Promise<ShortDramaItem[]> {
  try {
    // 获取配置
    const config = await getConfig();

    // 筛选出所有启用的短剧源
    const shortDramaSources = config.SourceConfig.filter(
      source => source.type === 'shortdrama' && !source.disabled
    );

    console.log(`📺 找到 ${shortDramaSources.length} 个配置的短剧源`);

    // 如果没有配置短剧源，使用默认源
    if (shortDramaSources.length === 0) {
      console.log('📺 使用默认短剧源');
      return await fetchFromShortDramaSource(
        'https://wwzy.tv/api.php/provide/vod',
        size
      );
    }

    // 有配置短剧源，聚合所有源的数据
    console.log('📺 聚合多个短剧源的数据');
    const results = await Promise.allSettled(
      shortDramaSources.map(source => {
        console.log(`🔄 请求短剧源: ${source.name}`);
        return fetchFromShortDramaSource(source.api, size);
      })
    );

    // 合并所有成功的结果
    const allItems: ShortDramaItem[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`✅ ${shortDramaSources[index].name}: 获取到 ${result.value.length} 条数据`);
        allItems.push(...result.value);
      } else {
        console.error(`❌ ${shortDramaSources[index].name}: 请求失败`, result.reason);
      }
    });

    // 去重（根据名称）
    const uniqueItems = Array.from(
      new Map(allItems.map(item => [item.name, item])).values()
    );

    // 按更新时间排序
    uniqueItems.sort((a, b) =>
      new Date(b.update_time).getTime() - new Date(a.update_time).getTime()
    );

    // 返回指定数量
    const finalItems = uniqueItems.slice(0, size);
    console.log(`📊 最终返回 ${finalItems.length} 条短剧数据`);

    return finalItems;
  } catch (error) {
    console.error('获取短剧推荐失败:', error);
    // 出错时fallback到默认源
    try {
      console.log('⚠️ 出错，fallback到默认源');
      return await fetchFromShortDramaSource(
        'https://wwzy.tv/api.php/provide/vod',
        size
      );
    } catch (fallbackError) {
      console.error('默认源也失败:', fallbackError);
      return [];
    }
  }
}
