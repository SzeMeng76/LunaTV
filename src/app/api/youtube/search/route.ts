import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, hasSpecialFeaturePermission } from '@/lib/config';
import { db } from '@/lib/db';
import { filterSensitiveContent } from '@/lib/filter';  // 新增：引入统一过滤函数

export const runtime = 'nodejs';

// YouTube Data API v3 配置
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// 内容类型到搜索关键词的映射
const getContentTypeQuery = (originalQuery: string, contentType: string): string => {
  if (contentType === 'all') return originalQuery;
  
  const typeKeywords = {
    music: ['music', 'song', 'audio', 'MV', 'cover', 'live'],
    movie: ['movie', 'film', 'trailer', 'cinema', 'full movie'],
    educational: ['tutorial', 'education', 'learn', 'how to', 'guide', 'course'],
    gaming: ['gaming', 'gameplay', 'game', 'walkthrough', 'review'],
    sports: ['sports', 'football', 'basketball', 'soccer', 'match', 'game'],
    news: ['news', 'breaking', 'report', 'today', 'latest']
  };
  
  const keywords = typeKeywords[contentType as keyof typeof typeKeywords] || [];
  if (keywords.length > 0) {
    // 随机选择一个关键词添加到搜索中
    const randomKeyword = keywords[Math.floor(Math.random() * keywords.length)];
    return `${originalQuery} ${randomKeyword}`;
  }
  
  return originalQuery;
};

// 模拟搜索数据（当没有真实API Key时使用）
const mockSearchResults = [
  {
    id: { videoId: 'dQw4w9WgXcQ' },
    snippet: {
      title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
      description: 'The official video for "Never Gonna Give You Up" by Rick Astley',
      thumbnails: {
        medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' },
      },
      channelTitle: 'Rick Astley',
      publishedAt: '2009-10-25T06:57:33Z'
    }
  },
  // ... 其他模拟数据（保持原样）
];

export async function GET(request: NextRequest) {
  // 权限检查：需要登录
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();
  const contentType = searchParams.get('type') || 'all';

  if (!query) {
    return NextResponse.json({ error: '搜索关键词不能为空' }, { status: 400 });
  }

  // 获取配置
  const config = await getConfig();
  const youtubeConfig = config.YouTubeConfig;
  const shouldFilter = !config.SiteConfig.DisableYellowFilter;  // 新增：确定是否过滤敏感内容

  // 检查是否启用 YouTube 搜索 - 必须在缓存检查之前
  if (!youtubeConfig?.enabled) {
    return NextResponse.json({ error: 'YouTube 搜索功能未启用' }, { status: 400 });
  }

  if (!youtubeConfig?.apiKey) {
    return NextResponse.json({ error: 'YouTube API Key 未配置' }, { status: 400 });
  }

  // YouTube 搜索缓存：30分钟
  const YOUTUBE_CACHE_TIME = 30 * 60;  // 30分钟（秒）
  const cacheKey = `youtube-search-${query}-${contentType}`;

  console.log(`🔍 检查 YouTube 搜索缓存: ${cacheKey}`);

  // 服务端直接调用数据库
  try {
    const cached = await db.getCache(cacheKey);
    if (cached) {
      console.log(`✅ YouTube 搜索缓存命中(数据库): "${query}" (${contentType})`);
      // 新增：即使是缓存，也应用过滤（以防旧缓存未过滤）
      if (shouldFilter) {
        cached.videos = filterSensitiveContent(
          cached.videos.map((v: any) => ({
            ...v,
            title: v.snippet?.title,
            description: v.snippet?.description  // 兼容过滤函数，临时映射
          })),
          true
        ).map((v: any) => ({ ...v, snippet: { ...v.snippet, title: v.title, description: v.description } }));  // 还原结构
        cached.total = cached.videos.length;
      }
      return NextResponse.json({
        ...cached,
        fromCache: true,
      });
    }
  } catch (cacheError) {
    console.warn('YouTube 搜索缓存检查失败:', cacheError);
  }

  // 没有缓存，进行实际搜索
  console.log(`🌐 执行 YouTube 搜索: "${query}" (type: ${contentType})`);

  const controller = new AbortController();
  const signal = controller.signal;
  const timeout = setTimeout(() => controller.abort(), 15000);  // 15秒超时

  try {
    const searchQuery = getContentTypeQuery(query, contentType);
    
    const youtubeUrl = `${YOUTUBE_API_BASE}/search?` +
      new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        maxResults: '20',
        type: 'video',
        safeSearch: 'strict',
        key: youtubeConfig.apiKey,
      }).toString();

    const response = await fetch(youtubeUrl, { signal });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`YouTube API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // 统一返回格式
    let responseData = {
      success: true,
      videos: data.items || [],
      total: data.pageInfo?.totalResults || 0,
      query: query,
      source: 'youtube'
    };

    // 新增：应用过滤（成人 + 赌博关键词）
    if (shouldFilter) {
      responseData.videos = filterSensitiveContent(
        responseData.videos.map((v: any) => ({
          ...v,
          title: v.snippet?.title,
          description: v.snippet?.description  // 临时映射以兼容过滤函数（检查 title 和 description）
        })),
        true
      ).map((v: any) => ({ ...v, snippet: { ...v.snippet, title: v.title, description: v.description } }));  // 还原结构
      responseData.total = responseData.videos.length;
    }

    // 服务端直接保存到数据库
    try {
      await db.setCache(cacheKey, responseData, YOUTUBE_CACHE_TIME);
      console.log(`💾 YouTube搜索API结果已缓存(数据库): "${query}" - ${responseData.videos.length} 个结果, TTL: ${YOUTUBE_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('YouTube搜索缓存保存失败:', cacheError);
    }

    console.log(`✅ YouTube搜索完成: "${query}" - ${responseData.videos.length} 个结果`);
    return NextResponse.json(responseData);
    
  } catch (error) {
    console.error('YouTube搜索失败:', error);
    
    // API失败时返回模拟数据作为备用
    const fallbackResults = mockSearchResults.slice(0, 10).map(video => ({
      ...video,
      snippet: {
        ...video.snippet,
        title: `${query} - ${video.snippet.title}`,
      }
    }));

    // 新增：对 fallback 也应用过滤
    let fallbackData = {
      success: true,
      videos: fallbackResults,
      total: fallbackResults.length,
      query: query,
      source: 'fallback'
    };

    if (shouldFilter) {
      fallbackData.videos = filterSensitiveContent(
        fallbackData.videos.map((v: any) => ({
          ...v,
          title: v.snippet?.title,
          description: v.snippet?.description
        })),
        true
      ).map((v: any) => ({ ...v, snippet: { ...v.snippet, title: v.title, description: v.description } }));
      fallbackData.total = fallbackData.videos.length;
    }

    // 失败情况的缓存时间设短一点，避免长时间缓存错误状态
    try {
      const fallbackCacheKey = `youtube-search-fallback-${query}`;
      await db.setCache(fallbackCacheKey, fallbackData, 5 * 60); // 5分钟
      console.log(`💾 YouTube搜索备用结果已缓存(数据库): "${query}" - ${fallbackData.videos.length} 个结果, TTL: 5分钟`);
    } catch (cacheError) {
      console.warn('YouTube搜索备用缓存保存失败:', cacheError);
    }
    
    return NextResponse.json(fallbackData);
  }
}