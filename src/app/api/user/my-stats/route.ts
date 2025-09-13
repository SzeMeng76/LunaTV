/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 检查存储类型是否支持统计功能
    if (!db.isStatsSupported()) {
      return NextResponse.json(
        {
          error: '当前存储类型不支持播放统计功能，请使用 Redis、Upstash 或 Kvrocks',
          supportedTypes: ['redis', 'upstash', 'kvrocks']
        },
        { status: 400 }
      );
    }

    const config = await getConfig();
    const username = process.env.USERNAME;

    // 检查用户权限（管理员或普通用户）
    if (authInfo.username !== username) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    // 获取用户个人统计数据
    const userStats = await db.getUserPlayStat(authInfo.username);

    return NextResponse.json(userStats, { status: 200 });
  } catch (err) {
    console.error('获取用户个人统计失败:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}