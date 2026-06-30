import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { CrashLog } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const crashReport: CrashLog = await request.json();

    // 添加服务器接收时间
    const serverTimestamp = new Date().toISOString();
    const logEntry: CrashLog = {
      ...crashReport,
      serverReceivedAt: serverTimestamp,
    };

    // 保存到数据库（Redis/KVRocks/Upstash）
    await db.saveCrashLog(logEntry);

    // 打印到服务器控制台
    console.error('🔥 收到崩溃报告:', {
      type: crashReport.type || 'PAGE_ERROR',
      message: crashReport.message,
      url: crashReport.url,
      timestamp: crashReport.timestamp,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('保存崩溃报告失败:', error);
    return NextResponse.json(
      { error: 'Failed to save crash report' },
      { status: 500 }
    );
  }
}

// GET 接口：获取崩溃日志列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const crashLogs = await db.getCrashLogs(limit);

    return NextResponse.json({ crashLogs }, { status: 200 });
  } catch (error) {
    console.error('获取崩溃日志失败:', error);
    return NextResponse.json(
      { error: 'Failed to get crash logs' },
      { status: 500 }
    );
  }
}

// DELETE 接口：清除所有崩溃日志
export async function DELETE() {
  try {
    await db.clearCrashLogs();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('清除崩溃日志失败:', error);
    return NextResponse.json(
      { error: 'Failed to clear crash logs' },
      { status: 500 }
    );
  }
}
