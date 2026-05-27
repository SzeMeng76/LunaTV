/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (authInfo.username !== process.env.USERNAME) {
    return NextResponse.json({ error: 'Forbidden: Owner access required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const logs = await db.getLoginLogs(limit);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error('获取登录日志失败:', error);
    return NextResponse.json({ error: '获取登录日志失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (authInfo.username !== process.env.USERNAME) {
    return NextResponse.json({ error: 'Forbidden: Owner access required' }, { status: 403 });
  }

  try {
    await db.clearLoginLogs();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('清除登录日志失败:', error);
    return NextResponse.json({ error: '清除登录日志失败' }, { status: 500 });
  }
}
