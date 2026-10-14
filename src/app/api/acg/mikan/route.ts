import { XMLParser } from 'fast-xml-parser';
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

export const runtime = 'nodejs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '_',
});

const asArray = (value: any): any[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const pickText = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return pickText(value[0]);
  if (typeof value === 'object')
    return String(value._ ?? value['@_url'] ?? value['@_href'] ?? '');
  return String(value);
};

/**
 * POST /api/acg/mikan
 * 搜索 Mikan RSS（需要登录，不支持分页）
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
        { status: 400 },
      );
    }

    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      return NextResponse.json(
        { error: '搜索关键词不能为空' },
        { status: 400 },
      );
    }

    // 验证页码（Mikan RSS 不支持分页，这里仍接收 page 以保持接口一致）
    const pageNum = parseInt(String(page), 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return NextResponse.json(
        { error: '页码必须是大于0的整数' },
        { status: 400 },
      );
    }

    if (pageNum > 1) {
      return NextResponse.json({
        keyword: trimmedKeyword,
        page: pageNum,
        total: 0,
        items: [],
      });
    }

    // ACG 搜索缓存：30分钟
    const ACG_CACHE_TIME = 30 * 60; // 30分钟（秒）
    const cacheKey = `acg-mikan-${trimmedKeyword}`;

    console.log(`🔍 检查 Mikan 搜索缓存: ${cacheKey}`);

    // 尝试从缓存获取
    try {
      const cached = await db.getCache(cacheKey);
      if (cached) {
        console.log(`✅ Mikan 搜索缓存命中: "${trimmedKeyword}"`);
        return NextResponse.json({
          ...cached,
          fromCache: true,
          cacheSource: 'database',
          cacheTimestamp: new Date().toISOString(),
        });
      }

      console.log(`❌ Mikan 搜索缓存未命中: "${trimmedKeyword}"`);
    } catch (cacheError) {
      console.warn('Mikan 搜索缓存读取失败:', cacheError);
      // 缓存失败不影响主流程，继续执行
    }

    const searchUrl = `https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(trimmedKeyword)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Mikan API 请求失败: ${response.status}`);
    }

    const xmlData = await response.text();
    const parsed = parser.parse(xmlData);

    if (!parsed?.rss?.channel?.item) {
      return NextResponse.json({
        keyword: trimmedKeyword,
        page: pageNum,
        total: 0,
        items: [],
      });
    }

    const items = asArray(parsed.rss.channel.item);

    const results = items.map((item: any) => {
      const title = pickText(item.title);
      const link = pickText(item.link);
      const guid =
        pickText(item.guid) ||
        link ||
        `${title}-${pickText(asArray(item.torrent)[0]?.pubDate)}`;
      const pubDate =
        pickText(item.pubDate) ||
        pickText(asArray(item.torrent)[0]?.pubDate) ||
        pickText(item['dc:date']);

      const description =
        pickText(item.description) || pickText(item['content:encoded']) || '';

      const torrentUrl =
        pickText(asArray(item.enclosure)[0]?.['@_url']) ||
        pickText(asArray(item.enclosure)[0]?.['@_href']) ||
        '';

      // 提取描述中的图片（如果有）
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
        link,
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

    // 保存到缓存
    try {
      await db.setCache(cacheKey, responseData, ACG_CACHE_TIME);
      console.log(
        `💾 Mikan 搜索结果已缓存: "${trimmedKeyword}" - ${results.length} 个结果, TTL: ${ACG_CACHE_TIME}s`,
      );
    } catch (cacheError) {
      console.warn('Mikan 搜索缓存保存失败:', cacheError);
    }

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('Mikan 搜索失败:', error);
    return NextResponse.json(
      { error: error.message || '搜索失败' },
      { status: 500 },
    );
  }
}
