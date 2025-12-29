// app/api/search/ws/route.ts  (流式搜索接口，已添加赌博关键词屏蔽)

import { NextRequest } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { filterSensitiveContent } from '@/lib/filter';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ error: '搜索关键词不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  const shouldFilter = !config.SiteConfig.DisableYellowFilter;

  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const safeEnqueue = (data: Uint8Array) => {
        try {
          if (streamClosed) return false;
          controller.enqueue(data);
          return true;
        } catch {
          streamClosed = true;
          return false;
        }
      };

      safeEnqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'start',
        query,
        totalSources: apiSites.length,
        timestamp: Date.now(),
      })}\n\n`));

      let completedSources = 0;
      const allResults: any[] = [];

      const searchPromises = apiSites.map(async (site) => {
        try {
          const results = await Promise.race([
            searchFromApi(site, query),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`${site.name} timeout`)), 20000)
            ),
          ]) as any[];

          // 统一过滤（成人 + 赌博关键词）
          const filteredResults = filterSensitiveContent(results, shouldFilter);

          completedSources++;

          if (!streamClosed) {
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'source_result',
              source: site.key,
              sourceName: site.name,
              results: filteredResults,
              timestamp: Date.now(),
            })}\n\n`));
          }

          if (filteredResults.length > 0) {
            allResults.push(...filteredResults);
          }
        } catch (error) {
          console.warn(`搜索失败 ${site.name}:`, error);
          completedSources++;

          if (!streamClosed) {
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'source_error',
              source: site.key,
              sourceName: site.name,
              error: error instanceof Error ? error.message : '搜索失败',
              timestamp: Date.now(),
            })}\n\n`));
          }
        }

        if (completedSources === apiSites.length && !streamClosed) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            totalResults: allResults.length,
            completedSources,
            timestamp: Date.now(),
          })}\n\n`));
          controller.close();
        }
      });

      await Promise.allSettled(searchPromises);
    },
    cancel() {
      streamClosed = true;
      console.log('Client disconnected, cancelling search stream');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}