/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { LiveStatsResult, LiveViewRecord } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行直播统计查看',
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
    if (username !== process.env.USERNAME) {
      const userEntry = config.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    // 获取所有用户（不限制数量，因为我们会过滤掉没有观看记录的用户）
    const allUsers = config.UserConfig.Users;

    const userStats: Array<{
      username: string;
      totalWatchTime: number;
      totalViews: number;
      lastViewTime: number;
      recentRecords: LiveViewRecord[];
      avgWatchTime: number;
      mostWatchedChannel: string;
      mostWatchedSource: string;
    }> = [];

    let totalWatchTime = 0;
    let totalViews = 0;
    const channelCount: Record<
      string,
      { count: number; totalTime: number; channelId: string }
    > = {};
    const sourceCount: Record<string, { count: number; sourceKey: string }> =
      {};
    const dailyData: Record<string, { watchTime: number; views: number }> = {};

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 为每个用户获取直播观看记录统计（并行查询，提高性能）
    const userPromises = allUsers.map(async (user) => {
      try {
        const userRecordsKey = `live_views:${user.username}`;

        // 添加超时控制，避免 Redis 查询卡住
        const records: LiveViewRecord[] = await Promise.race([
          storage.getCache(userRecordsKey),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)), // 5秒超时
        ]).then((result) => result || []);

        if (records.length === 0) {
          // 跳过没有观看记录的用户，不显示在列表中
          return null;
        }

        // 计算用户统计
        let userWatchTime = 0;
        let userLastViewTime = 0;
        const userChannelCount: Record<string, number> = {};
        const userSourceCount: Record<string, number> = {};

        records.forEach((record) => {
          // 累计观看时间
          userWatchTime += record.duration;

          // 更新最后观看时间
          if (record.endTime > userLastViewTime) {
            userLastViewTime = record.endTime;
          }

          // 统计频道
          const channelKey = `${record.channelName}`;
          userChannelCount[channelKey] =
            (userChannelCount[channelKey] || 0) + 1;
          if (!channelCount[channelKey]) {
            channelCount[channelKey] = {
              count: 0,
              totalTime: 0,
              channelId: record.channelId,
            };
          }
          channelCount[channelKey].count += 1;
          channelCount[channelKey].totalTime += record.duration;

          // 统计来源
          const sourceKey = record.sourceName;
          userSourceCount[sourceKey] = (userSourceCount[sourceKey] || 0) + 1;
          if (!sourceCount[sourceKey]) {
            sourceCount[sourceKey] = { count: 0, sourceKey: record.sourceKey };
          }
          sourceCount[sourceKey].count += 1;

          // 统计近7天数据
          const recordDate = new Date(record.endTime);
          if (recordDate >= sevenDaysAgo) {
            const dateKey = recordDate.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
              dailyData[dateKey] = { watchTime: 0, views: 0 };
            }
            dailyData[dateKey].watchTime += record.duration;
            dailyData[dateKey].views += 1;
          }
        });

        // 获取最近观看记录（按时间倒序，最多10条）
        const recentRecords = records
          .sort((a, b) => b.endTime - a.endTime)
          .slice(0, 10);

        // 找出最常观看的频道
        let mostWatchedChannel = '';
        let maxChannelCount = 0;
        for (const [channel, count] of Object.entries(userChannelCount)) {
          if (count > maxChannelCount) {
            maxChannelCount = count;
            mostWatchedChannel = channel;
          }
        }

        // 找出最常使用的直播源
        let mostWatchedSource = '';
        let maxSourceCount = 0;
        for (const [source, count] of Object.entries(userSourceCount)) {
          if (count > maxSourceCount) {
            maxSourceCount = count;
            mostWatchedSource = source;
          }
        }

        const userStat = {
          username: user.username,
          totalWatchTime: userWatchTime,
          totalViews: records.length,
          lastViewTime: userLastViewTime,
          recentRecords,
          avgWatchTime: records.length > 0 ? userWatchTime / records.length : 0,
          mostWatchedChannel,
          mostWatchedSource,
        };

        return userStat;
      } catch {
        return null;
      }
    });

    // 等待所有用户查询完成
    const results = await Promise.all(userPromises);

    // 过滤掉 null 结果并收集统计数据
    for (const result of results) {
      if (result) {
        userStats.push(result);
        totalWatchTime += result.totalWatchTime;
        totalViews += result.totalViews;

        // 收集频道和来源统计
        result.recentRecords.forEach((record) => {
          const channelKey = record.channelName;
          if (!channelCount[channelKey]) {
            channelCount[channelKey] = {
              count: 0,
              totalTime: 0,
              channelId: record.channelId,
            };
          }
          channelCount[channelKey].count += 1;
          channelCount[channelKey].totalTime += record.duration;

          const sourceKey = record.sourceName;
          if (!sourceCount[sourceKey]) {
            sourceCount[sourceKey] = { count: 0, sourceKey: record.sourceKey };
          }
          sourceCount[sourceKey].count += 1;

          // 统计近7天数据
          const recordDate = new Date(record.endTime);
          if (recordDate >= sevenDaysAgo) {
            const dateKey = recordDate.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
              dailyData[dateKey] = { watchTime: 0, views: 0 };
            }
            dailyData[dateKey].watchTime += record.duration;
            dailyData[dateKey].views += 1;
          }
        });
      }
    }

    // 按观看时间降序排序
    userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime);

    // 整理热门频道数据（取前10个）
    const topChannels = Object.entries(channelCount)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([channelName, data]) => ({
        channelName,
        channelId: data.channelId,
        viewCount: data.count,
        totalWatchTime: data.totalTime,
      }));

    // 整理热门来源数据（取前5个）
    const topSources = Object.entries(sourceCount)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([sourceName, data]) => ({
        sourceName,
        sourceKey: data.sourceKey,
        viewCount: data.count,
      }));

    // 整理近7天数据
    const dailyStats: Array<{
      date: string;
      watchTime: number;
      views: number;
    }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const data = dailyData[dateKey] || { watchTime: 0, views: 0 };
      dailyStats.push({
        date: dateKey,
        watchTime: data.watchTime,
        views: data.views,
      });
    }

    const result: LiveStatsResult = {
      totalUsers: allUsers.length,
      totalWatchTime,
      totalViews,
      avgWatchTimePerUser:
        allUsers.length > 0 ? totalWatchTime / allUsers.length : 0,
      avgViewsPerUser: allUsers.length > 0 ? totalViews / allUsers.length : 0,
      userStats,
      topChannels,
      topSources,
      dailyStats,
    };

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: '获取直播统计失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
