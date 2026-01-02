import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * 代理状态检测接口
 *
 * 用于检查 Cloudflare Worker 代理是否正常工作
 * 返回当前代理配置状态和健康状况
 */
export async function GET(request: NextRequest) {
  try {
    const config = await getConfig();

    const tvboxProxyConfig = config.TVBoxProxyConfig;
    const videoProxyConfig = config.VideoProxyConfig;

    // 测试 Worker 连通性
    const testWorkerHealth = async (proxyUrl: string): Promise<{
      healthy: boolean;
      responseTime?: number;
      error?: string
    }> => {
      try {
        const startTime = Date.now();
        const response = await fetch(`${proxyUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000), // 5秒超时
        });
        const responseTime = Date.now() - startTime;

        if (response.ok) {
          return { healthy: true, responseTime };
        } else {
          return { healthy: false, error: `HTTP ${response.status}` };
        }
      } catch (error: any) {
        return {
          healthy: false,
          error: error.message || 'Connection failed'
        };
      }
    };

    // 测试两个代理的健康状况
    const [tvboxHealth, videoHealth] = await Promise.all([
      tvboxProxyConfig?.enabled && tvboxProxyConfig.proxyUrl
        ? testWorkerHealth(tvboxProxyConfig.proxyUrl)
        : Promise.resolve({ healthy: false, error: 'Not enabled' }),
      videoProxyConfig?.enabled && videoProxyConfig.proxyUrl
        ? testWorkerHealth(videoProxyConfig.proxyUrl)
        : Promise.resolve({ healthy: false, error: 'Not enabled' }),
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tvboxProxy: {
        enabled: tvboxProxyConfig?.enabled ?? false,
        proxyUrl: tvboxProxyConfig?.proxyUrl || null,
        health: tvboxHealth,
      },
      videoProxy: {
        enabled: videoProxyConfig?.enabled ?? false,
        proxyUrl: videoProxyConfig?.proxyUrl || null,
        health: videoHealth,
      },
    }, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store', // 不缓存状态
      },
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to check proxy status',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
