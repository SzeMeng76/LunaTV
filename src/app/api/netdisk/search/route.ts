import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { filterSensitiveContent } from '@/lib/filter';  // 新增：引入统一过滤函数

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: '搜索关键词不能为空' }, { status: 400 });
  }

  const config = await getConfig();
  const netDiskConfig = config.NetDiskConfig;

  // 检查是否启用网盘搜索 - 必须在缓存检查之前
  if (!netDiskConfig?.enabled) {
    return NextResponse.json({ error: '网盘搜索功能未启用' }, { status: 400 });
  }

  if (!netDiskConfig?.pansouUrl) {
    return NextResponse.json({ error: 'PanSou服务地址未配置' }, { status: 400 });
  }

  const shouldFilter = !config.SiteConfig.DisableYellowFilter;  // 新增：确定是否过滤

  // 网盘搜索缓存：30分钟
  const NETDISK_CACHE_TIME = 30 * 60; // 30分钟（秒）
  const enabledCloudTypesStr = (netDiskConfig.enabledCloudTypes || []).sort().join(',');
  // 缓存key包含功能状态，确保功能开启/关闭时缓存隔离
  const cacheKey = `netdisk-search-enabled-${query}-${enabledCloudTypesStr}`;
  
  console.log(`🔍 检查网盘搜索缓存: ${cacheKey}`);
  
  // 服务端直接调用数据库（不用ClientCache，避免HTTP循环调用）
  try {
    const cached = await db.getCache(cacheKey);
    if (cached) {
      console.log(`✅ 网盘搜索缓存命中(数据库): "${query}" (${enabledCloudTypesStr})`);
      // 新增：即使是缓存结果，也应用过滤（以防旧缓存未过滤）
      if (shouldFilter && cached.data?.merged_by_type) {
        // 假设 merged_by_type 是对象，值是数组结果
        Object.keys(cached.data.merged_by_type).forEach(key => {
          cached.data.merged_by_type[key] = filterSensitiveContent(
            cached.data.merged_by_type[key],
            true
          );
        });
        cached.data.total = Object.values(cached.data.merged_by_type).reduce(
          (sum: number, arr: any[]) => sum + (arr.length || 0),
          0
        );
      }
      return NextResponse.json({
        ...cached,
        fromCache: true,
      });
    }
  } catch (cacheError) {
    console.warn('网盘搜索缓存检查失败:', cacheError);
  }

  // 没有缓存，进行实际搜索
  console.log(`🌐 执行网盘搜索: "${query}"`);

  const controller = new AbortController();
  const signal = controller.signal;
  const timeout = setTimeout(() => controller.abort(), 30000);  // 30秒超时

  try {
    const pansouResponse = await fetch(netDiskConfig.pansouUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal,
      body: JSON.stringify({
        kw: query,
        res: 'merge',
        cloud_types: netDiskConfig.enabledCloudTypes || ['baidu', 'aliyun', 'quark', 'tianyi', 'uc']
      })
    });

    clearTimeout(timeout);

    if (!pansouResponse.ok) {
      throw new Error(`PanSou服务响应错误: ${pansouResponse.status} ${pansouResponse.statusText}`);
    }

    const result = await pansouResponse.json();
    
    // 统一返回格式
    let responseData = {
      success: true,
      data: {
        total: result.data?.total || 0,
        merged_by_type: result.data?.merged_by_type || {},
        source: 'pansou',
        query: query,
        timestamp: new Date().toISOString()
      }
    };

    // 新增：应用过滤
    if (shouldFilter && responseData.data.merged_by_type) {
      // 假设 merged_by_type 是对象，值是数组结果（每个结果有 title/description 等字段）
      Object.keys(responseData.data.merged_by_type).forEach(key => {
        responseData.data.merged_by_type[key] = filterSensitiveContent(
          responseData.data.merged_by_type[key],
          true
        );
      });
      responseData.data.total = Object.values(responseData.data.merged_by_type).reduce(
        (sum: number, arr: any[]) => sum + (arr.length || 0),
        0
      );
    }

    // 服务端直接保存到数据库（不用ClientCache，避免HTTP循环调用）
    try {
      await db.setCache(cacheKey, responseData, NETDISK_CACHE_TIME);
      console.log(`💾 网盘搜索结果已缓存(数据库): "${query}" - ${responseData.data.total} 个结果, TTL: ${NETDISK_CACHE_TIME}s`);
    } catch (cacheError) {
      console.warn('网盘搜索缓存保存失败:', cacheError);
    }

    console.log(`✅ 网盘搜索完成: "${query}" - ${responseData.data.total} 个结果`);
    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error('网盘搜索失败:', error);
    
    let errorMessage = '网盘搜索失败';
    if (error.name === 'AbortError') {
      errorMessage = '网盘搜索请求超时';
    } else if (error.message) {
      errorMessage = `网盘搜索失败: ${error.message}`;
    }

    return NextResponse.json({ 
      success: false,
      error: errorMessage,
      suggestion: '请检查PanSou服务是否正常运行或联系管理员'
    }, { status: 500 });
  }
}