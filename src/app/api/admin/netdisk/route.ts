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
    const netDiskConfig = await request.json();
    
    // 验证配置数据
    if (typeof netDiskConfig.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid enabled value' }, { status: 400 });
    }

    if (!netDiskConfig.pansouUrl || typeof netDiskConfig.pansouUrl !== 'string') {
      return NextResponse.json({ error: 'Invalid pansouUrl value' }, { status: 400 });
    }

    if (!Number.isInteger(netDiskConfig.timeout) || netDiskConfig.timeout < 10 || netDiskConfig.timeout > 120) {
      return NextResponse.json({ error: 'Invalid timeout value' }, { status: 400 });
    }

    if (!Array.isArray(netDiskConfig.enabledCloudTypes)) {
      return NextResponse.json({ error: 'Invalid enabledCloudTypes value' }, { status: 400 });
    }

    // 验证网盘类型
    const validCloudTypes = ['baidu', 'aliyun', 'quark', 'guangya', 'tianyi', 'uc', 'mobile', '115', 'pikpak', 'xunlei', '123', 'magnet', 'ed2k'];
    for (const type of netDiskConfig.enabledCloudTypes) {
      if (!validCloudTypes.includes(type)) {
        return NextResponse.json({ error: `Invalid cloud type: ${type}` }, { status: 400 });
      }
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
    
    // 更新网盘配置
    adminConfig.NetDiskConfig = {
      enabled: netDiskConfig.enabled,
      pansouUrl: netDiskConfig.pansouUrl.trim(),
      timeout: netDiskConfig.timeout,
      enabledCloudTypes: netDiskConfig.enabledCloudTypes
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
    console.error('Save netdisk config error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}