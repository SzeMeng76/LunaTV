/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { parseStringPromise } from 'xml2js';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

export const runtime = 'nodejs';

/**
 * POST /api/acg/search
 * 搜索 ACG 磁力资源（需要登录）
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

    // 验证页码
    const pageNum = parseInt(String(page), 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return NextResponse.json(
        { error: '页码必须是大于0的整数' },
        { status: 400 }
      );
    }

    // 请求 acg.rip API
    const acgUrl = `https://acg.rip/page/${pageNum}.xml?term=${encodeURIComponent(trimmedKeyword)}`;

    const response = await fetch(acgUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`ACG.RIP API 请求失败: ${response.status}`);
    }

    const xmlData = await response.text();

    // 解析 XML
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

    // 转换为标准格式
    const results = items.map((item: any) => {
      // 提取描述中的图片（如果有）
      let images: string[] = [];
      if (item.description?.[0]) {
        const imgMatches = item.description[0].match(/src="([^"]+)"/g);
        if (imgMatches) {
          images = imgMatches.map((match: string) => {
            const urlMatch = match.match(/src="([^"]+)"/);
            return urlMatch ? urlMatch[1] : '';
          }).filter(Boolean);
        }
      }

      return {
        title: item.title?.[0] || '',
        link: item.link?.[0] || '',
        guid: item.guid?.[0] || '',
        pubDate: item.pubDate?.[0] || '',
        torrentUrl: item.enclosure?.[0]?.$?.url || '',
        description: item.description?.[0] || '',
        images,
      };
    });

    return NextResponse.json({
      keyword: trimmedKeyword,
      page: pageNum,
      total: results.length,
      items: results,
    });

  } catch (error: any) {
    console.error('ACG 搜索失败:', error);
    return NextResponse.json(
      { error: error.message || '搜索失败' },
      { status: 500 }
    );
  }
}
