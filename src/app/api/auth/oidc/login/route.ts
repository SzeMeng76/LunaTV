/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const config = await getConfig();
    const oidcConfig = config.OIDCAuthConfig;

    // 检查是否启用OIDC登录
    if (!oidcConfig || !oidcConfig.enabled) {
      return NextResponse.json(
        { error: 'OIDC登录未启用' },
        { status: 403 }
      );
    }

    // 检查OIDC配置
    if (!oidcConfig.authorizationEndpoint || !oidcConfig.clientId) {
      return NextResponse.json(
        { error: 'OIDC配置不完整，请配置Authorization Endpoint和Client ID' },
        { status: 500 }
      );
    }

    // 生成state参数用于防止CSRF攻击
    const state = crypto.randomUUID();

    // 使用环境变量SITE_BASE，或从请求头获取真实的origin
    const origin = process.env.SITE_BASE ||
                   request.headers.get('x-forwarded-host')
                     ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('x-forwarded-host')}`
                     : request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/oidc/callback`;

    // 构建授权URL
    const authUrl = new URL(oidcConfig.authorizationEndpoint);
    authUrl.searchParams.set('client_id', oidcConfig.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);

    // 将state存储到cookie中
    const response = NextResponse.redirect(authUrl);

    response.cookies.set('oidc_state', state, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10分钟
    });

    return response;
  } catch (error) {
    console.error('OIDC登录发起失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
