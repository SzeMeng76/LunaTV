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
    const body = await request.json();
    const { qrcodeKey } = body;

    if (!qrcodeKey) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }

    // 轮询二维码登录状态
    const response = await fetch(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcodeKey}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
      },
    });

    const data = await response.json();

    if (data.code === 0) {
      const pollData = data.data;

      // 86101: 未扫码
      // 86090: 已扫码未确认
      // 86038: 二维码已失效
      // 0: 登录成功
      if (pollData.code === 0) {
        // 登录成功，从响应头提取 cookies
        const setCookieHeaders = response.headers.getSetCookie();
        const cookies: Record<string, { value: string; expires?: number }> = {};

        // 解析 set-cookie 头
        setCookieHeaders.forEach((cookieStr) => {
          const parts = cookieStr.split(';');
          const [nameValue] = parts;
          const [name, value] = nameValue.split('=');

          // 提取过期时间
          let expires: number | undefined;
          const expiresMatch = cookieStr.match(/Expires=([^;]+)/i);
          if (expiresMatch) {
            expires = new Date(expiresMatch[1]).getTime();
          }

          cookies[name.trim()] = { value: value.trim(), expires };
        });

        // 保存登录信息到配置
        const config = await getConfig();
        const loginTime = Date.now();
        const expireTime = cookies.SESSDATA?.expires || (loginTime + 180 * 24 * 60 * 60 * 1000); // 默认180天

        config.BilibiliConfig = {
          ...config.BilibiliConfig,
          enabled: config.BilibiliConfig?.enabled || false,
          sessdata: cookies.SESSDATA?.value || '',
          bili_jct: cookies.bili_jct?.value || '',
          buvid3: cookies.buvid3?.value || '',
          dedeuserid: cookies.DedeUserID?.value || '',
          loginStatus: 'logged_in',
          loginTime,
          expireTime,
        };

        // 获取用户信息
        try {
          const userInfoResponse = await fetch('https://api.bilibili.com/x/web-interface/nav', {
            headers: {
              'Cookie': `SESSDATA=${config.BilibiliConfig.sessdata}; bili_jct=${config.BilibiliConfig.bili_jct}; buvid3=${config.BilibiliConfig.buvid3}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
          });
          const userInfo = await userInfoResponse.json();

          if (userInfo.code === 0) {
            config.BilibiliConfig.userInfo = {
              mid: userInfo.data.mid,
              username: userInfo.data.uname,
              face: userInfo.data.face,
              isVip: userInfo.data.vipStatus === 1,
              vipType: userInfo.data.vipType,
              vipExpireDate: userInfo.data.vipDueDate || 0,
            };
          }
        } catch (error) {
          console.error('获取B站用户信息失败:', error);
        }

        await db.saveAdminConfig(config);

        return NextResponse.json({
          success: true,
          status: 'success',
          message: '登录成功',
        });
      } else if (pollData.code === 86101) {
        return NextResponse.json({
          success: true,
          status: 'waiting',
          message: '等待扫码',
        });
      } else if (pollData.code === 86090) {
        return NextResponse.json({
          success: true,
          status: 'scanned',
          message: '已扫码，等待确认',
        });
      } else if (pollData.code === 86038) {
        return NextResponse.json({
          success: true,
          status: 'expired',
          message: '二维码已失效',
        });
      } else {
        return NextResponse.json({
          success: true,
          status: 'error',
          message: pollData.message || '未知错误',
        });
      }
    } else {
      return NextResponse.json(
        { error: '轮询登录状态失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('轮询B站登录状态失败:', error);
    return NextResponse.json(
      { error: '轮询失败' },
      { status: 500 }
    );
  }
}
