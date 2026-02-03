import ipaddr from 'ipaddr.js';
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET - 获取当前信任网络配置
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

  // 检查用户权限（只有站长可以查看）
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (authInfo.username !== process.env.USERNAME) {
    return NextResponse.json({ error: '权限不足' }, { status: 403 });
  }

  try {
    const adminConfig = await getConfig();

    return NextResponse.json({
      success: true,
      data: {
        config: adminConfig.TrustedNetworkConfig || {
          enabled: false,
          trustedIPs: [],
        },
        // 返回环境变量配置状态（只读）
        envConfig: {
          hasEnvConfig: !!process.env.TRUSTED_NETWORK_IPS,
          trustedIPs: process.env.TRUSTED_NETWORK_IPS
            ? process.env.TRUSTED_NETWORK_IPS.split(',').map((ip) => ip.trim())
            : [],
        },
      },
    });
  } catch (error) {
    console.error('Get trusted network config error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST - 保存信任网络配置
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

  // 检查用户权限（只有站长可以修改）
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (authInfo.username !== process.env.USERNAME) {
    return NextResponse.json({ error: '权限不足，只有站长可以修改信任网络配置' }, { status: 403 });
  }

  try {
    const trustedNetworkConfig = await request.json();

    // 验证配置数据
    if (typeof trustedNetworkConfig.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid enabled value' }, { status: 400 });
    }

    // 验证 IP 列表
    if (!Array.isArray(trustedNetworkConfig.trustedIPs)) {
      return NextResponse.json({ error: 'trustedIPs必须是数组' }, { status: 400 });
    }

    // 验证每个 IP 格式
    for (const ip of trustedNetworkConfig.trustedIPs) {
      if (typeof ip !== 'string' || !isValidIPOrCIDR(ip.trim())) {
        return NextResponse.json({ error: `无效的IP地址格式: ${ip}` }, { status: 400 });
      }
    }

    // 获取当前配置
    const adminConfig = await getConfig();

    // 更新信任网络配置
    adminConfig.TrustedNetworkConfig = {
      enabled: trustedNetworkConfig.enabled,
      trustedIPs: trustedNetworkConfig.trustedIPs.map((ip: string) => ip.trim()),
    };

    // 保存配置到数据库
    await db.saveAdminConfig(adminConfig);

    // 清除配置缓存
    clearConfigCache();

    // 设置 tn-version cookie 通知 middleware 立即刷新缓存
    const response = NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
    response.cookies.set('tn-version', Date.now().toString(), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60, // 1 年
    });

    return response;
  } catch (error) {
    console.error('Save trusted network config error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// 验证IP地址或CIDR格式（支持 IPv4 和 IPv6）
function isValidIPOrCIDR(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;

  const trimmed = ip.trim();

  // 允许通配符
  if (trimmed === '*') return true;

  // 使用 ipaddr.js 验证 IP 或 CIDR
  if (trimmed.includes('/')) {
    return ipaddr.isValidCIDR(trimmed);
  }

  return ipaddr.isValid(trimmed);
}
