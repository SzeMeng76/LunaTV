import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);

  if (!authInfo || (authInfo.role !== 'admin' && authInfo.role !== 'owner')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 获取二维码登录密钥
    const response = await fetch('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
      },
    });

    const data = await response.json();

    if (data.code === 0) {
      return NextResponse.json({
        success: true,
        qrcodeUrl: data.data.url,
        qrcodeKey: data.data.qrcode_key,
      });
    } else {
      return NextResponse.json(
        { error: '获取二维码失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('获取B站二维码失败:', error);
    return NextResponse.json(
      { error: '获取二维码失败' },
      { status: 500 }
    );
  }
}
