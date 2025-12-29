/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAvailableApiSites } from '@/lib/config';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

// OrionTV 兼容接口
export async function GET(request: NextRequest) {
  console.log('request', request.url);

  // 添加用户认证检查
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const apiSites = await getAvailableApiSites(authInfo.username);

    return NextResponse.json(apiSites);
  } catch (error) {
    return NextResponse.json({ error: '获取资源失败' }, { status: 500 });
  }
}
