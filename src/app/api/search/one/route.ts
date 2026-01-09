// 文件：one.route.ts（已修改）
// 添加违禁词检测：查询含违禁词直接返回空 + 结果过滤违禁词

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { bannedWords } from '@/lib/filter';   // ← 新增导入

export const runtime = 'nodejs';

// OrionTV 兼容接口 - 单资源搜索
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const resourceId = searchParams.get('resourceId');

  if (!query || !resourceId) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { result: null, error: '缺少必要参数: q 或 resourceId' },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  }

  // 1. 查询本身包含违禁词 → 直接返回空，不进行搜索
  const queryLower = query.toLowerCase();
  if (bannedWords.some(word => queryLower.includes(word.toLowerCase()))) {
    return NextResponse.json({ results: [] }, { status: 200 });
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  try {
    // 根据 resourceId 查找对应的 API 站点
    const targetSite = apiSites.find((site) => site.key === resourceId);
    if (!targetSite) {
      return NextResponse.json(
        {
          error: `未找到指定的视频源: ${resourceId}`,
          result: null,
        },
        { status: 404 }
      );
    }

    const results = await searchFromApi(targetSite, query);
    let result = results.filter((r) => r.title === query);

    // 2. 过滤违禁词（标题或类型名包含违禁词的全部屏蔽）
    result = result.filter(item => {
      const title = (item.title || '').toLowerCase();
      const typeName = (item.type_name || '').toLowerCase();
      return !bannedWords.some(word => 
        title.includes(word.toLowerCase()) || 
        typeName.includes(word.toLowerCase())
      );
    });

    // 原有黄色内容过滤
    if (!config.SiteConfig.DisableYellowFilter) {
      result = result.filter((item) => {
        const typeName = item.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }

    const cacheTime = await getCacheTime();

    if (result.length === 0) {
      return NextResponse.json(
        {
          error: '未找到结果',
          result: null,
        },
        { status: 404 }
      );
    } else {
      return NextResponse.json(
        { results: result },
        {
          headers: {
            'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
            'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Netlify-Vary': 'query',
          },
        }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: '搜索失败',
        result: null,
      },
      { status: 500 }
    );
  }
}