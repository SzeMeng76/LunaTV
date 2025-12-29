/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';
import { blockedWords } from '@/lib/blocked';

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
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  // 过滤掉整站成人源
  const validSites = apiSites.filter(site => !site.is_adult);

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
        totalSources: validSites.length,
        timestamp: Date.now()
      })}\n\n`));

      let completedSources = 0;
      const allResults: any[] = [];

      const searchPromises = validSites.map(async (site) => {
        try {
          const results = await Promise.race([
            searchFromApi(site, query),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
          ]) as any[];

          // 三层过滤
          const filteredResults = results.filter((item: any) => {
            const title = (item.title || '').toLowerCase();
            const typeName = (item.type_name || '').toLowerCase();

            if (yellowWords.some((w: string) => typeName.includes(w.toLowerCase()))) {
              return false;
            }
            if (
              blockedWords.some((w: string) =>
                title.includes(w.toLowerCase()) || typeName.includes(w.toLowerCase())
              )
            ) {
              return false;
            }
            return true;
          });

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

          allResults.push(...filteredResults);
        } catch (error) {
          console.warn(`搜索失败 ${site.name}:`, error);
          completedSources++;

          if (!streamClosed) {
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'source_error',
              source: site.key,
              sourceName: site.name,
              error: '搜索失败或超时',
              timestamp: Date.now()
            })}\n\n`));
          }
        }

        if (completedSources === validSites.length && !streamClosed) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            totalResults: allResults.length,
            completedSources,
            timestamp: Date.now()
          })}\n\n`));
          controller.close();
        }
      });

      await Promise.allSettled(searchPromises);
    },
    cancel() {
      streamClosed = true;
      console.log('Client disconnected');
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