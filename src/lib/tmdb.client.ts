/* eslint-disable @typescript-eslint/no-explicit-any */

import { getConfig } from '@/lib/config';
import { TMDB_CACHE_EXPIRE, getCacheKey, getCache, setCache } from '@/lib/tmdb-cache';
import { ReleaseCalendarItem } from '@/lib/types';

// TMDB API 配置
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

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

  console.log(`[TMDB API] 请求: ${endpoint}`);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
          poster: work.poster_path ? `${TMDB_IMAGE_BASE_URL}${work.poster_path}` : '',
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

// ========================================
// Release Calendar 相关函数
// ========================================

/**
 * 获取 TMDB API Key（支持用户自定义设置）
 */
async function getTMDBApiKey(): Promise<string | null> {
  try {
    const config = await getConfig();

    // 优先使用用户设置的 TMDB API Key
    if (config?.SiteConfig?.TMDBApiKey && config.SiteConfig.TMDBApiKey.trim()) {
      return config.SiteConfig.TMDBApiKey.trim();
    }

    // 没有用户设置，返回 null（表示用户未配置）
    return null;
  } catch (error) {
    console.error('[TMDB] 获取 API Key 失败:', error);
    return null;
  }
}

/**
 * 获取电影即将上映列表
 * @param page 页码
 * @param region 地区代码 (如: CN, US, TW, HK)
 */
export async function getMovieUpcoming(page: number = 1, region?: string): Promise<any> {
  try {
    const apiKey = await getTMDBApiKey();
    if (!apiKey) {
      console.log('[TMDB] 用户未设置 TMDB API Key，跳过获取即将上映电影数据');
      return null;
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      language: 'zh-CN',
      page: page.toString(),
    });

    if (region) {
      params.append('region', region);
    }

    const url = `${TMDB_BASE_URL}/movie/upcoming?${params.toString()}`;
    console.log(`[TMDB] 获取即将上映电影: page=${page}, region=${region || 'all'}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[TMDB] 获取即将上映电影失败:', error);
    return null;
  }
}

/**
 * 获取电影正在上映列表
 * @param page 页码
 * @param region 地区代码
 */
export async function getMovieNowPlaying(page: number = 1, region?: string): Promise<any> {
  try {
    const apiKey = await getTMDBApiKey();
    if (!apiKey) {
      console.log('[TMDB] 用户未设置 TMDB API Key，跳过获取正在上映电影数据');
      return null;
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      language: 'zh-CN',
      page: page.toString(),
    });

    if (region) {
      params.append('region', region);
    }

    const url = `${TMDB_BASE_URL}/movie/now_playing?${params.toString()}`;
    console.log(`[TMDB] 获取正在上映电影: page=${page}, region=${region || 'all'}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[TMDB] 获取正在上映电影失败:', error);
    return null;
  }
}

/**
 * 获取电视剧今日播出列表
 * @param page 页码
 */
export async function getTVAiringToday(page: number = 1): Promise<any> {
  try {
    const apiKey = await getTMDBApiKey();
    if (!apiKey) {
      console.log('[TMDB] 用户未设置 TMDB API Key，跳过获取今日播出电视剧数据');
      return null;
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      language: 'zh-CN',
      page: page.toString(),
    });

    const url = `${TMDB_BASE_URL}/tv/airing_today?${params.toString()}`;
    console.log(`[TMDB] 获取今日播出电视剧: page=${page}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[TMDB] 获取今日播出电视剧失败:', error);
    return null;
  }
}

/**
 * 获取电视剧正在播出列表
 * @param page 页码
 */
export async function getTVOnTheAir(page: number = 1): Promise<any> {
  try {
    const apiKey = await getTMDBApiKey();
    if (!apiKey) {
      console.log('[TMDB] 用户未设置 TMDB API Key，跳过获取正在播出电视剧数据');
      return null;
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      language: 'zh-CN',
      page: page.toString(),
    });

    const url = `${TMDB_BASE_URL}/tv/on_the_air?${params.toString()}`;
    console.log(`[TMDB] 获取正在播出电视剧: page=${page}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[TMDB] 获取正在播出电视剧失败:', error);
    return null;
  }
}

/**
 * 获取电影或电视剧的详细信息（包含演职员信息）
 * @param id TMDB ID
 * @param type 类型 (movie 或 tv)
 */
export async function getTMDBDetails(id: number, type: 'movie' | 'tv'): Promise<any> {
  try {
    const apiKey = await getTMDBApiKey();
    if (!apiKey) {
      return null;
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      language: 'zh-CN',
      append_to_response: 'credits,release_dates,content_ratings', // 获取演职员、上映日期、分级信息
    });

    const url = `${TMDB_BASE_URL}/${type}/${id}?${params.toString()}`;
    console.log(`[TMDB] 获取详情: ${type}/${id}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[TMDB] 获取${type}详情失败:`, error);
    return null;
  }
}

/**
 * 将 TMDB 电影数据转换为 ReleaseCalendarItem 格式
 * 实现中文优先逻辑：有中文标题就用中文，否则用原标题
 */
export async function convertTMDBMovieToCalendarItem(movie: any): Promise<ReleaseCalendarItem | null> {
  try {
    if (!movie || !movie.id) {
      return null;
    }

    // 🔥 先过滤日期，避免浪费API调用获取详情（保留过去7天内和未来的电影）
    const releaseDate = movie.release_date || '';
    const title = movie.title || movie.original_title || '';

    if (releaseDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      if (releaseDate < sevenDaysAgoStr) {
        console.log(`[TMDB] 过滤掉旧电影: ${title} (${releaseDate})`);
        return null; // 过滤掉超过7天前的电影
      }
    }

    // 获取详细信息（包含演职员）
    const details = await getTMDBDetails(movie.id, 'movie');
    const now = Date.now();

    // 获取导演（从 crew 中筛选）
    let director = '未知';
    if (details?.credits?.crew) {
      const directors = details.credits.crew
        .filter((person: any) => person.job === 'Director')
        .map((person: any) => person.name)
        .slice(0, 3); // 最多3个导演
      if (directors.length > 0) {
        director = directors.join('/');
      }
    }

    // 获取主演（从 cast 中获取，中文 API 返回的就是中文名）
    let actors = '未知';
    if (details?.credits?.cast) {
      const castNames = details.credits.cast
        .slice(0, 5) // 前5个演员
        .map((person: any) => person.name)
        .filter((name: string) => name);
      if (castNames.length > 0) {
        actors = castNames.join('/');
      }
    }

    // 获取地区（从 production_countries 获取）
    let region = '未知';
    if (details?.production_countries && details.production_countries.length > 0) {
      const countries = details.production_countries
        .map((country: any) => country.name || country.iso_3166_1)
        .slice(0, 3);
      region = countries.join('/');
    }

    // 获取类型（从 genres 获取，中文 API 返回中文类型）
    let genre = '未知';
    if (details?.genres && details.genres.length > 0) {
      const genres = details.genres
        .map((g: any) => g.name)
        .slice(0, 3);
      genre = genres.join('/');
    }

    // 海报图片
    const cover = movie.poster_path
      ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}`
      : undefined;

    // 简介（中文 API 返回中文简介）
    const description = movie.overview || details?.overview || undefined;

    const item: ReleaseCalendarItem = {
      id: `tmdb_movie_${movie.id}`,
      title,
      type: 'movie',
      director,
      actors,
      region,
      genre,
      releaseDate,
      cover,
      description,
      source: 'tmdb',
      createdAt: now,
      updatedAt: now,
    };

    return item;
  } catch (error) {
    console.error('[TMDB] 转换电影数据失败:', error);
    return null;
  }
}

/**
 * 将 TMDB 电视剧数据转换为 ReleaseCalendarItem 格式
 */
export async function convertTMDBTVToCalendarItem(tv: any): Promise<ReleaseCalendarItem | null> {
  try {
    if (!tv || !tv.id) {
      return null;
    }

    // 🔥 先过滤日期，避免浪费API调用获取详情（保留过去7天内和未来的电视剧）
    const releaseDate = tv.first_air_date || '';
    const title = tv.name || tv.original_name || '';

    if (releaseDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      if (releaseDate < sevenDaysAgoStr) {
        console.log(`[TMDB] 过滤掉旧电视剧: ${title} (${releaseDate})`);
        return null; // 过滤掉超过7天前的电视剧
      }
    }

    // 获取详细信息（包含演职员）
    const details = await getTMDBDetails(tv.id, 'tv');
    const now = Date.now();

    // 获取导演/创作者
    let director = '未知';
    if (details?.created_by && details.created_by.length > 0) {
      const creators = details.created_by
        .map((person: any) => person.name)
        .slice(0, 3);
      director = creators.join('/');
    } else if (details?.credits?.crew) {
      // 如果没有创作者，尝试从 crew 获取导演
      const directors = details.credits.crew
        .filter((person: any) => person.job === 'Director' || person.job === 'Executive Producer')
        .map((person: any) => person.name)
        .slice(0, 3);
      if (directors.length > 0) {
        director = directors.join('/');
      }
    }

    // 获取主演
    let actors = '未知';
    if (details?.credits?.cast) {
      const castNames = details.credits.cast
        .slice(0, 5)
        .map((person: any) => person.name)
        .filter((name: string) => name);
      if (castNames.length > 0) {
        actors = castNames.join('/');
      }
    }

    // 获取地区
    let region = '未知';
    if (details?.production_countries && details.production_countries.length > 0) {
      const countries = details.production_countries
        .map((country: any) => country.name || country.iso_3166_1)
        .slice(0, 3);
      region = countries.join('/');
    } else if (details?.origin_country && details.origin_country.length > 0) {
      region = details.origin_country.slice(0, 3).join('/');
    }

    // 获取类型
    let genre = '未知';
    if (details?.genres && details.genres.length > 0) {
      const genres = details.genres
        .map((g: any) => g.name)
        .slice(0, 3);
      genre = genres.join('/');
    }

    // 海报图片
    const cover = tv.poster_path
      ? `${TMDB_IMAGE_BASE_URL}${tv.poster_path}`
      : undefined;

    // 简介
    const description = tv.overview || details?.overview || undefined;

    // 集数
    const episodes = details?.number_of_episodes || undefined;

    const item: ReleaseCalendarItem = {
      id: `tmdb_tv_${tv.id}`,
      title,
      type: 'tv',
      director,
      actors,
      region,
      genre,
      releaseDate,
      cover,
      description,
      episodes,
      source: 'tmdb',
      createdAt: now,
      updatedAt: now,
    };

    return item;
  } catch (error) {
    console.error('[TMDB] 转换电视剧数据失败:', error);
    return null;
  }
}