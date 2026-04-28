import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { encWbi, getBuvid3, getBilibiliHeaders } from '@/lib/bilibili-wbi';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('q') || searchParams.get('keyword');

  if (!keyword) {
    return NextResponse.json({ error: '搜索关键词不能为空' }, { status: 400 });
  }

  try {
    // 获取配置
    const config = await getConfig();
    const biliConfig = config.BilibiliConfig;

    // 检查是否启用
    if (!biliConfig?.enabled) {
      return NextResponse.json({
        success: false,
        error: 'B站搜索功能未启用'
      }, { status: 400 });
    }

    console.log(`🔍 B站搜索: "${keyword}"`);

    // Bilibili搜索缓存：60分钟（与YouTube相同）
    const BILIBILI_CACHE_TIME = 60 * 60; // 60分钟（秒）
    const isLoggedIn = biliConfig?.loginStatus === 'logged_in' ? 'logged' : 'guest';
    const cacheKey = `bilibili-search-${isLoggedIn}-${encodeURIComponent(keyword)}`;

    console.log(`🔍 检查Bilibili搜索缓存: ${cacheKey}`);

    // 检查缓存
    try {
      const cached = await db.getCache(cacheKey);
      if (cached) {
        console.log(`✅ Bilibili搜索缓存命中(数据库): "${keyword}"`);
        return NextResponse.json({
          ...cached,
          fromCache: true,
          cacheSource: 'database',
          cacheTimestamp: new Date().toISOString()
        });
      }

      console.log(`❌ Bilibili搜索缓存未命中: "${keyword}"`);
    } catch (cacheError) {
      console.warn('Bilibili搜索缓存读取失败:', cacheError);
      // 缓存失败不影响主流程，继续执行
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
      console.log('🔐 使用管理员登录凭证搜索');
    }

    // 准备搜索参数
    const params = {
      keyword: keyword.trim(),
      page: 1,
      search_type: 'video'  // 搜索类型：video, media_bangumi, media_ft 等
    };

    // Wbi 签名
    const signedQuery = await encWbi(params);

    // 请求 B站搜索 API
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/wbi/search/all/v2?${signedQuery}`,
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

    // 解析搜索结果
    const results = parseSearchResults(data.data);

    console.log(`✅ B站搜索完成: "${keyword}" - ${results.videos.length} 个视频, ${results.bangumi.length} 个番剧, ${results.upusers.length} 个UP主`);

    // 调试：打印第一个结果的图片URL
    if (results.videos.length > 0) {
      console.log('📸 视频封面示例:', results.videos[0].pic);
    }
    if (results.bangumi.length > 0) {
      console.log('📸 番剧封面示例:', results.bangumi[0].cover);
    }

    const responseData = {
      success: true,
      keyword,
      videos: results.videos,
      bangumi: results.bangumi,
      upusers: results.upusers,
      total: results.total,
      source: 'bilibili'
    };

    // 保存到缓存
    try {
      await db.setCache(cacheKey, responseData, BILIBILI_CACHE_TIME);
      console.log(`💾 Bilibili搜索结果已缓存(数据库): "${keyword}" - ${results.total} 个结果, TTL: ${BILIBILI_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('Bilibili搜索缓存保存失败:', cacheError);
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('❌ B站搜索失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '搜索失败'
    }, { status: 500 });
  }
}

/**
 * 解析 B站搜索结果
 */
function parseSearchResults(data: any) {
  const videos: any[] = [];
  const bangumi: any[] = [];
  const upusers: any[] = [];
  let total = 0;

  if (!data || !data.result) {
    return { videos, bangumi, upusers, total };
  }

  // 遍历搜索结果
  for (const item of data.result) {
    if (item.result_type === 'video' && item.data) {
      // 普通视频
      videos.push(...item.data.map((v: any) => ({
        type: 'video',
        bvid: v.bvid,
        aid: v.aid,
        title: v.title?.replace(/<[^>]*>/g, ''), // 移除 HTML 标签
        pic: v.pic?.startsWith('//') ? `https:${v.pic}` : v.pic,
        author: v.author,
        mid: v.mid,
        duration: v.duration,
        play: v.play,
        danmaku: v.video_review,
        favorites: v.favorites,
        review: v.review,
        pubdate: v.pubdate,
        description: v.description
      })));
    } else if (item.result_type === 'media_bangumi' && item.data) {
      // 番剧
      bangumi.push(...item.data.map((b: any) => ({
        type: 'bangumi',
        season_id: b.season_id,
        media_id: b.media_id,
        title: b.title?.replace(/<[^>]*>/g, ''),
        cover: b.cover?.startsWith('//') ? `https:${b.cover}` : b.cover,
        areas: b.areas,
        styles: b.styles,
        media_type: b.media_type,
        media_score: b.media_score,
        ep_size: b.ep_size,
        is_follow: b.is_follow,
        badges: b.badges
      })));
    } else if (item.result_type === 'bili_user' && item.data) {
      // UP主
      upusers.push(...item.data.map((u: any) => ({
        type: 'upuser',
        mid: u.mid,
        uname: u.uname,
        usign: u.usign,
        fans: u.fans,
        videos: u.videos,
        upic: u.upic?.startsWith('//') ? `https:${u.upic}` : u.upic,
        level: u.level,
        gender: u.gender,
        is_upuser: u.is_upuser,
        is_live: u.is_live,
        room_id: u.room_id,
        official_verify: u.official_verify,
        res: u.res?.map((r: any) => ({
          aid: r.aid,
          bvid: r.bvid,
          title: r.title,
          pic: r.pic?.startsWith('//') ? `https:${r.pic}` : r.pic,
          play: r.play,
          duration: r.duration,
          pubdate: r.pubdate
        })) || []
      })));
    }
  }

  total = videos.length + bangumi.length + upusers.length;

  return { videos, bangumi, upusers, total };
}
