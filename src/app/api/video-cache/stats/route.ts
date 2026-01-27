import { NextResponse } from 'next/server';
import { getCacheStats } from '@/lib/video-cache';

export const runtime = 'nodejs';

/**
 * 获取视频缓存统计信息
 */
export async function GET() {
  try {
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;

    if (storageType !== 'kvrocks') {
      return NextResponse.json({
        code: 400,
        message: '当前存储类型不支持视频缓存',
      }, { status: 400 });
    }

    const stats = await getCacheStats();

    return NextResponse.json({
      code: 200,
      message: '获取成功',
      data: {
        totalSize: stats.totalSize,
        totalSizeMB: (stats.totalSize / 1024 / 1024).toFixed(2),
        fileCount: stats.fileCount,
        maxSize: stats.maxSize,
        maxSizeMB: (stats.maxSize / 1024 / 1024).toFixed(2),
        usagePercent: ((stats.totalSize / stats.maxSize) * 100).toFixed(2),
      },
    });
  } catch (error) {
    console.error('[VideoCache] 获取统计失败:', error);
    return NextResponse.json({
      code: 500,
      message: '获取统计失败',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
