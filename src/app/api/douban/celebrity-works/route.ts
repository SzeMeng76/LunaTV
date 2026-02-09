import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { db } from '@/lib/db';
import { fetchDoubanWithVerification } from '@/lib/douban-anti-crawler';
import { getRandomUserAgentWithInfo, getSecChUaHeaders } from '@/lib/user-agent';

// 缓存时间：2小时
const CELEBRITY_WORKS_CACHE_TIME = 2 * 60 * 60;

// 请求限制器
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2秒最小间隔

function randomDelay(min = 500, max = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 从豆瓣通用搜索 HTML 解析影视作品
 */
function parseDoubanSearchHtml(html: string): Array<{
  id: string;
  title: string;
  poster: string;
  rate: string;
  url: string;
  source: string;
}> {
  const results: Array<{
    id: string;
    title: string;
    poster: string;
    rate: string;
    url: string;
    source: string;
  }> = [];

  // 使用 split 方式分割每个 result div（比正则更可靠）
  const blocks = html.split('<div class="result">').slice(1);

  for (const block of blocks) {
    // 提取 ID - 从 URL 中获取
    const idMatch = block.match(/movie\.douban\.com%2Fsubject%2F(\d+)/);
    if (!idMatch) continue;
    const id = idMatch[1];

    // 提取海报
    const posterMatch = block.match(/<img[^>]*src="([^"]+)"/);
    const poster = posterMatch ? posterMatch[1] : '';

    // 提取评分
    const rateMatch = block.match(/<span class="rating_nums">([^<]*)<\/span>/);
    const rate = rateMatch ? rateMatch[1] : '';

    // 提取标题 - 从 subject-cast 中获取原名
    const castMatch = block.match(/<span class="subject-cast">([^<]*)<\/span>/);
    let title = '';
    if (castMatch) {
      // 格式：原名:不眠日 / 刘璋牧 / 白敬亭 / 2025
      const castText = castMatch[1];
      const titleMatch = castText.match(/原名:([^/]+)/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
    }

    // 如果没有从 subject-cast 获取到标题，尝试从链接文本获取
    if (!title) {
      const titleMatch = block.match(/class="title-text">([^<]+)<\/a>/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
    }

    if (id && title) {
      results.push({
        id,
        title,
        poster,
        rate,
        url: `https://movie.douban.com/subject/${id}/`,
        source: 'douban'
      });
    }
  }

  return results;
}

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 获取参数
  const celebrityName = searchParams.get('name');
  const limit = parseInt(searchParams.get('limit') || '20');
  const mode = searchParams.get('mode') || 'search'; // 'search' = 通用搜索, 'api' = 豆瓣API

  // 验证参数
  if (!celebrityName?.trim()) {
    return NextResponse.json(
      { error: '缺少必要参数: name（演员名字）' },
      { status: 400 }
    );
  }

  if (limit < 1 || limit > 50) {
    return NextResponse.json(
      { error: 'limit 必须在 1-50 之间' },
      { status: 400 }
    );
  }

  try {
    // 生成缓存 key（包含 mode）
    const cacheKey = `douban-celebrity-works-${mode}-${celebrityName.trim()}-${limit}`;

    console.log(`🔍 [豆瓣演员作品API] 检查缓存: ${cacheKey} (mode: ${mode})`);

    // 检查缓存
    try {
      const cachedResult = await db.getCache(cacheKey);
      if (cachedResult) {
        console.log(`✅ [豆瓣演员作品API] 缓存命中: ${celebrityName} - ${cachedResult.works?.length || 0} 项`);
        return NextResponse.json(cachedResult);
      }
      console.log(`❌ [豆瓣演员作品API] 缓存未命中，开始搜索...`);
    } catch (cacheError) {
      console.warn('豆瓣演员作品缓存检查失败:', cacheError);
    }

    // 请求限流：确保请求间隔
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await new Promise(resolve =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
      );
    }
    lastRequestTime = Date.now();

    // 添加随机延时
    await randomDelay(500, 1500);

    // 获取随机浏览器指纹
    const { ua, browser, platform } = getRandomUserAgentWithInfo();
    const secChHeaders = getSecChUaHeaders(browser, platform);

    let works: Array<{
      id: string;
      title: string;
      poster: string;
      rate: string;
      url: string;
      source: string;
    }> = [];

    if (mode === 'api') {
      // 使用豆瓣 API（/j/search_subjects）
      const apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=${encodeURIComponent(celebrityName.trim())}&page_limit=${limit}&page_start=0`;
      console.log(`[豆瓣演员作品API] API模式请求: ${apiUrl}`);

      const response = await fetchDoubanWithVerification(apiUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://movie.douban.com/',
          ...secChHeaders,
        },
      });

      if (!response.ok) {
        throw new Error(`豆瓣API请求失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.subjects && Array.isArray(data.subjects)) {
        works = data.subjects.map((item: any) => ({
          id: item.id,
          title: item.title,
          poster: item.cover,
          rate: item.rate || '',
          url: item.url,
          source: 'douban-api'
        }));
      }
    } else {
      // 使用豆瓣通用搜索 URL（cat=1002 表示影视）
      const searchUrl = `https://www.douban.com/search?cat=1002&q=${encodeURIComponent(celebrityName.trim())}`;
      console.log(`[豆瓣演员作品API] 搜索模式请求: ${searchUrl}`);

      const response = await fetchDoubanWithVerification(searchUrl, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://www.douban.com/',
          ...secChHeaders,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
        },
      });

      if (!response.ok) {
        throw new Error(`豆瓣搜索请求失败: ${response.status}`);
      }

      const html = await response.text();
      console.log(`[豆瓣演员作品API] 获取 HTML 长度: ${html.length}`);

      // 解析 HTML 提取影视作品
      const allWorks = parseDoubanSearchHtml(html);
      works = allWorks.slice(0, limit);
    }

    const result = {
      success: true,
      celebrityName: celebrityName.trim(),
      mode,
      works,
      total: works.length,
    };

    console.log(`[豆瓣演员作品API] 找到 ${works.length} 部作品 (mode: ${mode})`);

    // 缓存结果
    try {
      await db.setCache(cacheKey, result, CELEBRITY_WORKS_CACHE_TIME);
      console.log(`💾 [豆瓣演员作品API] 结果已缓存: "${celebrityName}" - ${works.length} 项, TTL: ${CELEBRITY_WORKS_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('豆瓣演员作品缓存保存失败:', cacheError);
    }

    // 返回结果
    const cacheTime = await getCacheTime();
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    console.error(`[豆瓣演员作品API] 搜索失败: ${celebrityName}`, (error as Error).message);
    return NextResponse.json(
      {
        success: false,
        error: '豆瓣演员作品搜索失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
