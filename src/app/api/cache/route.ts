import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    console.log(`🔍 API缓存请求: ${key}`);

    // 现在可以安全地调用 db.getCache，Upstash 的 getCache 已经修复
    const data = await db.getCache(key);
    console.log(`✅ API缓存结果: ${data ? '命中' : '未命中'}`);
    return NextResponse.json({ data });
  } catch (error) {
    console.error(
      `❌ API缓存错误 (key: ${request.nextUrl.searchParams.get('key')}):`,
      error,
    );
    console.error('错误详情:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.json({ data: null }, { status: 200 }); // 确保返回 200 而不是 500
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, data, expireSeconds } = body;

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    console.log(`📝 API缓存写入: ${key}, 过期时间: ${expireSeconds}秒`);

    await db.setCache(key, data, expireSeconds);

    console.log(`✅ API缓存写入成功: ${key}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ API缓存写入失败:', error);
    console.error('错误详情:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.json({ error: 'Failed to set cache' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const prefix = searchParams.get('prefix');

    if (prefix) {
      await db.clearExpiredCache(prefix);
    } else if (key) {
      await db.deleteCache(key);
    } else {
      return NextResponse.json(
        { error: 'Key or prefix is required' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete cache error:', error);
    return NextResponse.json(
      { error: 'Failed to delete cache' },
      { status: 500 },
    );
  }
}
