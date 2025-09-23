import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { ClientCache } from '@/lib/client-cache';
import { db } from '@/lib/db';
import { DatabaseCacheManager } from '@/lib/database-cache';

export const runtime = 'nodejs';

// 缓存统计接口
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 只有站长(owner)可以访问缓存管理
  if (authInfo.username !== process.env.USERNAME) {
    return NextResponse.json({ error: 'Forbidden: Owner access required' }, { status: 403 });
  }

  try {
    // 添加调试信息
    console.log('🔍 开始获取缓存统计...');
    
    // 检查存储类型
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    console.log('🔍 存储类型:', storageType);
    
    // 如果是 Upstash，直接测试连接
    if (storageType === 'upstash') {
      const storage = (db as any).storage;
      console.log('🔍 存储实例存在:', !!storage);
      console.log('🔍 存储实例类型:', storage?.constructor?.name);
      console.log('🔍 withRetry方法:', typeof storage?.withRetry);
      console.log('🔍 client存在:', !!storage?.client);
      console.log('🔍 client.keys方法:', typeof storage?.client?.keys);
      console.log('🔍 client.mget方法:', typeof storage?.client?.mget);
      
      if (storage && storage.client) {
        try {
          console.log('🔍 测试获取所有cache:*键...');
          const allKeys = await storage.withRetry(() => storage.client.keys('cache:*'));
          console.log('🔍 找到的键:', allKeys.length, allKeys.slice(0, 5));
          
          if (allKeys.length > 0) {
            console.log('🔍 测试获取第一个键的值...');
            const firstValue = await storage.withRetry(() => storage.client.get(allKeys[0]));
            console.log('🔍 第一个值的类型:', typeof firstValue);
            console.log('🔍 第一个值的长度:', typeof firstValue === 'string' ? firstValue.length : 'N/A');
          }
        } catch (debugError) {
          console.error('🔍 调试测试失败:', debugError);
        }
      }
    }
    
    const stats = await getCacheStats();
    return NextResponse.json({
      success: true,
      data: stats,
      debug: {
        storageType,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('获取缓存统计失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '获取缓存统计失败' 
    }, { status: 500 });
  }
}

// 缓存清理接口
export async function DELETE(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // 只有站长(owner)可以访问缓存管理
  if (authInfo.username !== process.env.USERNAME) {
    return NextResponse.json({ error: 'Forbidden: Owner access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cacheType = searchParams.get('type'); // all, douban, shortdrama, danmu, netdisk, youtube, search
  
  try {
    let clearedCount = 0;
    let message = '';

    switch (cacheType) {
      case 'douban':
        clearedCount = await clearDoubanCache();
        message = `已清理 ${clearedCount} 个豆瓣缓存项`;
        break;

      case 'shortdrama':
        clearedCount = await clearShortdramaCache();
        message = `已清理 ${clearedCount} 个短剧缓存项`;
        break;

      case 'tmdb':
        clearedCount = await clearTmdbCache();
        message = `已清理 ${clearedCount} 个TMDB缓存项`;
        break;

      case 'danmu':
        clearedCount = await clearDanmuCache();
        message = `已清理 ${clearedCount} 个弹幕缓存项`;
        break;
      
      case 'netdisk':
        clearedCount = await clearNetdiskCache();
        message = `已清理 ${clearedCount} 个网盘搜索缓存项`;
        break;
      
      case 'youtube':
        clearedCount = await clearYouTubeCache();
        message = `已清理 ${clearedCount} 个YouTube搜索缓存项`;
        break;
      
      case 'search':
        clearedCount = await clearSearchCache();
        message = `已清理 ${clearedCount} 个搜索缓存项`;
        break;
      
      case 'expired':
        clearedCount = await clearExpiredCache();
        message = `已清理 ${clearedCount} 个过期缓存项`;
        break;
      
      case 'all':
        clearedCount = await clearAllCache();
        message = `已清理 ${clearedCount} 个缓存项`;
        break;
      
      default:
        return NextResponse.json({ 
          success: false, 
          error: '无效的缓存类型' 
        }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        clearedCount,
        message
      }
    });

  } catch (error) {
    console.error('清理缓存失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '清理缓存失败' 
    }, { status: 500 });
  }
}

// 获取缓存统计信息
async function getCacheStats() {
  console.log('📊 开始获取缓存统计信息...');

  // 直接使用数据库统计（支持KVRocks/Upstash/Redis）
  const dbStats = await DatabaseCacheManager.getSimpleCacheStats();
  
  if (!dbStats) {
    console.warn('⚠️ 数据库缓存统计失败，返回空统计');
    return {
      douban: { count: 0, size: 0, types: {} },
      shortdrama: { count: 0, size: 0, types: {} },
      tmdb: { count: 0, size: 0, types: {} },
      danmu: { count: 0, size: 0 },
      netdisk: { count: 0, size: 0 },
      youtube: { count: 0, size: 0 },
      search: { count: 0, size: 0 },
      other: { count: 0, size: 0 },
      total: { count: 0, size: 0 },
      timestamp: new Date().toISOString(),
      source: 'failed',
      note: '数据库统计失败',
      formattedSizes: {
        douban: '0 B',
        shortdrama: '0 B',
        tmdb: '0 B',
        danmu: '0 B',
        netdisk: '0 B',
        youtube: '0 B',
        search: '0 B',
        other: '0 B',
        total: '0 B'
      }
    };
  }
  
  console.log(`✅ 缓存统计获取完成: 总计 ${dbStats.total.count} 项`);
  return dbStats;
}

// 清理豆瓣缓存
async function clearDoubanCache(): Promise<number> {
  let clearedCount = 0;
  
  // 清理数据库中的豆瓣缓存
  const dbCleared = await DatabaseCacheManager.clearCacheByType('douban');
  clearedCount += dbCleared;

  // 清理localStorage中的豆瓣缓存（兜底）
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith('douban-') || key.startsWith('bangumi-')
    );
    keys.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    console.log(`🗑️ localStorage中清理了 ${keys.length} 个豆瓣缓存项`);
  }

  return clearedCount;
}

// 清理短剧缓存
async function clearShortdramaCache(): Promise<number> {
  let clearedCount = 0;

  // 清理数据库中的短剧缓存
  const dbCleared = await DatabaseCacheManager.clearCacheByType('shortdrama');
  clearedCount += dbCleared;

  // 清理localStorage中的短剧缓存（兜底）
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage).filter(key =>
      key.startsWith('shortdrama-')
    );
    keys.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    console.log(`🗑️ localStorage中清理了 ${keys.length} 个短剧缓存项`);
  }

  return clearedCount;
}

// 清理TMDB缓存
async function clearTmdbCache(): Promise<number> {
  let clearedCount = 0;

  // 清理数据库中的TMDB缓存
  const dbCleared = await DatabaseCacheManager.clearCacheByType('tmdb');
  clearedCount += dbCleared;

  // 清理localStorage中的TMDB缓存（兜底）
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage).filter(key =>
      key.startsWith('tmdb-')
    );
    keys.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    console.log(`🗑️ localStorage中清理了 ${keys.length} 个TMDB缓存项`);
  }

  return clearedCount;
}

// 清理弹幕缓存
async function clearDanmuCache(): Promise<number> {
  let clearedCount = 0;
  
  // 清理数据库中的弹幕缓存
  const dbCleared = await DatabaseCacheManager.clearCacheByType('danmu');
  clearedCount += dbCleared;

  // 清理localStorage中的弹幕缓存（兜底）
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith('danmu-cache') || key === 'lunatv_danmu_cache'
    );
    keys.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    console.log(`🗑️ localStorage中清理了 ${keys.length} 个弹幕缓存项`);
  }

  return clearedCount;
}

// 清理YouTube缓存
async function clearYouTubeCache(): Promise<number> {
  let clearedCount = 0;
  
  // 清理数据库中的YouTube缓存
  const dbCleared = await DatabaseCacheManager.clearCacheByType('youtube');
  clearedCount += dbCleared;

  // 清理localStorage中的YouTube缓存（兜底）
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith('youtube-search')
    );
    keys.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    console.log(`🗑️ localStorage中清理了 ${keys.length} 个YouTube搜索缓存项`);
  }

  return clearedCount;
}

// 清理网盘搜索缓存
async function clearNetdiskCache(): Promise<number> {
  let clearedCount = 0;
  
  // 清理数据库中的网盘缓存
  const dbCleared = await DatabaseCacheManager.clearCacheByType('netdisk');
  clearedCount += dbCleared;

  // 清理localStorage中的网盘缓存（兜底）
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith('netdisk-search')
    );
    keys.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    console.log(`🗑️ localStorage中清理了 ${keys.length} 个网盘搜索缓存项`);
  }

  return clearedCount;
}

// 清理搜索缓存（直接调用数据库，因为search类型已从DatabaseCacheManager中移除）
async function clearSearchCache(): Promise<number> {
  let clearedCount = 0;
  
  try {
    // 直接清理数据库中的search-和cache-前缀缓存
    await db.clearExpiredCache('search-');
    await db.clearExpiredCache('cache-');
    console.log('🗑️ 搜索缓存清理完成');
    clearedCount = 1; // 标记操作已执行
  } catch (error) {
    console.error('清理搜索缓存失败:', error);
  }

  // 清理localStorage中的搜索缓存（兜底）
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith('search-') || key.startsWith('cache-')
    );
    keys.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    console.log(`🗑️ localStorage中清理了 ${keys.length} 个搜索缓存项`);
  }

  return clearedCount;
}

// 清理过期缓存
async function clearExpiredCache(): Promise<number> {
  let clearedCount = 0;
  
  // 清理数据库中的过期缓存
  const dbCleared = await DatabaseCacheManager.clearExpiredCache();
  clearedCount += dbCleared;

  // 清理localStorage中的过期缓存（兜底）
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage);
    const now = Date.now();
    
    keys.forEach(key => {
      try {
        const data = localStorage.getItem(key);
        if (!data) return;
        
        const parsed = JSON.parse(data);
        
        // 检查是否有过期时间字段
        if (parsed.expire && now > parsed.expire) {
          localStorage.removeItem(key);
          clearedCount++;
        } else if (parsed.timestamp && parsed.expireSeconds) {
          const expireTime = parsed.timestamp + (parsed.expireSeconds * 1000);
          if (now > expireTime) {
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
      } catch (error) {
        // 数据格式错误，清理掉
        localStorage.removeItem(key);
        clearedCount++;
      }
    });
    
    console.log(`🗑️ localStorage中清理了 ${clearedCount - dbCleared} 个过期缓存项`);
  }

  return clearedCount;
}

// 清理所有缓存
async function clearAllCache(): Promise<number> {
  const doubanCount = await clearDoubanCache();
  const shortdramaCount = await clearShortdramaCache();
  const tmdbCount = await clearTmdbCache();
  const danmuCount = await clearDanmuCache();
  const netdiskCount = await clearNetdiskCache();
  const youtubeCount = await clearYouTubeCache();
  const searchCount = await clearSearchCache();

  return doubanCount + shortdramaCount + tmdbCount + danmuCount + netdiskCount + youtubeCount + searchCount;
}

// 格式化字节大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}