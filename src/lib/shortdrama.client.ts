/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import {
  ShortDramaCategory,
  ShortDramaItem,
  ShortDramaParseResult,
} from './types';
import {
  SHORTDRAMA_CACHE_EXPIRE,
  getCacheKey,
  getCache,
  setCache,
} from './shortdrama-cache';
import { DEFAULT_USER_AGENT } from './user-agent';

// 新的视频源 API（资源站采集接口）- 用于分类和搜索
const SHORTDRAMA_API_BASE = 'https://wwzy.tv/api.php/provide/vod';

// 解析 API（乱短剧API）- 用于 parse 解析播放地址
const SHORTDRAMA_PARSE_API_BASE = 'https://api.r2afosne.dpdns.org';

// 检测是否为移动端环境
const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// 获取API基础URL - 统一使用内部 API 代理避免 CORS 问题
const getApiBase = () => {
  // 所有请求都通过内部 API 代理
  return '/api/shortdrama';
};

// 获取短剧分类列表
export async function getShortDramaCategories(): Promise<ShortDramaCategory[]> {
  const cacheKey = getCacheKey('categories', {});

  try {
    // 检查缓存
    const cached = await getCache(cacheKey);
    if (cached) {
      return cached;
    }

    // 使用内部 API 代理
    const apiUrl = `${getApiBase()}/categories`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // 内部 API 已经处理好格式
    const result: ShortDramaCategory[] = data;

    // 只缓存非空结果，避免缓存错误/空数据
    if (Array.isArray(result) && result.length > 0) {
      await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.categories);
    }
    return result;
  } catch (error) {
    console.error('获取短剧分类失败:', error);
    return [];
  }
}

// 获取推荐短剧列表
export async function getRecommendedShortDramas(
  category?: number,
  size = 10
): Promise<ShortDramaItem[]> {
  const cacheKey = getCacheKey('recommends', { category, size });

  try {
    // 检查缓存
    const cached = await getCache(cacheKey);
    if (cached) {
      return cached;
    }

    // 使用内部 API 代理
    const params = new URLSearchParams();
    if (category) params.append('category', category.toString());
    params.append('size', size.toString());
    const apiUrl = `${getApiBase()}/recommend?${params.toString()}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // 只缓存非空结果，避免缓存错误/空数据
    if (Array.isArray(result) && result.length > 0) {
      await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.recommends);
    }
    return result;
  } catch (error) {
    console.error('获取推荐短剧失败:', error);
    return [];
  }
}

// 获取分类短剧列表（分页）
export async function getShortDramaList(
  category: number,
  page = 1,
  size = 20
): Promise<{ list: ShortDramaItem[]; hasMore: boolean }> {
  const cacheKey = getCacheKey('lists', { category, page, size });

  try {
    // 检查缓存
    const cached = await getCache(cacheKey);
    if (cached) {
      return cached;
    }

    // 使用内部 API 代理
    const apiUrl = `${getApiBase()}/list?categoryId=${category}&page=${page}&size=${size}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // 只缓存非空结果，避免缓存错误/空数据
    if (result.list && Array.isArray(result.list) && result.list.length > 0) {
      const cacheTime = page === 1 ? SHORTDRAMA_CACHE_EXPIRE.lists * 2 : SHORTDRAMA_CACHE_EXPIRE.lists;
      await setCache(cacheKey, result, cacheTime);
    }
    return result;
  } catch (error) {
    console.error('获取短剧列表失败:', error);
    return { list: [], hasMore: false };
  }
}

// 搜索短剧
export async function searchShortDramas(
  query: string,
  page = 1,
  size = 20
): Promise<{ list: ShortDramaItem[]; hasMore: boolean }> {
  try {
    // 使用内部 API 代理
    const apiUrl = `${getApiBase()}/search?query=${encodeURIComponent(query)}&page=${page}&size=${size}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('搜索短剧失败:', error);
    return { list: [], hasMore: false };
  }
}

// 使用备用API解析单集视频
async function parseWithAlternativeApi(
  dramaName: string,
  episode: number,
  alternativeApiUrl: string
): Promise<ShortDramaParseResult> {
  try {
    // 规范化 API 基础地址，移除末尾斜杠
    const alternativeApiBase = alternativeApiUrl.replace(/\/+$/, '');

    // 检查是否提供了备用API地址
    if (!alternativeApiBase) {
      console.log('备用API地址未配置');
      return {
        code: -1,
        msg: '备用API未启用',
      };
    }

    // Step 1: Search for the drama by name to get drama ID
    const searchUrl = `${alternativeApiBase}/api/v1/drama/dl?dramaName=${encodeURIComponent(dramaName)}`;
    console.log('[Alternative API] Step 1 - Search URL:', searchUrl);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000), // 15秒超时
    });

    console.log('[Alternative API] Step 1 - Response status:', searchResponse.status);

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('[Alternative API] Step 1 - Error response:', errorText);
      throw new Error(`Search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    // 加强数据验证
    if (!searchData || typeof searchData !== 'object') {
      throw new Error('备用API返回数据格式错误');
    }

    if (!searchData.data || !Array.isArray(searchData.data) || searchData.data.length === 0) {
      return {
        code: 1,
        msg: `未找到短剧"${dramaName}"`,
      };
    }

    const firstDrama = searchData.data[0];
    if (!firstDrama || !firstDrama.id) {
      throw new Error('备用API返回的短剧数据不完整');
    }

    const dramaId = firstDrama.id;

    // Step 2: Get all episodes for this drama
    const episodesUrl = `${alternativeApiBase}/api/v1/drama/dramas?dramaId=${dramaId}`;
    const episodesResponse = await fetch(episodesUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000), // 15秒超时
    });

    if (!episodesResponse.ok) {
      throw new Error(`Episodes fetch failed: ${episodesResponse.status}`);
    }

    const episodesData = await episodesResponse.json();

    // 检查API是否返回错误消息（字符串格式）
    if (typeof episodesData === 'string') {
      if (episodesData.includes('未查询到该剧集')) {
        return {
          code: 1,
          msg: `该短剧暂时无法播放，请稍后再试`,
        };
      }
      return {
        code: 1,
        msg: `视频源暂时不可用`,
      };
    }

    // 验证集数数据
    if (!episodesData || !episodesData.data || !Array.isArray(episodesData.data)) {
      return {
        code: 1,
        msg: '视频源暂时不可用',
      };
    }

    if (episodesData.data.length === 0) {
      return {
        code: 1,
        msg: '该短剧暂无可用集数',
      };
    }

    // 注意：episode 参数可能是 0（主API的第一集索引）或 1（从1开始计数）
    // 备用API的数组索引是从0开始的
    let episodeIndex: number;
    if (episode === 0 || episode === 1) {
      // 主API的episode=0 或 episode=1 都对应第一集
      episodeIndex = 0;
    } else {
      // episode >= 2 时，映射到数组索引 episode-1
      episodeIndex = episode - 1;
    }

    if (episodeIndex < 0 || episodeIndex >= episodesData.data.length) {
      return {
        code: 1,
        msg: `集数 ${episode} 不存在（共${episodesData.data.length}集）`,
      };
    }

    // Step 3: 尝试获取视频直链，如果当前集不存在则自动跳到下一集
    // 最多尝试3集（防止无限循环）
    let actualEpisodeIndex = episodeIndex;
    let directData: any = null;
    const maxRetries = 3;

    for (let retry = 0; retry < maxRetries; retry++) {
      const currentIndex = episodeIndex + retry;

      // 检查是否超出集数范围
      if (currentIndex >= episodesData.data.length) {
        return {
          code: 1,
          msg: `该集暂时无法播放，请尝试其他集数`,
        };
      }

      const targetEpisode = episodesData.data[currentIndex];
      if (!targetEpisode || !targetEpisode.id) {
        console.log(`[Alternative API] 第${episode + retry}集数据不完整，尝试下一集`);
        continue;
      }

      const episodeId = targetEpisode.id;
      const directUrl = `${alternativeApiBase}/api/v1/drama/direct?episodeId=${episodeId}`;

      try {
        const directResponse = await fetch(directUrl, {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15000), // 15秒超时
        });

        if (!directResponse.ok) {
          console.log(`[Alternative API] 第${episode + retry}集HTTP错误: ${directResponse.status}，尝试下一集`);
          continue;
        }

        const data = await directResponse.json();

        // 检查是否返回 "未查询到该剧集" 错误
        if (typeof data === 'string' && data.includes('未查询到该剧集')) {
          console.log(`[Alternative API] 第${episode + retry}集视频源缺失，尝试下一集`);
          continue;
        }

        // 验证播放链接数据
        if (!data || !data.url) {
          console.log(`[Alternative API] 第${episode + retry}集无播放链接，尝试下一集`);
          continue;
        }

        // 成功获取到视频链接
        directData = data;
        actualEpisodeIndex = currentIndex;

        if (retry > 0) {
          console.log(`[Alternative API] ✅ 第${episode}集不可用，已自动跳转到第${episode + retry}集`);
        }
        break;
      } catch (error) {
        console.log(`[Alternative API] 第${episode + retry}集请求失败:`, error);
        continue;
      }
    }

    // 如果所有尝试都失败
    if (!directData || !directData.url) {
      return {
        code: 1,
        msg: `该集暂时无法播放，请尝试其他集数`,
      };
    }

    // 将 http:// 转换为 https:// 避免 Mixed Content 错误
    const videoUrl = (directData.url || '').replace(/^http:\/\//i, 'https://');

    // 备用API的视频链接通过代理访问（避免防盗链限制）
    const proxyUrl = `/api/proxy/shortdrama?url=${encodeURIComponent(videoUrl)}`;

    // 计算实际播放的集数（从1开始）
    const actualEpisode = actualEpisodeIndex + 1;

    return {
      code: 0,
      data: {
        videoId: dramaId,
        videoName: firstDrama.name,
        currentEpisode: actualEpisode, // 使用实际播放的集数
        totalEpisodes: episodesData.data.length,
        parsedUrl: proxyUrl,
        proxyUrl: proxyUrl,
        cover: directData.pic || firstDrama.pic || '',
        description: firstDrama.overview || '',
        episode: {
          index: actualEpisode, // 使用实际播放的集数
          label: `第${actualEpisode}集`,
          parsedUrl: proxyUrl,
          proxyUrl: proxyUrl,
          title: directData.title || `第${actualEpisode}集`,
        },
      },
      // 额外的元数据供其他地方使用
      metadata: {
        author: firstDrama.author || '',
        backdrop: firstDrama.backdrop || firstDrama.pic || '',
        vote_average: firstDrama.vote_average || 0,
        tmdb_id: firstDrama.tmdb_id || undefined,
      }
    };
  } catch (error) {
    console.error('备用API解析失败:', error);
    // 返回更详细的错误信息
    const errorMsg = error instanceof Error ? error.message : '备用API请求失败';
    return {
      code: -1,
      msg: `视频源暂时不可用，请稍后再试`,
    };
  }
}

// 解析单集视频（支持跨域代理，自动fallback到备用API）
export async function parseShortDramaEpisode(
  id: number,
  episode: number,
  useProxy = true,
  dramaName?: string,
  alternativeApiUrl?: string
): Promise<ShortDramaParseResult> {
  // 如果提供了剧名和备用API，优先尝试备用API（因为主API链接经常失效）
  if (dramaName && alternativeApiUrl) {
    console.log('优先尝试备用API...');
    try {
      const alternativeResult = await parseWithAlternativeApi(dramaName, episode, alternativeApiUrl);
      if (alternativeResult.code === 0) {
        console.log('备用API成功！');
        return alternativeResult;
      }
      console.log('备用API失败，fallback到主API:', alternativeResult.msg);
    } catch (altError) {
      console.log('备用API错误，fallback到主API:', altError);
    }
  }

  try {
    const params = new URLSearchParams({
      id: id.toString(), // API需要string类型的id
      episode: episode.toString(), // episode从1开始
    });

    if (useProxy) {
      params.append('proxy', 'true');
    }

    const timestamp = Date.now();
    const apiUrl = isMobile()
      ? `/api/shortdrama/parse?${params.toString()}&_t=${timestamp}`
      : `${SHORTDRAMA_PARSE_API_BASE}/vod/parse/single?${params.toString()}`;

    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    } : {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
      },
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // API可能返回错误信息
    if (data.code === 1) {
      // 如果主API失败且提供了剧名和备用API地址，尝试使用备用API
      if (dramaName && alternativeApiUrl) {
        console.log('主API失败，尝试使用备用API...');
        return await parseWithAlternativeApi(dramaName, episode, alternativeApiUrl);
      }
      return {
        code: data.code,
        msg: data.msg || '该集暂时无法播放，请稍后再试',
      };
    }

    // API成功时，检查是否有有效的视频链接
    const parsedUrl = data.episode?.parsedUrl || data.parsedUrl || '';

    // 如果主API返回成功但没有有效链接，尝试备用API
    if (!parsedUrl && dramaName && alternativeApiUrl) {
      console.log('主API未返回有效链接，尝试使用备用API...');
      return await parseWithAlternativeApi(dramaName, episode, alternativeApiUrl);
    }

    // API成功时直接返回数据对象，根据实际结构解析
    return {
      code: 0,
      data: {
        videoId: data.videoId || id,
        videoName: data.videoName || '',
        currentEpisode: data.episode?.index || episode,
        totalEpisodes: data.totalEpisodes || 1,
        parsedUrl: parsedUrl,
        proxyUrl: data.episode?.proxyUrl || '', // proxyUrl在episode对象内
        cover: data.cover || '',
        description: data.description || '',
        episode: data.episode || null, // 保留原始episode对象
      },
    };
  } catch (error) {
    console.error('解析短剧集数失败:', error);
    // 如果主API网络请求失败且提供了剧名和备用API地址，尝试使用备用API
    if (dramaName && alternativeApiUrl) {
      console.log('主API网络错误，尝试使用备用API...');
      return await parseWithAlternativeApi(dramaName, episode, alternativeApiUrl);
    }
    return {
      code: -1,
      msg: '网络连接失败，请检查网络后重试',
    };
  }
}

// 批量解析多集视频
export async function parseShortDramaBatch(
  id: number,
  episodes: number[],
  useProxy = true
): Promise<ShortDramaParseResult[]> {
  try {
    const params = new URLSearchParams({
      id: id.toString(),
      episodes: episodes.join(','),
    });

    if (useProxy) {
      params.append('proxy', 'true');
    }

    const timestamp = Date.now();
    const apiUrl = isMobile()
      ? `/api/shortdrama/parse?${params.toString()}&_t=${timestamp}`
      : `${SHORTDRAMA_PARSE_API_BASE}/vod/parse/batch?${params.toString()}`;

    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    } : {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
      },
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('批量解析短剧失败:', error);
    return [];
  }
}

// 解析整部短剧所有集数
export async function parseShortDramaAll(
  id: number,
  useProxy = true
): Promise<ShortDramaParseResult[]> {
  try {
    const params = new URLSearchParams({
      id: id.toString(),
    });

    if (useProxy) {
      params.append('proxy', 'true');
    }

    const timestamp = Date.now();
    const apiUrl = isMobile()
      ? `/api/shortdrama/parse?${params.toString()}&_t=${timestamp}`
      : `${SHORTDRAMA_PARSE_API_BASE}/vod/parse/all?${params.toString()}`;

    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    } : {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
      },
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('解析完整短剧失败:', error);
    return [];
  }
}