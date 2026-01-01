/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';
import { promisify } from 'util';
import { gzip } from 'zlib';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { SimpleCrypto } from '@/lib/crypto';
import { db } from '@/lib/db';
import { CURRENT_VERSION } from '@/lib/version';

export const runtime = 'nodejs';

const gzipAsync = promisify(gzip);

export async function POST(req: NextRequest) {
  try {
    // 检查存储类型
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      return NextResponse.json(
        { error: '不支持本地存储进行数据迁移' },
        { status: 400 }
      );
    }

    // 验证身份和权限
    const authInfo = getAuthInfoFromCookie(req);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查用户权限（只有站长可以导出数据）
    if (authInfo.username !== process.env.USERNAME) {
      return NextResponse.json({ error: '权限不足，只有站长可以导出数据' }, { status: 401 });
    }

    const config = await db.getAdminConfig();
    if (!config) {
      return NextResponse.json({ error: '无法获取配置' }, { status: 500 });
    }

    // 解析请求体获取密码
    const { password } = await req.json();
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '请提供加密密码' }, { status: 400 });
    }

    // 收集所有数据
    const exportData = {
      timestamp: new Date().toISOString(),
      serverVersion: CURRENT_VERSION,
      data: {
        // 管理员配置
        adminConfig: config,
        // 所有用户数据
        userData: {} as { [username: string]: any }
      }
    };

    // 获取所有用户
    let allUsers = await db.getAllUsers();
    // 添加站长用户
    allUsers.push(process.env.USERNAME);
    allUsers = Array.from(new Set(allUsers));

    // 为每个用户收集数据
    for (const username of allUsers) {
      const userData = {
        // 播放记录
        playRecords: await db.getAllPlayRecords(username),
        // 收藏夹
        favorites: await db.getAllFavorites(username),
        // 搜索历史
        searchHistory: await db.getSearchHistory(username),
        // 跳过片头片尾配置
        skipConfigs: await db.getAllSkipConfigs(username),
        // V2用户信息（包含 oidcSub, role, tags, enabledApis 等）
        userInfoV2: await db.getUserInfoV2(username),
        // 登录统计（loginCount, firstLoginTime, lastLoginTime）
        loginStats: await getUserLoginStats(username),
        // 用户密码（V1兼容，通过验证空密码来检查用户是否存在，然后获取密码）
        password: await getUserPassword(username)
      };

      exportData.data.userData[username] = userData;
    }

    // 覆盖站长密码
    exportData.data.userData[process.env.USERNAME].password = process.env.PASSWORD;

    // 将数据转换为JSON字符串
    const jsonData = JSON.stringify(exportData);

    // 先压缩数据
    const compressedData = await gzipAsync(jsonData);

    // 使用提供的密码加密压缩后的数据
    const encryptedData = SimpleCrypto.encrypt(compressedData.toString('base64'), password);

    // 生成文件名
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `moontv-backup-${timestamp}.dat`;

    // 返回加密的数据作为文件下载
    return new NextResponse(encryptedData, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': encryptedData.length.toString(),
      },
    });

  } catch (error) {
    console.error('数据导出失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导出失败' },
      { status: 500 }
    );
  }
}

// 辅助函数：获取用户密码（通过数据库直接访问）
async function getUserPassword(username: string): Promise<string | null> {
  try {
    // 使用 Redis 存储的直接访问方法
    const storage = (db as any).storage;
    if (storage && typeof storage.client?.get === 'function') {
      const passwordKey = `u:${username}:pwd`;
      const password = await storage.client.get(passwordKey);
      return password;
    }
    return null;
  } catch (error) {
    console.error(`获取用户 ${username} 密码失败:`, error);
    return null;
  }
}

// 辅助函数：获取用户登录统计（通过数据库直接访问）
async function getUserLoginStats(username: string): Promise<{
  loginCount: number;
  firstLoginTime: number;
  lastLoginTime: number;
  lastLoginDate: number;
} | null> {
  try {
    const storage = (db as any).storage;
    if (storage && typeof storage.client?.get === 'function') {
      const loginStatsKey = `user_login_stats:${username}`;
      const statsData = await storage.client.get(loginStatsKey);

      if (statsData) {
        // 处理不同存储类型的返回格式
        if (typeof statsData === 'string') {
          // KVRocks/Redis 返回字符串
          return JSON.parse(statsData);
        } else {
          // Upstash 返回对象
          return statsData as any;
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`获取用户 ${username} 登录统计失败:`, error);
    return null;
  }
}
