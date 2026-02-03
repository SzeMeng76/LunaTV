/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { clearConfigCache, getConfig } from '@/lib/config';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);

  // 检查用户权限
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { primaryApiUrl, alternativeApiUrl, enableAlternative } = body;

    // 验证必填字段
    if (!primaryApiUrl) {
      return NextResponse.json(
        { error: '主API地址不能为空' },
        { status: 400 }
      );
    }

    if (enableAlternative && !alternativeApiUrl) {
      return NextResponse.json(
        { error: '启用备用API时必须提供备用API地址' },
        { status: 400 }
      );
    }

    // 获取当前配置
    const config = await getConfig();

    // 更新短剧配置
    config.ShortDramaConfig = {
      primaryApiUrl: primaryApiUrl.trim(),
      alternativeApiUrl: alternativeApiUrl.trim(),
      enableAlternative: !!enableAlternative,
    };

    // 保存到数据库
    await db.saveAdminConfig(config);

    // 清除配置缓存
    clearConfigCache();

    return NextResponse.json({
      success: true,
      message: '短剧API配置已更新',
    });
  } catch (error) {
    console.error('保存短剧配置失败:', error);
    return NextResponse.json(
      { error: '保存失败，请重试' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);

  // 检查用户权限
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getConfig();

    return NextResponse.json({
      success: true,
      config: config.ShortDramaConfig || {
        primaryApiUrl: 'https://wwzy.tv/api.php/provide/vod',
        alternativeApiUrl: '',
        enableAlternative: false,
      },
    });
  } catch (error) {
    console.error('获取短剧配置失败:', error);
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    );
  }
}
