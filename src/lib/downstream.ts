/* eslint-disable @typescript-eslint/no-explicit-any */

import { API_CONFIG, ApiSite, getConfig } from '@/lib/config';
import { getCachedSearchPage, setCachedSearchPage } from '@/lib/search-cache';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';
// 使用轻量级 switch-chinese 库（93.8KB vs opencc-js 5.6MB）
import stcasc, { ChineseType } from 'switch-chinese';

// 创建模块级别的繁简转换器实例
const converter = stcasc();

interface ApiSearchItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_remarks?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_douban_id?: number;
  type_name?: string;
}

/**
 * 通用的带缓存搜索函数
 */
async function searchWithCache(
  apiSite: ApiSite,
  query: string,
  page: number,
  url: string,
  timeoutMs = 8000
): Promise<{ results: SearchResult[]; pageCount?: number }> {
  // 先查缓存
  const cached = getCachedSearchPage(apiSite.key, query, page);
  if (cached) {
    if (cached.status === 'ok') {
      return { results: cached.data, pageCount: cached.pageCount };
    } else {
      return { results: [] };
    }
  }

  // 缓存未命中，发起网络请求
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 403) {
        setCachedSearchPage(apiSite.key, query, page, 'forbidden', []);
      }
      return { results: [] };
    }

    const data = await response.json();
    if (
      !data ||
      !data.list ||
      !Array.isArray(data.list) ||
      data.list.length === 0
    ) {
      // 空结果不做负缓存要求，这里不写入缓存
      return { results: [] };
    }

    // 处理结果数据
    const allResults = data.list.map((item: ApiSearchItem) => {
      let episodes: string[] = [];
      let titles: string[] = [];

      // 使用正则表达式从 vod_play_url 提取 m3u8 链接
      if (item.vod_play_url) {
        // 先用 $$$ 分割
        const vod_play_url_array = item.vod_play_url.split('$$$');
        // 分集之间#分割，标题和播放链接 $ 分割
        vod_play_url_array.forEach((url: string) => {
          const matchEpisodes: string[] = [];
          const matchTitles: string[] = [];
          const title_url_array = url.split('#');
          title_url_array.forEach((title_url: string) => {
            const episode_title_url = title_url.split('$');
            if (
              episode_title_url.length === 2 &&
              episode_title_url[1].endsWith('.m3u8')
            ) {
              // 标准格式：第1集$https://xxx.m3u8
              matchTitles.push(episode_title_url[0]);
              matchEpisodes.push(episode_title_url[1]);
            } else if (
              episode_title_url.length === 1 &&
              episode_title_url[0].endsWith('.m3u8')
            ) {
              // 纯链接格式：https://xxx.m3u8（无标题信息）
              matchTitles.push(`第${matchEpisodes.length + 1}集`);
              matchEpisodes.push(episode_title_url[0]);
            }
          });
          if (matchEpisodes.length > episodes.length) {
            episodes = matchEpisodes;
            titles = matchTitles;
          }
        });
      }

      return {
        id: item.vod_id.toString(),
        title: item.vod_name.trim().replace(/\s+/g, ' '),
        poster: item.vod_pic?.trim() || '', // 确保poster为有效字符串，过滤空白
        episodes,
        episodes_titles: titles,
        source: apiSite.key,
        source_name: apiSite.name,
        class: item.vod_class,
        year: item.vod_year
          ? item.vod_year.match(/\d{4}/)?.[0] || ''
          : 'unknown',
        desc: cleanHtmlTags(item.vod_content || ''),
        type_name: item.type_name,
        douban_id: item.vod_douban_id,
        remarks: item.vod_remarks, // 传递备注信息（如"已完结"等）
      };
    });

    // 过滤掉集数为 0 的结果
    const results = allResults.filter((result: SearchResult) => result.episodes.length > 0);

    const pageCount = page === 1 ? data.pagecount || 1 : undefined;
    // 写入缓存（成功）
    setCachedSearchPage(apiSite.key, query, page, 'ok', results, pageCount);
    return { results, pageCount };
  } catch (error: any) {
    clearTimeout(timeoutId);
    // 识别被 AbortController 中止（超时）
    const aborted = error?.name === 'AbortError' || error?.code === 20 || error?.message?.includes('aborted');
    if (aborted) {
      setCachedSearchPage(apiSite.key, query, page, 'timeout', []);
    }
    return { results: [] };
  }
}

export async function searchFromApi(
  apiSite: ApiSite,
  query: string,
  precomputedVariants?: string[] // 新增：预计算的变体
): Promise<SearchResult[]> {
  try {
    const apiBaseUrl = apiSite.api;

    // 智能搜索：使用预计算的变体（最多2个，由 generateSearchVariants 智能生成）
    const searchVariants = precomputedVariants || generateSearchVariants(query);

    // 调试：输出搜索变体
    console.log(`[DEBUG] 搜索变体 for "${query}":`, searchVariants);

    // 🚀 并行搜索所有变体（关键优化：不再串行等待）
    const variantPromises = searchVariants.map(async (variant, index) => {
      const apiUrl = apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(variant);
      console.log(`[DEBUG] 并行搜索变体 ${index + 1}/${searchVariants.length}: "${variant}"`);

      try {
        const result = await searchWithCache(apiSite, variant, 1, apiUrl, 8000);
        return { variant, index, results: result.results, pageCount: result.pageCount };
      } catch (error) {
        console.log(`[DEBUG] 变体 "${variant}" 搜索失败:`, error);
        return { variant, index, results: [], pageCount: undefined };
      }
    });

    // 等待所有变体搜索完成
    const variantResults = await Promise.all(variantPromises);

    // 合并结果并去重
    const seenIds = new Set<string>();
    let results: SearchResult[] = [];
    let pageCountFromFirst = 0;

    // 按原始顺序处理结果（保持优先级）
    variantResults.sort((a, b) => a.index - b.index);

    for (const { variant, index, results: variantData, pageCount } of variantResults) {
      if (variantData.length > 0) {
        console.log(`[DEBUG] 变体 "${variant}" 找到 ${variantData.length} 个结果`);

        // 记录第一个变体的页数
        if (index === 0 && pageCount) {
          pageCountFromFirst = pageCount;
        }

        // 去重添加结果
        variantData.forEach(result => {
          const uniqueKey = `${result.source}_${result.id}`;
          if (!seenIds.has(uniqueKey)) {
            seenIds.add(uniqueKey);
            results.push(result);
          }
        });
      } else {
        console.log(`[DEBUG] 变体 "${variant}" 无结果`);
      }
    }

    // 如果没有任何结果，返回空数组
    if (results.length === 0) {
      return [];
    }

    console.log(`[DEBUG] 最终找到 ${results.length} 个唯一结果`);

    // 使用原始查询进行后续分页
    query = searchVariants[0];

    const config = await getConfig();
    const MAX_SEARCH_PAGES: number = config.SiteConfig.SearchDownstreamMaxPage;

    // 获取总页数
    const pageCount = pageCountFromFirst || 1;
    // 确定需要获取的额外页数
    const pagesToFetch = Math.min(pageCount - 1, MAX_SEARCH_PAGES - 1);

    // 如果有额外页数，获取更多页的结果
    if (pagesToFetch > 0) {
      const additionalPagePromises = [];

      for (let page = 2; page <= pagesToFetch + 1; page++) {
        const pageUrl =
          apiBaseUrl +
          API_CONFIG.search.pagePath
            .replace('{query}', encodeURIComponent(query))
            .replace('{page}', page.toString());

        const pagePromise = (async () => {
          // 使用新的缓存搜索函数处理分页
          const pageResult = await searchWithCache(apiSite, query, page, pageUrl, 8000);
          return pageResult.results;
        })();

        additionalPagePromises.push(pagePromise);
      }

      // 等待所有额外页的结果
      const additionalResults = await Promise.all(additionalPagePromises);

      // 合并所有页的结果
      additionalResults.forEach((pageResults) => {
        if (pageResults.length > 0) {
          results.push(...pageResults);
        }
      });
    }

    return results;
  } catch (error) {
    return [];
  }
}

/**
 * 计算搜索结果的相关性分数
 * @param originalQuery 原始查询
 * @param variant 搜索变体
 * @param results 搜索结果
 * @returns 相关性分数（越高越相关）
 */
function calculateRelevanceScore(originalQuery: string, variant: string, results: SearchResult[]): number {
  let score = 0;

  // 基础分数：结果数量（越多越好，但有上限）
  score += Math.min(results.length * 10, 100);

  // 变体质量分数：越接近原始查询越好
  if (variant === originalQuery) {
    score += 1000; // 完全匹配最高分
  } else if (variant.includes('：') && originalQuery.includes(' ')) {
    score += 500; // 空格变冒号的变体较高分
  } else if (variant.includes(':') && originalQuery.includes(' ')) {
    score += 400; // 空格变英文冒号
  }
  // 移除数字变体加分逻辑，依赖智能匹配处理

  // 结果质量分数：检查结果标题的匹配程度
  const originalWords = originalQuery.toLowerCase().replace(/[^\w\s\u4e00-\u9fff]/g, '').split(/\s+/).filter(w => w.length > 0);

  results.forEach(result => {
    const title = result.title.toLowerCase();
    let titleScore = 0;

    // 检查原始查询中的每个词是否在标题中
    let matchedWords = 0;
    originalWords.forEach(word => {
      if (title.includes(word)) {
        // 较长的词（如"血脉诅咒"）给予更高权重
        const wordWeight = word.length > 2 ? 100 : 50;
        titleScore += wordWeight;
        matchedWords++;
      }
    });

    // 完全匹配奖励：所有词都匹配时给予巨大奖励
    if (matchedWords === originalWords.length && originalWords.length > 1) {
      titleScore += 500; // 大幅提高完全匹配的奖励
    }

    // 部分匹配惩罚：如果只匹配了部分词，降低分数
    if (matchedWords < originalWords.length && originalWords.length > 1) {
      titleScore -= 100; // 惩罚不完整匹配
    }

    // 标题长度惩罚：过长的标题降低优先级（可能不够精确）
    if (title.length > 50) {
      titleScore -= 20;
    }

    // 年份奖励：较新的年份获得更高分数
    if (result.year && result.year !== 'unknown') {
      const year = parseInt(result.year);
      if (year >= 2020) {
        titleScore += 30;
      } else if (year >= 2010) {
        titleScore += 10;
      }
    }

    score += titleScore;
  });

  return score;
}

// 匹配 m3u8 链接的正则
const M3U8_PATTERN = /(https?:\/\/[^"'\s]+?\.m3u8)/g;

// 中文数字映射表（用于智能数字变体生成）
const CHINESE_TO_ARABIC: { [key: string]: string } = {
  '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
  '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
};
const ARABIC_TO_CHINESE = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/**
 * 智能生成数字变体（仅在检测到季/部/集数字格式时触发）
 * - "极速车魂第3季" → "极速车魂第三季"
 * - "中国奇谭第二季" → "中国奇谭2"
 * @returns 单个变体或 null（不匹配则不生成）
 */
function generateNumberVariant(query: string): string | null {
  // 模式1: "第X季/部/集/期" 格式（中文数字 → 阿拉伯数字）
  const chinesePattern = /第([一二三四五六七八九十])(季|部|集|期)/;
  const chineseMatch = chinesePattern.exec(query);
  if (chineseMatch) {
    const chineseNum = chineseMatch[1];
    const arabicNum = CHINESE_TO_ARABIC[chineseNum];
    if (arabicNum) {
      // "中国奇谭第二季" → "中国奇谭2"
      const base = query.replace(chineseMatch[0], '').trim();
      if (base) {
        return `${base}${arabicNum}`;
      }
    }
  }

  // 模式2: "第X季/部/集/期" 格式（阿拉伯数字 → 中文数字）
  const arabicPattern = /第(\d+)(季|部|集|期)/;
  const arabicMatch = arabicPattern.exec(query);
  if (arabicMatch) {
    const num = parseInt(arabicMatch[1]);
    const suffix = arabicMatch[2];
    if (num >= 1 && num <= 10) {
      const chineseNum = ARABIC_TO_CHINESE[num];
      // "极速车魂第3季" → "极速车魂第三季"
      return query.replace(arabicMatch[0], `第${chineseNum}${suffix}`);
    }
  }

  // 模式3: 末尾纯数字（如 "中国奇谭2" → "中国奇谭第二季"）
  const endNumberMatch = query.match(/^(.+?)(\d+)$/);
  if (endNumberMatch) {
    const base = endNumberMatch[1].trim();
    const num = parseInt(endNumberMatch[2]);
    if (num >= 1 && num <= 10 && base) {
      const chineseNum = ARABIC_TO_CHINESE[num];
      return `${base}第${chineseNum}季`;
    }
  }

  // 不匹配任何数字模式，返回 null（不生成变体）
  return null;
}

/**
 * 智能生成搜索变体（精简版：只生成必要的变体，避免无用搜索）
 *
 * 策略：
 * - 普通查询（无特殊字符）：只返回原始查询，不生成变体
 * - 数字查询（第X季/末尾数字）：返回 [原始, 数字变体]
 * - 标点查询（中文冒号等）：返回 [原始, 标点变体]
 * - 空格查询（多词搜索）：返回 [原始, 去空格变体]
 *
 * @param originalQuery 原始查询
 * @returns 按优先级排序的搜索变体数组（最多2个）
 */
export function generateSearchVariants(originalQuery: string): string[] {
  const trimmed = originalQuery.trim();

  // 1. 智能检测：数字变体（最高优先级的变体）
  const numberVariant = generateNumberVariant(trimmed);
  if (numberVariant) {
    return [trimmed, numberVariant];
  }

  // 2. 智能检测：中文标点变体（冒号等）
  const punctuationVariant = generatePunctuationVariant(trimmed);
  if (punctuationVariant) {
    return [trimmed, punctuationVariant];
  }

  // 3. 智能检测：空格变体（多词搜索）
  if (trimmed.includes(' ')) {
    const keywords = trimmed.split(/\s+/);
    if (keywords.length >= 2) {
      const lastKeyword = keywords[keywords.length - 1];
      // 如果最后一个词是季/集相关，组合主关键词
      if (/第|季|集|部|篇|章/.test(lastKeyword)) {
        const combined = keywords[0] + lastKeyword;
        return [trimmed, combined];
      }
      // 否则去除空格
      const noSpaces = trimmed.replace(/\s+/g, '');
      return [trimmed, noSpaces];
    }
  }

  // 4. 繁体检测：如果是繁体输入，添加简体变体
  const detectedType = converter.detect(trimmed);
  if (detectedType !== ChineseType.SIMPLIFIED) {
    const simplified = converter.simplized(trimmed);
    if (simplified !== trimmed) {
      return [trimmed, simplified];
    }
  }

  // 5. 普通查询：不需要变体，只返回原始查询
  return [trimmed];
}

/**
 * 智能生成标点变体（只返回最优的1个变体）
 * @returns 单个变体或 null
 */
function generatePunctuationVariant(query: string): string | null {
  // 中文冒号 → 空格（最常见的匹配模式）
  if (query.includes('：')) {
    return query.replace(/：/g, ' ');
  }

  // 英文冒号 → 空格
  if (query.includes(':')) {
    return query.replace(/:/g, ' ');
  }

  // 中文书名号 → 去除
  if (query.includes('《') || query.includes('》')) {
    return query.replace(/[《》]/g, '');
  }

  // 不需要标点变体
  return null;
}

export async function getDetailFromApi(
  apiSite: ApiSite,
  id: string
): Promise<SearchResult> {
  if (apiSite.detail) {
    return handleSpecialSourceDetail(id, apiSite);
  }

  const detailUrl = `${apiSite.api}${API_CONFIG.detail.path}${id}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(detailUrl, {
    headers: API_CONFIG.detail.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`详情请求失败: ${response.status}`);
  }

  const data = await response.json();

  if (
    !data ||
    !data.list ||
    !Array.isArray(data.list) ||
    data.list.length === 0
  ) {
    throw new Error('获取到的详情内容无效');
  }

  const videoDetail = data.list[0];
  let episodes: string[] = [];
  let titles: string[] = [];

  // 处理播放源拆分
  if (videoDetail.vod_play_url) {
    // 先用 $$$ 分割
    const vod_play_url_array = videoDetail.vod_play_url.split('$$$');
    // 分集之间#分割，标题和播放链接 $ 分割
    vod_play_url_array.forEach((url: string) => {
      const matchEpisodes: string[] = [];
      const matchTitles: string[] = [];
      const title_url_array = url.split('#');
      title_url_array.forEach((title_url: string) => {
        const episode_title_url = title_url.split('$');
        if (
          episode_title_url.length === 2 &&
          episode_title_url[1].endsWith('.m3u8')
        ) {
          matchTitles.push(episode_title_url[0]);
          matchEpisodes.push(episode_title_url[1]);
        }
      });
      if (matchEpisodes.length > episodes.length) {
        episodes = matchEpisodes;
        titles = matchTitles;
      }
    });
  }

  // 如果播放源为空，则尝试从内容中解析 m3u8
  if (episodes.length === 0 && videoDetail.vod_content) {
    const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
    episodes = matches.map((link: string) => link.replace(/^\$/, ''));
  }

  return {
    id: id.toString(),
    title: videoDetail.vod_name,
    poster: videoDetail.vod_pic?.trim() || '', // 确保poster为有效字符串，过滤空白
    episodes,
    episodes_titles: titles,
    source: apiSite.key,
    source_name: apiSite.name,
    class: videoDetail.vod_class,
    year: videoDetail.vod_year
      ? videoDetail.vod_year.match(/\d{4}/)?.[0] || ''
      : 'unknown',
    desc: cleanHtmlTags(videoDetail.vod_content),
    type_name: videoDetail.type_name,
    douban_id: videoDetail.vod_douban_id,
    remarks: videoDetail.vod_remarks, // 传递备注信息（如"已完结"等）
  };
}

async function handleSpecialSourceDetail(
  id: string,
  apiSite: ApiSite
): Promise<SearchResult> {
  const detailUrl = `${apiSite.detail}/index.php/vod/detail/id/${id}.html`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(detailUrl, {
    headers: API_CONFIG.detail.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`详情页请求失败: ${response.status}`);
  }

  const html = await response.text();
  let matches: string[] = [];

  if (apiSite.key === 'ffzy') {
    const ffzyPattern =
      /\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g;
    matches = html.match(ffzyPattern) || [];
  }

  if (matches.length === 0) {
    const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
    matches = html.match(generalPattern) || [];
  }

  // 去重并清理链接前缀
  matches = Array.from(new Set(matches)).map((link: string) => {
    link = link.substring(1); // 去掉开头的 $
    const parenIndex = link.indexOf('(');
    return parenIndex > 0 ? link.substring(0, parenIndex) : link;
  });

  // 根据 matches 数量生成剧集标题
  const episodes_titles = Array.from({ length: matches.length }, (_, i) =>
    (i + 1).toString()
  );

  // 提取标题
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const titleText = titleMatch ? titleMatch[1].trim() : '';

  // 提取描述
  const descMatch = html.match(
    /<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/
  );
  const descText = descMatch ? cleanHtmlTags(descMatch[1]) : '';

  // 提取封面
  const coverMatch = html.match(/(https?:\/\/[^"'\s]+?\.jpg)/g);
  const coverUrl = coverMatch ? coverMatch[0].trim() : '';

  // 提取年份
  const yearMatch = html.match(/>(\d{4})</);
  const yearText = yearMatch ? yearMatch[1] : 'unknown';

  return {
    id,
    title: titleText,
    poster: coverUrl,
    episodes: matches,
    episodes_titles,
    source: apiSite.key,
    source_name: apiSite.name,
    class: '',
    year: yearText,
    desc: descText,
    type_name: '',
    douban_id: 0,
    remarks: undefined, // HTML解析无法获取remarks信息
  };
}
