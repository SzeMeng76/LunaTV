/* eslint-disable @typescript-eslint/no-explicit-any */

import { getConfig } from '@/lib/config';

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
  }>;
  total?: number;
  source: 'tmdb';
}

/**
 * 检查TMDB是否已配置并启用
 */
export async function isTMDBEnabled(): Promise<boolean> {
  const config = await getConfig();
  return !!(config.SiteConfig.EnableTMDBActorSearch && config.SiteConfig.TMDBApiKey);
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
  return await fetchTMDB<TMDBPersonSearchResponse>('/search/person', {
    query: query.trim(),
    page: page.toString()
  });
}

/**
 * 获取演员的电影作品
 */
export async function getTMDBPersonMovies(personId: number): Promise<TMDBMovieCreditsResponse> {
  return await fetchTMDB<TMDBMovieCreditsResponse>(`/person/${personId}/movie_credits`);
}

/**
 * 获取演员的电视剧作品
 */
export async function getTMDBPersonTVShows(personId: number): Promise<TMDBTVCreditsResponse> {
  return await fetchTMDB<TMDBTVCreditsResponse>(`/person/${personId}/tv_credits`);
}

/**
 * 按演员名字搜索相关作品（主要功能）
 */
export async function searchTMDBActorWorks(
  actorName: string,
  type: 'movie' | 'tv' = 'movie',
  limit = 999
): Promise<TMDBResult> {
  try {
    // 检查是否启用
    if (!(await isTMDBEnabled())) {
      return {
        code: 500,
        message: 'TMDB演员搜索功能未启用或API Key未配置',
        list: [],
        source: 'tmdb'
      };
    }

    console.log(`[TMDB演员搜索] 搜索演员: ${actorName}, 类型: ${type}`);

    // 1. 先搜索演员
    const personSearch = await searchTMDBPerson(actorName);

    if (personSearch.results.length === 0) {
      return {
        code: 200,
        message: '未找到相关演员',
        list: [],
        total: 0,
        source: 'tmdb'
      };
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

    // 4. 按评分和发布时间排序
    works.sort((a: any, b: any) => {
      // 先按评分排序
      const ratingDiff = (b.vote_average || 0) - (a.vote_average || 0);
      if (ratingDiff !== 0) return ratingDiff;

      // 评分相同则按时间排序（新的在前）
      const dateA = new Date(a.release_date || a.first_air_date || '1900-01-01');
      const dateB = new Date(b.release_date || b.first_air_date || '1900-01-01');
      return dateB.getTime() - dateA.getTime();
    });

    // 5. 转换为统一格式
    const list = works
      .map((work: any) => {
        const releaseDate = work.release_date || work.first_air_date || '';
        const year = releaseDate ? new Date(releaseDate).getFullYear().toString() : '';

        return {
          id: work.id.toString(),
          title: work.title || work.name || '',
          poster: work.poster_path ? `${TMDB_IMAGE_BASE_URL}${work.poster_path}` : '',
          rate: work.vote_average ? work.vote_average.toFixed(1) : '',
          year: year
        };
      })
      .filter(work => work.title); // 过滤掉没有标题的

    console.log(`[TMDB演员搜索] 找到 ${list.length} 个${type === 'movie' ? '电影' : '电视剧'}作品`);

    return {
      code: 200,
      message: '获取成功',
      list: list,
      total: works.length,
      source: 'tmdb'
    };

  } catch (error) {
    console.error(`[TMDB演员搜索] 搜索失败:`, error);
    return {
      code: 500,
      message: `搜索失败: ${(error as Error).message}`,
      list: [],
      source: 'tmdb'
    };
  }
}