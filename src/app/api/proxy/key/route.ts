/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

export const runtime = 'nodejs';

// Key 缓存管理
const keyCache = new Map<string, { data: ArrayBuffer; timestamp: number; etag?: string }>();
const KEY_CACHE_TTL = 300000; // 5分钟
const MAX_CACHE_SIZE = 200;

// 连接池管理
import * as https from 'https';
import * as http from 'http';

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 30,
  maxFreeSockets: 10,
  timeout: 15000,
  keepAliveMsecs: 30000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 30,
  maxFreeSockets: 10,
  timeout: 15000,
  keepAliveMsecs: 30000,
});

// 性能统计
const keyStats = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  avgResponseTime: 0,
  totalBytes: 0,
};

// 清理过期缓存
function cleanupExpiredCache() {
  const now = Date.now();
  let cleanedCount = 0;
  
  // 使用 Array.from() 来避免迭代器问题
  const cacheEntries = Array.from(keyCache.entries());
  for (const [key, value] of cacheEntries) {
    if (now - value.timestamp > KEY_CACHE_TTL) {
      keyCache.delete(key);
      cleanedCount++;
    }
  }
  
  // 如果缓存仍然过大，删除最老的条目
  if (keyCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(keyCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => keyCache.delete(key));
    cleanedCount += toDelete.length;
  }
  
  if (cleanedCount > 0 && process.env.NODE_ENV === 'development') {
    console.log(`Cleaned ${cleanedCount} expired key cache entries`);
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();
  keyStats.requests++;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');
  
  if (!url) {
    keyStats.errors++;
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    keyStats.errors++;
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';

  const decodedUrl = decodeURIComponent(url);
  const cacheKey = `${source}-${decodedUrl}`;
  
  // 检查缓存
  const cached = keyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < KEY_CACHE_TTL) {
    keyStats.cacheHits++;
    
    const responseTime = Date.now() - startTime;
    keyStats.avgResponseTime = (keyStats.avgResponseTime * (keyStats.requests - 1) + responseTime) / keyStats.requests;
    
    return new Response(cached.data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, Range, Origin, Accept, User-Agent',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Cache': 'HIT',
        'Content-Length': cached.data.byteLength.toString(),
        ...(cached.etag && { 'ETag': cached.etag })
      },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

  try {
    if (process.env.NODE_ENV === 'development') {
      console.log(`Fetching key: ${decodedUrl}`);
    }
    
    const isHttps = decodedUrl.startsWith('https:');
    const agent = isHttps ? httpsAgent : httpAgent;

    const response = await fetch(decodedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        'Accept': 'application/octet-stream, */*',
        'Cache-Control': 'no-cache',
        ...(cached?.etag && { 'If-None-Match': cached.etag })
      },
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Node.js specific option
      agent: typeof window === 'undefined' ? agent : undefined,
    });

    clearTimeout(timeoutId);

    // 如果是 304 Not Modified，返回缓存的数据
    if (response.status === 304 && cached) {
      keyStats.cacheHits++;
      
      const responseTime = Date.now() - startTime;
      keyStats.avgResponseTime = (keyStats.avgResponseTime * (keyStats.requests - 1) + responseTime) / keyStats.requests;
      
      return new Response(cached.data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
          'Cache-Control': 'public, max-age=300',
          'X-Cache': '304-HIT',
          'Content-Length': cached.data.byteLength.toString(),
        },
      });
    }

    if (!response.ok) {
      keyStats.errors++;
      // 改进错误消息，对 401/403 提供更友好的提示
      const upstreamStatus = response.status;
      let errorMessage = `Failed to fetch key: ${response.status} ${response.statusText}`;

      if (upstreamStatus === 401 || upstreamStatus === 403) {
        errorMessage = `上游资源拒绝访问（${upstreamStatus}），已尝试自动补齐鉴权和防盗链请求头`;
      }

      return NextResponse.json({
        error: errorMessage
      }, { status: response.status >= 500 ? 500 : response.status });
    }
    
    const keyData = await response.arrayBuffer();
    const etag = response.headers.get('ETag');
    
    // 缓存 key 数据
    keyCache.set(cacheKey, { 
      data: keyData, 
      timestamp: Date.now(),
      etag: etag || undefined
    });
    
    // 定期清理缓存
    if (keyCache.size > MAX_CACHE_SIZE || keyStats.requests % 50 === 0) {
      cleanupExpiredCache();
    }
    
    // 更新统计信息
    keyStats.totalBytes += keyData.byteLength;
    const responseTime = Date.now() - startTime;
    keyStats.avgResponseTime = (keyStats.avgResponseTime * (keyStats.requests - 1) + responseTime) / keyStats.requests;
    
    return new Response(keyData, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, Range, Origin, Accept, User-Agent',
        'Access-Control-Expose-Headers': 'Content-Length, X-Cache, X-Upstream-Url',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Cache': 'MISS',
        'Content-Length': keyData.byteLength.toString(),
        ...(etag && { 'ETag': etag }),
        ...(response.url && { 'X-Upstream-Url': response.url })
      },
    });
    
  } catch (error: any) {
    keyStats.errors++;
    clearTimeout(timeoutId);
    
    // 处理不同类型的错误
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Key request timeout' }, { status: 408 });
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return NextResponse.json({ error: 'Network connection failed' }, { status: 503 });
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Key proxy error:', error);
    }
    return NextResponse.json({ 
      error: 'Failed to fetch key',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
    
  } finally {
    clearTimeout(timeoutId);
    
    // 定期打印统计信息
    if (keyStats.requests % 100 === 0 && process.env.NODE_ENV === 'development') {
      const hitRate = keyStats.cacheHits / keyStats.requests * 100;
      console.log(`Key Proxy Stats - Requests: ${keyStats.requests}, Cache Hits: ${keyStats.cacheHits} (${hitRate.toFixed(1)}%), Errors: ${keyStats.errors}, Avg Time: ${keyStats.avgResponseTime.toFixed(2)}ms, Cache Size: ${keyCache.size}, Total: ${(keyStats.totalBytes / 1024).toFixed(2)}KB`);
    }
  }
}