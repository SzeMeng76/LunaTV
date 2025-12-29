/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { blockedWords } from '@/lib/blocked';

export const runtime = 'nodejs';

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[：:]/g, ':')
    .replace(/[·\.\-ー]/g, '')
    .replace(/\s+/g, '');
}

function containsBlocked(text: string): boolean {
  const normalized = normalize(text);
  return blockedWords.some(word => normalized.includes(word));
}

function containsYellow(typeName: string): boolean {
  const normalized = normalize(typeName);
  return yellowWords.some(word => normalized.includes(word));
}

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

      safeEnqueue(`data: ${JSON.stringify({
        type: 'start',
        query,
        totalSources: apiSites.length,
        timestamp: Date.now(),
      })}\n\n`);

      let completedSources = 0;

      const tasks = apiSites.map(async (site) => {
        let results: any[] = [];

        try {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 18000)
          );

          results = await Promise.race([searchFromApi(site, query), timeoutPromise]);

          // 加强过滤：支持多种字段名 + 标准化处理
          const filteredResults = results.filter((item: any) => {
            // 提取标题（支持 title / name / vod_name 等常见字段）
            const title = (
              item.title ||
              item.name ||
              item.vod_name ||
              item.video_name ||
              ''
            ).toString();

            // 提取分类（支持 type_name / typeName / category / class 等）
            const typeName = (
              item.type_name ||
              item.typeName ||
              item.category ||
              item.class ||
              item.tag ||
              ''
            ).toString();

            // 黄色过滤
            if (!config.SiteConfig.DisableYellowFilter && containsYellow(typeName)) {
              return false;
            }

            // 黑名单过滤（标题或分类）
            if (containsBlocked(title) || containsBlocked(typeName)) {
              return false;
            }

            return true;
          });

          results = filteredResults; // 使用过滤后的结果

          if (!streamClosed) {
            safeEnqueue(`data: ${JSON.stringify({
              type: 'source_result',
              source: site.key,
              sourceName: site.name,
              results,
              timestamp: Date.now(),
            })}\n\n`);
          }

        } catch (err) {
          console.warn(`搜索源失败 ${site.name}:`, (err as Error)?.message || err);

          if (!streamClosed) {
            safeEnqueue(`data: ${JSON.stringify({
              type: 'source_error',
              source: site.key,
              sourceName: site.name,
              error: (err as Error)?.message || '搜索失败',
              timestamp: Date.now(),
            })}\n\n`);
          }
        } finally {
          completedSources++;

          if (completedSources === apiSites.length && !streamClosed) {
            safeEnqueue(`data: ${JSON.stringify({
              type: 'complete',
              totalResults: 0, // 前端不依赖这个字段
              completedSources,
              timestamp: Date.now(),
            })}\n\n`);

            try { controller.close(); } catch {}
          }
        }
      });

      Promise.allSettled(tasks).finally(() => {
        if (!streamClosed) {
          try { controller.close(); } catch {}
        }
      });
    },

    cancel() {
      streamClosed = true;
      console.log('客户端断开，取消搜索流');
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