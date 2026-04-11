/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getUserRegion } from '@/lib/networkDetection';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * JAR 源修复和验证 API
 * 专门用于诊断和修复 JAR 加载问题
 */

// 验证通过的稳定 JAR 源列表（2026-03-31 测试 - 已验证文件头）
const VERIFIED_JAR_SOURCES = [
  {
    url: 'https://ghproxy.vip/https://raw.githubusercontent.com/FongMi/CatVodSpider/main/jar/custom_spider.jar',
    name: 'ghproxy.vip国内CDN',
    region: 'domestic',
    priority: 1,
  },
  {
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/FongMi/CatVodSpider/main/jar/custom_spider.jar',
    name: 'gh-proxy国内CDN',
    region: 'domestic',
    priority: 2,
  },
  {
    url: 'https://raw.githubusercontent.com/FongMi/CatVodSpider/main/jar/custom_spider.jar',
    name: 'GitHub-FongMi官方',
    region: 'international',
    priority: 1,
  },
  {
    url: 'https://raw.githubusercontent.com/qlql765/CatVodTVSpider-by-zhixc/main/jar/custom_spider.jar',
    name: 'GitHub-qlql765镜像',
    region: 'international',
    priority: 2,
  },
  {
    url: 'https://raw.githubusercontent.com/gaotianliuyun/gao/master/jar/custom_spider.jar',
    name: 'GitHub-gaotianliuyun备份',
    region: 'international',
    priority: 2,
  },
  {
    url: 'https://cors.isteed.cc/github.com/FongMi/CatVodSpider/raw/main/jar/custom_spider.jar',
    name: 'CORS代理源',
    region: 'proxy',
    priority: 3,
  },
];

// 测试单个JAR源
async function testJarSource(source: any): Promise<{
  url: string;
  name: string;
  success: boolean;
  responseTime: number;
  size?: number;
  error?: string;
  statusCode?: number;
}> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const userAgent =
      source.region === 'domestic'
        ? DEFAULT_USER_AGENT
        : 'LunaTV-JarTest/1.0';

    const response = await fetch(source.url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: '*/*',
        'Cache-Control': 'no-cache',
        Connection: 'close',
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength) : undefined;

      return {
        url: source.url,
        name: source.name,
        success: true,
        responseTime,
        size,
        statusCode: response.status,
      };
    } else {
      return {
        url: source.url,
        name: source.name,
        success: false,
        responseTime,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      url: source.url,
      name: source.name,
      success: false,
      responseTime,
      error: error.message || 'Network error',
    };
  }
}

// 生成修复建议
function generateFixRecommendations(
  testResults: any[],
  userRegion: string
): {
  immediate: string[];
  configuration: string[];
  troubleshooting: string[];
} {
  const successful = testResults.filter((r) => r.success);
  const failed = testResults.filter((r) => !r.success);

  const immediate: string[] = [];
  const configuration: string[] = [];
  const troubleshooting: string[] = [];

  if (successful.length === 0) {
    immediate.push('🚨 所有JAR源均不可用，建议立即检查网络连接');
    immediate.push('🔧 临时解决方案：清除TVBox应用数据并重新导入配置');

    troubleshooting.push('检查设备网络连接是否正常');
    troubleshooting.push('尝试切换WiFi网络或使用移动数据');
    troubleshooting.push(
      '检查路由器DNS设置，建议使用 8.8.8.8 或 114.114.114.114'
    );
    troubleshooting.push('如使用代理，请确认代理服务器正常工作');
  } else if (successful.length < 3) {
    immediate.push('⚠️ 部分JAR源可用，但稳定性不足');
    immediate.push('📡 建议优化网络环境以提高成功率');
  } else {
    immediate.push('✅ 多个JAR源可用，配置应该能正常加载');
  }

  // 基于地区的配置建议
  if (userRegion === 'domestic') {
    configuration.push('🏠 检测到国内网络，推荐使用以下配置参数：');
    configuration.push('- 启用"国内优化"模式');
    configuration.push('- DNS设置：114.114.114.114, 223.5.5.5');
    configuration.push('- 如访问GitHub受限，启用代理源');
  } else {
    configuration.push('🌍 国际网络环境，推荐配置：');
    configuration.push('- 使用GitHub直连源');
    configuration.push('- DNS设置：8.8.8.8, 1.1.1.1');
    configuration.push('- 启用HTTP/2和并发连接');
  }

  // TVBox专用建议
  configuration.push('📱 TVBox应用设置建议：');
  configuration.push('- 启用"智能解析"和"并发解析"');
  configuration.push('- 设置"连接超时"为30秒');
  configuration.push('- 启用"自动重试"，重试次数设为3次');
  configuration.push('- 定期清理应用缓存');

  // 针对具体错误的建议
  const has403 = failed.some((f) => f.error?.includes('403'));
  const has404 = failed.some((f) => f.error?.includes('404'));
  const hasTimeout = failed.some(
    (f) => f.error?.includes('timeout') || f.error?.includes('aborted')
  );

  if (has403) {
    troubleshooting.push(
      '403错误：服务器拒绝访问，可能是反爬虫机制，尝试使用代理源'
    );
  }
  if (has404) {
    troubleshooting.push(
      '404错误：JAR文件不存在，该源可能已失效，请使用其他可用源'
    );
  }
  if (hasTimeout) {
    troubleshooting.push(
      '超时错误：网络连接不稳定，建议检查网络质量或切换网络'
    );
  }

  return { immediate, configuration, troubleshooting };
}

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();

    // 检测用户网络环境
    const userRegion = getUserRegion(request);

    console.log(`[JAR-FIX] 开始测试JAR源，检测到用户区域：${userRegion}`);

    // 根据用户区域排序测试源
    const sortedSources = VERIFIED_JAR_SOURCES.sort((a, b) => {
      if (userRegion === 'domestic') {
        if (a.region === 'domestic' && b.region !== 'domestic') return -1;
        if (a.region !== 'domestic' && b.region === 'domestic') return 1;
      } else {
        if (a.region === 'international' && b.region !== 'international')
          return -1;
        if (a.region !== 'international' && b.region === 'international')
          return 1;
      }
      return a.priority - b.priority;
    });

    // 并发测试所有源
    const testPromises = sortedSources.map((source) => testJarSource(source));
    const testResults = await Promise.all(testPromises);

    // 生成修复建议
    const recommendations = generateFixRecommendations(testResults, userRegion);

    // 找出最佳可用源
    const bestSources = testResults
      .filter((r) => r.success)
      .sort((a, b) => a.responseTime - b.responseTime)
      .slice(0, 3);

    const response = {
      success: true,
      timestamp: Date.now(),
      executionTime: Date.now() - startTime,

      // 测试结果概览
      summary: {
        total_tested: testResults.length,
        successful: testResults.filter((r) => r.success).length,
        failed: testResults.filter((r) => !r.success).length,
        user_region: userRegion,
        avg_response_time:
          testResults
            .filter((r) => r.success)
            .reduce((sum, r) => sum + r.responseTime, 0) /
          Math.max(1, testResults.filter((r) => r.success).length),
      },

      // 详细测试结果
      test_results: testResults,

      // 推荐的最佳源
      recommended_sources: bestSources,

      // 分类修复建议
      recommendations,

      // 可直接使用的配置URL
      fixed_config_urls:
        bestSources.length > 0
          ? [
              `${request.nextUrl.origin}/api/tvbox?forceSpiderRefresh=1`,
              `${request.nextUrl.origin}/api/tvbox/config?forceSpiderRefresh=1`,
            ]
          : [],

      // 状态评估
      status: {
        jar_available: bestSources.length > 0,
        network_quality:
          testResults.filter((r) => r.success).length >= 3
            ? 'good'
            : testResults.filter((r) => r.success).length >= 1
            ? 'fair'
            : 'poor',
        needs_troubleshooting: testResults.filter((r) => r.success).length < 2,
      },
    };

    console.log(
      `[JAR-FIX] 测试完成，成功源：${bestSources.length}/${testResults.length}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('[JAR-FIX] 测试过程出错:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'JAR源测试失败',
        message: error instanceof Error ? error.message : '未知错误',
        timestamp: Date.now(),

        emergency_recommendations: [
          '🚨 JAR源测试系统出现问题',
          '🔧 建议手动尝试以下备用配置：',
          '- 清除TVBox应用数据',
          '- 检查网络连接',
          '- 尝试使用其他网络环境',
          '- 联系技术支持获取最新配置',
        ],
      },
      { status: 500 }
    );
  }
}
