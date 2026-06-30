import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getBuvid3, getBilibiliHeaders } from '@/lib/bilibili-wbi';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('pn') || '1');
  const pageSize = parseInt(searchParams.get('ps') || '20');

  try {
    // 获取配置
    const config = await getConfig();
    const biliConfig = config.BilibiliConfig;

    // 检查是否启用
    if (!biliConfig?.enabled) {
      return NextResponse.json({
        success: false,
        error: 'B站功能未启用'
      }, { status: 400 });
    }

    console.log(`🔥 获取B站热门视频: 第${page}页`);

    // 热门视频缓存：30分钟
    const POPULAR_CACHE_TIME = 30 * 60;
    const isLoggedIn = biliConfig?.loginStatus === 'logged_in' ? 'logged' : 'guest';
    const cacheKey = `bilibili-popular-${isLoggedIn}-${page}-${pageSize}`;

    console.log(`🔍 检查热门视频缓存: ${cacheKey}`);

    // 检查缓存
    try {
      const cached = await db.getCache(cacheKey);
      if (cached) {
        console.log(`✅ 热门视频缓存命中(数据库): 第${page}页`);
        return NextResponse.json({
          ...cached,
          fromCache: true,
          cacheSource: 'database',
          cacheTimestamp: new Date().toISOString()
        });
      }

      console.log(`❌ 热门视频缓存未命中: 第${page}页`);
    } catch (cacheError) {
      console.warn('热门视频缓存读取失败:', cacheError);
    }

    // 获取 buvid3 和登录 cookies
    const buvid3 = biliConfig?.buvid3 || await getBuvid3();

    // 构建 Cookie 字符串
    let cookieStr = `buvid3=${buvid3}`;
    if (biliConfig?.loginStatus === 'logged_in' && biliConfig.sessdata) {
      cookieStr += `; SESSDATA=${biliConfig.sessdata}`;
      if (biliConfig.bili_jct) {
        cookieStr += `; bili_jct=${biliConfig.bili_jct}`;
      }
      if (biliConfig.dedeuserid) {
        cookieStr += `; DedeUserID=${biliConfig.dedeuserid}`;
      }
      console.log('🔐 使用管理员登录凭证获取热门');
    }

    // 请求 B站热门 API
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/popular?pn=${page}&ps=${pageSize}`,
      {
        headers: {
          ...getBilibiliHeaders(buvid3),
          'Cookie': cookieStr,
        }
      }
    );

    if (!response.ok) {
      throw new Error(`B站 API 请求失败: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 0) {
      console.error('B站 API 返回错误:', data);
      return NextResponse.json({
        success: false,
        error: data.message || 'B站 API 返回错误'
      }, { status: 400 });
    }

    // 解析热门视频
    const videos = parsePopularVideos(data.data);

    console.log(`✅ B站热门视频获取完成: 第${page}页 - ${videos.length} 个视频`);

    const responseData = {
      success: true,
      videos,
      no_more: data.data.no_more || false,
      page,
      pageSize,
      source: 'bilibili'
    };

    // 保存到缓存
    try {
      await db.setCache(cacheKey, responseData, POPULAR_CACHE_TIME);
      console.log(`💾 热门视频已缓存(数据库): 第${page}页, TTL: ${POPULAR_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('热门视频缓存保存失败:', cacheError);
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('❌ B站热门视频获取失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '获取失败'
    }, { status: 500 });
  }
}

/**
 * 解析热门视频列表
 */
function parsePopularVideos(data: any) {
  if (!data || !data.list) {
    return [];
  }

  return data.list.map((v: any) => ({
    type: 'video',
    bvid: v.bvid,
    aid: v.aid,
    title: v.title,
    pic: v.pic?.startsWith('//') ? `https:${v.pic}` : v.pic,
    author: v.owner?.name,
    mid: v.owner?.mid,
    duration: formatDuration(v.duration),
    play: v.stat?.view,
    danmaku: v.stat?.danmaku,
    favorites: v.stat?.favorite,
    review: v.stat?.reply,
    pubdate: v.pubdate,
    description: v.desc
  }));
}

/**
 * 格式化时长（秒 -> MM:SS）
 */
function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
