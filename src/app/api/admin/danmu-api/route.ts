import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET - 获取当前弹幕API配置
 */
export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '不支持本地存储进行管理员配置' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);

  // 检查用户权限（管理员或站长）
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminConfig = await getConfig();

    return NextResponse.json({
      success: true,
      data: {
        config: adminConfig.DanmuApiConfig || {
          enabled: true,
          useCustomApi: false,
          customApiUrl: '',
          customToken: '',
          timeout: 15,
        },
      },
    });
  } catch (error) {
    console.error('Get danmu API config error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST - 保存弹幕API配置
 */
export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      { error: '不支持本地存储进行管理员配置' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);

  // 检查用户权限（管理员或站长）
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 验证是否为管理员或站长
  const adminConfig = await getConfig();
  const userConfig = adminConfig.UserConfig?.Users?.find(
    (u) => u.username === authInfo.username
  );

  const isOwner = authInfo.username === process.env.USERNAME;
  const isAdmin = userConfig?.role === 'admin' || userConfig?.role === 'owner';

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }

  try {
    const danmuApiConfig = await request.json();

    // 验证配置数据
    if (typeof danmuApiConfig.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid enabled value' }, { status: 400 });
    }

    if (typeof danmuApiConfig.useCustomApi !== 'boolean') {
      return NextResponse.json({ error: 'Invalid useCustomApi value' }, { status: 400 });
    }

    // 如果使用自定义 API，验证 URL 格式
    if (danmuApiConfig.useCustomApi && danmuApiConfig.customApiUrl) {
      try {
        new URL(danmuApiConfig.customApiUrl);
      } catch {
        return NextResponse.json({ error: '无效的API地址格式' }, { status: 400 });
      }
    }

    // 验证超时时间
    const timeout = parseInt(danmuApiConfig.timeout) || 15;
    if (timeout < 5 || timeout > 60) {
      return NextResponse.json({ error: '超时时间必须在5-60秒之间' }, { status: 400 });
    }

    // 更新弹幕API配置
    adminConfig.DanmuApiConfig = {
      enabled: danmuApiConfig.enabled,
      useCustomApi: danmuApiConfig.useCustomApi,
      customApiUrl: (danmuApiConfig.customApiUrl || '').trim().replace(/\/$/, ''),
      customToken: (danmuApiConfig.customToken || '').trim(),
      timeout: timeout,
    };

    // 保存配置到数据库
    await db.saveAdminConfig(adminConfig);

    // 清除配置缓存
    clearConfigCache();

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Save danmu API config error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
