import { NextResponse } from 'next/server';

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

  return response;
}
