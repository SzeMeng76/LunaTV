/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { recordRequest, getDbQueryCount, resetDbQueryCount } from '@/lib/performance-monitor';
import { Reminder } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/reminders
 *
 * 支持两种调用方式：
 * 1. 不带 query，返回全部提醒列表（Record<string, Reminder>）。
 * 2. 带 key=source+id，返回单条提醒（Reminder | null）。
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
        path: '/api/reminders',
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
          path: '/api/reminders',
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
          path: '/api/reminders',
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

    // 查询单条提醒
    if (key) {
      const [source, id] = key.split('+');
      if (!source || !id) {
        const errorResponse = { error: 'Invalid key format' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'GET',
          path: '/api/reminders',
          statusCode: 400,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 400 });
      }
      const reminder = await db.getReminder(authInfo.username, source, id);
      const responseSize = Buffer.byteLength(JSON.stringify(reminder), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'GET',
        path: '/api/reminders',
        statusCode: 200,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize: 0,
        responseSize,
      });

      return NextResponse.json(reminder, { status: 200 });
    }

    // 查询全部提醒
    const reminders = await db.getAllReminders(authInfo.username);
    const count = Object.keys(reminders).length;
    const responseSize = Buffer.byteLength(JSON.stringify(reminders), 'utf8');
    const duration = Date.now() - startTime;

    console.log(
      `[提醒性能] 用户: ${authInfo.username} | 提醒数: ${count} | 耗时: ${(duration / 1000).toFixed(2)}s`
    );

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/reminders',
      statusCode: 200,
      duration,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return NextResponse.json(reminders, { status: 200 });
  } catch (err) {
    console.error('获取提醒失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'GET',
      path: '/api/reminders',
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
 * POST /api/reminders
 * body: { key: string; reminder: Reminder }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      const errorResponse = { error: 'Unauthorized' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/reminders',
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
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        const errorResponse = { error: '用户不存在' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'POST',
          path: '/api/reminders',
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
          path: '/api/reminders',
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
    const { key, reminder }: { key: string; reminder: Reminder } = body;

    if (!key || !reminder) {
      const errorResponse = { error: 'Missing key or reminder' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/reminders',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // 验证必要字段（提醒必须有 releaseDate）
    if (!reminder.title || !reminder.source_name || !reminder.releaseDate) {
      const errorResponse = { error: 'Invalid reminder data: missing title, source_name, or releaseDate' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'POST',
        path: '/api/reminders',
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
        path: '/api/reminders',
        statusCode: 400,
        duration: Date.now() - startTime,
        memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
        dbQueries: getDbQueryCount(),
        requestSize,
        responseSize: errorSize,
      });

      return NextResponse.json(errorResponse, { status: 400 });
    }

    const finalReminder = {
      ...reminder,
      save_time: reminder.save_time ?? Date.now(),
    } as Reminder;

    await db.saveReminder(authInfo.username, source, id, finalReminder);

    const successResponse = { success: true };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'POST',
      path: '/api/reminders',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize,
      responseSize,
    });

    return NextResponse.json(successResponse, { status: 200 });
  } catch (err) {
    console.error('保存提醒失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'POST',
      path: '/api/reminders',
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
 * DELETE /api/reminders
 *
 * 1. 不带 query -> 清空全部提醒
 * 2. 带 key=source+id -> 删除单条提醒
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage().heapUsed;
  resetDbQueryCount();

  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      const errorResponse = { error: 'Unauthorized' };
      const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

      recordRequest({
        timestamp: startTime,
        method: 'DELETE',
        path: '/api/reminders',
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
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        const errorResponse = { error: '用户不存在' };
        const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

        recordRequest({
          timestamp: startTime,
          method: 'DELETE',
          path: '/api/reminders',
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
          path: '/api/reminders',
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
          path: '/api/reminders',
          statusCode: 400,
          duration: Date.now() - startTime,
          memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
          dbQueries: getDbQueryCount(),
          requestSize: 0,
          responseSize: errorSize,
        });

        return NextResponse.json(errorResponse, { status: 400 });
      }
      await db.deleteReminder(username, source, id);
    } else {
      // 清空全部
      const all = await db.getAllReminders(username);
      const count = Object.keys(all).length;

      console.log(
        `[提醒性能-删除] 用户: ${username} | 待删除提醒数: ${count}`
      );

      await Promise.all(
        Object.keys(all).map(async (k) => {
          const [s, i] = k.split('+');
          if (s && i) await db.deleteReminder(username, s, i);
        })
      );
    }

    const successResponse = { success: true };
    const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'DELETE',
      path: '/api/reminders',
      statusCode: 200,
      duration: Date.now() - startTime,
      memoryUsed: (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024,
      dbQueries: getDbQueryCount(),
      requestSize: 0,
      responseSize,
    });

    return NextResponse.json(successResponse, { status: 200 });
  } catch (err) {
    console.error('删除提醒失败', err);
    const errorResponse = { error: 'Internal Server Error' };
    const errorSize = Buffer.byteLength(JSON.stringify(errorResponse), 'utf8');

    recordRequest({
      timestamp: startTime,
      method: 'DELETE',
      path: '/api/reminders',
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

