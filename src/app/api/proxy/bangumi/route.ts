import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { readTextLimited } from '@/lib/proxy-security';

const CMLIUSSSS_BASE = 'https://img.doubanio.cmliussss.net';
// 桜色镜像站：第三方全域名镜像 bgm.tv -> bangumi.lol
const SAKURA_API_BASE = 'https://api.bangumi.lol';

// Bangumi 响应体大小硬上限，防止异常上游返回超大响应把内存打爆
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Bangumi API 代理路由
 *
 * 用法:
 * GET /api/proxy/bangumi?path=calendar
 * GET /api/proxy/bangumi?path=v0/subjects/12345
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  try {
    const [adminConfig, cacheTime] = await Promise.all([getConfig(), getCacheTime()]);

    // 客户端可通过 query 参数覆盖 admin 配置（用于用户个人设置）
    const queryApiType = searchParams.get('apiType');
    const queryApiProxy = searchParams.get('apiProxy');
    const apiType = queryApiType || adminConfig.SiteConfig?.BangumiApiType || 'server';
    const apiProxy = queryApiProxy || adminConfig.SiteConfig?.BangumiApiProxy || '';

    let apiUrl: string;
    if (apiType === 'cmliussss') {
      apiUrl = `${CMLIUSSSS_BASE}/${path}`;
    } else if (apiType === 'sakura') {
      apiUrl = `${SAKURA_API_BASE}/${path}`;
    } else if (apiType === 'corsapi') {
      // 使用 Cloudflare Worker 代理，从 VideoProxyConfig 获取地址
      const corsApiBase = (adminConfig.VideoProxyConfig?.proxyUrl || 'https://corsapi.smone.workers.dev').replace(/\/$/, '');
      apiUrl = `${corsApiBase}/?url=${encodeURIComponent(`https://api.bgm.tv/${path}`)}`;
    } else if (apiType === 'custom' && apiProxy) {
      const base = apiProxy.endsWith('/') ? apiProxy.slice(0, -1) : apiProxy;
      apiUrl = `${base}/${path}`;
    } else {
      apiUrl = `https://api.bgm.tv/${path}`;
    }

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'LunaTV/1.0 (https://github.com/yourusername/LunaTV)',
        'Accept': 'application/json',
      },
      next: { revalidate: cacheTime },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Bangumi API returned ${response.status}` },
        { status: response.status }
      );
    }

    const text = await readTextLimited(response, MAX_RESPONSE_BYTES);
    const data = JSON.parse(text);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    console.error('Bangumi API proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch from Bangumi API' }, { status: 500 });
  }
}
