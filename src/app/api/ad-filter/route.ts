import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * 获取自定义去广告代码
 * GET /api/ad-filter
 */
export async function GET() {
  try {
    const config = await getConfig();
    const customAdFilterCode = config.SiteConfig?.CustomAdFilterCode || '';
    const customAdFilterVersion = config.SiteConfig?.CustomAdFilterVersion || 1;

    return NextResponse.json({
      code: customAdFilterCode,
      version: customAdFilterVersion,
    });
  } catch (error) {
    console.error('获取自定义去广告代码失败:', error);
    return NextResponse.json(
      { error: '获取失败', code: '', version: 1 },
      { status: 500 }
    );
  }
}
