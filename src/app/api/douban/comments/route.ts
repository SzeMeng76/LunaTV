import { NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { fetchDoubanWithVerification } from '@/lib/douban-anti-crawler';
import { bypassDoubanChallenge } from '@/lib/puppeteer';
import { getRandomUserAgent } from '@/lib/user-agent';
import { recordRequest } from '@/lib/performance-monitor';

/**
 * 从配置中获取豆瓣 Cookies
 */
async function getDoubanCookies(): Promise<string | null> {
  try {
    const config = await getConfig();
    return config.DoubanConfig?.cookies || null;
  } catch (error) {
    console.warn('[Douban Comments] 获取 cookies 配置失败:', error);
    return null;
  }
}

// 请求限制器
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2秒最小间隔

function randomDelay(min = 1000, max = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 检测是否为豆瓣 challenge 页面
 */
function isDoubanChallengePage(html: string): boolean {
  return (
    html.includes('sha512') &&
    html.includes('process(cha)') &&
    html.includes('载入中')
  );
}

/**
 * 尝试使用反爬验证获取页面
 */
async function tryFetchWithAntiCrawler(url: string): Promise<{ success: boolean; html?: string; error?: string }> {
  try {
    console.log('[Douban Comments] 🔐 尝试使用反爬验证...');
    const response = await fetchDoubanWithVerification(url);

    if (response.ok) {
      const html = await response.text();
      console.log(`[Douban Comments] ✅ 反爬验证成功，页面长度: ${html.length}`);
      return { success: true, html };
    }

    console.log(`[Douban Comments] ⚠️ 反爬验证返回状态: ${response.status}`);
    return { success: false, error: `Status ${response.status}` };
  } catch (error) {
    console.log('[Douban Comments] ❌ 反爬验证失败:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const start = parseInt(searchParams.get('start') || '0');
  const limit = parseInt(searchParams.get('limit') || '10');
  const sort = searchParams.get('sort') || 'new_score'; // new_score 或 time

  if (!id) {
    // 记录失败请求
    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/comments',
      statusCode: 400,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize: 0,
    });

    return NextResponse.json(
      { error: '缺少必要参数: id' },
      { status: 400 }
    );
  }

  // 验证参数
  if (limit < 1 || limit > 50) {
    // 记录失败请求
    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/comments',
      statusCode: 400,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize: 0,
    });

    return NextResponse.json(
      { error: 'limit 必须在 1-50 之间' },
      { status: 400 }
    );
  }

  if (start < 0) {
    // 记录失败请求
    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/comments',
      statusCode: 400,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize: 0,
    });

    return NextResponse.json(
      { error: 'start 不能小于 0' },
      { status: 400 }
    );
  }

  const target = `https://movie.douban.com/subject/${id}/comments?start=${start}&limit=${limit}&status=P&sort=${sort}`;

  try {
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

    // 🍪 获取豆瓣 Cookies（如果配置了）
    const doubanCookies = await getDoubanCookies();

    let html: string | null = null;

    // 🔐 优先级 1: 尝试使用反爬验证
    const antiCrawlerResult = await tryFetchWithAntiCrawler(target);
    if (antiCrawlerResult.success && antiCrawlerResult.html) {
      // 检查是否为 challenge 页面
      if (!isDoubanChallengePage(antiCrawlerResult.html)) {
        console.log('[Douban Comments] ✅ 反爬验证成功，直接使用返回的页面');
        html = antiCrawlerResult.html;
      } else {
        console.log('[Douban Comments] ⚠️ 反爬验证返回了 challenge 页面，尝试其他方式');
      }
    } else {
      console.log('[Douban Comments] ⚠️ 反爬验证失败，尝试 Cookie 方式');
    }

    // 🍪 优先级 2: 如果反爬验证失败，使用 Cookie 方式（原有逻辑）
    if (!html) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const fetchOptions = {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
        // 随机添加Referer
        ...(Math.random() > 0.5 ? { 'Referer': 'https://movie.douban.com/' } : {}),
        // 🍪 如果配置了 Cookies，则添加到请求头
        ...(doubanCookies ? { 'Cookie': doubanCookies } : {}),
      },
    };

    // 如果使用了 Cookies，记录日志
    if (doubanCookies) {
      console.log(`[Douban Comments] 使用配置的 Cookies 请求: ${id}`);
    }

    const response = await fetch(target, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    html = await response.text();

    // 检测 challenge 页面 - 根据配置决定是否使用 Puppeteer
    if (isDoubanChallengePage(html)) {
      console.log(`[Douban Comments] 检测到 challenge 页面`);

      // 🍪 如果使用了 Cookies 但仍然遇到 challenge，说明 cookies 可能失效
      if (doubanCookies) {
        console.warn(`[Douban Comments] ⚠️ 使用 Cookies 仍遇到 Challenge，Cookies 可能已失效`);
      }

      // 获取配置，检查是否启用 Puppeteer
      const config = await getConfig();
      const enablePuppeteer = config.DoubanConfig?.enablePuppeteer ?? false;

      if (enablePuppeteer) {
        console.log(`[Douban Comments] Puppeteer 已启用，尝试绕过 Challenge...`);
        try {
          // 尝试使用 Puppeteer 绕过 Challenge
          const puppeteerResult = await bypassDoubanChallenge(target);
          html = puppeteerResult.html;

          // 再次检测是否成功绕过
          if (isDoubanChallengePage(html)) {
            console.log(`[Douban Comments] Puppeteer 绕过失败`);
            throw new Error('豆瓣反爬虫激活，无法获取短评');
          }

          console.log(`[Douban Comments] ✅ Puppeteer 成功绕过 Challenge`);
        } catch (puppeteerError) {
          console.error(`[Douban Comments] Puppeteer 执行失败:`, puppeteerError);
          throw new Error('豆瓣反爬虫激活，无法获取短评');
        }
      } else {
        // Puppeteer 未启用，直接返回错误
        console.log(`[Douban Comments] Puppeteer 未启用，无法绕过 Challenge`);
        throw new Error('豆瓣反爬虫激活，请在管理后台启用 Puppeteer');
      }
    }

    // 🍪 如果使用了 Cookies 且成功获取页面，记录成功日志
    if (doubanCookies) {
      console.log(`[Douban Comments] ✅ 使用 Cookies 成功获取短评: ${id}`);
    }
    } // 结束 if (!html) 块

    // 解析短评列表
    const comments = parseDoubanComments(html);

    const cacheTime = await getCacheTime();
    const successResponse = {
      code: 200,
      message: '获取成功',
      data: {
        comments,
        start,
        limit,
        count: comments.length
      }
    };
    const successResponseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    // 记录成功请求
    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/comments',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize: successResponseSize,
    });

    return NextResponse.json(successResponse, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    const errorResponse = {
      error: '获取豆瓣短评失败',
      details: (error as Error).message
    };
    const errorResponseSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    // 记录错误请求
    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/douban/comments',
      statusCode: 500,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: 0,
      requestSize: 0,
      responseSize: errorResponseSize,
    });

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

interface DoubanComment {
  username: string;
  user_id: string;
  avatar: string;
  rating: number; // 0-5, 0表示未评分
  time: string;
  location: string;
  content: string;
  useful_count: number;
}

function parseDoubanComments(html: string): DoubanComment[] {
  const comments: DoubanComment[] = [];

  try {
    // 匹配所有 comment-item (包含 data-cid 属性)
    const commentItemRegex = /<div class="comment-item"[^>]*>([\s\S]*?)(?=<div class="comment-item"|<div id="paginator"|$)/g;
    let match;

    while ((match = commentItemRegex.exec(html)) !== null) {
      try {
        const item = match[0];

        // 提取用户信息 - 在 comment-info 中
        const userLinkMatch = item.match(/<span class="comment-info">[\s\S]*?<a href="https:\/\/www\.douban\.com\/people\/([^/]+)\/">([^<]+)<\/a>/);
        const username = userLinkMatch ? userLinkMatch[2].trim() : '';
        const user_id = userLinkMatch ? userLinkMatch[1] : '';

        // 提取头像 - 在 avatar div 中
        const avatarMatch = item.match(/<div class="avatar">[\s\S]*?<img src="([^"]+)"/);
        const avatar = avatarMatch ? avatarMatch[1].replace(/^http:/, 'https:') : '';

        // 提取评分 (allstar50 表示5星, allstar40 表示4星, allstar30 表示3星)
        const ratingMatch = item.match(/<span class="allstar(\d)0 rating"/);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;

        // 提取时间
        const timeMatch = item.match(/<span class="comment-time"[^>]*title="([^"]+)"/);
        const time = timeMatch ? timeMatch[1] : '';

        // 提取地点
        const locationMatch = item.match(/<span class="comment-location">([^<]+)<\/span>/);
        const location = locationMatch ? locationMatch[1].trim() : '';

        // 提取短评内容
        const contentMatch = item.match(/<span class="short">([\s\S]*?)<\/span>/);
        let content = '';
        if (contentMatch) {
          content = contentMatch[1]
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();
        }

        // 提取有用数
        const usefulMatch = item.match(/<span class="votes vote-count">(\d+)<\/span>/);
        const useful_count = usefulMatch ? parseInt(usefulMatch[1]) : 0;

        // 只添加有效的短评
        if (username && content) {
          comments.push({
            username,
            user_id,
            avatar,
            rating,
            time,
            location,
            content,
            useful_count
          });
        }
      } catch (e) {
        // 跳过解析失败的单条评论
        console.warn('解析单条评论失败:', e);
      }
    }

    return comments;
  } catch (error) {
    console.error('解析豆瓣短评失败:', error);
    return [];
  }
}
