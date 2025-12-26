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

    // 测试健康检查端点
    const healthUrl = `${serverUrl.replace(/\/$/, '')}/health`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10秒超时

    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return NextResponse.json({
          success: false,
          error: `服务器返回错误: HTTP ${response.status}`,
        });
      }

      const data = await response.json();

      if (data.status === 'ok') {
        const uptimeMinutes = data.uptime ? Math.floor(data.uptime / 60) : 0;
        return NextResponse.json({
          success: true,
          message: `连接成功！服务器运行时间: ${uptimeMinutes} 分钟`,
        });
      } else {
        return NextResponse.json({
          success: false,
          error: '服务器状态异常',
        });
      }
    } catch (fetchError: any) {
      clearTimeout(timeout);

      if (fetchError.name === 'AbortError') {
        return NextResponse.json({
          success: false,
          error: '连接超时（10秒）',
        });
      }

      return NextResponse.json({
        success: false,
        error: `无法连接到服务器: ${fetchError.message}`,
      });
    }
  } catch (error: any) {
    console.error('测试连接失败:', error);
    return NextResponse.json(
      { success: false, error: error.message || '测试连接失败' },
      { status: 500 }
    );
  }
}
