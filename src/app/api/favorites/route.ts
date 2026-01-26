/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';
import { Favorite } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/favorites
 *
 * 支持两种调用方式：
 * 1. 不带 query，返回全部收藏列表（Record<string, Favorite>）。
 * 2. 带 key=source+id，返回单条收藏（Favorite | null）。
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      const errorResponse = { error: 'Unauthorized' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/favorites',
        statusCode: 401,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        const errorResponse = { error: '用户不存在' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'GET',
          path: '/api/favorites',
          statusCode: 401,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 401 });
      }
      if (user.banned) {
        const errorResponse = { error: '用户已被封禁' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'GET',
          path: '/api/favorites',
          statusCode: 401,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    // 查询单条收藏
    if (key) {
      const [source, id] = key.split('+');
      if (!source || !id) {
        const errorResponse = { error: 'Invalid key format' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'GET',
          path: '/api/favorites',
          statusCode: 400,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 400 });
      }
      const fav = await db.getFavorite(authInfo.username, source, id);
      const responseSize = Buffer.byteLength(JSON.stringify(fav), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/favorites',
        statusCode: 200,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
      });

      return NextResponse.json(fav, { status: 200 });
    }

    // 查询全部收藏
    const favorites = await db.getAllFavorites(authInfo.username);
    const count = Object.keys(favorites).length;
    const responseSize = Buffer.byteLength(JSON.stringify(favorites), 'utf8');
    const duration = Date.now() - startTime;

    // 性能监控日志
    const durationSeconds = (duration / 1000).toFixed(2);
    console.log(
      `[收藏性能] 用户: ${authInfo.username} | 收藏数: ${count} | 耗时: ${durationSeconds}s (${duration}ms)`
    );

    // 性能警告 - 根据不同耗时输出不同级别的日志
    if (duration > 25000) {
      console.error(
        `❌ [严重慢查询] 用户 ${authInfo.username} 的收藏查询耗时 ${durationSeconds}s，接近超时阈值！收藏数: ${count}`
      );
    } else if (duration > 15000) {
      console.warn(
        `⚠️  [慢查询警告] 用户 ${authInfo.username} 的收藏查询耗时 ${durationSeconds}s，建议优化。收藏数: ${count}`
      );
    } else if (duration > 5000) {
      console.log(
        `⏱️  [性能提示] 用户 ${authInfo.username} 的收藏查询耗时 ${durationSeconds}s，性能尚可。收藏数: ${count}`
      );
    } else {
      console.log(
        `✅ [性能良好] 用户 ${authInfo.username} 的收藏查询耗时 ${durationSeconds}s，性能优秀！收藏数: ${count}`
      );
    }

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/favorites',
      statusCode: 200,
      duration,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return NextResponse.json(favorites, { status: 200 });
  } catch (err) {
    console.error('获取收藏失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/favorites',
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

/**
 * POST /api/favorites
 * body: { key: string; favorite: Favorite }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      const errorResponse = { error: 'Unauthorized' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/favorites',
        statusCode: 401,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        const errorResponse = { error: '用户不存在' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'POST',
          path: '/api/favorites',
          statusCode: 401,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 401 });
      }
      if (user.banned) {
        const errorResponse = { error: '用户已被封禁' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'POST',
          path: '/api/favorites',
          statusCode: 401,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 401 });
      }
    }

    const body = await request.json();
    const requestSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
    const { key, favorite }: { key: string; favorite: Favorite } = body;

    if (!key || !favorite) {
      const errorResponse = { error: 'Missing key or favorite' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/favorites',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 验证必要字段
    if (!favorite.title || !favorite.source_name) {
      const errorResponse = { error: 'Invalid favorite data' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/favorites',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const [source, id] = key.split('+');
    if (!source || !id) {
      const errorResponse = { error: 'Invalid key format' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/favorites',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const finalFavorite = {
      ...favorite,
      save_time: favorite.save_time ?? Date.now(),
    } as Favorite;

    await db.saveFavorite(authInfo.username, source, id, finalFavorite);

    const successResponse = { success: true };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'POST',
      path: '/api/favorites',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize,
      responseSize,
    });

    return NextResponse.json(successResponse, { status: 200 });
  } catch (err) {
    console.error('保存收藏失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'POST',
      path: '/api/favorites',
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

/**
 * DELETE /api/favorites
 *
 * 1. 不带 query -> 清空全部收藏
 * 2. 带 key=source+id -> 删除单条收藏
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      const errorResponse = { error: 'Unauthorized' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'DELETE',
        path: '/api/favorites',
        statusCode: 401,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        const errorResponse = { error: '用户不存在' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'DELETE',
          path: '/api/favorites',
          statusCode: 401,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 401 });
      }
      if (user.banned) {
        const errorResponse = { error: '用户已被封禁' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'DELETE',
          path: '/api/favorites',
          statusCode: 401,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 401 });
      }
    }

    const username = authInfo.username;
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // 删除单条
      const [source, id] = key.split('+');
      if (!source || !id) {
        const errorResponse = { error: 'Invalid key format' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'DELETE',
          path: '/api/favorites',
          statusCode: 400,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 400 });
      }
      await db.deleteFavorite(username, source, id);
    } else {
      // 清空全部
      const all = await db.getAllFavorites(username);
      const count = Object.keys(all).length;

      console.log(
        `[收藏性能-删除] 用户: ${username} | 待删除收藏数: ${count}`
      );

      await Promise.all(
        Object.keys(all).map(async (k) => {
          const [s, i] = k.split('+');
          if (s && i) await db.deleteFavorite(username, s, i);
        })
      );
    }

    const successResponse = { success: true };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'DELETE',
      path: '/api/favorites',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return NextResponse.json(successResponse, { status: 200 });
  } catch (err) {
    console.error('删除收藏失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'DELETE',
      path: '/api/favorites',
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
