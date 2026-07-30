/* eslint-disable @typescript-eslint/no-explicit-any */

import { getConfig } from '@/lib/config';
import type { AdminConfig } from '@/lib/admin.types';
import { TMDB_CACHE_EXPIRE, getCacheKey, getCache, setCache } from '@/lib/tmdb-cache';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

// TMDB API 配置
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

/**
 * 若已启用 VideoProxyConfig（Cloudflare Worker 代理），把目标 URL 包一层代理，
 * 用于绕过 TMDB 在国内的访问限制/加速图片加载。未启用时原样返回。
 */
export function applyCorsProxy(url: string, config: AdminConfig): string {
  const proxyConfig = config.VideoProxyConfig;
  if (!proxyConfig?.enabled || !proxyConfig.proxyUrl) return url;
  const base = proxyConfig.proxyUrl.replace(/\/$/, '');
  return `${base}/?url=${encodeURIComponent(url)}`;
}

// TMDB API 响应类型
interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
}

interface TMDBPersonSearchResponse {
  page: number;
  results: TMDBPerson[];
  total_pages: number;
  total_results: number;
}

interface TMDBMovieCredit {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  character?: string;
  job?: string;
}

interface TMDBTVCredit {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date: string;
  vote_average: number;
  character?: string;
  job?: string;
}

interface TMDBMovieCreditsResponse {
  id: number;
  cast: TMDBMovieCredit[];
  crew: TMDBMovieCredit[];
}

interface TMDBTVCreditsResponse {
  id: number;
  cast: TMDBTVCredit[];
  crew: TMDBTVCredit[];
}

// 统一的返回格式，兼容现有的 DoubanItem
export interface TMDBResult {
  code: number;
  message: string;
  list: Array<{
    id: string;
    title: string;
    poster: string;
    rate: string;
    year: string;
    popularity?: number;
    vote_count?: number;
    genre_ids?: number[];
    character?: string;
    episode_count?: number;
    original_language?: string;
  }>;
  total?: number;
  source: 'tmdb';
}

// TMDB筛选排序参数
export interface TMDBFilterOptions {
  // 时间筛选
  startYear?: number;
  endYear?: number;

  // 评分筛选
  minRating?: number;
  maxRating?: number;

  // 人气筛选
  minPopularity?: number;
  maxPopularity?: number;

  // 投票数筛选
  minVoteCount?: number;

  // 类型筛选（TMDB类型ID）
  genreIds?: number[];

  // 语言筛选
  languages?: string[];

  // 参演集数筛选（TV剧用）
  minEpisodeCount?: number;

  // 只显示有评分的
  onlyRated?: boolean;

  // 排序方式
  sortBy?: 'rating' | 'date' | 'popularity' | 'vote_count' | 'title' | 'episode_count';
  sortOrder?: 'asc' | 'desc';

  // 结果限制
  limit?: number;
}

/**
 * 检查TMDB是否已配置并启用
 */
export async function isTMDBEnabled(): Promise<boolean> {
  const config = await getConfig();
  return !!(config.SiteConfig.EnableTMDBActorSearch && config.SiteConfig.TMDBApiKey);
}

/**
 * 通过标题搜索电影
 */
export async function searchTMDBMovie(
  title: string,
  year?: string
): Promise<{ id: number; title: string; release_date: string; vote_average: number } | null> {
  try {
    // 检查缓存
    const cacheKey = getCacheKey('movie_search', { title: title.trim(), year: year || '' });
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`TMDB电影搜索缓存命中: ${title}`);
      return cached;
    }

    const params: Record<string, string> = {
      query: title.trim(),
    };
    if (year) {
      params.year = year;
    }

    const response = await fetchTMDB<any>('/search/movie', params);

    if (response.results && response.results.length > 0) {
      // 取第一个结果（最匹配的）
      const result = {
        id: response.results[0].id,
        title: response.results[0].title,
        release_date: response.results[0].release_date || '',
        vote_average: response.results[0].vote_average || 0,
      };

      // 保存到缓存
      await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.actor_search);
      console.log(`TMDB电影搜索成功: ${title} -> ID ${result.id}`);

      return result;
    }

    console.log(`TMDB电影搜索无结果: ${title}`);
    return null;
  } catch (error) {
    console.error(`搜索TMDB电影失败 (${title}):`, error);
    return null;
  }
}

/**
 * 通过标题搜索电视剧
 */
export async function searchTMDBTV(
  title: string,
  year?: string
): Promise<{ id: number; name: string; first_air_date: string; vote_average: number } | null> {
  try {
    // 检查缓存
    const cacheKey = getCacheKey('tv_search', { title: title.trim(), year: year || '' });
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`TMDB电视剧搜索缓存命中: ${title}`);
      return cached;
    }

    const params: Record<string, string> = {
      query: title.trim(),
    };
    if (year) {
      params.first_air_date_year = year;
    }

    const response = await fetchTMDB<any>('/search/tv', params);

    if (response.results && response.results.length > 0) {
      // 取第一个结果（最匹配的）
      const result = {
        id: response.results[0].id,
        name: response.results[0].name,
        first_air_date: response.results[0].first_air_date || '',
        vote_average: response.results[0].vote_average || 0,
      };

      // 保存到缓存
      await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.actor_search);
      console.log(`TMDB电视剧搜索成功: ${title} -> ID ${result.id}`);

      return result;
    }

    console.log(`TMDB电视剧搜索无结果: ${title}`);
    return null;
  } catch (error) {
    console.error(`搜索TMDB电视剧失败 (${title}):`, error);
    return null;
  }
}

/**
 * 调用TMDB API的通用函数
 */
async function fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const config = await getConfig();

  if (!config.SiteConfig.TMDBApiKey) {
    throw new Error('TMDB API Key 未配置');
  }

  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.append('api_key', config.SiteConfig.TMDBApiKey);
  url.searchParams.append('language', config.SiteConfig.TMDBLanguage || 'zh-CN');

  // 添加其他参数
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const requestUrl = applyCorsProxy(url.toString(), config);
  console.log(`[TMDB API] 请求: ${endpoint}`);

  const response = await fetch(requestUrl, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
    }
  });

  if (!response.ok) {
    throw new Error(`TMDB API错误: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 搜索演员
 */
export async function searchTMDBPerson(query: string, page = 1): Promise<TMDBPersonSearchResponse> {
  // 检查缓存
  const cacheKey = getCacheKey('person_search', { query: query.trim(), page });
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`TMDB演员搜索缓存命中: ${query}`);
    return cached;
  }

  const result = await fetchTMDB<TMDBPersonSearchResponse>('/search/person', {
    query: query.trim(),
    page: page.toString()
  });

  // 保存到缓存
  await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.actor_search);
  console.log(`TMDB演员搜索已缓存: ${query}`);

  return result;
}

/**
 * 获取演员的电影作品
 */
export async function getTMDBPersonMovies(personId: number): Promise<TMDBMovieCreditsResponse> {
  // 检查缓存
  const cacheKey = getCacheKey('movie_credits', { personId });
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`TMDB演员电影作品缓存命中: ${personId}`);
    return cached;
  }

  const result = await fetchTMDB<TMDBMovieCreditsResponse>(`/person/${personId}/movie_credits`);

  // 保存到缓存
  await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.movie_credits);
  console.log(`TMDB演员电影作品已缓存: ${personId}`);

  return result;
}

/**
 * 获取演员的电视剧作品
 */
export async function getTMDBPersonTVShows(personId: number): Promise<TMDBTVCreditsResponse> {
  // 检查缓存
  const cacheKey = getCacheKey('tv_credits', { personId });
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`TMDB演员电视剧作品缓存命中: ${personId}`);
    return cached;
  }

  const result = await fetchTMDB<TMDBTVCreditsResponse>(`/person/${personId}/tv_credits`);

  // 保存到缓存
  await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.tv_credits);
  console.log(`TMDB演员电视剧作品已缓存: ${personId}`);

  return result;
}

/**
 * 获取电影详情（包含keywords和similar）
 */
export async function getTMDBMovieDetails(movieId: number): Promise<{
  id: number;
  title: string;
  original_title: string;
  overview: string;
  vote_average: number;
  vote_count: number;
  genres: Array<{ id: number; name: string }>;
  keywords: Array<{ id: number; name: string }>;
  similar: Array<{
    id: number;
    title: string;
    vote_average: number;
    release_date: string;
  }>;
} | null> {
  try {
    // 检查缓存
    const cacheKey = getCacheKey('movie_details', { movieId });
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`TMDB电影详情缓存命中: ${movieId}`);
      return cached;
    }

    // 并行获取详情、keywords、similar
    const [details, keywordsData, similarData] = await Promise.all([
      fetchTMDB(`/movie/${movieId}`, {}),
      fetchTMDB(`/movie/${movieId}/keywords`, {}),
      fetchTMDB(`/movie/${movieId}/similar`, {})
    ]);

    const result = {
      ...(details as any),
      keywords: (keywordsData as any).keywords || [],
      similar: ((similarData as any).results || []).slice(0, 5) // 只取前5个相似影片
    };

    // 保存到缓存
    await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.movie_details);
    console.log(`TMDB电影详情已缓存: ${movieId}`);

    return result;
  } catch (error) {
    console.error(`获取TMDB电影详情失败 (ID: ${movieId}):`, error);
    return null;
  }
}

/**
 * 获取电视剧详情（包含keywords和similar）
 */
export async function getTMDBTVDetails(tvId: number): Promise<{
  id: number;
  name: string;
  original_name: string;
  overview: string;
  vote_average: number;
  vote_count: number;
  genres: Array<{ id: number; name: string }>;
  keywords: Array<{ id: number; name: string }>;
  similar: Array<{
    id: number;
    name: string;
    vote_average: number;
    first_air_date: string;
  }>;
} | null> {
  try {
    // 检查缓存
    const cacheKey = getCacheKey('tv_details', { tvId });
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`TMDB电视剧详情缓存命中: ${tvId}`);
      return cached;
    }

    // 并行获取详情、keywords、similar
    const [details, keywordsData, similarData] = await Promise.all([
      fetchTMDB(`/tv/${tvId}`, {}),
      fetchTMDB(`/tv/${tvId}/keywords`, {}),
      fetchTMDB(`/tv/${tvId}/similar`, {})
    ]);

    const result = {
      ...(details as any),
      keywords: ((keywordsData as any).results || []),
      similar: ((similarData as any).results || []).slice(0, 5) // 只取前5个相似影片
    };

    // 保存到缓存
    await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.tv_details);
    console.log(`TMDB电视剧详情已缓存: ${tvId}`);

    return result;
  } catch (error) {
    console.error(`获取TMDB电视剧详情失败 (ID: ${tvId}):`, error);
    return null;
  }
}

/**
 * 按演员名字搜索相关作品（主要功能）
 */
export async function searchTMDBActorWorks(
  actorName: string,
  type: 'movie' | 'tv' = 'movie',
  filterOptions: TMDBFilterOptions = {}
): Promise<TMDBResult> {
  console.log(`🚀 [TMDB] searchTMDBActorWorks 开始执行: ${actorName}, type=${type}`);

  try {
    console.log(`🔍 [TMDB] 检查是否启用...`);
    // 检查是否启用
    if (!(await isTMDBEnabled())) {
      console.log(`❌ [TMDB] TMDB功能未启用`);
      return {
        code: 500,
        message: 'TMDB演员搜索功能未启用或API Key未配置',
        list: [],
        source: 'tmdb'
      } as TMDBResult;
    }

    console.log(`✅ [TMDB] TMDB功能已启用`);
    const config = await getConfig();
    // 检查缓存 - 为整个搜索结果缓存
    const cacheKey = getCacheKey('actor_works', { actorName, type, ...filterOptions });
    console.log(`🔑 [TMDB] 缓存Key: ${cacheKey}`);

    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`✅ [TMDB] 缓存命中: ${actorName}/${type}`);
      return cached;
    }
    console.log(`❌ [TMDB] 缓存未命中，开始搜索...`);

    console.log(`[TMDB演员搜索] 搜索演员: ${actorName}, 类型: ${type}`);

    // 1. 先搜索演员
    const personSearch = await searchTMDBPerson(actorName);

    if (personSearch.results.length === 0) {
      const result: TMDBResult = {
        code: 200,
        message: '未找到相关演员',
        list: [],
        total: 0,
        source: 'tmdb'
      };
      // 缓存空结果，避免重复请求
      await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.actor_search);
      return result;
    }

    // 2. 取最知名的演员（按人气排序）
    const person = personSearch.results.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
    console.log(`[TMDB演员搜索] 找到演员: ${person.name} (ID: ${person.id})`);

    // 3. 获取该演员的作品
    let works: any[] = [];
    if (type === 'movie') {
      const movieCredits = await getTMDBPersonMovies(person.id);
      works = movieCredits.cast; // 主要关注演员作品，不是幕后工作
    } else {
      const tvCredits = await getTMDBPersonTVShows(person.id);
      works = tvCredits.cast;
    }

    // 4. 应用筛选条件
    let filteredWorks = works.filter((work: any) => {
      const releaseDate = work.release_date || work.first_air_date || '';
      const year = releaseDate ? new Date(releaseDate).getFullYear() : 0;
      const rating = work.vote_average || 0;
      const popularity = work.popularity || 0;
      const voteCount = work.vote_count || 0;
      const episodeCount = work.episode_count || 0;
      const language = work.original_language || '';
      const genreIds = work.genre_ids || [];

      // 时间筛选
      if (filterOptions.startYear && year && year < filterOptions.startYear) return false;
      if (filterOptions.endYear && year && year > filterOptions.endYear) return false;

      // 评分筛选
      if (filterOptions.minRating && rating < filterOptions.minRating) return false;
      if (filterOptions.maxRating && rating > filterOptions.maxRating) return false;

      // 人气筛选
      if (filterOptions.minPopularity && popularity < filterOptions.minPopularity) return false;
      if (filterOptions.maxPopularity && popularity > filterOptions.maxPopularity) return false;

      // 投票数筛选
      if (filterOptions.minVoteCount && voteCount < filterOptions.minVoteCount) return false;

      // 参演集数筛选（TV剧）
      if (filterOptions.minEpisodeCount && type === 'tv' && episodeCount < filterOptions.minEpisodeCount) return false;

      // 只显示有评分的
      if (filterOptions.onlyRated && rating === 0) return false;

      // 类型筛选
      if (filterOptions.genreIds && filterOptions.genreIds.length > 0) {
        const hasMatchingGenre = filterOptions.genreIds.some(id => genreIds.includes(id));
        if (!hasMatchingGenre) return false;
      }

      // 语言筛选
      if (filterOptions.languages && filterOptions.languages.length > 0) {
        if (!filterOptions.languages.includes(language)) return false;
      }

      return true;
    });

    // 5. 排序
    const sortBy = filterOptions.sortBy || 'date';
    const sortOrder = filterOptions.sortOrder || 'desc';
    const orderMultiplier = sortOrder === 'asc' ? -1 : 1;

    filteredWorks.sort((a: any, b: any) => {
      let compareValue = 0;

      switch (sortBy) {
        case 'rating':
          compareValue = ((b.vote_average || 0) - (a.vote_average || 0)) * orderMultiplier;
          break;
        case 'date': {
          const dateA = new Date(a.release_date || a.first_air_date || '1900-01-01');
          const dateB = new Date(b.release_date || b.first_air_date || '1900-01-01');
          compareValue = (dateB.getTime() - dateA.getTime()) * orderMultiplier;
          break;
        }
        case 'popularity':
          compareValue = ((b.popularity || 0) - (a.popularity || 0)) * orderMultiplier;
          break;
        case 'vote_count':
          compareValue = ((b.vote_count || 0) - (a.vote_count || 0)) * orderMultiplier;
          break;
        case 'title': {
          const titleA = (a.title || a.name || '').toLowerCase();
          const titleB = (b.title || b.name || '').toLowerCase();
          compareValue = titleA.localeCompare(titleB) * orderMultiplier;
          break;
        }
        case 'episode_count':
          if (type === 'tv') {
            compareValue = ((b.episode_count || 0) - (a.episode_count || 0)) * orderMultiplier;
          }
          break;
      }

      // 如果主要排序字段相同，使用次要排序（评分 + 时间）
      if (compareValue === 0 && sortBy !== 'rating') {
        const ratingDiff = (b.vote_average || 0) - (a.vote_average || 0);
        if (ratingDiff !== 0) return ratingDiff;

        const dateA = new Date(a.release_date || a.first_air_date || '1900-01-01');
        const dateB = new Date(b.release_date || b.first_air_date || '1900-01-01');
        compareValue = dateB.getTime() - dateA.getTime();
      }

      return compareValue;
    });

    // 6. 应用结果限制
    if (filterOptions.limit && filterOptions.limit > 0) {
      filteredWorks = filteredWorks.slice(0, filterOptions.limit);
    }

    // 7. 转换为统一格式
    const list = filteredWorks
      .map((work: any) => {
        const releaseDate = work.release_date || work.first_air_date || '';
        const year = releaseDate ? new Date(releaseDate).getFullYear().toString() : '';

        return {
          id: work.id.toString(),
          title: work.title || work.name || '',
          poster: work.poster_path ? applyCorsProxy(`${TMDB_IMAGE_BASE_URL}${work.poster_path}`, config) : '',
          rate: work.vote_average ? work.vote_average.toFixed(1) : '',
          year: year,
          popularity: work.popularity,
          vote_count: work.vote_count,
          genre_ids: work.genre_ids,
          character: work.character,
          episode_count: work.episode_count,
          original_language: work.original_language
        };
      })
      .filter(work => work.title); // 过滤掉没有标题的

    console.log(`[TMDB演员搜索] 筛选后找到 ${list.length} 个${type === 'movie' ? '电影' : '电视剧'}作品（原始: ${works.length}）`);

    const result: TMDBResult = {
      code: 200,
      message: '获取成功',
      list: list,
      total: list.length,
      source: 'tmdb'
    };

    // 保存到缓存
    await setCache(cacheKey, result, TMDB_CACHE_EXPIRE.actor_search);
    console.log(`TMDB演员作品搜索已缓存: ${actorName}/${type}`);

    return result;

  } catch (error) {
    console.error(`[TMDB演员搜索] 搜索失败:`, error);
    return {
      code: 500,
      message: `搜索失败: ${(error as Error).message}`,
      list: [],
      source: 'tmdb'
    } as TMDBResult;
  }
}