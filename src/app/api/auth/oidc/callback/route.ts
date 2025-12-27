/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 生成签名
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证Cookie
async function generateAuthCookie(
  username: string,
  role: 'owner' | 'admin' | 'user'
): Promise<string> {
  const authData: any = { role };

  if (username && process.env.PASSWORD) {
    authData.username = username;
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now();
    authData.loginTime = Date.now();
  }

  return encodeURIComponent(JSON.stringify(authData));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // 使用环境变量SITE_BASE，或从请求头获取真实的origin
    const origin = process.env.SITE_BASE ||
                   request.headers.get('x-forwarded-host')
                     ? `${request.headers.get('x-forwarded-proto') || 'https'}://${request.headers.get('x-forwarded-host')}`
                     : request.nextUrl.origin;

    // 检查是否有错误
    if (error) {
      console.error('OIDC认证错误:', error);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent('OIDC认证失败')}`, origin)
      );
    }

    // 验证必需参数
    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('缺少必需参数'), origin)
      );
    }

    // 验证state
    const storedState = request.cookies.get('oidc_state')?.value;
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('状态验证失败'), origin)
      );
    }

    const config = await getConfig();
    const oidcConfig = config.OIDCAuthConfig;

    // 检查OIDC配置
    if (!oidcConfig || !oidcConfig.tokenEndpoint || !oidcConfig.userInfoEndpoint || !oidcConfig.clientId || !oidcConfig.clientSecret) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('OIDC配置不完整'), origin)
      );
    }

    const redirectUri = `${origin}/api/auth/oidc/callback`;

    // 交换code获取token
    const tokenResponse = await fetch(oidcConfig.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: oidcConfig.clientId,
        client_secret: oidcConfig.clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('获取token失败:', await tokenResponse.text());
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('获取token失败'), origin)
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const idToken = tokenData.id_token;

    if (!accessToken || !idToken) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('token无效'), origin)
      );
    }

    // 获取用户信息
    const userInfoResponse = await fetch(oidcConfig.userInfoEndpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!userInfoResponse.ok) {
      console.error('获取用户信息失败:', await userInfoResponse.text());
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('获取用户信息失败'), origin)
      );
    }

    const userInfo = await userInfoResponse.json();
    const oidcSub = userInfo.sub; // OIDC的唯一标识符

    if (!oidcSub) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('用户信息无效'), origin)
      );
    }

    // 检查用户是否已存在(通过OIDC sub查找)
    // 优先使用新版本查找
    let username = await db.getUserByOidcSub(oidcSub);
    let userRole: 'owner' | 'admin' | 'user' = 'user';

    if (username) {
      // 从新版本获取用户信息
      const userInfoV2 = await db.getUserInfoV2(username);
      if (userInfoV2) {
        userRole = userInfoV2.role;
        // 检查用户是否被封禁
        if (userInfoV2.banned) {
          return NextResponse.redirect(
            new URL('/login?error=' + encodeURIComponent('用户被封禁'), origin)
          );
        }
      }
    } else {
      // 回退到配置中查找
      const existingUser = config.UserConfig.Users.find((u: any) => u.oidcSub === oidcSub);
      if (existingUser) {
        username = existingUser.username;
        userRole = existingUser.role || 'user';
        // 检查用户是否被封禁
        if (existingUser.banned) {
          return NextResponse.redirect(
            new URL('/login?error=' + encodeURIComponent('用户被封禁'), origin)
          );
        }
      }
    }

    if (username) {
      // 用户已存在,直接登录
      const response = NextResponse.redirect(new URL('/', origin));
      const cookieValue = await generateAuthCookie(username, userRole);
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);

      response.cookies.set('user_auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax',
        httpOnly: false,
        secure: false,
      });

      // 清除state cookie
      response.cookies.delete('oidc_state');

      return response;
    }

    // 用户不存在,检查是否允许注册
    if (!oidcConfig.enableRegistration) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('该OIDC账号未注册'), origin)
      );
    }

    // 需要注册,跳转到用户名输入页面
    // 将OIDC信息存储到session中
    const oidcSession = {
      sub: oidcSub,
      email: userInfo.email,
      name: userInfo.name,
      trust_level: userInfo.trust_level, // 提取trust_level字段
      timestamp: Date.now(),
    };

    const response = NextResponse.redirect(new URL('/oidc-register', origin));
    response.cookies.set('oidc_session', JSON.stringify(oidcSession), {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10分钟
    });

    // 清除state cookie
    response.cookies.delete('oidc_state');

    return response;
  } catch (error) {
    console.error('OIDC回调处理失败:', error);
    const origin = process.env.SITE_BASE || request.nextUrl.origin;
    return NextResponse.redirect(
      new URL('/login?error=' + encodeURIComponent('服务器错误'), origin)
    );
  }
}
