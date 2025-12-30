/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[Middleware ${requestId}] Path:`, pathname);

  // 检测User-Agent并设置CSS版本cookie（用于双CSS Bundle策略）
  const userAgent = request.headers.get('user-agent') || '';
  const isOldIOS = detectOldIOSBrowser(userAgent);
  const cssVersion = isOldIOS ? 'legacy' : 'modern';

  console.log(`[Middleware ${requestId}] CSS Version:`, cssVersion, isOldIOS ? '(Old iOS detected)' : '');

  // 处理 /adult/ 路径前缀，重写为实际 API 路径
  if (pathname.startsWith('/adult/')) {
    console.log(`[Middleware ${requestId}] Adult path detected, rewriting...`);

    // 移除 /adult 前缀
    const newPathname = pathname.replace(/^\/adult/, '');

    // 创建新的 URL
    const url = request.nextUrl.clone();
    url.pathname = newPathname || '/';

    // 添加 adult=1 参数（如果还没有）
    if (!url.searchParams.has('adult')) {
      url.searchParams.set('adult', '1');
    }

    console.log(`[Middleware ${requestId}] Rewritten path: ${url.pathname}${url.search}`);

    // 重写请求
    const response = NextResponse.rewrite(url);

    // 设置响应头标识成人内容模式
    response.headers.set('X-Content-Mode', 'adult');

    // 继续执行认证检查（对于 API 路径）
    if (newPathname.startsWith('/api')) {
      // 将重写后的请求传递给认证逻辑
      const modifiedRequest = new NextRequest(url, request);
      return handleAuthentication(modifiedRequest, newPathname, requestId, response, cssVersion);
    }

    setCSSVersionCookie(response, cssVersion);
    return response;
  }

  // 跳过不需要认证的路径
  if (shouldSkipAuth(pathname)) {
    console.log(`[Middleware ${requestId}] Skipping auth for path:`, pathname);
    const response = NextResponse.next();
    setCSSVersionCookie(response, cssVersion);
    return response;
  }

  return handleAuthentication(request, pathname, requestId, undefined, cssVersion);
}

// 提取认证处理逻辑为单独的函数
async function handleAuthentication(
  request: NextRequest,
  pathname: string,
  requestId: string,
  response?: NextResponse,
  cssVersion?: string
) {

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  console.log(`[Middleware ${requestId}] Storage type:`, storageType);

  if (!process.env.PASSWORD) {
    console.log(`[Middleware ${requestId}] PASSWORD env not set, redirecting to warning`);
    // 如果没有设置密码，重定向到警告页面
    const warningUrl = new URL('/warning', request.url);
    return NextResponse.redirect(warningUrl);
  }

  // 从cookie获取认证信息
  console.log(`[Middleware ${requestId}] All cookies:`, request.cookies.getAll());
  console.log(`[Middleware ${requestId}] Cookie header:`, request.headers.get('cookie'));

  const authInfo = getAuthInfoFromCookie(request);
  console.log(`[Middleware ${requestId}] Auth info from cookie:`, authInfo ? {
    username: authInfo.username,
    hasSignature: !!authInfo.signature,
    hasPassword: !!authInfo.password,
    timestamp: authInfo.timestamp
  } : null);

  if (!authInfo) {
    console.log(`[Middleware ${requestId}] No auth info, failing auth`);
    const failResponse = handleAuthFailure(request, pathname);
    if (cssVersion) setCSSVersionCookie(failResponse, cssVersion);
    return failResponse;
  }

  // localstorage模式：在middleware中完成验证
  if (storageType === 'localstorage') {
    if (!authInfo.password || authInfo.password !== process.env.PASSWORD) {
      const failResponse = handleAuthFailure(request, pathname);
      if (cssVersion) setCSSVersionCookie(failResponse, cssVersion);
      return failResponse;
    }
    const nextResponse = response || NextResponse.next();
    if (cssVersion) setCSSVersionCookie(nextResponse, cssVersion);
    return nextResponse;
  }

  // 其他模式：只验证签名
  // 检查是否有用户名（非localStorage模式下密码不存储在cookie中）
  if (!authInfo.username || !authInfo.signature) {
    console.log(`[Middleware ${requestId}] Missing username or signature:`, {
      hasUsername: !!authInfo.username,
      hasSignature: !!authInfo.signature
    });
    const failResponse = handleAuthFailure(request, pathname);
    if (cssVersion) setCSSVersionCookie(failResponse, cssVersion);
    return failResponse;
  }

  // 验证签名（如果存在）
  if (authInfo.signature) {
    console.log(`[Middleware ${requestId}] Verifying signature for user:`, authInfo.username);
    const isValidSignature = await verifySignature(
      authInfo.username,
      authInfo.signature,
      process.env.PASSWORD || ''
    );

    console.log(`[Middleware ${requestId}] Signature valid:`, isValidSignature);

    // 签名验证通过即可
    if (isValidSignature) {
      console.log(`[Middleware ${requestId}] Auth successful, allowing access`);
      const nextResponse = response || NextResponse.next();
      if (cssVersion) setCSSVersionCookie(nextResponse, cssVersion);
      return nextResponse;
    }
  }

  // 签名验证失败或不存在签名
  console.log(`[Middleware ${requestId}] Signature verification failed, denying access`);
  const failResponse = handleAuthFailure(request, pathname);
  if (cssVersion) setCSSVersionCookie(failResponse, cssVersion);
  return failResponse;
}

// 验证签名
async function verifySignature(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  try {
    // 导入密钥
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // 将十六进制字符串转换为Uint8Array
    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    // 验证签名
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      messageData
    );
  } catch (error) {
    console.error('签名验证失败:', error);
    return false;
  }
}

// 处理认证失败的情况
function handleAuthFailure(
  request: NextRequest,
  pathname: string
): NextResponse {
  // 如果是 API 路由，返回 401 状态码
  if (pathname.startsWith('/api')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 否则重定向到登录页面
  const loginUrl = new URL('/login', request.url);
  // 保留完整的URL，包括查询参数
  const fullUrl = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', fullUrl);
  return NextResponse.redirect(loginUrl);
}

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  const skipPaths = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
    '/api/telegram/', // Telegram API 端点
  ];

  return skipPaths.some((path) => pathname.startsWith(path));
}

// 检测旧版iOS浏览器（iOS < 16.4）
function detectOldIOSBrowser(userAgent: string): boolean {
  // 匹配 iOS 版本号
  // 例如: "iPhone OS 15_7 like Mac OS X" 或 "iPhone OS 16_3_1 like Mac OS X"
  const iosVersionMatch = userAgent.match(/iPhone OS (\d+)_(\d+)/);

  if (iosVersionMatch) {
    const majorVersion = parseInt(iosVersionMatch[1], 10);
    const minorVersion = parseInt(iosVersionMatch[2], 10);

    // iOS 16.4 以下的版本需要使用legacy CSS
    if (majorVersion < 16) {
      return true;
    }
    if (majorVersion === 16 && minorVersion < 4) {
      return true;
    }
  }

  // 同样检测 iPad
  const ipadVersionMatch = userAgent.match(/CPU OS (\d+)_(\d+)/);
  if (ipadVersionMatch) {
    const majorVersion = parseInt(ipadVersionMatch[1], 10);
    const minorVersion = parseInt(ipadVersionMatch[2], 10);

    if (majorVersion < 16) {
      return true;
    }
    if (majorVersion === 16 && minorVersion < 4) {
      return true;
    }
  }

  return false;
}

// 设置CSS版本cookie
function setCSSVersionCookie(response: NextResponse, cssVersion: string): void {
  response.cookies.set('css-version', cssVersion, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30天
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

// 配置middleware匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|register|oidc-register|warning|api/login|api/register|api/logout|api/cron|api/server-config|api/tvbox|api/live/merged|api/parse|api/bing-wallpaper|api/proxy/|api/telegram/|api/auth/oidc/|api/watch-room/).*)',
  ],
};
