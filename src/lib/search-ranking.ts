/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 搜索结果相关性排序工具
 *
 * 评分规则（从高到低）：
 * 1. 完全匹配（标题 === 关键词）：100分
 * 2. 开头匹配（标题以关键词开头）：80分
 * 3. 包含完整关键词（标题包含关键词）：60分
 * 4. 模糊匹配（标题包含关键词的部分字符）：20-40分
 * 5. 年份加分：最新的作品加分（最多+10分）
 */

import { SearchResult } from './types';

/**
 * 计算字符串的相似度（Levenshtein距离）
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // 删除
        matrix[i][j - 1] + 1, // 插入
        matrix[i - 1][j - 1] + cost // 替换
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * 计算相似度百分比（0-1之间）
 */
function similarityScore(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(str1.length, str2.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

/**
 * 检查标题中是否包含关键词的所有字符（按顺序，但可以有间隔）
 * 例如："后浪" 可以匹配 "后来的浪潮"
 */
function containsCharsInOrder(title: string, keyword: string): boolean {
  let keywordIndex = 0;
  for (let i = 0; i < title.length && keywordIndex < keyword.length; i++) {
    if (title[i] === keyword[keywordIndex]) {
      keywordIndex++;
    }
  }
  return keywordIndex === keyword.length;
}

/**
 * 计算搜索结果的相关性分数
 */
export function calculateRelevanceScore(
  result: SearchResult,
  query: string
): number {
  const title = (result.title || '').trim();
  const keyword = query.trim();

  if (!title || !keyword) return 0;

  // 移除空格后的标题和关键词，用于更精确的匹配
  const titleNoSpace = title.replace(/\s+/g, '');
  const keywordNoSpace = keyword.replace(/\s+/g, '');

  let score = 0;

  // 1. 完全匹配（100分）
  if (title === keyword || titleNoSpace === keywordNoSpace) {
    score = 100;
  }
  // 2. 开头匹配（80分）
  else if (
    title.startsWith(keyword) ||
    titleNoSpace.startsWith(keywordNoSpace)
  ) {
    score = 80;
  }
  // 3. 包含完整关键词（60分）
  else if (title.includes(keyword) || titleNoSpace.includes(keywordNoSpace)) {
    score = 60;
  }
  // 4. 模糊匹配
  else {
    // 4.1 检查是否包含关键词的所有字符（按顺序）
    if (containsCharsInOrder(titleNoSpace, keywordNoSpace)) {
      // 计算字符间隔程度，间隔越小分数越高
      const similarity = similarityScore(titleNoSpace, keywordNoSpace);
      score = 20 + similarity * 20; // 20-40分
    }
    // 4.2 检查是否包含关键词的部分字符
    else {
      const matchedChars = keywordNoSpace
        .split('')
        .filter((char) => titleNoSpace.includes(char)).length;
      const matchRatio = matchedChars / keywordNoSpace.length;
      score = matchRatio * 15; // 0-15分
    }
  }

  // 5. 年份加分（最新的作品加分，最多+10分）
  const year = parseInt(result.year || '0', 10);
  if (year > 0) {
    const currentYear = new Date().getFullYear();
    const yearDiff = currentYear - year;
    if (yearDiff >= 0) {
      // 最近5年的作品加分更多
      if (yearDiff <= 5) {
        score += 10 - yearDiff; // 5-10分
      } else if (yearDiff <= 10) {
        score += 5; // 5分
      } else if (yearDiff <= 20) {
        score += 2; // 2分
      }
    }
  }

  // 6. 豆瓣评分加分（如果有）
  if (result.douban_id && result.douban_id > 0) {
    score += 5; // 有豆瓣信息的作品加5分
  }

  return Math.min(score, 110); // 最高110分
}

/**
 * 对搜索结果按相关性排序
 */
export function rankSearchResults(
  results: SearchResult[],
  query: string
): SearchResult[] {
  if (!results || results.length === 0) return [];

  // 计算每个结果的相关性分数
  const scoredResults = results.map((result) => ({
    result,
    score: calculateRelevanceScore(result, query),
  }));

  // 按分数降序排序
  scoredResults.sort((a, b) => {
    // 首先按分数排序
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // 分数相同时，按年份倒序（新的在前）
    const yearA = parseInt(a.result.year || '0', 10);
    const yearB = parseInt(b.result.year || '0', 10);
    if (yearB !== yearA) {
      return yearB - yearA;
    }

    // 年份也相同时，按标题字母顺序
    return a.result.title.localeCompare(b.result.title);
  });

  // 返回排序后的结果
  return scoredResults.map((item) => item.result);
}

/**
 * 为搜索结果分组（按相关性分级）
 */
export function groupSearchResultsByRelevance(
  results: SearchResult[],
  query: string
): {
  exact: SearchResult[]; // 精确匹配（分数 >= 80）
  high: SearchResult[]; // 高相关（60 <= 分数 < 80）
  medium: SearchResult[]; // 中等相关（40 <= 分数 < 60）
  low: SearchResult[]; // 低相关（分数 < 40）
} {
  const ranked = rankSearchResults(results, query);

  const groups = {
    exact: [] as SearchResult[],
    high: [] as SearchResult[],
    medium: [] as SearchResult[],
    low: [] as SearchResult[],
  };

  ranked.forEach((result) => {
    const score = calculateRelevanceScore(result, query);
    if (score >= 80) {
      groups.exact.push(result);
    } else if (score >= 60) {
      groups.high.push(result);
    } else if (score >= 40) {
      groups.medium.push(result);
    } else {
      groups.low.push(result);
    }
  });

  return groups;
}
