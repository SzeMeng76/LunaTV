import { NextResponse } from 'next/server';
import crypto from 'crypto';

import {
  getTelegramToken,
  verifyAndConsumeTelegramToken,
} from '@/lib/telegram-tokens';
import { db } from '@/lib/db';
import { clearConfigCache, getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 生成随机密码
function generatePassword(length = 8): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length];
  }

  return password;
}

// 生成签名
async function generateSignature(
  data: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证Cookie（带签名）
async function generateAuthCookie(
  username: string,
  role: 'owner' | 'admin' | 'user' = 'user',
): Promise<string> {
  const authData: Record<string, any> = { role };

  if (username && process.env.PASSWORD) {
    authData.username = username;
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now();
    authData.loginTime = Date.now();
  }

  return encodeURIComponent(JSON.stringify(authData));
}

export async function GET(request: Request) {
  const requestId = Math.random().toString(36).substring(7);
  console.log(
    `[Verify ${requestId}] ==================== NEW REQUEST ====================`,
  );
  console.log(`[Verify ${requestId}] URL:`, request.url);
  console.log(
    `[Verify ${requestId}] User-Agent:`,
    request.headers.get('user-agent'),
  );
  console.log(`[Verify ${requestId}] Referer:`, request.headers.get('referer'));

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const confirm = searchParams.get('confirm'); // 新增：确认参数

    console.log(`[Verify ${requestId}] Token:`, token, 'Confirm:', confirm);

    if (!token) {
      console.log(`[Verify ${requestId}] No token provided`);
      return new NextResponse(
        `<html><body><h1>无效的登录链接</h1><p>缺少 token 参数</p></body></html>`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
      );
    }

    // 如果没有 confirm 参数，先验证 token 是否有效（但不删除），然后显示确认页面
    if (!confirm) {
      console.log(
        `[Verify ${requestId}] No confirm param, checking token validity first`,
      );
      const tokenData = await getTelegramToken(token);

      if (!tokenData) {
        console.log(`[Verify ${requestId}] Token not found or expired`);
        return new NextResponse(
          `<html><body><h1>登录链接无效</h1><p>链接可能已过期或已被使用</p></body></html>`,
          {
            status: 401,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          },
        );
      }

      console.log(
        `[Verify ${requestId}] Token valid, showing confirmation page`,
      );
      // 返回确认页面（防止 Telegram 链接预览消费 token）
      return new NextResponse(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>确认登录</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
      margin: 1rem;
    }
    h1 {
      color: #333;
      margin-bottom: 1rem;
      font-size: 1.5rem;
    }
    p {
      color: #666;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    .btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 1rem 2rem;
      font-size: 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }
    .btn:active {
      transform: translateY(0);
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔐</div>
    <h1>Telegram 登录确认</h1>
    <p>点击下方按钮完成登录到 ${tokenData.baseUrl || 'LunaTV'}</p>
    <a href="/api/telegram/verify?token=${token}&confirm=1" class="btn">
      确认登录
    </a>
  </div>
</body>
</html>`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
      );
    }

    // 有 confirm 参数，真正消费 token 并登录
    console.log(`[Verify ${requestId}] Confirm param present, consuming token`);
    const tokenData = await verifyAndConsumeTelegramToken(token);
    console.log(`[Verify ${requestId}] Token data retrieved:`, tokenData);

    if (!tokenData) {
      console.log(
        `[Verify ${requestId}] Token not found or expired - RETURNING ERROR PAGE`,
      );
      return new NextResponse(
        `<html><body><h1>登录链接无效</h1><p>链接可能已过期或已被使用</p></body></html>`,
        {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
      );
    }

    const { telegramUsername } = tokenData;

    console.log(
      `[Verify ${requestId}] Token valid, proceeding with login for:`,
      telegramUsername,
    );

    // 获取管理员配置
    const config = await db.getAdminConfig();
    const telegramConfig = config?.TelegramAuthConfig;

    if (!telegramConfig?.enabled) {
      return new NextResponse(
        `<html><body><h1>Telegram 登录未启用</h1></body></html>`,
        {
          status: 403,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
      );
    }

    // 构建用户名（格式：tg_username）
    const username = `tg_${telegramUsername}`;
    console.log(`[Verify ${requestId}] Constructed username:`, username);

    // 检查用户是否已存在
    let isNewUser = false;
    let initialPassword = '';
    console.log(`[Verify ${requestId}] Checking if user exists...`);
    const userExists = await db.checkUserExist(username);
    console.log(`[Verify ${requestId}] User exists:`, userExists);

    if (!userExists) {
      // 自动注册新用户
      if (telegramConfig.autoRegister) {
        console.log(
          `[Verify ${requestId}] Auto-register enabled, creating new user`,
        );
        initialPassword = generatePassword();
        console.log(
          `[Verify ${requestId}] Generated password:`,
          initialPassword,
        );

        console.log(`[Verify ${requestId}] Calling db.registerUser...`);
        await db.registerUser(username, initialPassword);
        console.log(`[Verify ${requestId}] User registered successfully`);

        // 验证用户是否真的被创建
        const verifyExists = await db.checkUserExist(username);
        console.log(
          `[Verify ${requestId}] Verification - user exists after registration:`,
          verifyExists,
        );

        // 清除配置缓存，强制下次getConfig()时重新从数据库读取最新用户列表
        console.log(
          `[Verify ${requestId}] Clearing config cache to force reload with new user`,
        );
        clearConfigCache();

        isNewUser = true;
      } else {
        return new NextResponse(
          `<html><body><h1>用户不存在</h1><p>请先注册或联系管理员</p></body></html>`,
          {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          },
        );
      }
    }

    // 准备认证数据
    console.log(
      `[Verify ${requestId}] Preparing auth data for user:`,
      username,
    );
    console.log(
      `[Verify ${requestId}] PASSWORD env:`,
      process.env.PASSWORD ? 'SET' : 'NOT SET',
    );

    // 生成认证数据对象（不手动编码，让 Next.js 自动处理）
    const authData: Record<string, any> = { role: 'user' };
    if (username && process.env.PASSWORD) {
      authData.username = username;
      const signature = await generateSignature(username, process.env.PASSWORD);
      authData.signature = signature;
      authData.timestamp = Date.now();
      authData.loginTime = Date.now();
    }
    const authDataString = JSON.stringify(authData);
    console.log(
      `[Verify ${requestId}] Auth data string length:`,
      authDataString.length,
    );

    const expires = new Date();
    expires.setDate(expires.getDate() + 7); // 7天过期

    // 获取当前域名和协议
    const url = new URL(request.url);
    const isSecure = url.protocol === 'https:';
    console.log(`[Verify ${requestId}] Domain:`, url.hostname);
    console.log(`[Verify ${requestId}] Protocol:`, url.protocol);
    console.log(`[Verify ${requestId}] Cookie expires:`, expires.toUTCString());

    // 记录登入时间 - 直接调用 db 而不是通过 API
    try {
      console.log(
        `[Verify ${requestId}] Recording login time for user:`,
        username,
      );
      await db.updateUserLoginStats(username, Date.now(), isNewUser);
      console.log(`[Verify ${requestId}] Login time recorded successfully`);
    } catch (error) {
      console.log(`[Verify ${requestId}] 记录登入时间失败:`, error);
      // 不影响登录流程
    }

    console.log(`[Verify ${requestId}] ========== FINAL STATUS ==========`);
    console.log(`[Verify ${requestId}] Username:`, username);
    console.log(`[Verify ${requestId}] Is new user:`, isNewUser);
    console.log(
      `[Verify ${requestId}] Initial password:`,
      isNewUser ? initialPassword : 'N/A',
    );
    console.log(`[Verify ${requestId}] Cookie expires:`, expires.toISOString());
    console.log(`[Verify ${requestId}] Auth data:`, authDataString);
    console.log(`[Verify ${requestId}] ===================================`);

    // Create HTML response that sets cookies and redirects
    // This ensures cookies are set before navigation happens
    const newUserData =
      isNewUser && initialPassword
        ? JSON.stringify({ username, password: initialPassword })
        : '';
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>登录成功</title>
</head>
<body>
  <script>
    // 立即跳转到首页
    window.location.replace('/');
  </script>
</body>
</html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

    // Set auth cookie - 直接使用 JSON 字符串，Next.js 会自动 URL 编码
    console.log(
      `[Verify ${requestId}] Setting auth cookie via response.cookies.set()...`,
    );
    console.log(`[Verify ${requestId}] Auth data string:`, authDataString);
    console.log(`[Verify ${requestId}] Cookie settings:`, {
      path: '/',
      expires: expires.toISOString(),
      sameSite: 'lax',
      secure: isSecure,
      httpOnly: false,
    });

    response.cookies.set('user_auth', authDataString, {
      path: '/',
      expires: expires,
      sameSite: 'lax',
      secure: isSecure,
      httpOnly: false,
    });

    console.log(`[Verify ${requestId}] Auth cookie set, verifying...`);
    console.log(
      `[Verify ${requestId}] Response cookies:`,
      response.cookies.getAll(),
    );

    // Set new user cookie if needed
    if (isNewUser && initialPassword) {
      const newUserExpires = new Date();
      newUserExpires.setSeconds(newUserExpires.getSeconds() + 60);
      console.log(
        `[Verify ${requestId}] Setting new user cookie via response.cookies.set()...`,
      );
      response.cookies.set('telegram_new_user', newUserData, {
        path: '/',
        expires: newUserExpires,
        sameSite: 'lax',
        secure: isSecure,
        httpOnly: false,
      });
    }

    console.log(`[Verify ${requestId}] SUCCESS - Returning HTML with cookies`);

    // 异步记录登录日志
    const tgXff = request.headers.get('x-forwarded-for');
    const tgRealIp = request.headers.get('x-real-ip');
    const tgClientIp = tgXff
      ? tgXff.split(',')[0].trim()
      : tgRealIp
        ? tgRealIp.trim()
        : 'unknown';
    const tgLoginLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username: username,
      loginTime: Date.now(),
      ip: tgClientIp,
      location: '',
      userAgent: request.headers.get('user-agent') || '',
      loginMethod: 'telegram',
    };
    db.addLoginLog(tgLoginLog).catch((err) => {
      console.error('Telegram登录记录日志失败:', err);
    });

    return response;
  } catch (error) {
    console.error(`[Verify ${requestId}] ERROR:`, error);
    return new NextResponse(
      `<html><body><h1>登录失败</h1><p>服务器错误，请稍后重试</p></body></html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }
}
