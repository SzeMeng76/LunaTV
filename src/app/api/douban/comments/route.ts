import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';

// 用户代理池
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

// 请求限制器
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2秒最小间隔

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min = 1000, max = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const start = parseInt(searchParams.get('start') || '0');
  const limit = parseInt(searchParams.get('limit') || '10');
  const sort = searchParams.get('sort') || 'new_score'; // new_score 或 time

  if (!id) {
    return NextResponse.json(
      { error: '缺少必要参数: id' },
      { status: 400 }
    );
  }

  // 验证参数
  if (limit < 1 || limit > 50) {
    return NextResponse.json(
      { error: 'limit 必须在 1-50 之间' },
      { status: 400 }
    );
  }

  if (start < 0) {
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
      },
    };

    const response = await fetch(target, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();

    // 解析短评列表
    const comments = parseDoubanComments(html);

    const cacheTime = await getCacheTime();
    return NextResponse.json({
      code: 200,
      message: '获取成功',
      data: {
        comments,
        start,
        limit,
        count: comments.length
      }
    }, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取豆瓣短评失败', details: (error as Error).message },
      { status: 500 }
    );
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
