/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseStringPromise } from 'xml2js';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

export const runtime = 'nodejs';

const pickText = (value: any): string => {
  if (value === undefined || value === null) return '';
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined || first === null) return '';
  if (typeof first === 'object') return String(first._ ?? first.$?.url ?? first.$?.href ?? '');
  return String(first);
};

/**
 * POST /api/acg/nyaa
 * 搜索 Nyaa RSS（需要登录，不支持分页）
 * - https://nyaa.si/?page=rss&q=xxx&c=1_0&f=0
 */
export async function POST(req: NextRequest) {
  // 权限检查：需要登录
  const authInfo = getAuthInfoFromCookie(req);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { keyword, page = 1 } = await req.json();

    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json(
        { error: '搜索关键词不能为空' },
        { status: 400 }
      );
    }

    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      return NextResponse.json(
        { error: '搜索关键词不能为空' },
        { status: 400 }
      );
    }

    const pageNum = parseInt(String(page), 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return NextResponse.json(
        { error: '页码必须是大于0的整数' },
        { status: 400 }
      );
    }

    // Nyaa RSS 不支持分页
    if (pageNum > 1) {
      return NextResponse.json({
        keyword: trimmedKeyword,
        page: pageNum,
        total: 0,
        items: [],
      });
    }

    const ACG_CACHE_TIME = 30 * 60;
    const cacheKey = `acg-nyaa-${trimmedKeyword}`;

    console.log(`🔍 检查 Nyaa 搜索缓存: ${cacheKey}`);

    try {
      const cached = await db.getCache(cacheKey);
      if (cached) {
        console.log(`✅ Nyaa 搜索缓存命中: "${trimmedKeyword}"`);
        return NextResponse.json({
          ...cached,
          fromCache: true,
          cacheSource: 'database',
          cacheTimestamp: new Date().toISOString(),
        });
      }
      console.log(`❌ Nyaa 搜索缓存未命中: "${trimmedKeyword}"`);
    } catch (cacheError) {
      console.warn('Nyaa 搜索缓存读取失败:', cacheError);
    }

    const params = new URLSearchParams({
      page: 'rss',
      q: trimmedKeyword,
      c: '1_0',
      f: '0',
    });
    const searchUrl = `https://nyaa.si/?${params.toString()}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Nyaa API 请求失败: ${response.status}`);
    }

    const xmlData = await response.text();
    const parsed = await parseStringPromise(xmlData);

    if (!parsed?.rss?.channel?.[0]?.item) {
      return NextResponse.json({
        keyword: trimmedKeyword,
        page: pageNum,
        total: 0,
        items: [],
      });
    }

    const items = parsed.rss.channel[0].item;

    const results = items.map((item: any) => {
      const title = pickText(item.title);
      // Nyaa RSS 中 link 是 .torrent 下载地址，guid 才是详情页
      const torrentUrl = pickText(item.link);
      const detailUrl = pickText(item.guid) || torrentUrl;
      const guid = detailUrl || torrentUrl || `${title}-${pickText(item.pubDate)}`;
      const pubDate = pickText(item.pubDate);
      const size = pickText(item['nyaa:size']);
      const category = pickText(item['nyaa:category']);
      const seeders = pickText(item['nyaa:seeders']);
      const leechers = pickText(item['nyaa:leechers']);
      const downloads = pickText(item['nyaa:downloads']);
      const infoHash = pickText(item['nyaa:infoHash']);
      const description =
        pickText(item.description) ||
        [
          size && `大小：${size}`,
          category && `分类：${category}`,
          seeders && `Seeders：${seeders}`,
          leechers && `Leechers：${leechers}`,
          downloads && `下载：${downloads}`,
          infoHash && `Hash：${infoHash}`,
        ]
          .filter(Boolean)
          .join(' | ');

      let images: string[] = [];
      if (description) {
        const imgMatches = description.match(/src="([^"]+)"/g);
        if (imgMatches) {
          images = imgMatches
            .map((match: string) => {
              const urlMatch = match.match(/src="([^"]+)"/);
              return urlMatch ? urlMatch[1] : '';
            })
            .filter(Boolean);
        }
      }

      return {
        title,
        link: detailUrl,
        guid,
        pubDate,
        torrentUrl,
        description,
        images,
      };
    });

    const responseData = {
      keyword: trimmedKeyword,
      page: pageNum,
      total: results.length,
      items: results,
    };

    try {
      await db.setCache(cacheKey, responseData, ACG_CACHE_TIME);
      console.log(`💾 Nyaa 搜索结果已缓存: "${trimmedKeyword}" - ${results.length} 个结果, TTL: ${ACG_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('Nyaa 搜索缓存保存失败:', cacheError);
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('Nyaa 搜索失败:', error);
    return NextResponse.json(
      { error: error.message || '搜索失败' },
      { status: 500 }
    );
  }
}
