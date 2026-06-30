import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';
import { EpisodeSkipConfig } from '@/lib/types';

// 配置 Node.js Runtime
export const runtime = 'nodejs';

/** 从 key 和 identityKey 解析出 DB 层需要的 source 和 id */
function resolveSkipKey(
  key: string,
  identityKey?: string,
): { source: string; id: string } | null {
  if (identityKey) {
    // 新格式：视频身份 key，source=identityKey, id='__identity__' 用于兼容 SQLite 主键
    return { source: identityKey, id: '__identity__' };
  }
  // 旧格式：source+id
  const parts = key.split('+');
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { source: parts[0], id: parts.slice(1).join('+') };
  }
  return null;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    const body = await request.json();
    const requestSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
    const { action, key, config, username, identityKey } = body;

    // 验证请求参数
    if (!action) {
      const errorResponse = { error: '缺少操作类型' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/skipconfigs',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 获取认证信息
    const authInfo = getAuthInfoFromCookie(request);

    // 如果是直接传入的认证信息（客户端模式），使用传入的信息
    const finalUsername = username || authInfo?.username;

    if (!finalUsername) {
      const errorResponse = { error: '用户未登录' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/skipconfigs',
        statusCode: 401,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 401 });
    }

    switch (action) {
      case 'get': {
        if (!key) {
          const errorResponse = { error: '缺少配置键' };
          const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

          recordRequest({
            timestamp: startTime,
            method: 'POST',
            path: '/api/skipconfigs',
            statusCode: 400,
            duration: Date.now() - startTime,
            memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
            dbQueries: getDbQueryCount(),
            requestSize,
            responseSize: errorSize,
          });

          return NextResponse.json(errorResponse, { status: 400 });
        }

        // 解析 key 为 source 和 id (格式: source+id)
        const resolved = resolveSkipKey(key, identityKey);
        if (!resolved) {
          const errorResponse = { error: '无效的key格式' };
          const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

          recordRequest({
            timestamp: startTime,
            method: 'POST',
            path: '/api/skipconfigs',
            statusCode: 400,
            duration: Date.now() - startTime,
            memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
            dbQueries: getDbQueryCount(),
            requestSize,
            responseSize: errorSize,
          });

          return NextResponse.json(errorResponse, { status: 400 });
        }

        const skipConfig = await db.getSkipConfig(finalUsername, resolved.source, resolved.id);
        const successResponse = { config: skipConfig };
        const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'POST',
          path: '/api/skipconfigs',
          statusCode: 200,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize,
          responseSize,
        });

        return NextResponse.json(successResponse);
      }

      case 'set': {
        if (!key || !config) {
          const errorResponse = { error: '缺少配置键或配置数据' };
          const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

          recordRequest({
            timestamp: startTime,
            method: 'POST',
            path: '/api/skipconfigs',
            statusCode: 400,
            duration: Date.now() - startTime,
            memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
            dbQueries: getDbQueryCount(),
            requestSize,
            responseSize: errorSize,
          });

          return NextResponse.json(errorResponse, { status: 400 });
        }

        // 解析 key 为 source 和 id (格式: source+id)
        const resolved = resolveSkipKey(key, identityKey);
        if (!resolved) {
          const errorResponse = { error: '无效的key格式' };
          const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

          recordRequest({
            timestamp: startTime,
            method: 'POST',
            path: '/api/skipconfigs',
            statusCode: 400,
            duration: Date.now() - startTime,
            memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
            dbQueries: getDbQueryCount(),
            requestSize,
            responseSize: errorSize,
          });

          return NextResponse.json(errorResponse, { status: 400 });
        }

        // 验证配置数据结构
        if (!config.source || !config.id || !config.title || !Array.isArray(config.segments)) {
          const errorResponse = { error: '配置数据格式错误' };
          const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

          recordRequest({
            timestamp: startTime,
            method: 'POST',
            path: '/api/skipconfigs',
            statusCode: 400,
            duration: Date.now() - startTime,
            memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
            dbQueries: getDbQueryCount(),
            requestSize,
            responseSize: errorSize,
          });

          return NextResponse.json(errorResponse, { status: 400 });
        }

        // 验证片段数据
        for (const segment of config.segments) {
          if (
            typeof segment.start !== 'number' ||
            typeof segment.end !== 'number' ||
            segment.start >= segment.end ||
            !['opening', 'ending'].includes(segment.type)
          ) {
            const errorResponse = { error: '片段数据格式错误' };
            const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

            recordRequest({
              timestamp: startTime,
              method: 'POST',
              path: '/api/skipconfigs',
              statusCode: 400,
              duration: Date.now() - startTime,
              memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
              dbQueries: getDbQueryCount(),
              requestSize,
              responseSize: errorSize,
            });

            return NextResponse.json(errorResponse, { status: 400 });
          }
        }

        await db.setSkipConfig(finalUsername, resolved.source, resolved.id, config as EpisodeSkipConfig);
        const successResponse = { success: true };
        const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'POST',
          path: '/api/skipconfigs',
          statusCode: 200,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize,
          responseSize,
        });

        return NextResponse.json(successResponse);
      }

      case 'getAll': {
        const allConfigs = await db.getAllSkipConfigs(finalUsername);
        const successResponse = { configs: allConfigs };
        const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'POST',
          path: '/api/skipconfigs',
          statusCode: 200,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize,
          responseSize,
        });

        return NextResponse.json(successResponse);
      }

      case 'delete': {
        if (!key) {
          const errorResponse = { error: '缺少配置键' };
          const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

          recordRequest({
            timestamp: startTime,
            method: 'POST',
            path: '/api/skipconfigs',
            statusCode: 400,
            duration: Date.now() - startTime,
            memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
            dbQueries: getDbQueryCount(),
            requestSize,
            responseSize: errorSize,
          });

          return NextResponse.json(errorResponse, { status: 400 });
        }

        // 解析 key 为 source 和 id (格式: source+id)
        const resolved = resolveSkipKey(key, identityKey);
        if (!resolved) {
          const errorResponse = { error: '无效的key格式' };
          const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

          recordRequest({
            timestamp: startTime,
            method: 'POST',
            path: '/api/skipconfigs',
            statusCode: 400,
            duration: Date.now() - startTime,
            memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
            dbQueries: getDbQueryCount(),
            requestSize,
            responseSize: errorSize,
          });

          return NextResponse.json(errorResponse, { status: 400 });
        }

        await db.deleteSkipConfig(finalUsername, resolved.source, resolved.id);
        const successResponse = { success: true };
        const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'POST',
          path: '/api/skipconfigs',
          statusCode: 200,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize,
          responseSize,
        });

        return NextResponse.json(successResponse);
      }

      default: {
        const errorResponse = { error: '不支持的操作类型' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'POST',
          path: '/api/skipconfigs',
          statusCode: 400,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 400 });
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('跳过配置 API 错误:', error);
    const errorResponse = { error: '服务器内部错误' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'POST',
      path: '/api/skipconfigs',
      statusCode: 500,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize: errorSize,
    });

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
