import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, hasSpecialFeaturePermission } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// YouTube Data API v3 配置
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// 模拟热门视频数据（当没有真实API Key时使用）
const mockPopularVideos = [
  {
    id: 'dQw4w9WgXcQ',
    snippet: {
      title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
      description: 'The official video for "Never Gonna Give You Up" by Rick Astley',
      thumbnails: {
        medium: {
          url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
          width: 320,
          height: 180
        }
      },
      channelTitle: 'Rick Astley',
      publishedAt: '2009-10-25T06:57:33Z',
      channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw'
    },
    statistics: {
      viewCount: '1400000000',
      likeCount: '15000000'
    }
  },
  {
    id: '9bZkp7q19f0',
    snippet: {
      title: 'PSY - GANGNAM STYLE(강남스타일) M/V',
      description: 'PSY - GANGNAM STYLE(강남스타일) M/V',
      thumbnails: {
        medium: {
          url: 'https://i.ytimg.com/vi/9bZkp7q19f0/mqdefault.jpg',
          width: 320,
          height: 180
        }
      },
      channelTitle: 'officialpsy',
      publishedAt: '2012-07-15T08:34:21Z',
      channelId: 'UCrDkAvF9ZRMyvALrOFqOZ5A'
    },
    statistics: {
      viewCount: '5000000000',
      likeCount: '25000000'
    }
  },
  {
    id: 'kJQP7kiw5Fk',
    snippet: {
      title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
      description: 'Luis Fonsi - Despacito ft. Daddy Yankee',
      thumbnails: {
        medium: {
          url: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg',
          width: 320,
          height: 180
        }
      },
      channelTitle: 'LuisFonsiVEVO',
      publishedAt: '2017-01-12T19:06:32Z',
      channelId: 'UCAxjGjCSj8wLGhcMQTKgxNw'
    },
    statistics: {
      viewCount: '8500000000',
      likeCount: '50000000'
    }
  },
  {
    id: 'fJ9rUzIMcZQ',
    snippet: {
      title: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
      description: 'Queen – Bohemian Rhapsody (Official Video Remastered)',
      thumbnails: {
        medium: {
          url: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/mqdefault.jpg',
          width: 320,
          height: 180
        }
      },
      channelTitle: 'Queen Official',
      publishedAt: '2008-08-01T14:54:09Z',
      channelId: 'UCwK2Grm574W1u-sBzLikldQ'
    },
    statistics: {
      viewCount: '1900000000',
      likeCount: '20000000'
    }
  }
];

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const username = authInfo.username;

  const { searchParams } = new URL(request.url);
  const regionCode = searchParams.get('regionCode') || 'US'; // 默认美国
  const pageToken = searchParams.get('pageToken') || ''; // 分页token

  try {
    // 获取YouTube配置
    const config = await getConfig();

    // 检查用户是否有YouTube搜索功能权限
    const hasPermission = await hasSpecialFeaturePermission(username, 'youtube-search', config);
    if (!hasPermission) {
      return NextResponse.json({
        success: false,
        error: '您无权使用YouTube功能，请联系管理员开通权限'
      }, {
        status: 403,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Expires': '0',
          'Pragma': 'no-cache',
          'Surrogate-Control': 'no-store'
        }
      });
    }
    const youtubeConfig = config.YouTubeConfig;

    // 检查YouTube功能是否启用
    if (!youtubeConfig?.enabled) {
      return NextResponse.json({
        success: false,
        error: 'YouTube功能未启用'
      }, {
        status: 400,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Expires': '0',
          'Pragma': 'no-cache',
          'Surrogate-Control': 'no-store'
        }
      });
    }

    const maxResults = Math.min(youtubeConfig.maxResults || 25, 50);

    // YouTube热门视频缓存：30分钟（热门视频更新较慢）
    const YOUTUBE_POPULAR_CACHE_TIME = 30 * 60; // 30分钟（秒）
    const cacheKey = `youtube-popular-${youtubeConfig.enabled}-${youtubeConfig.enableDemo}-${maxResults}-${regionCode}-${pageToken}`;

    console.log(`🔍 检查YouTube热门视频缓存: ${cacheKey}`);

    // 检查缓存
    try {
      const cached = await db.getCache(cacheKey);
      if (cached) {
        console.log(`✅ YouTube热门视频缓存命中(数据库)`);
        return NextResponse.json({
          ...cached,
          fromCache: true,
          cacheSource: 'database',
          cacheTimestamp: new Date().toISOString()
        });
      }

      console.log(`❌ YouTube热门视频缓存未命中`);
    } catch (cacheError) {
      console.warn('YouTube热门视频缓存读取失败:', cacheError);
    }

    // 如果启用演示模式或没有配置API Key，返回模拟数据
    if (youtubeConfig.enableDemo || !youtubeConfig.apiKey) {
      const responseData = {
        success: true,
        videos: mockPopularVideos.slice(0, maxResults),
        total: mockPopularVideos.length,
        source: 'demo',
        warning: youtubeConfig.enableDemo ? '当前为演示模式，显示模拟数据' : 'API Key未配置，显示模拟数据。请在管理后台配置YouTube API Key以获取真实热门视频'
      };

      // 保存到缓存
      try {
        await db.setCache(cacheKey, responseData, YOUTUBE_POPULAR_CACHE_TIME);
        console.log(`💾 YouTube热门视频演示结果已缓存(数据库): ${responseData.videos.length} 个结果, TTL: ${YOUTUBE_POPULAR_CACHE_TIME}s`);
      } catch (cacheError) {
        console.warn('YouTube热门视频缓存保存失败:', cacheError);
      }

      return NextResponse.json(responseData);
    }

    // 使用真实的YouTube API获取热门视频
    const popularUrl = `${YOUTUBE_API_BASE}/videos?` +
      `key=${youtubeConfig.apiKey}&` +
      `part=snippet,statistics&` +
      `chart=mostPopular&` +
      `maxResults=${maxResults}&` +
      `regionCode=${regionCode}` +
      (pageToken ? `&pageToken=${pageToken}` : '');

    const response = await fetch(popularUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log('YouTube API错误详情:', errorData);

      let errorMessage = '';

      if (response.status === 400) {
        const reason = errorData.error?.errors?.[0]?.reason;
        const message = errorData.error?.message || '';

        if (reason === 'keyInvalid' || message.includes('API key not valid')) {
          errorMessage = 'YouTube API Key无效，请在管理后台检查配置';
        } else {
          errorMessage = `YouTube API请求错误: ${message || 'Bad Request'}`;
        }
      } else if (response.status === 403) {
        const reason = errorData.error?.errors?.[0]?.reason;
        const message = errorData.error?.message || '';

        if (reason === 'quotaExceeded' || message.includes('quota')) {
          errorMessage = 'YouTube API配额已用完，请稍后重试';
        } else {
          errorMessage = 'YouTube API访问被拒绝，请检查API Key权限配置';
        }
      } else {
        errorMessage = `YouTube API请求失败 (${response.status})，请检查API Key配置`;
      }

      return NextResponse.json({
        success: false,
        error: errorMessage
      }, { status: 400 });
    }

    const data = await response.json();

    const responseData = {
      success: true,
      videos: data.items || [],
      total: data.pageInfo?.totalResults || 0,
      nextPageToken: data.nextPageToken || null,
      prevPageToken: data.prevPageToken || null,
      source: 'youtube'
    };

    // 保存到缓存
    try {
      await db.setCache(cacheKey, responseData, YOUTUBE_POPULAR_CACHE_TIME);
      console.log(`💾 YouTube热门视频API结果已缓存(数据库): ${responseData.videos.length} 个结果, TTL: ${YOUTUBE_POPULAR_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('YouTube热门视频缓存保存失败:', cacheError);
    }

    console.log(`✅ YouTube热门视频获取完成: ${responseData.videos.length} 个结果`);
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('YouTube热门视频获取失败:', error);

    // API失败时返回模拟数据作为备用
    const fallbackData = {
      success: true,
      videos: mockPopularVideos.slice(0, 10),
      total: mockPopularVideos.length,
      source: 'fallback'
    };

    try {
      const fallbackCacheKey = `youtube-popular-fallback`;
      await db.setCache(fallbackCacheKey, fallbackData, 5 * 60); // 5分钟
      console.log(`💾 YouTube热门视频备用结果已缓存(数据库): ${fallbackData.videos.length} 个结果, TTL: 5分钟`);
    } catch (cacheError) {
      console.warn('YouTube热门视频备用缓存保存失败:', cacheError);
    }

    return NextResponse.json(fallbackData);
  }
}
