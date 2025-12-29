// app/api/search/ws/route.ts
import { NextRequest } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { toSimplified } from '@/lib/chinese';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { rankSearchResults } from '@/lib/search-ranking';
import { filterSensitiveContent } from '@/lib/blocked';

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
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return new Response(JSON.stringify({ error: '搜索关键词不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  // 黄色过滤是否启用（赌博词始终过滤，不受此影响）
  const disableYellowFilter = config.SiteConfig.DisableYellowFilter || false;

  // 繁简转换
  let normalizedQuery = query;
  try {
    normalizedQuery = await toSimplified(query);
  } catch (e) {
    console.warn('繁体转简体失败', e);
  }

  const searchQueries = [normalizedQuery];
  if (query !== normalizedQuery) searchQueries.unshift(query); // 原词优先

  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const safeEnqueue = (data: string) => {
        if (streamClosed) return false;
        try {
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          streamClosed = true;
          return false;
        }
      };

      // 开始事件
      safeEnqueue(
        `data: ${JSON.stringify({
          type: 'start',
          query,
          normalizedQuery,
          totalSources: apiSites.length,
          timestamp: Date.now(),
        })}\n\n`
      );

      let completedSources = 0;
      const allResults: any[] = [];

      const tasks = apiSites.map(async (site) => {
        let siteResults: any[] = [];

        try {
          // 对每个查询词并行搜索，取所有结果
          const promises = searchQueries.map((q) =>
            Promise.race([
              searchFromApi(site, q),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 18000) // 缩短为18秒，更快失败
              ),
            ]).catch((err) => {
              console.warn(`${site.name} 查询 "${q}" 超时或失败:`, err.message || err);
              return []; // 单个查询失败不影响其他
            })
          );

          const resultsArrays = await Promise.all(promises);
          siteResults = resultsArrays.flat();

          // 去重（按 id）
          const uniqueMap = new Map<string, any>();
          siteResults.forEach((r: any) => {
            if (r.id) uniqueMap.set(r.id, r);
          });
          siteResults = Array.from(uniqueMap.values());

          // === 统一敏感内容过滤（赌博词始终过滤）===
          siteResults = filterSensitiveContent(siteResults, disableYellowFilter, apiSites);

          // 排序
          siteResults = rankSearchResults(siteResults, normalizedQuery);

          // 发送该源结果
          if (!streamClosed && siteResults.length > 0) {
            allResults.push(...siteResults);

            safeEnqueue(
              `data: ${JSON.stringify({
                type: 'source_result',
                source: site.key,
                sourceName: site.name,
                results: siteResults,
                timestamp: Date.now(),
              })}\n\n`
            );
          }
        } catch (error) {
          console.warn(`搜索源完全失败 ${site.name}:`, error);
          if (!streamClosed) {
            safeEnqueue(
              `data: ${JSON.stringify({
                type: 'source_error',
                source: site.key,
                sourceName: site.name,
                error: error instanceof Error ? error.message : '搜索失败',
                timestamp: Date.now(),
              })}\n\n`
            );
          }
        } finally {
          // === 关键：无论成功失败，只加一次 ===
          completedSources++;

          // 所有源都完成了
          if (completedSources === apiSites.length && !streamClosed) {
            safeEnqueue(
              `data: ${JSON.stringify({
                type: 'complete',
                totalResults: allResults.length,
                completedSources,
                timestamp: Date.now(),
              })}\n\n`
            );

            try {
              controller.close();
            } catch {}
          }
        }
      });

      // 并行执行所有任务
      await Promise.allSettled(tasks);
    },

    cancel() {
      streamClosed = true;
      console.log('客户端断开，搜索流已取消');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}