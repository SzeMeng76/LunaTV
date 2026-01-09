// 文件：ws.route.ts（已修改）
// 添加违禁词检测 + 每个源结果都进行违禁词过滤

/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { bannedWords } from '@/lib/filter';   // ← 新增导入

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return new Response(
      JSON.stringify({ error: '搜索关键词不能为空' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const queryLower = query.toLowerCase();

  // 1. 查询含违禁词 → 直接返回空流（模拟正常完成）
  if (bannedWords.some(word => queryLower.includes(word.toLowerCase()))) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', query, totalSources: 0, timestamp: Date.now() })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', totalResults: 0, completedSources: 0, timestamp: Date.now() })}\n\n`));
        controller.close();
      }
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

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  let streamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const safeEnqueue = (data: Uint8Array) => {
        try {
          if (streamClosed || (!controller.desiredSize && controller.desiredSize !== 0)) {
            return false;
          }
          controller.enqueue(data);
          return true;
        } catch (error) {
          console.warn('Failed to enqueue data:', error);
          streamClosed = true;
          return false;
        }
      };

      safeEnqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'start',
        query,
        totalSources: apiSites.length,
        timestamp: Date.now()
      })}\n\n`));

      let completedSources = 0;
      const allResults: any[] = [];

      const searchPromises = apiSites.map(async (site) => {
        try {
          const searchPromise = Promise.race([
            searchFromApi(site, query),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${site.name} timeout`)), 20000)),
          ]);

          let results = await searchPromise as any[];

          // 2. 违禁词过滤
          results = results.filter(item => {
            const title = (item.title || '').toLowerCase();
            const typeName = (item.type_name || '').toLowerCase();
            return !bannedWords.some(word => 
              title.includes(word.toLowerCase()) || 
              typeName.includes(word.toLowerCase())
            );
          });

          // 原有黄色过滤
          let filteredResults = results;
          if (!config.SiteConfig.DisableYellowFilter) {
            filteredResults = results.filter(r => {
              const typeName = r.type_name || '';
              return !yellowWords.some(word => typeName.includes(word));
            });
          }

          completedSources++;

          if (!streamClosed) {
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'source_result',
              source: site.key,
              sourceName: site.name,
              results: filteredResults,
              timestamp: Date.now()
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
              timestamp: Date.now()
            })}\n\n`));
          }
        }

        if (completedSources === apiSites.length && !streamClosed) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            totalResults: allResults.length,
            completedSources,
            timestamp: Date.now()
          })}\n\n`));

          try { controller.close(); } catch {}
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