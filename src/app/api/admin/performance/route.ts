/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 性能监控 API
 * 提供性能数据查询接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getRecentMetrics, getRecentRequests, getCurrentStatus, clearCache, startAutoCollection } from '@/lib/performance-monitor';
import { initFetchInterceptor } from '@/lib/fetch-interceptor';
import { getExternalTrafficStats } from '@/lib/external-traffic-monitor';

export const runtime = 'nodejs';

// 启动自动数据收集
startAutoCollection();

// 启动全局 fetch 拦截器（监控外部流量）
initFetchInterceptor();

/**
 * GET - 获取性能数据
 */
export async function GET(request: NextRequest) {
  try {
    // 权限验证
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 只有站长和管理员可以查看性能数据
    const username = authInfo.username;
    if (username !== process.env.USERNAME) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');
    const limit = parseInt(searchParams.get('limit') || '100');

    // 获取最近 N 小时的数据
    const metrics = getRecentMetrics(hours);
    const currentStatus = await getCurrentStatus();
    const recentRequests = await getRecentRequests(limit, hours);
    const externalTraffic = await getExternalTrafficStats(hours);

    return NextResponse.json({
      ok: true,
      data: {
        metrics,
        currentStatus,
        recentRequests,
        externalTraffic,
      },
    });
  } catch (error) {
    console.error('获取性能数据失败:', error);
    return NextResponse.json(
      { error: '获取性能数据失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 清空性能数据缓存
 */
export async function DELETE(request: NextRequest) {
  try {
    // 权限验证
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 只有站长可以清空数据
    const username = authInfo.username;
    if (username !== process.env.USERNAME) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    // 清空缓存
    await clearCache();

    return NextResponse.json({
      ok: true,
      message: '性能数据已清空',
    });
  } catch (error) {
    console.error('清空性能数据失败:', error);
    return NextResponse.json(
      { error: '清空性能数据失败' },
      { status: 500 }
    );
  }
}
