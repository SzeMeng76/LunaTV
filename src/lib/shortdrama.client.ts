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
      mode: 'cors',
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
      mode: 'cors',
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
      mode: 'cors',
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
      mode: 'cors',
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

// 解析单集视频（支持跨域代理）
export async function parseShortDramaEpisode(
  id: number,
  episode: number,
  useProxy = true
): Promise<ShortDramaParseResult> {
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
      mode: 'cors',
    };

    const response = await fetch(apiUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // API可能返回错误信息
    if (data.code === 1) {
      return {
        code: data.code,
        msg: data.msg || '解析失败',
      };
    }

    // API成功时直接返回数据对象，根据实际结构解析
    return {
      code: 0,
      data: {
        videoId: data.videoId || id,
        videoName: data.videoName || '',
        currentEpisode: data.episode?.index || episode,
        totalEpisodes: data.totalEpisodes || 1,
        parsedUrl: data.episode?.parsedUrl || data.parsedUrl || '',
        proxyUrl: data.episode?.proxyUrl || '', // proxyUrl在episode对象内
        cover: data.cover || '',
        description: data.description || '',
        episode: data.episode || null, // 保留原始episode对象
      },
    };
  } catch (error) {
    console.error('解析短剧集数失败:', error);
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
      mode: 'cors',
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
      mode: 'cors',
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