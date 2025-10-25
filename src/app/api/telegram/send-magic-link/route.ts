import { NextResponse } from 'next/server';
import crypto from 'crypto';

import { db } from '@/lib/db';
import { setTelegramToken } from '@/lib/telegram-tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { telegramUsername } = await request.json();
    console.log('[Magic Link] Received request for username:', telegramUsername);

    if (!telegramUsername || typeof telegramUsername !== 'string') {
      console.log('[Magic Link] Invalid username');
      return NextResponse.json(
        { error: '请提供有效的 Telegram 用户名' },
        { status: 400 }
      );
    }

    // 获取管理员配置
    const config = await db.getAdminConfig();
    const telegramConfig = config?.TelegramAuthConfig;
    console.log('[Magic Link] Config loaded, enabled:', telegramConfig?.enabled);

    if (!telegramConfig?.enabled) {
      console.log('[Magic Link] Telegram login not enabled');
      return NextResponse.json(
        { error: 'Telegram 登录未启用' },
        { status: 403 }
      );
    }

    if (!telegramConfig.botToken) {
      console.log('[Magic Link] Bot token not configured');
      return NextResponse.json(
        { error: 'Bot Token 未配置' },
        { status: 500 }
      );
    }

    // 生成随机 token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 分钟过期

    // 获取当前请求的域名
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
    const baseUrl = `${protocol}://${host}`;

    // 存储 token 到数据库
    const tokenData = {
      telegramUsername: telegramUsername.toLowerCase(),
      expiresAt,
      baseUrl, // 保存请求的域名
    };

    console.log('[Magic Link] Storing token:', token, 'Data:', tokenData);
    await setTelegramToken(token, tokenData);
    console.log('[Magic Link] Token saved successfully');

    // 自动设置 webhook 到当前域名（如果还未设置）
    try {
      const webhookUrl = `${baseUrl}/api/telegram/webhook`;
      const infoResponse = await fetch(
        `https://api.telegram.org/bot${telegramConfig.botToken}/getWebhookInfo`
      );
      const info = await infoResponse.json();

      if (info.ok && info.result.url !== webhookUrl) {
        console.log('[Magic Link] Auto-setting webhook to:', webhookUrl);
        await fetch(
          `https://api.telegram.org/bot${telegramConfig.botToken}/setWebhook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: webhookUrl,
              allowed_updates: ['message'],
            }),
          }
        );
        console.log('[Magic Link] Webhook set successfully');
      }
    } catch (error) {
      console.error('[Magic Link] Failed to set webhook:', error);
      // 不阻止流程继续
    }

    // 生成 Telegram 深度链接
    const botUsername = telegramConfig.botUsername;
    const deepLink = `https://t.me/${botUsername}?start=${token}`;

    console.log('[Magic Link] Deep link generated:', deepLink);

    // 返回深度链接给前端
    return NextResponse.json({
      success: true,
      deepLink: deepLink,
      botUsername: botUsername,
    });
  } catch (error) {
    console.error('Magic link send error:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}
