/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';
import { promisify } from 'util';
import { gunzip } from 'zlib';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { configSelfCheck, setCachedConfig } from '@/lib/config';
import { SimpleCrypto } from '@/lib/crypto';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const gunzipAsync = promisify(gunzip);

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

    // 检查用户权限（只有站长可以导入数据）
    if (authInfo.username !== process.env.USERNAME) {
      return NextResponse.json({ error: '权限不足，只有站长可以导入数据' }, { status: 401 });
    }

    // 解析表单数据
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const password = formData.get('password') as string;

    if (!file) {
      return NextResponse.json({ error: '请选择备份文件' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: '请提供解密密码' }, { status: 400 });
    }

    // 读取文件内容
    const encryptedData = await file.text();

    // 解密数据
    let decryptedData: string;
    try {
      decryptedData = SimpleCrypto.decrypt(encryptedData, password);
    } catch (error) {
      return NextResponse.json({ error: '解密失败，请检查密码是否正确' }, { status: 400 });
    }

    // 解压缩数据
    const compressedBuffer = Buffer.from(decryptedData, 'base64');
    const decompressedBuffer = await gunzipAsync(compressedBuffer);
    const decompressedData = decompressedBuffer.toString();

    // 解析JSON数据
    let importData: any;
    try {
      importData = JSON.parse(decompressedData);
    } catch (error) {
      return NextResponse.json({ error: '备份文件格式错误' }, { status: 400 });
    }

    // 验证数据格式
    if (!importData.data || !importData.data.adminConfig || !importData.data.userData) {
      return NextResponse.json({ error: '备份文件格式无效' }, { status: 400 });
    }

    // 开始导入数据 - 先清空现有数据
    await db.clearAllData();

    // 🔥 修复：先注册所有用户，然后再进行配置自检查
    // 步骤1：重新注册所有用户（包含完整的V2信息）
    const userData = importData.data.userData;
    for (const username in userData) {
      const user = userData[username];

      // 优先使用 V2 用户信息创建用户
      if (user.userInfoV2) {
        console.log(`创建 V2 用户: ${username}`, user.userInfoV2);
        await db.createUserV2(
          username,
          user.userInfoV2.password || user.password || '', // 优先使用V2加密密码
          user.userInfoV2.role || 'user',
          user.userInfoV2.tags,
          user.userInfoV2.oidcSub, // 恢复 OIDC 绑定
          user.userInfoV2.enabledApis
        );
      } else if (user.password) {
        // 兼容旧版本备份（V1用户）
        console.log(`创建 V1 用户: ${username}`);
        await db.registerUser(username, user.password);
      }
    }

    // 步骤2：导入管理员配置并进行自检查
    // 此时数据库中已有用户，configSelfCheck 可以正确获取用户列表并保留备份中的用户配置
    importData.data.adminConfig = await configSelfCheck(importData.data.adminConfig);
    await db.saveAdminConfig(importData.data.adminConfig);
    await setCachedConfig(importData.data.adminConfig);

    // 步骤3：导入用户的其他数据（播放记录、收藏、登录统计等）
    for (const username in userData) {
      const user = userData[username];

      // 导入播放记录（带数据升级）
      if (user.playRecords) {
        for (const [key, record] of Object.entries(user.playRecords)) {
          // 数据升级：确保所有必需字段存在
          const recordData = record as any;
          const upgradedRecord = {
            ...recordData,
            // 确保 type 字段存在（旧版本可能没有）
            type: recordData.type || undefined,
            // 确保 douban_id 字段存在
            douban_id: recordData.douban_id || undefined,
            // 确保 remarks 字段存在
            remarks: recordData.remarks || undefined,
            // 确保 original_episodes 字段存在
            original_episodes: recordData.original_episodes || undefined,
          };
          await (db as any).storage.setPlayRecord(username, key, upgradedRecord);
        }
      }

      // 导入收藏夹（带数据升级）
      if (user.favorites) {
        for (const [key, favorite] of Object.entries(user.favorites)) {
          // 数据升级：确保所有必需字段存在
          const favoriteData = favorite as any;
          const upgradedFavorite = {
            ...favoriteData,
            // 确保 origin 字段存在
            origin: favoriteData.origin || 'vod',
            // 确保 type 字段存在
            type: favoriteData.type || undefined,
            // 确保 releaseDate 字段存在
            releaseDate: favoriteData.releaseDate || undefined,
            // 确保 remarks 字段存在
            remarks: favoriteData.remarks || undefined,
          };
          await (db as any).storage.setFavorite(username, key, upgradedFavorite);
        }
      }

      // 导入想看（即将上映提醒）（带数据升级）
      if (user.reminders) {
        for (const [key, reminder] of Object.entries(user.reminders)) {
          // 数据升级：确保所有必需字段存在
          const reminderData = reminder as any;
          const upgradedReminder = {
            ...reminderData,
            // 确保 origin 字段存在
            origin: reminderData.origin || 'vod',
            // 确保 type 字段存在
            type: reminderData.type || undefined,
            // 确保 releaseDate 字段存在（提醒必须有上映日期）
            releaseDate: reminderData.releaseDate || '',
            // 确保 remarks 字段存在
            remarks: reminderData.remarks || undefined,
          };
          await (db as any).storage.setReminder(username, key, upgradedReminder);
        }
      }

      // 导入搜索历史
      if (user.searchHistory && Array.isArray(user.searchHistory)) {
        for (const keyword of user.searchHistory.reverse()) { // 反转以保持顺序
          await db.addSearchHistory(username, keyword);
        }
      }

      // 导入跳过片头片尾配置
      if (user.skipConfigs) {
        for (const [key, skipConfig] of Object.entries(user.skipConfigs)) {
          const [source, id] = key.split('+');
          if (source && id) {
            await db.setSkipConfig(username, source, id, skipConfig as any);
          }
        }
      }

      // 导入登录统计（恢复 loginCount, firstLoginTime, lastLoginTime）
      if (user.loginStats) {
        try {
          const storage = (db as any).storage;
          if (storage && typeof storage.client?.set === 'function') {
            const loginStatsKey = `user_login_stats:${username}`;
            const statsData = JSON.stringify(user.loginStats);
            await storage.client.set(loginStatsKey, statsData);
            console.log(`已恢复用户 ${username} 的登录统计:`, user.loginStats);
          }
        } catch (error) {
          console.error(`恢复用户 ${username} 登录统计失败:`, error);
        }
      }
    }

    return NextResponse.json({
      message: '数据导入成功',
      importedUsers: Object.keys(userData).length,
      timestamp: importData.timestamp,
      serverVersion: typeof importData.serverVersion === 'string' ? importData.serverVersion : '未知版本'
    });

  } catch (error) {
    console.error('数据导入失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 }
    );
  }
}
