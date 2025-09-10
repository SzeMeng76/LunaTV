import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

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

  const username = authInfo.username;

  try {
    const youtubeConfig = await request.json();
    
    // 验证配置数据
    if (typeof youtubeConfig.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid enabled value' }, { status: 400 });
    }

    // 如果启用YouTube，验证必需字段
    if (youtubeConfig.enabled && !youtubeConfig.enableDemo) {
      if (!youtubeConfig.apiKey || typeof youtubeConfig.apiKey !== 'string') {
        return NextResponse.json({ error: 'API密钥不能为空' }, { status: 400 });
      }
    }

    if (youtubeConfig.maxResults && (!Number.isInteger(youtubeConfig.maxResults) || youtubeConfig.maxResults < 1 || youtubeConfig.maxResults > 50)) {
      return NextResponse.json({ error: '最大结果数应在1-50之间' }, { status: 400 });
    }

    // 获取当前配置
    const adminConfig = await getConfig();
    
    // 权限校验
    if (username !== process.env.USERNAME) {
      // 管理员
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }
    
    // 更新YouTube配置
    adminConfig.YouTubeConfig = {
      enabled: youtubeConfig.enabled ?? false,
      apiKey: youtubeConfig.apiKey?.trim() || '',
      enableDemo: youtubeConfig.enableDemo ?? true,
      maxResults: youtubeConfig.maxResults ?? 25,
      enabledRegions: youtubeConfig.enabledRegions ?? ['US', 'CN', 'JP', 'KR', 'GB', 'DE', 'FR'],
      enabledCategories: youtubeConfig.enabledCategories ?? ['Film & Animation', 'Music', 'Gaming', 'News & Politics', 'Entertainment']
    };

    // 保存配置到数据库
    await db.saveAdminConfig(adminConfig);
    
    // 清除配置缓存，强制下次重新从数据库读取
    clearConfigCache();

    return NextResponse.json({ success: true }, {
      headers: {
        'Cache-Control': 'no-store', // 不缓存结果
      },
    });

  } catch (error) {
    console.error('Save YouTube config error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}