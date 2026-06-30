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
    const config = await getConfig();

    // 清除登录信息
    config.BilibiliConfig = {
      ...config.BilibiliConfig,
      enabled: config.BilibiliConfig?.enabled || false,
      sessdata: undefined,
      bili_jct: undefined,
      buvid3: undefined,
      loginStatus: 'not_logged_in',
      userInfo: undefined,
    };

    await db.saveAdminConfig(config);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('退出B站登录失败:', error);
    return NextResponse.json(
      { error: '退出登录失败' },
      { status: 500 }
    );
  }
}
