import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 客户端日志收集 API
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { level, message, data, timestamp } = body;

    // 根据日志级别输出到服务端
    const logPrefix = `[ClientLog]`;
    const logMessage = `${logPrefix} [${level}] ${message}`;

    if (level === 'error') {
      console.error(logMessage, data || '');
    } else if (level === 'warn') {
      console.warn(logMessage, data || '');
    } else {
      console.log(logMessage, data || '');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ClientLog] 处理客户端日志失败:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
