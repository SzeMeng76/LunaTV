/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { CURRENT_VERSION } from '@/lib/version'

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const config = await getConfig();
  console.log('TelegramAuthConfig:', config.TelegramAuthConfig);

  // 检查是否是内部请求（middleware 获取信任网络配置）
  const isInternalRequest = request.headers.get('x-internal-request') === 'true';
  const requestedKey = new URL(request.url).searchParams.get('key');

  // 内部请求：只返回特定配置
  if (isInternalRequest && requestedKey === 'TrustedNetworkConfig') {
    return NextResponse.json({
      TrustedNetworkConfig: config.TrustedNetworkConfig || null,
    });
  }

  const result: any = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    Version: CURRENT_VERSION,
    DownloadEnabled: config.DownloadConfig?.enabled ?? true,
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

  // 添加 OIDC 登录配置（仅公开必要信息）
  // 优先使用新的多 Provider 配置
  if (config.OIDCProviders && config.OIDCProviders.length > 0) {
    // 只返回启用的 Provider 的公开信息
    const enabledProviders = config.OIDCProviders
      .filter(p => p.enabled)
      .map(p => ({
        id: p.id,
        name: p.name,
        buttonText: p.buttonText,
        issuer: p.issuer, // 用于provider检测（公开信息，不敏感）
        // 注意：不返回 ClientSecret、Endpoints 等敏感信息
      }));

    if (enabledProviders.length > 0) {
      result.OIDCProviders = enabledProviders;
    }
  } else if (config.OIDCAuthConfig?.enabled) {
    // 向后兼容：旧的单 Provider 配置
    result.OIDCConfig = {
      enabled: true,
      buttonText: config.OIDCAuthConfig.buttonText || '使用OIDC登录',
      issuer: config.OIDCAuthConfig.issuer, // 用于provider检测（公开信息，不敏感）
      // 注意：不返回 ClientSecret、Endpoints 等敏感信息
    };
  }

  return NextResponse.json(result);
}
