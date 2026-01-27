/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 导入 cron route 中的统计数据
// 注意：这里我们需要从父模块导出 currentCronStats
let cachedStats: any = null;

export async function GET() {
  try {
    // 从全局获取最新的 cron 统计数据
    // 这里需要修改 cron/route.ts 来导出统计数据
    const stats = (global as any).currentCronStats || cachedStats;

    if (!stats) {
      return NextResponse.json({
        success: false,
        message: 'No cron statistics available yet. Please run cron job first.',
        timestamp: new Date().toISOString(),
      }, { status: 404 });
    }

    // 缓存统计数据
    cachedStats = stats;

    return NextResponse.json({
      success: true,
      message: 'Cron statistics retrieved successfully',
      timestamp: new Date().toISOString(),
      stats: {
        startTime: stats.startTime,
        endTime: stats.endTime,
        duration: stats.duration,
        durationSeconds: stats.duration ? (stats.duration / 1000).toFixed(2) : null,
        memoryUsed: stats.memoryUsed ? `${stats.memoryUsed.toFixed(2)} MB` : null,
        dbQueries: stats.dbQueries,
        tasks: stats.tasks,
      },
    });
  } catch (error) {
    console.error('Failed to retrieve cron stats:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to retrieve cron statistics',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
