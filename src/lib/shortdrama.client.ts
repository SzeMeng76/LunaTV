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

const SHORTDRAMA_API_BASE = 'https://api.r2afosne.dpdns.org';

// 检测是否为移动端环境
const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// 获取API基础URL - 移动端使用内部API代理，桌面端直接调用外部API
const getApiBase = (endpoint: string) => {
  if (isMobile()) {
    return `/api/shortdrama${endpoint}`;
  }
  // 桌面端使用外部API的完整路径
  return `${SHORTDRAMA_API_BASE}/vod${endpoint}`;
};

// 获取短剧分类列表
export async function getShortDramaCategories(): Promise<ShortDramaCategory[]> {
  const cacheKey = getCacheKey('categories', {});

  try {
    // 临时禁用缓存进行测试 - 移动端强制刷新
    if (!isMobile()) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const apiUrl = isMobile()
      ? `/api/shortdrama/categories`
      : getApiBase('/categories');

    // 移动端使用内部API，桌面端调用外部API
    const fetchOptions: RequestInit = isMobile() ? {
      // 移动端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
    } : {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: ShortDramaCategory[];
    // 内部API直接返回数组，外部API返回带categories的对象
    if (isMobile()) {
      result = data; // 内部API已经处理过格式
    } else {
      const categories = data.categories || [];
      result = categories.map((item: any) => ({
        type_id: item.type_id,
        type_name: item.type_name,
      }));
    }

    // 缓存结果
    await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.categories);
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
    // 临时禁用缓存进行测试 - 移动端强制刷新
    if (!isMobile()) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const apiUrl = isMobile()
      ? `/api/shortdrama/recommend?${category ? `category=${category}&` : ''}size=${size}`
      : `${SHORTDRAMA_API_BASE}/vod/recommend?${category ? `category=${category}&` : ''}size=${size}`;

    const fetchOptions: RequestInit = isMobile() ? {
      // 移动端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
    } : {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: ShortDramaItem[];
    if (isMobile()) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.items || [];
      result = items.map((item: any) => ({
        id: item.vod_id || item.id,
        name: item.vod_name || item.name,
        cover: item.vod_pic || item.cover,
        update_time: item.vod_time || item.update_time || new Date().toISOString(),
        score: item.vod_score || item.score || 0,
        episode_count: parseInt(item.vod_remarks?.replace(/[^\d]/g, '') || '1'),
        description: item.vod_content || item.description || '',
        author: item.vod_actor || item.author || '',
        backdrop: item.vod_pic_slide || item.backdrop || item.vod_pic || item.cover,
        vote_average: item.vod_score || item.vote_average || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));
    }

    // 缓存结果
    await setCache(cacheKey, result, SHORTDRAMA_CACHE_EXPIRE.recommends);
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
    // 临时禁用缓存进行测试 - 移动端强制刷新
    if (!isMobile()) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const apiUrl = isMobile()
      ? `/api/shortdrama/list?categoryId=${category}&page=${page}&size=${size}`
      : `${SHORTDRAMA_API_BASE}/vod/list?categoryId=${category}&page=${page}&size=${size}`;

    const fetchOptions: RequestInit = isMobile() ? {
      // 移动端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
    } : {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: { list: ShortDramaItem[]; hasMore: boolean };
    if (isMobile()) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.list || [];
      const list = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        cover: item.cover,
        update_time: item.update_time || new Date().toISOString(),
        score: item.score || 0,
        episode_count: 1, // 分页API没有集数信息，ShortDramaCard会自动获取
        description: item.description || '',
        author: item.author || '',
        backdrop: item.backdrop || item.cover,
        vote_average: item.vote_average || item.score || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));

      result = {
        list,
        hasMore: data.currentPage < data.totalPages, // 使用totalPages判断是否还有更多
      };
    }

    // 缓存结果 - 第一页缓存时间更长
    const cacheTime = page === 1 ? SHORTDRAMA_CACHE_EXPIRE.lists * 2 : SHORTDRAMA_CACHE_EXPIRE.lists;
    await setCache(cacheKey, result, cacheTime);
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
    const apiUrl = isMobile()
      ? `/api/shortdrama/search?query=${encodeURIComponent(query)}&page=${page}&size=${size}`
      : `${SHORTDRAMA_API_BASE}/vod/search?name=${encodeURIComponent(query)}&page=${page}&size=${size}`;

    const fetchOptions: RequestInit = isMobile() ? {
      // 移动端：让浏览器使用HTTP缓存，不添加破坏缓存的headers
    } : {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    let result: { list: ShortDramaItem[]; hasMore: boolean };
    if (isMobile()) {
      result = data; // 内部API已经处理过格式
    } else {
      // 外部API的处理逻辑
      const items = data.list || [];
      const list = items.map((item: any) => ({
        id: item.id,
        name: item.name,
        cover: item.cover,
        update_time: item.update_time || new Date().toISOString(),
        score: item.score || 0,
        episode_count: 1, // 搜索API没有集数信息，ShortDramaCard会自动获取
        description: item.description || '',
        author: item.author || '',
        backdrop: item.backdrop || item.cover,
        vote_average: item.vote_average || item.score || 0,
        tmdb_id: item.tmdb_id || undefined,
      }));

      result = {
        list,
        hasMore: data.currentPage < data.totalPages,
      };
    }

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
    const alternativeApiBase = alternativeApiUrl;

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!episodesResponse.ok) {
      throw new Error(`Episodes fetch failed: ${episodesResponse.status}`);
    }

    const episodesData = await episodesResponse.json();

    // 验证集数数据
    if (!episodesData || !episodesData.data || !Array.isArray(episodesData.data)) {
      throw new Error('备用API返回的集数列表格式错误');
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

    const targetEpisode = episodesData.data[episodeIndex];
    if (!targetEpisode || !targetEpisode.id) {
      throw new Error(`集数 ${episode} 的数据不完整`);
    }

    const episodeId = targetEpisode.id;

    // Step 3: Get the direct link for the episode
    const directUrl = `${alternativeApiBase}/api/v1/drama/direct?episodeId=${episodeId}`;
    const directResponse = await fetch(directUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!directResponse.ok) {
      throw new Error(`Direct link fetch failed: ${directResponse.status}`);
    }

    const directData = await directResponse.json();

    // 验证播放链接数据
    if (!directData || !directData.url) {
      throw new Error('备用API未返回播放链接');
    }

    // 将 http:// 转换为 https:// 避免 Mixed Content 错误
    const videoUrl = (directData.url || '').replace(/^http:\/\//i, 'https://');

    // 备用API的视频链接通过代理访问（避免防盗链限制）
    const proxyUrl = `/api/proxy/shortdrama?url=${encodeURIComponent(videoUrl)}`;

    return {
      code: 0,
      data: {
        videoId: dramaId,
        videoName: firstDrama.name,
        currentEpisode: episode,
        totalEpisodes: episodesData.data.length,
        parsedUrl: proxyUrl,
        proxyUrl: proxyUrl,
        cover: directData.pic || firstDrama.pic || '',
        description: firstDrama.overview || '',
        episode: {
          index: episode,
          label: `第${episode}集`,
          parsedUrl: proxyUrl,
          proxyUrl: proxyUrl,
          title: directData.title || `第${episode}集`,
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
      msg: `备用API错误: ${errorMsg}`,
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
      : `${SHORTDRAMA_API_BASE}/vod/parse/single?${params.toString()}`;

    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    } : {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
        msg: data.msg || '解析失败',
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
      msg: '网络请求失败',
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
      : `${SHORTDRAMA_API_BASE}/vod/parse/batch?${params.toString()}`;

    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    } : {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
      : `${SHORTDRAMA_API_BASE}/vod/parse/all?${params.toString()}`;

    const fetchOptions: RequestInit = isMobile() ? {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    } : {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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