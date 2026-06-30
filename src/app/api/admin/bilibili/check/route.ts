import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);

  if (!authInfo || (authInfo.role !== 'admin' && authInfo.role !== 'owner')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getConfig();

    if (!config.BilibiliConfig?.sessdata) {
      return NextResponse.json({
        success: false,
        error: '未登录',
      });
    }

    // 检查登录状态
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: {
        'Cookie': `SESSDATA=${config.BilibiliConfig.sessdata}; bili_jct=${config.BilibiliConfig.bili_jct}; buvid3=${config.BilibiliConfig.buvid3}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const data = await response.json();

    if (data.code === 0) {
      // 登录有效，更新用户信息
      config.BilibiliConfig.loginStatus = 'logged_in';
      config.BilibiliConfig.userInfo = {
        mid: data.data.mid,
        username: data.data.uname,
        face: data.data.face,
        isVip: data.data.vipStatus === 1,
        vipType: data.data.vipType,
        vipExpireDate: data.data.vipDueDate || 0,
      };

      await db.saveAdminConfig(config);

      return NextResponse.json({
        success: true,
        valid: true,
        userInfo: config.BilibiliConfig.userInfo,
      });
    } else {
      // 登录已失效
      config.BilibiliConfig.loginStatus = 'expired';
      await db.saveAdminConfig(config);

      return NextResponse.json({
        success: true,
        valid: false,
        message: 'Cookie 已过期',
      });
    }
  } catch (error) {
    console.error('检查B站登录状态失败:', error);
    return NextResponse.json(
      { error: '检查失败' },
      { status: 500 }
    );
  }
}
