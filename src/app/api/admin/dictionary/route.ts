// src/app/api/admin/dictionary/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  loadDictionary,
  resetDictionary,
  saveDictionary,
} from '@/lib/dictionary-storage';

// Define a minimal Auth type here to avoid using `any`; preferably export a proper type from auth.ts
type Auth = { role?: 'owner' | 'admin' | string } | null;

// 服务端检查是否是站长（owner）
function isOwner(request: NextRequest): boolean {
  const auth = getAuthInfoFromCookie(request) as Auth;
  return auth?.role === 'owner' || auth?.role === 'admin';
}

export async function GET(request: NextRequest) {
  const auth = getAuthInfoFromCookie(request) as Auth;
  if (!auth || (auth.role !== 'owner' && auth.role !== 'admin')) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }
  try {
    const words = await loadDictionary();
    return NextResponse.json({ words });
  } catch (error) {
    console.error('获取词典失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isOwner(request)) {
    return NextResponse.json({ error: '仅站长可修改词典' }, { status: 403 });
  }
  try {
    const { words } = await request.json();
    if (!Array.isArray(words)) {
      return NextResponse.json(
        { error: '请求体必须包含 words 数组' },
        { status: 400 }
      );
    }
    await saveDictionary(words);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存词典失败:', error);
    return NextResponse.json({ error: '保存失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isOwner(request)) {
    return NextResponse.json({ error: '仅站长可重置词典' }, { status: 403 });
  }
  try {
    await resetDictionary();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('重置词典失败:', error);
    return NextResponse.json({ error: '重置失败' }, { status: 500 });
  }
}
