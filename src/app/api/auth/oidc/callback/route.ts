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
    console.log('[OIDC Callback] Request URL:', request.url);
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    console.log('[OIDC Callback] Params - code:', !!code, 'state:', !!state, 'error:', error);

    // 使用环境变量SITE_BASE，或从请求头获取真实的origin
    let origin: string;
    if (process.env.SITE_BASE) {
      origin = process.env.SITE_BASE;
      console.log('[OIDC Callback] Using SITE_BASE:', origin);
    } else if (request.headers.get('x-forwarded-host')) {
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('x-forwarded-host');
      origin = `${proto}://${host}`;
      console.log('[OIDC Callback] Using x-forwarded-host:', origin);
    } else {
      origin = request.nextUrl.origin;
      origin = origin.replace('://0.0.0.0:', '://localhost:');
      console.log('[OIDC Callback] Using request origin:', origin);
    }

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

    // 验证state并获取 provider ID
    const storedStateData = request.cookies.get('oidc_state')?.value;
    if (!storedStateData) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('状态验证失败'), origin)
      );
    }

    let storedState: string;
    let providerId = 'default';

    try {
      // 尝试解析为 JSON（新格式）
      const parsed = JSON.parse(storedStateData);
      storedState = parsed.state;
      providerId = parsed.providerId || 'default';
    } catch {
      // 向后兼容：旧格式直接是 state 字符串
      storedState = storedStateData;
    }

    if (storedState !== state) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('状态验证失败'), origin)
      );
    }

    const config = await getConfig();

    // 优先使用新的多 Provider 配置
    let oidcConfig = null;

    if (config.OIDCProviders && config.OIDCProviders.length > 0) {
      // 查找指定的 Provider
      if (providerId === 'default') {
        oidcConfig = config.OIDCProviders.find(p => p.enabled);
      } else {
        oidcConfig = config.OIDCProviders.find(p => p.id === providerId);
      }
    } else if (config.OIDCAuthConfig) {
      // 向后兼容：使用旧的单 Provider 配置
      oidcConfig = config.OIDCAuthConfig;
    }

    // 检查OIDC配置
    if (!oidcConfig || !oidcConfig.tokenEndpoint || !oidcConfig.userInfoEndpoint || !oidcConfig.clientId || !oidcConfig.clientSecret) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('OIDC配置不完整'), origin)
      );
    }

    const redirectUri = `${origin}/api/auth/oidc/callback`;
    console.log('[OIDC Callback] Token exchange - redirectUri:', redirectUri);
    console.log('[OIDC Callback] Token exchange - providerId:', providerId);

    // 交换code获取token
    let tokenRequestBody: Record<string, string>;

    if (providerId === 'wechat') {
      // 微信使用 appid 和 secret，不是标准的 client_id/client_secret
      tokenRequestBody = {
        appid: oidcConfig.clientId,
        secret: oidcConfig.clientSecret,
        code: code,
        grant_type: 'authorization_code',
      };
    } else {
      // 标准 OAuth 2.0 参数
      tokenRequestBody = {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: oidcConfig.clientId,
        client_secret: oidcConfig.clientSecret,
      };
    }

    // GitHub 需要 Accept: application/json 头才能返回 JSON 格式
    const tokenHeaders: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (providerId === 'github') {
      tokenHeaders['Accept'] = 'application/json';
    }

    console.log('[OIDC Callback] Fetching token from:', oidcConfig.tokenEndpoint);
    const tokenResponse = await fetch(oidcConfig.tokenEndpoint, {
      method: 'POST',
      headers: tokenHeaders,
      body: new URLSearchParams(tokenRequestBody),
    });

    console.log('[OIDC Callback] Token response status:', tokenResponse.status);
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('获取token失败:', errorText);
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('获取token失败'), origin)
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const idToken = tokenData.id_token;
    const openid = tokenData.openid; // 微信返回的 openid

    // Facebook、微信和 GitHub 不一定返回 id_token（非标准OIDC）
    if (!accessToken || (!idToken && providerId !== 'facebook' && providerId !== 'wechat' && providerId !== 'github')) {
      return NextResponse.redirect(
        new URL('/login?error=' + encodeURIComponent('token无效'), origin)
      );
    }

    // 获取用户信息
    let userInfo: any;

    if (providerId === 'apple') {
      // Apple 的用户信息在 id_token 中，不需要调用 userinfo endpoint
      // 解析 JWT (id_token) 获取用户信息
      try {
        // JWT 格式：header.payload.signature
        // 我们只需要 payload 部分
        const tokenParts = idToken.split('.');
        if (tokenParts.length !== 3) {
          throw new Error('Invalid id_token format');
        }
        // Base64 解码 payload
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        userInfo = payload;
      } catch (error) {
        console.error('解析 Apple id_token 失败:', error);
        return NextResponse.redirect(
          new URL('/login?error=' + encodeURIComponent('Apple 用户信息解析失败'), origin)
        );
      }
    } else {
      // 其他 provider 需要调用 userinfo endpoint
      let userInfoUrl = oidcConfig.userInfoEndpoint;
      const userInfoHeaders: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
      };

      if (providerId === 'facebook') {
        // Facebook Graph API 需要指定 fields
        const url = new URL(userInfoUrl);
        url.searchParams.set('fields', 'id,name,email,picture.width(640).height(640)');
        userInfoUrl = url.toString();
      } else if (providerId === 'wechat') {
        // 微信需要 access_token 和 openid 参数
        const url = new URL(userInfoUrl);
        url.searchParams.set('access_token', accessToken);
        url.searchParams.set('openid', openid);
        userInfoUrl = url.toString();
      } else if (providerId === 'github') {
        // GitHub REST API 需要特殊的 headers
        userInfoHeaders['Accept'] = 'application/vnd.github+json';
        userInfoHeaders['X-GitHub-Api-Version'] = '2022-11-28';
      }

      const userInfoResponse = await fetch(userInfoUrl, {
        headers: userInfoHeaders,
      });

      if (!userInfoResponse.ok) {
        console.error('获取用户信息失败:', await userInfoResponse.text());
        return NextResponse.redirect(
          new URL('/login?error=' + encodeURIComponent('获取用户信息失败'), origin)
        );
      }

      userInfo = await userInfoResponse.json();
      console.log('[OIDC Callback] User info received:', { providerId, hasEmail: !!userInfo.email, hasName: !!userInfo.name, hasSub: !!userInfo.sub, hasId: !!userInfo.id });

      // GitHub 的 email 可能为 null（如果用户未公开），需要从 /user/emails 获取
      if (providerId === 'github' && !userInfo.email) {
        try {
          const emailResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });
          if (emailResponse.ok) {
            const emails = await emailResponse.json();
            // 使用 primary email 或第一个 verified email
            const primaryEmail = emails.find((e: any) => e.primary && e.verified);
            const verifiedEmail = emails.find((e: any) => e.verified);
            userInfo.email = primaryEmail?.email || verifiedEmail?.email || null;
            console.log('[OIDC Callback] GitHub email fetched:', { hasEmail: !!userInfo.email });
          }
        } catch (error) {
          console.error('获取 GitHub email 失败:', error);
        }
      }
    }
    // OIDC的唯一标识符：
    // - 标准OIDC使用 sub
    // - Facebook使用 id
    // - 微信使用 openid
    // - GitHub使用 id
    const oidcSub = userInfo.sub || userInfo.id || userInfo.openid;

    if (!oidcSub) {
      console.error('用户信息缺少唯一标识符:', userInfo);
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

      // 异步记录登入时间（不阻塞响应）
      const loginTime = Date.now();
      fetch(`${origin}/api/user/my-stats`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `user_auth=${cookieValue}`
        },
        body: JSON.stringify({ loginTime })
      }).catch(err => {
        console.error('OIDC登录记录登入时间失败:', err);
      });

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
      providerId: providerId, // 存储 provider ID 用于注册时验证
      timestamp: Date.now(),
    };
    console.log('[OIDC Callback] Creating oidc_session:', { sub: oidcSession.sub, hasEmail: !!oidcSession.email, hasName: !!oidcSession.name, providerId });

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
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    let origin: string;
    if (process.env.SITE_BASE) {
      origin = process.env.SITE_BASE;
    } else if (request.headers.get('x-forwarded-host')) {
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('x-forwarded-host');
      origin = `${proto}://${host}`;
    } else {
      origin = request.nextUrl.origin;
      origin = origin.replace('://0.0.0.0:', '://localhost:');
    }

    // 在开发环境显示详细错误信息
    const errorMessage = process.env.NODE_ENV === 'development' && error instanceof Error
      ? `服务器错误: ${error.message}`
      : '服务器错误';

    return NextResponse.redirect(
      new URL('/login?error=' + encodeURIComponent(errorMessage), origin)
    );
  }
}

// Apple Sign In uses response_mode=form_post, which sends a POST request
export async function POST(request: NextRequest) {
  try {
    console.log('[OIDC Callback POST] Request URL:', request.url);

    // Apple sends params in form data instead of query params
    const formData = await request.formData();
    const code = formData.get('code') as string | null;
    const state = formData.get('state') as string | null;
    const error = formData.get('error') as string | null;
    const userJson = formData.get('user') as string | null; // Apple may send user data

    console.log('[OIDC Callback POST] Form params - code:', !!code, 'state:', !!state, 'error:', error, 'user:', !!userJson);

    // Reconstruct URL with query params to reuse GET handler logic
    const url = new URL(request.url);
    if (code) url.searchParams.set('code', code);
    if (state) url.searchParams.set('state', state);
    if (error) url.searchParams.set('error', error);

    // Create a new request with query params
    const newRequest = new NextRequest(url, {
      headers: request.headers,
    });

    // Reuse GET handler logic
    return await GET(newRequest);
  } catch (error) {
    console.error('OIDC POST回调处理失败:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    let origin: string;
    if (process.env.SITE_BASE) {
      origin = process.env.SITE_BASE;
    } else if (request.headers.get('x-forwarded-host')) {
      const proto = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('x-forwarded-host');
      origin = `${proto}://${host}`;
    } else {
      origin = request.nextUrl.origin;
      origin = origin.replace('://0.0.0.0:', '://localhost:');
    }

    const errorMessage = process.env.NODE_ENV === 'development' && error instanceof Error
      ? `服务器错误: ${error.message}`
      : '服务器错误';

    return NextResponse.redirect(
      new URL('/login?error=' + encodeURIComponent(errorMessage), origin)
    );
  }
}
