/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { blockedWords } from '@/lib/blocked';

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

      // 发送开始事件
      safeEnqueue(`data: ${JSON.stringify({
        type: 'start',
        query,
        totalSources: apiSites.length,
        timestamp: Date.now(),
      })}\n\n`);

      let completedSources = 0;
      const allResults: any[] = [];

      // 为每个站点创建独立任务，并严格限制超时
      const tasks = apiSites.map(async (site) => {
        let results: any[] = [];

        try {
          // 严格 18 秒超时（留 2 秒给后续处理）
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 18000)
          );

          results = await Promise.race([
            searchFromApi(site, query),
            timeoutPromise,
          ]);

          // 过滤黄色 + 黑名单
          const shouldFilterYellow = !config.SiteConfig.DisableYellowFilter;
          results = results.filter((item: any) => {
            const typeName = (item.type_name || '').toLowerCase();
            const title = (item.title || '').toLowerCase();

            if (shouldFilterYellow && yellowWords.some(w => typeName.includes(w))) {
              return false;
            }
            if (blockedWords.some(w => title.includes(w) || typeName.includes(w))) {
              return false;
            }
            return true;
          });

          // 发送成功结果
          if (!streamClosed) {
            safeEnqueue(`data: ${JSON.stringify({
              type: 'source_result',
              source: site.key,
              sourceName: site.name,
              results,
              timestamp: Date.now(),
            })}\n\n`);
          }

          if (results.length > 0) {
            allResults.push(...results);
          }

        } catch (err) {
          console.warn(`搜索源失败 ${site.name}:`, (err as Error).message || err);

          // 发送错误事件
          if (!streamClosed) {
            safeEnqueue(`data: ${JSON.stringify({
              type: 'source_error',
              source: site.key,
              sourceName: site.name,
              error: (err as Error).message || '搜索失败',
              timestamp: Date.now(),
            })}\n\n`);
          }
        } finally {
          completedSources++;

          // 所有源都处理完了，发送完成事件
          if (completedSources === apiSites.length && !streamClosed) {
            safeEnqueue(`data: ${JSON.stringify({
              type: 'complete',
              totalResults: allResults.length,
              completedSources,
              timestamp: Date.now(),
            })}\n\n`);

            try {
              controller.close();
            } catch {}
          }
        }
      });

      // 并行执行所有任务，不等待任何一个卡住
      Promise.allSettled(tasks).finally(() => {
        if (!streamClosed) {
          try {
            controller.close();
          } catch {}
        }
      });
    },

    cancel() {
      streamClosed = true;
      console.log('客户端断开连接，取消搜索流');
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