/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { LiveViewRecord } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行直播统计',
      },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      channelName,
      channelId,
      sourceName,
      sourceKey,
      startTime,
      endTime,
      channelGroup,
      channelLogo,
    } = body;

    // 验证必填字段
    if (
      !channelName ||
      !channelId ||
      !sourceName ||
      !sourceKey ||
      !startTime ||
      !endTime
    ) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    // 计算观看时长
    const duration = Math.floor((endTime - startTime) / 1000); // 转换为秒

    // 只记录观看时长大于5秒的记录
    if (duration < 5) {
      return NextResponse.json({
        success: true,
        message: '观看时长过短，不记录',
      });
    }

    const record: LiveViewRecord = {
      username: authInfo.username,
      channelName,
      channelId,
      sourceName,
      sourceKey,
      startTime,
      endTime,
      duration,
      channelGroup,
      channelLogo,
    };

    // 保存到数据库
    const storage = db;
    const key = `live_view_${authInfo.username}_${Date.now()}`;
    await storage.setCache(key, record);

    // 同时保存到用户的直播观看记录列表
    const userRecordsKey = `live_views:${authInfo.username}`;
    const existingRecords = (await storage.getCache(userRecordsKey)) || [];
    existingRecords.push(record);

    // 只保留最近100条记录
    if (existingRecords.length > 100) {
      existingRecords.splice(0, existingRecords.length - 100);
    }

    await storage.setCache(userRecordsKey, existingRecords);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: '记录直播观看失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
