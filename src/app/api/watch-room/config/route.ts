import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * 获取观影室配置
 * GET /api/watch-room/config
 */
export async function GET() {
  try {
    const config = await getConfig();
    const watchRoomConfig = config.WatchRoomConfig;

    // 如果未配置或未启用，返回 disabled
    if (!watchRoomConfig || !watchRoomConfig.enabled) {
      return NextResponse.json({
        enabled: false,
      });
    }

    // 返回配置（不包含 authKey，authKey 由客户端从环境变量获取或管理员配置）
    return NextResponse.json({
      enabled: true,
      serverUrl: watchRoomConfig.serverUrl,
      // authKey 敏感信息，需要时由客户端单独请求
    });
  } catch (error) {
    console.error('获取观影室配置失败:', error);
    return NextResponse.json(
      { error: '获取配置失败', enabled: false },
      { status: 500 }
    );
  }
}

/**
 * 获取观影室完整配置（包含 authKey，需要管理员权限）
 * GET /api/watch-room/config?full=true
 *
 * 这个端点需要在实际使用时添加权限验证
 */
export async function POST() {
  try {
    const config = await getConfig();
    const watchRoomConfig = config.WatchRoomConfig;

    if (!watchRoomConfig) {
      return NextResponse.json({
        enabled: false,
        serverUrl: '',
        authKey: '',
      });
    }

    return NextResponse.json({
      enabled: watchRoomConfig.enabled || false,
      serverUrl: watchRoomConfig.serverUrl || '',
      authKey: watchRoomConfig.authKey || '',
    });
  } catch (error) {
    console.error('获取观影室完整配置失败:', error);
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    );
  }
}
