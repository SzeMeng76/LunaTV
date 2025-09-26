/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

// 计算注册天数
function calculateRegistrationDays(startDate: number): number {
  if (!startDate || startDate <= 0) return 0;

  const firstDate = new Date(startDate);
  const currentDate = new Date();

  // 获取自然日（忽略时分秒）
  const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
  const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

  // 计算自然日差值并加1
  const daysDiff = Math.floor((currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
  return daysDiff + 1;
}

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

    // 获取用户配置信息来获取真实的创建时间
    // 设置项目开始时间，2025年9月14日（与管理员统计保持一致）
    const PROJECT_START_DATE = new Date('2025-09-14').getTime();
    let userCreatedAt = PROJECT_START_DATE;

    // 对于所有用户（包括站长），都尝试从配置中获取创建时间
    const user = config.UserConfig.Users.find(
      (u) => u.username === authInfo.username
    );

    // 使用与管理员统计相同的逻辑
    userCreatedAt = user?.createdAt || PROJECT_START_DATE;

    // 增强统计数据：添加注册天数和登录天数计算
    const registrationDays = calculateRegistrationDays(userCreatedAt);
    const loginDays = userStats.firstWatchDate && userStats.firstWatchDate > 0
      ? calculateRegistrationDays(userStats.firstWatchDate)
      : 0;

    // 获取最后登录时间
    const lastLoginTime = user?.lastLoginTime || null;

    console.log('注册天数计算:', {
      userCreatedAt,
      userCreatedAtDate: new Date(userCreatedAt),
      registrationDays,
      firstWatchDate: userStats.firstWatchDate,
      firstWatchDateDate: userStats.firstWatchDate ? new Date(userStats.firstWatchDate) : null,
      loginDays,
      lastLoginTime,
      lastLoginTimeDate: lastLoginTime ? new Date(lastLoginTime) : null
    });

    const enhancedStats = {
      ...userStats,
      // 确保新字段有默认值
      totalMovies: userStats.totalMovies ?? userStats.totalPlays ?? 0,
      firstWatchDate: userStats.firstWatchDate ?? userStats.lastPlayTime ?? Date.now(),
      lastUpdateTime: userStats.lastUpdateTime ?? Date.now(),
      // 注册天数计算（基于真实的用户创建时间）
      registrationDays,
      // 登录天数计算（基于首次观看时间，类似Alpha逻辑）
      loginDays,
      // 新增：最后登录时间
      lastLoginTime: lastLoginTime
    };

    return NextResponse.json(enhancedStats, { status: 200 });
  } catch (err) {
    console.error('获取用户个人统计失败:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST 方法：更新用户统计数据（用于智能观看时间统计）
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/user/my-stats - 开始处理请求');

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

    // 检查用户权限
    if (authInfo.username !== username) {
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

    const body = await request.json();
    const { watchTime, movieKey, timestamp, isRecalculation } = body;

    if (typeof watchTime !== 'number' || !movieKey || !timestamp) {
      return NextResponse.json(
        { error: '参数错误：需要 watchTime, movieKey, timestamp' },
        { status: 400 }
      );
    }

    // 获取当前用户统计数据
    const currentStats = await db.getUserPlayStat(authInfo.username);

    // 构建更新后的统计数据
    const updatedStats = {
      ...currentStats,
      totalWatchTime: isRecalculation
        ? watchTime
        : currentStats.totalWatchTime + watchTime,
      lastUpdateTime: timestamp,
      // 更新首次观看时间（如果还没有设置）
      firstWatchDate: currentStats.firstWatchDate || timestamp,
      // 简单的影片数量统计（这里可以进一步优化为精确去重）
      totalMovies: currentStats.totalMovies || currentStats.totalPlays || 1
    };

    // 更新统计数据（这里需要扩展存储层支持）
    // TODO: 需要在存储层添加 updateUserStats 方法
    console.log('更新用户统计数据:', updatedStats);

    return NextResponse.json({
      success: true,
      userStats: updatedStats
    });
  } catch (error) {
    console.error('POST /api/user/my-stats - 详细错误信息:', error);
    return NextResponse.json(
      {
        error: '更新用户统计数据失败',
        details: process.env.NODE_ENV === 'development' ? (error as Error)?.message : undefined
      },
      { status: 500 }
    );
  }
}

// DELETE 方法：清除用户统计数据
export async function DELETE(request: NextRequest) {
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

    // 检查用户权限
    if (authInfo.username !== username) {
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

    // TODO: 需要在存储层添加清除用户统计数据的方法
    console.log('清除用户统计数据:', authInfo.username);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('清除用户统计数据失败:', error);
    return NextResponse.json(
      { error: '清除用户统计数据失败' },
      { status: 500 }
    );
  }
}