import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // 清除新的认证cookie (user_auth)
  response.cookies.set('user_auth', '', {
    path: '/',
    expires: new Date(0),
    sameSite: 'lax', // 改为 lax 以支持 PWA
    httpOnly: false, // PWA 需要客户端可访问
    secure: false, // 根据协议自动设置
  });

  // 同时清除旧的认证cookie (auth) 以保持兼容性
  response.cookies.set('auth', '', {
    path: '/',
    expires: new Date(0),
    sameSite: 'lax',
    httpOnly: false,
    secure: false,
  });

  // 检查是否开启了游客浏览，如果是则设置游客模式 cookie
  try {
    const config = await getConfig();
    const allowGuestBrowse = config.HomePageConfig?.allowGuestBrowse ?? false;
    if (allowGuestBrowse) {
      response.cookies.set('guest_mode', 'true', {
        path: '/',
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 1 天
      });
    }
  } catch {
    // 忽略错误，继续返回
  }

  return response;
}
