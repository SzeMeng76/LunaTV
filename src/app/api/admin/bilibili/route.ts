import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);

  if (!authInfo || (authInfo.role !== 'admin' && authInfo.role !== 'owner')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { enabled } = body;

    // 获取当前配置
    const config = await getConfig();

    // 更新 Bilibili 配置
    config.BilibiliConfig = {
      ...config.BilibiliConfig,
      enabled: enabled || false,
    };

    // 保存配置
    await db.saveAdminConfig(config);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存 Bilibili 配置失败:', error);
    return NextResponse.json(
      { error: '保存失败' },
      { status: 500 }
    );
  }
}
