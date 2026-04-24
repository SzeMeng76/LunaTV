/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getSpiderJar, getSpiderStatus } from '@/lib/spiderJar';
import { detectNetworkEnvironment } from '@/lib/networkDetection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 智能TVBox健康检查API
 * 提供全面的诊断信息和优化建议，解决 spider unreachable 问题
 */

// 测试单个URL的可达性
async function testUrlReachability(
  url: string,
  timeoutMs = 8000
): Promise<{
  success: boolean;
  responseTime: number;
  statusCode?: number;
  error?: string;
  size?: number;
}> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'LunaTV-HealthCheck/1.0',
        Accept: '*/*',
        'Cache-Control': 'no-cache',
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const contentLength = response.headers.get('content-length');
      return {
        success: true,
        responseTime,
        statusCode: response.status,
        size: contentLength ? parseInt(contentLength) : undefined,
      };
    } else {
      return {
        success: false,
        responseTime,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      responseTime,
      error: error.message || 'Network error',
    };
  }
}

// 生成针对性的优化建议
function generateRecommendations(
  networkEnv: any,
  spiderStatus: any,
  testResults: any[]
): string[] {
  const recommendations: string[] = [];

  // 基于网络环境的建议
  if (networkEnv.isDomestic) {
    recommendations.push('🏠 检测到国内网络环境，已优化JAR源选择策略');

    const successfulDomesticSources = testResults.filter(
      (r) =>
        r.success &&
        (r.url.includes('ghproxy.vip') ||
          r.url.includes('gh-proxy.com') ||
          r.url.includes('cors.isteed.cc'))
    );

    if (successfulDomesticSources.length === 0) {
      recommendations.push(
        '⚠️ 国内优化源不可用，建议检查网络连接或尝试使用代理'
      );
    } else {
      recommendations.push(
        `✅ 找到 ${successfulDomesticSources.length} 个国内可用源，加载速度应该较快`
      );
    }
  } else {
    recommendations.push('🌍 检测到国际网络环境，已启用GitHub直连');

    const successfulGitHubSources = testResults.filter(
      (r) => r.success && r.url.includes('githubusercontent.com')
    );

    if (successfulGitHubSources.length === 0) {
      recommendations.push('⚠️ GitHub源不可用，建议检查DNS设置或网络防火墙');
    }
  }

  // 基于Spider状态的建议
  if (!spiderStatus?.success) {
    recommendations.push(
      '🔧 当前使用备用JAR，功能可能受限，建议重试或联系管理员'
    );
  } else if (spiderStatus.tried > 3) {
    recommendations.push(
      '📡 多个源尝试后才成功，建议检查网络稳定性或切换网络环境'
    );
  } else {
    recommendations.push('✅ Spider JAR加载正常，配置应该可以正常使用');
  }

  // 基于响应时间的建议
  const successfulTests = testResults.filter((r) => r.success);
  if (successfulTests.length > 0) {
    const avgResponseTime =
      successfulTests.reduce((sum, r) => sum + r.responseTime, 0) /
      successfulTests.length;

    if (avgResponseTime > 3000) {
      recommendations.push(
        '🐌 网络响应较慢，建议选择延迟较低的网络或使用有线连接'
      );
    } else if (avgResponseTime < 1000) {
      recommendations.push('🚀 网络响应良好，配置加载应该很流畅');
    }
  }

  // TVBox特定建议
  recommendations.push('📱 建议在TVBox中启用"智能解析"和"自动重试"选项');
  recommendations.push('🔄 如遇到加载问题，可尝试在TVBox中手动刷新配置');

  return recommendations;
}

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();

    // 检测网络环境
    const networkEnv = detectNetworkEnvironment(request);
    console.log('[SmartHealth] 网络环境:', networkEnv);

    // 获取当前Spider状态
    const spiderStatus = getSpiderStatus();

    // 强制刷新获取最新JAR状态
    const freshSpider = await getSpiderJar(true);

    // 测试关键源的可达性（使用实际验证过的源）
    const testSources = [
      'https://ghproxy.vip/https://raw.githubusercontent.com/FongMi/CatVodSpider/main/jar/custom_spider.jar',
      'https://gh-proxy.com/https://raw.githubusercontent.com/FongMi/CatVodSpider/main/jar/custom_spider.jar',
      'https://raw.githubusercontent.com/FongMi/CatVodSpider/main/jar/custom_spider.jar',
      'https://raw.githubusercontent.com/qlql765/CatVodTVSpider-by-zhixc/main/jar/custom_spider.jar',
      'https://raw.githubusercontent.com/gaotianliuyun/gao/master/jar/custom_spider.jar',
      'https://cors.isteed.cc/github.com/FongMi/CatVodSpider/raw/main/jar/custom_spider.jar',
    ];

    // 并发测试多个源的可达性
    const reachabilityTests = await Promise.allSettled(
      testSources.map(async (url) => ({
        url,
        ...(await testUrlReachability(url, 10000)),
      }))
    );

    const testResults = reachabilityTests
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<{
          success: boolean;
          responseTime: number;
          statusCode?: number;
          error?: string;
          size?: number;
          url: string;
        }> => result.status === 'fulfilled'
      )
      .map((result) => result.value);

    // 生成智能建议
    const recommendations = generateRecommendations(
      networkEnv,
      spiderStatus,
      testResults
    );

    // 计算总体健康分数
    const successfulTests = testResults.filter((r) => r.success).length;
    const healthScore = Math.round(
      (successfulTests / testSources.length) * 100
    );

    const response = {
      success: true,
      timestamp: Date.now(),
      executionTime: Date.now() - startTime,

      // 网络环境信息
      network: {
        environment: networkEnv.isDomestic ? 'domestic' : 'international',
        region: networkEnv.region,
        detectionMethod: networkEnv.detectionMethod,
        optimized: true,
      },

      // Spider JAR 状态
      spider: {
        current: {
          success: freshSpider.success,
          source: freshSpider.source,
          size: freshSpider.size,
          md5: freshSpider.md5,
          cached: freshSpider.cached,
          tried_sources: freshSpider.tried,
        },
        cached: spiderStatus,
      },

      // 可达性测试结果
      reachability: {
        total_tested: testSources.length,
        successful: successfulTests,
        health_score: healthScore,
        tests: testResults,
      },

      // 智能建议
      recommendations,

      // 状态评估
      status: {
        overall:
          healthScore >= 75
            ? 'excellent'
            : healthScore >= 50
            ? 'good'
            : 'needs_attention',
        spider_available: freshSpider.success,
        network_stable: successfulTests >= 2,
        recommendations_count: recommendations.length,
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[SmartHealth] 错误:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Health check failed',
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
