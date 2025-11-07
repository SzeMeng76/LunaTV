/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { ReleaseCalendarItem } from './types';

const baseUrl = 'https://g.manmankan.com/dy2013';

/**
 * 生成唯一ID
 */
function generateId(title: string): string {
  return title.replace(/[^\w\u4e00-\u9fa5]/g, '').substring(0, 20);
}

/**
 * 解析电影HTML页面
 */
function parseMovieHTML(html: string): ReleaseCalendarItem[] {
  const items: ReleaseCalendarItem[] = [];
  const now = Date.now();

  try {
    // 包含所有电影条目，包括隐藏的（dis_none）条目
    const itemBlocks = html.split(/<dl class="(?:twlist-block|dis_none)">/);

    for (let i = 1; i < itemBlocks.length; i++) {
      const block = itemBlocks[i];

      // 提取标题 - 从dd-d1 div中
      const titleMatch = /<div class="dd-d1"><a[^>]*title="[^"]*">([^<]+)<\/a><\/div>/.exec(block);

      // 提取导演
      const directorMatch = /<div>导演：([^<]*)<\/div>/.exec(block);

      // 提取地区 - 需要处理链接
      const regionMatch = /<div>地区：<a[^>]*>([^<]*)<\/a><\/div>/.exec(block);

      // 提取类型 - 需要处理多个链接
      const genreMatch = /<div>类型：(.*?)<\/div>/.exec(block);

      // 提取上映时间
      const dateMatch = /<div>上映时间：(\d{4}\/\d{2}\/\d{2})<\/div>/.exec(block);

      // 提取主演 - 需要处理多个链接
      const actorsMatch = /<div class="dd-d2">主演：(.*?)<\/div>/.exec(block);

      // 提取海报图片 - 优先从 data-original 获取（懒加载），否则从 src
      const dataOriginalMatch = /<img[^>]*data-original=["']([^"']+)["']/.exec(block);
      const srcMatch = /<img[^>]*src=["']([^"']+)["']/.exec(block);

      let coverUrl: string | undefined;
      if (dataOriginalMatch) {
        coverUrl = dataOriginalMatch[1].trim();
      } else if (srcMatch) {
        coverUrl = srcMatch[1].trim();
      }

      // 处理海报URL：添加协议前缀
      if (coverUrl && coverUrl.startsWith('//')) {
        coverUrl = 'https:' + coverUrl;
      }
      // 过滤掉占位符图片
      if (coverUrl && coverUrl.includes('loadimg.gif')) {
        coverUrl = undefined;
      }

      if (titleMatch && dateMatch) {
        const title = titleMatch[1].trim();
        const dateStr = dateMatch[1].replace(/\//g, '-'); // 转换日期格式

        // 只保留今天及以后的数据
        const today = new Date().toISOString().split('T')[0];
        if (dateStr < today) {
          continue;
        }

        const director = directorMatch ? directorMatch[1].trim() : '未知';
        const region = regionMatch ? regionMatch[1].trim() : '未知';

        // 清理类型字段，移除HTML标签并保留斜杠分隔
        let genre = genreMatch ? genreMatch[1].trim() : '未知';
        genre = genre.replace(/<a[^>]*>([^<]*)<\/a>/g, '$1').replace(/\s+/g, ' ').trim();

        // 清理主演字段，移除HTML标签并保留斜杠分隔
        let actors = actorsMatch ? actorsMatch[1].trim() : '未知';
        actors = actors.replace(/<a[^>]*>([^<]*)<\/a>/g, '$1').replace(/\s+/g, ' ').trim();

        if (title && !title.includes('暂无')) {
          const item: ReleaseCalendarItem = {
            id: `movie_${dateStr}_${generateId(title)}`,
            title: title,
            type: 'movie',
            director: director,
            actors: actors,
            region: region,
            genre: genre,
            releaseDate: dateStr,
            cover: coverUrl,
            source: 'manmankan',
            createdAt: now,
            updatedAt: now,
          };

          items.push(item);
        }
      }
    }
  } catch (error) {
    console.error('解析电影HTML失败:', error);
  }

  return items;
}

/**
 * 解析电视剧HTML页面
 */
function parseTVHTML(html: string): ReleaseCalendarItem[] {
  const items: ReleaseCalendarItem[] = [];
  const now = Date.now();

  try {
    // 包含所有电视剧条目，包括隐藏的（dis_none）条目
    const itemBlocks = html.split(/<dl class="(?:twlist-block|dis_none)">/);

    for (let i = 1; i < itemBlocks.length; i++) {
      const block = itemBlocks[i];

      // 提取标题 - 从dd-d1 div中
      const titleMatch = /<div class="dd-d1"><a[^>]*title="[^"]*">([^<]+)<\/a><\/div>/.exec(block);

      // 提取导演
      const directorMatch = /<div>导演：([^<]*)<\/div>/.exec(block);

      // 提取地区 - 需要处理链接
      const regionMatch = /<div>地区：<a[^>]*>([^<]*)<\/a><\/div>/.exec(block);

      // 提取类型 - 需要处理多个链接
      const genreMatch = /<div>类型：(.*?)<\/div>/.exec(block);

      // 提取上映时间
      const dateMatch = /<div>上映时间：(\d{4}\/\d{2}\/\d{2})<\/div>/.exec(block);

      // 提取主演 - 需要处理多个链接
      const actorsMatch = /<div class="dd-d2">主演：(.*?)<\/div>/.exec(block);

      // 提取海报图片 - 优先从 data-original 获取（懒加载），否则从 src
      const dataOriginalMatch = /<img[^>]*data-original=["']([^"']+)["']/.exec(block);
      const srcMatch = /<img[^>]*src=["']([^"']+)["']/.exec(block);

      let coverUrl: string | undefined;
      if (dataOriginalMatch) {
        coverUrl = dataOriginalMatch[1].trim();
      } else if (srcMatch) {
        coverUrl = srcMatch[1].trim();
      }

      // 处理海报URL：添加协议前缀
      if (coverUrl && coverUrl.startsWith('//')) {
        coverUrl = 'https:' + coverUrl;
      }
      // 过滤掉占位符图片
      if (coverUrl && coverUrl.includes('loadimg.gif')) {
        coverUrl = undefined;
      }

      if (titleMatch && dateMatch) {
        const title = titleMatch[1].trim();
        const dateStr = dateMatch[1].replace(/\//g, '-'); // 转换日期格式

        // 只保留今天及以后的数据
        const today = new Date().toISOString().split('T')[0];
        if (dateStr < today) {
          continue;
        }

        const director = directorMatch ? directorMatch[1].trim() : '未知';
        const region = regionMatch ? regionMatch[1].trim() : '未知';

        // 清理类型字段，移除HTML标签并保留斜杠分隔
        let genre = genreMatch ? genreMatch[1].trim() : '未知';
        genre = genre.replace(/<a[^>]*>([^<]*)<\/a>/g, '$1').replace(/\s+/g, ' ').trim();

        // 清理主演字段，移除HTML标签并保留斜杠分隔
        let actors = actorsMatch ? actorsMatch[1].trim() : '未知';
        actors = actors.replace(/<a[^>]*>([^<]*)<\/a>/g, '$1').replace(/\s+/g, ' ').trim();

        if (title && !title.includes('暂无')) {
          const item: ReleaseCalendarItem = {
            id: `tv_${dateStr}_${generateId(title)}`,
            title: title,
            type: 'tv',
            director: director,
            actors: actors,
            region: region,
            genre: genre,
            releaseDate: dateStr,
            cover: coverUrl,
            source: 'manmankan',
            createdAt: now,
            updatedAt: now,
          };

          items.push(item);
        }
      }
    }
  } catch (error) {
    console.error('解析电视剧HTML失败:', error);
  }

  return items;
}

/**
 * 抓取电影发布时间表
 */
export async function scrapeMovieReleases(): Promise<ReleaseCalendarItem[]> {
  try {
    const url = `${baseUrl}/dianying/shijianbiao/`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000), // 15秒超时
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parseMovieHTML(html);
  } catch (error) {
    console.error('抓取电影数据失败:', error);
    return [];
  }
}

/**
 * 抓取电视剧发布时间表
 */
export async function scrapeTVReleases(): Promise<ReleaseCalendarItem[]> {
  try {
    const url = `${baseUrl}/dianshiju/shijianbiao/`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000), // 15秒超时
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parseTVHTML(html);
  } catch (error) {
    console.error('抓取电视剧数据失败:', error);
    return [];
  }
}

/**
 * 抓取所有数据
 */
export async function scrapeAllReleases(): Promise<ReleaseCalendarItem[]> {
  try {
    console.log('开始抓取发布日历数据...');

    // 避免并发请求导致的失败，改为顺序执行
    console.log('抓取电影数据...');
    const movies = await scrapeMovieReleases();
    console.log(`电影数据抓取完成: ${movies.length} 部`);

    // 添加延迟避免请求过于频繁
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('抓取电视剧数据...');
    const tvShows = await scrapeTVReleases();
    console.log(`电视剧数据抓取完成: ${tvShows.length} 部`);

    const allItems = [...movies, ...tvShows];
    console.log(`总共抓取到 ${allItems.length} 条发布数据`);

    return allItems;
  } catch (error) {
    console.error('抓取发布日历数据失败:', error);
    return [];
  }
}

/**
 * 获取发布日历数据（带缓存）
 */
export async function getReleaseCalendar(options: {
  type?: 'movie' | 'tv';
  region?: string;
  genre?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{
  items: ReleaseCalendarItem[];
  total: number;
  hasMore: boolean;
}> {
  try {
    // 获取所有数据
    const allItems = await scrapeAllReleases();

    // 应用过滤条件
    let filteredItems = allItems;

    if (options.type) {
      filteredItems = filteredItems.filter(item => item.type === options.type);
    }

    if (options.region && options.region !== '全部') {
      filteredItems = filteredItems.filter(item =>
        item.region.includes(options.region!)
      );
    }

    if (options.genre && options.genre !== '全部') {
      filteredItems = filteredItems.filter(item =>
        item.genre.includes(options.genre!)
      );
    }

    if (options.dateFrom) {
      filteredItems = filteredItems.filter(item =>
        item.releaseDate >= options.dateFrom!
      );
    }

    if (options.dateTo) {
      filteredItems = filteredItems.filter(item =>
        item.releaseDate <= options.dateTo!
      );
    }

    // 按发布日期排序
    filteredItems.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

    const total = filteredItems.length;
    const limit = options.limit;
    const offset = options.offset || 0;

    // 如果没有指定limit，返回所有数据
    const items = limit ? filteredItems.slice(offset, offset + limit) : filteredItems.slice(offset);
    const hasMore = limit ? offset + limit < total : false;

    return { items, total, hasMore };
  } catch (error) {
    console.error('获取发布日历失败:', error);
    return { items: [], total: 0, hasMore: false };
  }
}

/**
 * 获取过滤器选项
 */
export async function getFilters(): Promise<{
  types: Array<{ value: 'movie' | 'tv'; label: string; count: number }>;
  regions: Array<{ value: string; label: string; count: number }>;
  genres: Array<{ value: string; label: string; count: number }>;
}> {
  try {
    const allItems = await scrapeAllReleases();

    // 统计类型
    const typeCount = { movie: 0, tv: 0 };
    allItems.forEach(item => typeCount[item.type]++);

    // 统计地区
    const regionCount: Record<string, number> = {};
    allItems.forEach(item => {
      const region = item.region || '未知';
      regionCount[region] = (regionCount[region] || 0) + 1;
    });

    // 统计类型/标签
    const genreCount: Record<string, number> = {};
    allItems.forEach(item => {
      const genre = item.genre || '未知';
      genreCount[genre] = (genreCount[genre] || 0) + 1;
    });

    return {
      types: [
        { value: 'movie', label: '电影', count: typeCount.movie },
        { value: 'tv', label: '电视剧', count: typeCount.tv },
      ],
      regions: Object.entries(regionCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([region, count]) => ({ value: region, label: region, count })),
      genres: Object.entries(genreCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15)
        .map(([genre, count]) => ({ value: genre, label: genre, count })),
    };
  } catch (error) {
    console.error('获取过滤器失败:', error);
    return { types: [], regions: [], genres: [] };
  }
}