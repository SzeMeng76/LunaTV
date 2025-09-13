/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 检查存储类型是否支持统计功能
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      return NextResponse.json(
        {
          error: '当前存储类型不支持播放统计功能，请使用 Redis、Upstash 或 Kvrocks',
          supportedTypes: ['redis', 'upstash', 'kvrocks']
        },
        { status: 400 }
      );
    }

    // 检查用户权限（只有管理员和站长能访问）
    const username = process.env.USERNAME;
    const isAdmin = username === authInfo.username;
    const isOwner = authInfo.role === 'owner';

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: '权限不足，只有管理员才能查看播放统计' },
        { status: 403 }
      );
    }

    // 获取播放统计数据
    const stats = await db.getPlayStats();

    return NextResponse.json(stats, { status: 200 });
  } catch (err) {
    console.error('获取播放统计失败:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}