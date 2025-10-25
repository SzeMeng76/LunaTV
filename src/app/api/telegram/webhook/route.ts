import { NextResponse } from 'next/server';

import { getTelegramToken, deleteTelegramToken } from '@/lib/telegram-tokens';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Telegram Webhook 端点
export async function POST(request: Request) {
  try {
    const update = await request.json();
    console.log('[Webhook] Received update:', JSON.stringify(update, null, 2));

    // 获取管理员配置
    const config = await db.getAdminConfig();
    const telegramConfig = config?.TelegramAuthConfig;

    if (!telegramConfig?.enabled || !telegramConfig.botToken) {
      console.log('[Webhook] Telegram not configured');
      return NextResponse.json({ ok: true });
    }

    // 自动设置 webhook 到当前域名（如果不匹配）
    await autoSetWebhook(request, telegramConfig.botToken);

    // 处理 /start 命令
    if (update.message?.text?.startsWith('/start ')) {
      const chatId = update.message.chat.id;
      const token = update.message.text.split(' ')[1]; // 获取 token

      console.log('[Webhook] Received /start with token:', token);
      console.log('[Webhook] Chat ID:', chatId);

      // 从数据库验证 token
      console.log('[Webhook] Attempting to retrieve token from database...');
      const tokenData = await getTelegramToken(token);
      console.log('[Webhook] Token data retrieved:', tokenData);

      if (!tokenData) {
        console.log('[Webhook] Token not found or expired');
        // 发送错误消息
        await sendTelegramMessage(
          telegramConfig.botToken,
          chatId,
          '❌ 登录链接已过期或无效，请返回网站重新操作。'
        );
        return NextResponse.json({ ok: true });
      }

      // 生成登录链接 - 使用保存的域名（token 创建时保存的）
      const loginUrl = `${tokenData.baseUrl}/api/telegram/verify?token=${token}`;

      // 发送登录链接
      const message = `🔐 *登录到 ${config?.SiteConfig?.SiteName || 'LunaTV'}*\n\n点击下方链接完成登录：\n\n${loginUrl}\n\n⏰ 此链接将在 5 分钟后过期`;

      await sendTelegramMessage(
        telegramConfig.botToken,
        chatId,
        message
      );

      console.log('[Webhook] Login link sent successfully');
      return NextResponse.json({ ok: true });
    }

    // 其他消息类型
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json({ ok: true }); // 总是返回 ok 给 Telegram
  }
}

// 自动设置 webhook 到当前域名
async function autoSetWebhook(request: Request, botToken: string): Promise<void> {
  try {
    // 获取当前访问的域名
    const host = request.headers.get('host');
    if (!host) return;

    const protocol = request.headers.get('x-forwarded-proto') ||
                     (host.includes('localhost') ? 'http' : 'https');
    const currentWebhookUrl = `${protocol}://${host}/api/telegram/webhook`;

    // 检查当前 Telegram webhook 配置
    const infoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    );
    const info = await infoResponse.json();

    // 如果 webhook URL 不匹配，自动更新
    if (info.ok && info.result.url !== currentWebhookUrl) {
      console.log('[Webhook] Auto-updating webhook from', info.result.url, 'to', currentWebhookUrl);

      await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: currentWebhookUrl,
            allowed_updates: ['message'],
          }),
        }
      );

      console.log('[Webhook] Webhook auto-updated successfully');
    }
  } catch (error) {
    console.error('[Webhook] Auto-set webhook error:', error);
    // 不抛出错误，避免影响正常消息处理
  }
}

// 发送 Telegram 消息
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string
): Promise<void> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown',
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[Webhook] Failed to send message:', error);
    }
  } catch (error) {
    console.error('[Webhook] Error sending message:', error);
  }
}
