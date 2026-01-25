/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import { NextRequest, NextResponse } from 'next/server';

import { API_CONFIG, getConfig } from '@/lib/config';
import { getAdminRoleFromRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const role = await getAdminRoleFromRequest(request);
  if (!role) {
    return NextResponse.json({ error: '你没有权限访问源检测功能' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const sourceKey = searchParams.get('source');

  if (!query || !sourceKey) {
    return NextResponse.json(
      { error: '缺少必要参数: q (查询关键词) 和 source (源标识)' },
      { status: 400 }
    );
  }

  try {
    // 🔑 使用 getAvailableApiSites() 获取源列表，自动应用代理配置
    // 注意：source-test 需要测试所有源（包括禁用的），所以直接用 getConfig
    const config = await getConfig();

    // 先从原始配置查找源（支持测试禁用的源）
    const sourceFromConfig = config.SourceConfig.find(
      (s: any) => s.key === sourceKey
    );

    if (!sourceFromConfig) {
      return NextResponse.json(
        { error: `未找到源: ${sourceKey}` },
        { status: 404 }
      );
    }

    // 🔑 应用视频代理配置到单个源
    let targetSource = sourceFromConfig;
    const proxyConfig = config.VideoProxyConfig;

    if (proxyConfig?.enabled && proxyConfig.proxyUrl) {
      const proxyBaseUrl = proxyConfig.proxyUrl.replace(/\/$/, '');
      let realApiUrl = sourceFromConfig.api;

      // 提取真实 API URL（移除旧代理）
      const urlMatch = realApiUrl.match(/[?&]url=([^&]+)/);
      if (urlMatch) {
        realApiUrl = decodeURIComponent(urlMatch[1]);
      }

      // 提取 source ID
      const extractSourceId = (apiUrl: string): string => {
        try {
          const url = new URL(apiUrl);
          const hostname = url.hostname;
          const parts = hostname.split('.');

          if (parts.length >= 3 && (parts[0] === 'caiji' || parts[0] === 'api' || parts[0] === 'cj' || parts[0] === 'www')) {
            return parts[parts.length - 2].toLowerCase().replace(/[^a-z0-9]/g, '');
          }

          let name = parts[0].toLowerCase();
          name = name.replace(/zyapi$/, '').replace(/zy$/, '').replace(/api$/, '');
          return name.replace(/[^a-z0-9]/g, '') || 'source';
        } catch {
          return sourceFromConfig.key || sourceFromConfig.name.replace(/[^a-z0-9]/g, '');
        }
      };

      const sourceId = extractSourceId(realApiUrl);
      const proxiedApi = `${proxyBaseUrl}/p/${sourceId}?url=${encodeURIComponent(realApiUrl)}`;

      targetSource = {
        ...sourceFromConfig,
        api: proxiedApi,
      };

      console.log(`[Source Test] Applied proxy to ${sourceFromConfig.name}`);
    }

    // 构建搜索URL（使用 videolist 更符合多数源的搜索接口）
    const searchUrl = `${targetSource.api}?ac=videolist&wd=${encodeURIComponent(query)}`;

    // 直接请求源接口，不使用缓存
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

    try {
      const startedAt = Date.now();
      const response = await fetch(searchUrl, {
        headers: API_CONFIG.search.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return NextResponse.json(
          {
            error: `源接口返回错误: HTTP ${response.status}`,
            sourceError: `${response.status} ${response.statusText}`,
            sourceUrl: searchUrl,
          },
          { status: response.status }
        );
      }

      const data = await response.json();

      // 检查接口返回的数据格式
      if (!data || typeof data !== 'object') {
        return NextResponse.json(
          {
            error: '源接口返回数据格式错误',
            sourceError: '返回数据不是有效的JSON对象',
            sourceUrl: searchUrl,
          },
          { status: 502 }
        );
      }

      // 检查是否有错误信息
      if (data.code && data.code !== 1) {
        return NextResponse.json(
          {
            error: `源接口返回错误: ${data.msg || '未知错误'}`,
            sourceError: data.msg || `错误代码: ${data.code}`,
            sourceUrl: searchUrl,
          },
          { status: 502 }
        );
      }

      // 提取搜索结果
      const results = data.list || data.data || [];

      // 质量与性能指标
      const durationMs = Date.now() - startedAt;
      const resultCount = Array.isArray(results) ? results.length : 0;
      const lowerQ = (query || '').toLowerCase();
      const matched = Array.isArray(results)
        ? results.filter((item: any) =>
            String(item.vod_name || item.title || '')
              .toLowerCase()
              .includes(lowerQ)
          )
        : [];
      const matchRate = resultCount > 0 ? matched.length / resultCount : 0;
      const topMatches = matched
        .slice(0, 3)
        .map((it: any) => it.vod_name || it.title || '');

      return NextResponse.json({
        success: true,
        source: sourceKey,
        sourceName: targetSource.name || sourceKey,
        sourceUrl: searchUrl,
        results: results,
        total: resultCount,
        disabled: targetSource.disabled || false,
        // 新增：性能/质量指标
        durationMs,
        resultCount,
        matchRate,
        topMatches,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          {
            error: '请求超时 (15秒)',
            sourceError: '连接超时',
            sourceUrl: searchUrl,
          },
          { status: 408 }
        );
      }

      return NextResponse.json(
        {
          error: `网络请求失败: ${fetchError.message}`,
          sourceError: fetchError.message,
          sourceUrl: searchUrl,
        },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error('源测试API错误:', error);
    return NextResponse.json(
      {
        error: `服务器内部错误: ${error.message}`,
        sourceError: error.message,
      },
      { status: 500 }
    );
  }
}
