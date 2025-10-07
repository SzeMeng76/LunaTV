/**
 * 网络环境检测工具
 * 用于智能判断用户所在地区和网络环境
 */

import { NextRequest } from 'next/server';

export interface NetworkEnvironment {
  isDomestic: boolean; // 是否国内网络
  region: string; // 地区代码或描述
  userAgent: string;
  acceptLanguage: string;
  detectionMethod: string; // 检测方法
}

/**
 * 检测用户网络环境
 * @param req Next.js 请求对象
 * @returns 网络环境信息
 */
export function detectNetworkEnvironment(req: NextRequest): NetworkEnvironment {
  const headers = req.headers;
  const userAgent = headers.get('user-agent') || '';
  const acceptLanguage = headers.get('accept-language') || '';
  const cfCountry = headers.get('cf-ipcountry') || ''; // Cloudflare 提供的国家代码
  const xForwardedFor = headers.get('x-forwarded-for') || '';
  const xRealIp = headers.get('x-real-ip') || '';

  let isDomestic = false;
  let region = 'international';
  let detectionMethod = 'unknown';

  // 优先级1: Cloudflare 国家代码（最准确）
  if (cfCountry) {
    if (cfCountry === 'CN' || cfCountry === 'HK' || cfCountry === 'TW' || cfCountry === 'MO') {
      isDomestic = true;
      region = cfCountry;
      detectionMethod = 'cloudflare-country';
      return { isDomestic, region, userAgent, acceptLanguage, detectionMethod };
    } else {
      isDomestic = false;
      region = cfCountry;
      detectionMethod = 'cloudflare-country';
      return { isDomestic, region, userAgent, acceptLanguage, detectionMethod };
    }
  }

  // 优先级2: Accept-Language 语言偏好
  if (acceptLanguage.includes('zh-CN') || acceptLanguage.includes('zh-Hans')) {
    isDomestic = true;
    region = 'cn-language';
    detectionMethod = 'accept-language';
    return { isDomestic, region, userAgent, acceptLanguage, detectionMethod };
  }

  if (acceptLanguage.includes('zh-TW') || acceptLanguage.includes('zh-Hant')) {
    isDomestic = true;
    region = 'tw-language';
    detectionMethod = 'accept-language';
    return { isDomestic, region, userAgent, acceptLanguage, detectionMethod };
  }

  if (acceptLanguage.includes('zh-HK')) {
    isDomestic = true;
    region = 'hk-language';
    detectionMethod = 'accept-language';
    return { isDomestic, region, userAgent, acceptLanguage, detectionMethod };
  }

  // 优先级3: IP 地址段判断（国内常见IP段）
  const ip = xRealIp || xForwardedFor.split(',')[0].trim();
  if (ip) {
    // 中国大陆主要IP段
    const domesticIpPrefixes = [
      '1.', '14.', '27.', '36.', '39.', '42.', '49.', '58.', '59.', '60.', '61.',
      '101.', '103.', '106.', '110.', '111.', '112.', '113.', '114.', '115.', '116.',
      '117.', '118.', '119.', '120.', '121.', '122.', '123.', '124.', '125.',
      '171.', '175.', '180.', '182.', '183.', '202.', '203.', '210.', '211.',
      '218.', '219.', '220.', '221.', '222.', '223.',
    ];

    if (domesticIpPrefixes.some(prefix => ip.startsWith(prefix))) {
      isDomestic = true;
      region = 'cn-ip';
      detectionMethod = 'ip-address';
      return { isDomestic, region, userAgent, acceptLanguage, detectionMethod };
    }
  }

  // 优先级4: User-Agent 检测（国内特定浏览器）
  const domesticBrowsers = [
    '360Browser', 'QQBrowser', 'UCBrowser', 'LBBROWSER', 'SogouMobileBrowser',
    'baiduboxapp', 'BaiduHD', 'MicroMessenger', 'QQ/', 'Quark',
  ];

  if (domesticBrowsers.some(browser => userAgent.includes(browser))) {
    isDomestic = true;
    region = 'cn-browser';
    detectionMethod = 'user-agent';
    return { isDomestic, region, userAgent, acceptLanguage, detectionMethod };
  }

  // 默认：国际环境
  return {
    isDomestic: false,
    region: 'international',
    userAgent,
    acceptLanguage,
    detectionMethod: 'default',
  };
}

/**
 * 简化版：只返回是否国内
 */
export function isDomesticNetwork(req: NextRequest): boolean {
  return detectNetworkEnvironment(req).isDomestic;
}

/**
 * 获取用户地区代码
 */
export function getUserRegion(req: NextRequest): 'domestic' | 'international' {
  return detectNetworkEnvironment(req).isDomestic ? 'domestic' : 'international';
}
