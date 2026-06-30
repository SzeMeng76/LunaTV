/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';
import { PlayRecord } from '@/lib/types';

export const runtime = 'nodejs';

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
        path: '/api/playrecords',
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
          path: '/api/playrecords',
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
          path: '/api/playrecords',
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

    const records = await db.getAllPlayRecords(authInfo.username);

    // 数据升级：确保旧播放记录包含新字段，防止前端崩溃
    const upgradedRecords: Record<string, PlayRecord> = {};
    for (const [key, record] of Object.entries(records)) {
      upgradedRecords[key] = {
        ...(record as PlayRecord),
        // 确保 type 字段存在
        type: (record as any).type || undefined,
        // 确保 douban_id 字段存在
        douban_id: (record as any).douban_id || undefined,
        // 确保 remarks 字段存在
        remarks: (record as any).remarks || undefined,
        // 确保 original_episodes 字段存在
        original_episodes: (record as any).original_episodes || undefined,
      };
    }

    const responseSize = Buffer.byteLength(JSON.stringify(upgradedRecords), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/playrecords',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return NextResponse.json(upgradedRecords, { status: 200 });
  } catch (err) {
    console.error('获取播放记录失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/playrecords',
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
        path: '/api/playrecords',
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
          path: '/api/playrecords',
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
          path: '/api/playrecords',
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
    const { key, record }: { key: string; record: PlayRecord } = body;

    if (!key || !record) {
      const errorResponse = { error: 'Missing key or record' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/playrecords',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 验证播放记录数据
    if (!record.title || !record.source_name || record.index < 1) {
      const errorResponse = { error: 'Invalid record data' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/playrecords',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 从key中解析source和id
    const [source, id] = key.split('+');
    if (!source || !id) {
      const errorResponse = { error: 'Invalid key format' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/playrecords',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 获取现有播放记录以保持原始集数
    const existingRecord = await db.getPlayRecord(authInfo.username, source, id);

    // 🔑 关键修复：信任客户端传来的 original_episodes（已经过 checkShouldUpdateOriginalEpisodes 验证）
    // 只有在客户端没有提供时，才使用数据库中的值作为 fallback
    let originalEpisodes: number;
    if (record.original_episodes !== undefined && record.original_episodes !== null) {
      // 客户端已经设置了 original_episodes，信任它（可能是更新后的值）
      originalEpisodes = record.original_episodes;
    } else {
      // 客户端没有提供，使用数据库中的值或当前 total_episodes
      originalEpisodes = existingRecord?.original_episodes || existingRecord?.total_episodes || record.total_episodes;
    }

    const finalRecord = {
      ...record,
      save_time: record.save_time ?? Date.now(),
      original_episodes: originalEpisodes,
    } as PlayRecord;

    await db.savePlayRecord(authInfo.username, source, id, finalRecord);

    // 更新播放统计（如果存储类型支持）
    if (db.isStatsSupported()) {
      await db.updatePlayStatistics(
        authInfo.username,
        source,
        id,
        finalRecord.play_time
      );
    }

    const successResponse = { success: true };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'POST',
      path: '/api/playrecords',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize,
      responseSize,
    });

    return NextResponse.json(successResponse, { status: 200 });
  } catch (err) {
    console.error('保存播放记录失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'POST',
      path: '/api/playrecords',
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
        path: '/api/playrecords',
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
          path: '/api/playrecords',
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
          path: '/api/playrecords',
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
      // 如果提供了 key，删除单条播放记录
      const [source, id] = key.split('+');
      if (!source || !id) {
        const errorResponse = { error: 'Invalid key format' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'DELETE',
          path: '/api/playrecords',
          statusCode: 400,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 400 });
      }

      await db.deletePlayRecord(username, source, id);
    } else {
      // 未提供 key，则清空全部播放记录
      // 目前 DbManager 没有对应方法，这里直接遍历删除
      const all = await db.getAllPlayRecords(username);
      await Promise.all(
        Object.keys(all).map(async (k) => {
          const [s, i] = k.split('+');
          if (s && i) await db.deletePlayRecord(username, s, i);
        })
      );
    }

    const successResponse = { success: true };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'DELETE',
      path: '/api/playrecords',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return NextResponse.json(successResponse, { status: 200 });
  } catch (err) {
    console.error('删除播放记录失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'DELETE',
      path: '/api/playrecords',
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
