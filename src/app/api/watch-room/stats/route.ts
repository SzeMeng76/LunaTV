import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { serverUrl, authKey } = await request.json();

    if (!serverUrl) {
      return NextResponse.json(
        { success: false, error: '服务器地址不能为空' },
        { status: 400 }
      );
    }

    // 请求统计信息
    const statsUrl = `${serverUrl.replace(/\/$/, '')}/stats`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(statsUrl, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${authKey}`,
          Accept: 'application/json',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return NextResponse.json({
          success: false,
          error: `服务器返回错误: HTTP ${response.status}`,
        });
      }

      const stats = await response.json();

      return NextResponse.json({
        success: true,
        data: stats,
      });
    } catch (fetchError: any) {
      clearTimeout(timeout);

      if (fetchError.name === 'AbortError') {
        return NextResponse.json({
          success: false,
          error: '请求超时（10秒）',
        });
      }

      return NextResponse.json({
        success: false,
        error: `无法连接到服务器: ${fetchError.message}`,
      });
    }
  } catch (error: any) {
    console.error('获取统计信息失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || '获取统计信息失败' },
      { status: 500 }
    );
  }
}
