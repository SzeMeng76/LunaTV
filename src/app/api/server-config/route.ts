/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { CURRENT_VERSION } from '@/lib/version'

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const config = await getConfig();
  console.log('TelegramAuthConfig:', config.TelegramAuthConfig);

  const result: any = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    Version: CURRENT_VERSION,
  };

  // 添加 Telegram 登录配置（仅公开必要信息）
  if (config.TelegramAuthConfig?.enabled) {
    console.log('Telegram config is enabled, adding to result');
    result.TelegramAuthConfig = {
      enabled: true,
      botUsername: config.TelegramAuthConfig.botUsername,
      buttonSize: config.TelegramAuthConfig.buttonSize || 'large',
      showAvatar: config.TelegramAuthConfig.showAvatar ?? true,
      requestWriteAccess: config.TelegramAuthConfig.requestWriteAccess ?? false,
      // 注意：不返回 botToken，保护敏感信息
    };
  } else {
    console.log('Telegram config is NOT enabled or missing');
  }

  return NextResponse.json(result);
}
