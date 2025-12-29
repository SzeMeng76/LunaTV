/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { AdminConfig } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { blockedWords } from '@/lib/blocked';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();

    if (!query) {
      return NextResponse.json({ suggestions: [] });
    }

    const suggestions = await generateSuggestions(config, query, authInfo.username);

    const cacheTime = config.SiteConfig.SiteInterfaceCacheTime || 300;

    return NextResponse.json(
      { suggestions },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
        },
      }
    );
  } catch (error) {
    console.error('获取搜索建议失败', error);
    return NextResponse.json({ error: '获取搜索建议失败' }, { status: 500 });
  }
}

async function generateSuggestions(config: AdminConfig, query: string, username: string) {
  const queryLower = query.toLowerCase();
  const apiSites = await getAvailableApiSites(username);

  // 排除成人源
  const validSites = apiSites.filter(site => !site.is_adult);
  let realKeywords: string[] = [];

  if (validSites.length > 0) {
    const firstSite = validSites[0];
    const results = await searchFromApi(firstSite, query);

    const filteredResults = results.filter((r: any) => {
      const title = (r.title || '').toLowerCase();
      const typeName = (r.type_name || '').toLowerCase();

      if (yellowWords.some((w: string) => typeName.includes(w.toLowerCase()))) return false;
      if (blockedWords.some((w: string) => title.includes(w.toLowerCase()) || typeName.includes(w.toLowerCase()))) return false;

      return true;
    });

    realKeywords = Array.from(
      new Set(
        filteredResults
          .map((r: any) => r.title)
          .filter(Boolean)
          .flatMap((title: string) => title.split(/[ -:：·、-]/))
          .filter((w: string) => w.length > 1 && w.toLowerCase().includes(queryLower))
      )
    ).slice(0, 8);
  }

  // ... 后续建议生成逻辑保持不变（评分、排序等）
  const realSuggestions = realKeywords.map((word) => {
    const wordLower = word.toLowerCase();
    const queryWords = queryLower.split(/[ -:：·、-]/);

    let score = 1.0;
    if (wordLower === queryLower) score = 2.0;
    else if (wordLower.startsWith(queryLower) || wordLower.endsWith(queryLower)) score = 1.8;
    else if (queryWords.some(qw => wordLower.includes(qw))) score = 1.5;

    let type: 'exact' | 'related' | 'suggestion' = score >= 2.0 ? 'exact' : score >= 1.5 ? 'related' : 'suggestion';

    return { text: word, type, score };
  });

  return realSuggestions
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const priority = { exact: 3, related: 2, suggestion: 1 };
      return priority[b.type] - priority[a.type];
    });
}