/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { PlayRecord } from '@/lib/types';

// 导出类型供页面组件使用
export type { PlayStatsResult } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行播放统计查看',
      },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getConfig();
    const storage = db;
    const username = authInfo.username;

    // 判定操作者角色
    let _operatorRole: 'owner' | 'admin';
    if (username === process.env.USERNAME) {
      _operatorRole = 'owner';
    } else {
      const userEntry = config.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
      _operatorRole = 'admin';
    }

    // 使用LunaTV-stat相同的方式：直接在API路由中实现统计逻辑，从config获取用户列表
    const allUsers = config.UserConfig.Users;
    const userStats: Array<{
      username: string;
      totalWatchTime: number;
      totalPlays: number;
      lastPlayTime: number;
      recentRecords: PlayRecord[];
      avgWatchTime: number;
      mostWatchedSource: string;
      registrationDays: number;
      lastLoginTime: number;
      loginCount: number;
      createdAt: number;
    }> = [];
    let totalWatchTime = 0;
    let totalPlays = 0;
    const sourceCount: Record<string, number> = {};
    const dailyData: Record<string, { watchTime: number; plays: number }> = {};

    // 用户注册统计
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let todayNewUsers = 0;
    let totalRegisteredUsers = 0;
    const registrationData: Record<string, number> = {};

    // 计算近7天的日期范围
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 为每个用户获取播放记录统计
    for (const user of allUsers) {
      try {
        // 计算用户注册相关统计
        // 设置项目开始时间，2025年9月14日
        const PROJECT_START_DATE = new Date('2025-09-14').getTime();
        const userCreatedAt = user.createdAt || PROJECT_START_DATE;

        // 使用自然日计算，与个人统计保持一致
        const firstDate = new Date(userCreatedAt);
        const currentDate = new Date();
        const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
        const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const registrationDays = Math.floor((currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // 统计今日新增用户
        if (userCreatedAt >= todayStart) {
          todayNewUsers++;
        }
        totalRegisteredUsers++;

        // 统计注册时间分布（近7天）
        if (userCreatedAt >= sevenDaysAgo.getTime()) {
          const regDate = new Date(userCreatedAt).toISOString().split('T')[0];
          registrationData[regDate] = (registrationData[regDate] || 0) + 1;
        }

        // 获取用户最后登录时间和登入次数（从用户统计中获取真实登入时间）
        let lastLoginTime = 0;
        let loginCount = 0;
        try {
          const userPlayStat = await storage.getUserPlayStat(user.username);
          // 优先使用用户统计中的登入时间，这是真实的登录时间
          lastLoginTime = userPlayStat.lastLoginTime || userPlayStat.lastLoginDate || userPlayStat.firstLoginTime || 0;
          loginCount = userPlayStat.loginCount || 0;
        } catch (err) {
          // 获取失败时默认为0
          lastLoginTime = 0;
          loginCount = 0;
        }

        // 获取用户的所有播放记录
        const userPlayRecords = await storage.getAllPlayRecords(user.username);
        const records = Object.values(userPlayRecords);

        if (records.length === 0) {
          // 没有播放记录的用户也要显示
          userStats.push({
            username: user.username,
            totalWatchTime: 0,
            totalPlays: 0,
            lastPlayTime: 0,
            recentRecords: [],
            avgWatchTime: 0,
            mostWatchedSource: '',
            registrationDays,
            lastLoginTime,
            loginCount,
            createdAt: userCreatedAt,
          });
          continue;
        }

        // 计算用户统计
        let userWatchTime = 0;
        let userLastPlayTime = 0;
        const userSourceCount: Record<string, number> = {};

        records.forEach((record) => {
          // 累计观看时间（使用播放进度）
          userWatchTime += record.play_time || 0;

          // 更新最后播放时间
          if (record.save_time > userLastPlayTime) {
            userLastPlayTime = record.save_time;
          }

          // 不再从播放记录推断登录时间，而是使用真实的登入时间
          // 这里只更新播放相关的统计

          // 统计来源
          const sourceName = record.source_name || '未知来源';
          userSourceCount[sourceName] = (userSourceCount[sourceName] || 0) + 1;
          sourceCount[sourceName] = (sourceCount[sourceName] || 0) + 1;

          // 统计近7天数据
          const recordDate = new Date(record.save_time);
          if (recordDate >= sevenDaysAgo) {
            const dateKey = recordDate.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
              dailyData[dateKey] = { watchTime: 0, plays: 0 };
            }
            dailyData[dateKey].watchTime += record.play_time || 0;
            dailyData[dateKey].plays += 1;
          }
        });

        // 获取最近播放记录（按时间倒序，最多10条）
        const recentRecords = records
          .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
          .slice(0, 10);

        // 找出最常观看的来源
        let mostWatchedSource = '';
        let maxCount = 0;
        for (const [source, count] of Object.entries(userSourceCount)) {
          if (count > maxCount) {
            maxCount = count;
            mostWatchedSource = source;
          }
        }

        const userStat = {
          username: user.username,
          totalWatchTime: userWatchTime,
          totalPlays: records.length,
          lastPlayTime: userLastPlayTime,
          recentRecords,
          avgWatchTime: records.length > 0 ? userWatchTime / records.length : 0,
          mostWatchedSource,
          registrationDays,
          lastLoginTime: lastLoginTime || userCreatedAt, // 如果没有登入记录，使用注册时间
          loginCount,
          createdAt: userCreatedAt,
        };

        userStats.push(userStat);

        // 累计全站统计
        totalWatchTime += userWatchTime;
        totalPlays += records.length;
      } catch (error) {
        // console.error(`获取用户 ${user.username} 播放记录失败:`, error);
        // 出错的用户显示为空统计
        // 设置项目开始时间，2025年9月14日
        const PROJECT_START_DATE = new Date('2025-09-14').getTime();
        const userCreatedAt = user.createdAt || PROJECT_START_DATE;

        // 使用自然日计算，与个人统计保持一致
        const firstDate = new Date(userCreatedAt);
        const currentDate = new Date();
        const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
        const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const registrationDays = Math.floor((currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        userStats.push({
          username: user.username,
          totalWatchTime: 0,
          totalPlays: 0,
          lastPlayTime: 0,
          recentRecords: [],
          avgWatchTime: 0,
          mostWatchedSource: '',
          registrationDays,
          lastLoginTime: userCreatedAt, // 没有登入记录时使用注册时间
          loginCount: 0,
          createdAt: userCreatedAt,
        });
      }
    }

    // 按观看时间降序排序
    userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime);

    // 整理热门来源数据（取前5个）
    const topSources = Object.entries(sourceCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    // 整理近7天数据
    const dailyStats: Array<{ date: string; watchTime: number; plays: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const data = dailyData[dateKey] || { watchTime: 0, plays: 0 };
      dailyStats.push({
        date: dateKey,
        watchTime: data.watchTime,
        plays: data.plays,
      });
    }

    // 整理近7天注册数据
    const registrationStats: Array<{ date: string; newUsers: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const newUsers = registrationData[dateKey] || 0;
      registrationStats.push({
        date: dateKey,
        newUsers,
      });
    }

    // 计算活跃用户统计
    const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
    const sevenDaysAgoTime = sevenDaysAgo.getTime();
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    const activeUsers = {
      daily: userStats.filter(user => user.lastLoginTime >= oneDayAgo).length,
      weekly: userStats.filter(user => user.lastLoginTime >= sevenDaysAgoTime).length,
      monthly: userStats.filter(user => user.lastLoginTime >= thirtyDaysAgo).length,
    };

    const result = {
      totalUsers: allUsers.length,
      totalWatchTime,
      totalPlays,
      avgWatchTimePerUser: allUsers.length > 0 ? totalWatchTime / allUsers.length : 0,
      avgPlaysPerUser: allUsers.length > 0 ? totalPlays / allUsers.length : 0,
      userStats,
      topSources,
      dailyStats,
      // 新增的注册和活跃度统计
      registrationStats: {
        todayNewUsers,
        totalRegisteredUsers,
        registrationTrend: registrationStats,
      },
      activeUsers,
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store', // 不缓存，确保数据实时性
      },
    });
  } catch (error) {
    // console.error('获取播放统计失败:', error);
    return NextResponse.json(
      {
        error: '获取播放统计失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}