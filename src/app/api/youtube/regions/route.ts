import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, hasSpecialFeaturePermission } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// YouTube Data API v3 配置
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// 模拟地区数据（当没有真实API Key时使用）
const mockRegions = [
  { id: 'US', name: '美国 (United States)' },
  { id: 'GB', name: '英国 (United Kingdom)' },
  { id: 'JP', name: '日本 (Japan)' },
  { id: 'KR', name: '韩国 (South Korea)' },
  { id: 'TW', name: '台湾 (Taiwan)' },
  { id: 'HK', name: '香港 (Hong Kong)' },
  { id: 'SG', name: '新加坡 (Singapore)' },
  { id: 'MY', name: '马来西亚 (Malaysia)' },
  { id: 'CA', name: '加拿大 (Canada)' },
  { id: 'AU', name: '澳大利亚 (Australia)' },
  { id: 'DE', name: '德国 (Germany)' },
  { id: 'FR', name: '法国 (France)' },
  { id: 'IN', name: '印度 (India)' },
  { id: 'BR', name: '巴西 (Brazil)' },
  { id: 'MX', name: '墨西哥 (Mexico)' }
];

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const username = authInfo.username;

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

    // YouTube地区列表缓存：24小时（地区列表很少变化）
    const YOUTUBE_REGIONS_CACHE_TIME = 24 * 60 * 60; // 24小时（秒）
    const cacheKey = `youtube-regions-${youtubeConfig.enabled}-${youtubeConfig.enableDemo}`;

    console.log(`🔍 检查YouTube地区列表缓存: ${cacheKey}`);

    // 检查缓存
    try {
      const cached = await db.getCache(cacheKey);
      if (cached) {
        console.log(`✅ YouTube地区列表缓存命中(数据库)`);
        return NextResponse.json({
          ...cached,
          fromCache: true,
          cacheSource: 'database',
          cacheTimestamp: new Date().toISOString()
        });
      }

      console.log(`❌ YouTube地区列表缓存未命中`);
    } catch (cacheError) {
      console.warn('YouTube地区列表缓存读取失败:', cacheError);
    }

    // 如果启用演示模式或没有配置API Key，返回模拟数据
    if (youtubeConfig.enableDemo || !youtubeConfig.apiKey) {
      const responseData = {
        success: true,
        regions: mockRegions,
        total: mockRegions.length,
        source: 'demo',
        warning: youtubeConfig.enableDemo ? '当前为演示模式，显示模拟数据' : 'API Key未配置，显示模拟数据。请在管理后台配置YouTube API Key以获取完整地区列表'
      };

      // 保存到缓存
      try {
        await db.setCache(cacheKey, responseData, YOUTUBE_REGIONS_CACHE_TIME);
        console.log(`💾 YouTube地区列表演示结果已缓存(数据库): ${responseData.regions.length} 个地区, TTL: ${YOUTUBE_REGIONS_CACHE_TIME}s`);
      } catch (cacheError) {
        console.warn('YouTube地区列表缓存保存失败:', cacheError);
      }

      return NextResponse.json(responseData);
    }

    // 使用真实的YouTube API获取地区列表
    const regionsUrl = `${YOUTUBE_API_BASE}/i18nRegions?` +
      `key=${youtubeConfig.apiKey}&` +
      `part=snippet`;

    const response = await fetch(regionsUrl);

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

    // 转换API返回的数据格式
    const regions = (data.items || []).map((item: any) => ({
      id: item.id,
      name: item.snippet.name
    }));

    const responseData = {
      success: true,
      regions: regions,
      total: regions.length,
      source: 'youtube'
    };

    // 保存到缓存
    try {
      await db.setCache(cacheKey, responseData, YOUTUBE_REGIONS_CACHE_TIME);
      console.log(`💾 YouTube地区列表API结果已缓存(数据库): ${responseData.regions.length} 个地区, TTL: ${YOUTUBE_REGIONS_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('YouTube地区列表缓存保存失败:', cacheError);
    }

    console.log(`✅ YouTube地区列表获取完成: ${responseData.regions.length} 个地区`);
    return NextResponse.json(responseData);

  } catch (error) {
    console.error('YouTube地区列表获取失败:', error);

    // API失败时返回模拟数据作为备用
    const fallbackData = {
      success: true,
      regions: mockRegions,
      total: mockRegions.length,
      source: 'fallback'
    };

    try {
      const fallbackCacheKey = `youtube-regions-fallback`;
      await db.setCache(fallbackCacheKey, fallbackData, 5 * 60); // 5分钟
      console.log(`💾 YouTube地区列表备用结果已缓存(数据库): ${fallbackData.regions.length} 个地区, TTL: 5分钟`);
    } catch (cacheError) {
      console.warn('YouTube地区列表备用缓存保存失败:', cacheError);
    }

    return NextResponse.json(fallbackData);
  }
}
