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
      { error: '不支持本地存储进行管理员配置' },
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
      showHeroBanner,
      showContinueWatching,
      showUpcomingReleases,
      showHotMovies,
      showHotTvShows,
      showNewAnime,
      showHotVariety,
      showHotShortDramas,
    } = body;

    const config = await getConfig();

    config.HomePageConfig = {
      showHeroBanner: showHeroBanner ?? true,
      showContinueWatching: showContinueWatching ?? true,
      showUpcomingReleases: showUpcomingReleases ?? true,
      showHotMovies: showHotMovies ?? true,
      showHotTvShows: showHotTvShows ?? true,
      showNewAnime: showNewAnime ?? true,
      showHotVariety: showHotVariety ?? true,
      showHotShortDramas: showHotShortDramas ?? true,
    };

    await db.saveAdminConfig(config);
    clearConfigCache();

    return NextResponse.json({
      success: true,
      message: '首页模块配置已更新',
    });
  } catch (error) {
    console.error('保存首页配置失败:', error);
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
      { error: '不支持本地存储进行管理员配置' },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);

  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getConfig();

    return NextResponse.json({
      success: true,
      config: config.HomePageConfig || {
        showHeroBanner: true,
        showContinueWatching: true,
        showUpcomingReleases: true,
        showHotMovies: true,
        showHotTvShows: true,
        showNewAnime: true,
        showHotVariety: true,
        showHotShortDramas: true,
      },
    });
  } catch (error) {
    console.error('获取首页配置失败:', error);
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    );
  }
}
