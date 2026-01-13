import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

// 视频解析接口配置
interface Parser {
  name: string;
  url: string;
  platforms: string[];
  priority: number; // 优先级，数字越小优先级越高
  timeout?: number; // 超时时间(毫秒)
  status: 'active' | 'inactive' | 'unknown'; // 接口状态
}

// 视频解析接口列表（经过可用性测试，2025年1月更新）
const PARSERS: Parser[] = [
  {
    name: 'M3U8.TV解析',
    url: 'https://jx.m3u8.tv/jiexi/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'bilibili', 'pptv'],
    priority: 1,
    timeout: 15000,
    status: 'active' // ✅ 测试可用，支持多平台
  },
  {
    name: '星空解析',
    url: 'https://jx.xmflv.com/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'bilibili'],
    priority: 2,
    timeout: 15000,
    status: 'active' // ✅ 测试可用，HLS解析
  },
  {
    name: '播放家解析',
    url: 'https://jx.playerjy.com/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'sohu', 'letv'],
    priority: 3,
    timeout: 15000,
    status: 'active' // ✅ 测试可用，支持老平台
  },
  {
    name: '爱豆解析',
    url: 'https://jx.aidouer.net/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'bilibili', 'mgtv'],
    priority: 4,
    timeout: 15000,
    status: 'active' // ✅ 重定向到77flv，可用
  },
  {
    name: '77FLV解析',
    url: 'https://jx.77flv.cc/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'bilibili'],
    priority: 5,
    timeout: 15000,
    status: 'active' // ✅ 多个接口都重定向到这里，应该是可用的
  }
];

// 根据URL识别视频平台
function detectPlatform(url: string): string {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('qq.com') || urlLower.includes('v.qq.com')) return 'qq';
  if (urlLower.includes('iqiyi.com') || urlLower.includes('qiyi.com')) return 'iqiyi';
  if (urlLower.includes('youku.com')) return 'youku';
  if (urlLower.includes('mgtv.com')) return 'mgtv';
  if (urlLower.includes('bilibili.com')) return 'bilibili';
  if (urlLower.includes('sohu.com')) return 'sohu';
  if (urlLower.includes('letv.com') || urlLower.includes('le.com')) return 'letv';
  if (urlLower.includes('pptv.com')) return 'pptv';
  if (urlLower.includes('tudou.com')) return 'tudou';
  if (urlLower.includes('wasu.com')) return 'wasu';
  if (urlLower.includes('1905.com')) return '1905';
  
  return 'unknown';
}

// 检查解析器健康状态
async function checkParserHealth(parser: Parser): Promise<boolean> {
  try {
    const testUrl = 'https://v.qq.com/x/page/test.html';
    const parseUrl = parser.url + encodeURIComponent(testUrl);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), parser.timeout || 5000);
    
    const response = await fetch(parseUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT
      }
    });
    
    clearTimeout(timeoutId);
    return response.ok || response.status === 405; // 405 Method Not Allowed 也算正常
  } catch (error) {
    console.warn(`解析器 ${parser.name} 健康检查失败:`, error);
    return false;
  }
}

// 获取可用的解析器（优先返回活跃状态的解析器）
function getAvailableParsers(platform: string): Parser[] {
  const filtered = PARSERS.filter(parser => 
    parser.platforms.includes(platform) || platform === 'unknown'
  );
  
  // 按优先级和状态排序：active > unknown > inactive，同级别按priority排序
  return filtered.sort((a, b) => {
    // 状态权重：active=0, unknown=1, inactive=2
    const statusWeight = { active: 0, unknown: 1, inactive: 2 };
    const aWeight = statusWeight[a.status];
    const bWeight = statusWeight[b.status];
    
    if (aWeight !== bWeight) {
      return aWeight - bWeight;
    }
    
    // 状态相同时按优先级排序
    return a.priority - b.priority;
  });
}

// 批量检查所有解析器健康状态（后台任务）
async function updateParsersHealth() {
  const healthChecks = PARSERS.map(async (parser) => {
    const isHealthy = await checkParserHealth(parser);
    parser.status = isHealthy ? 'active' : 'inactive';
    return { name: parser.name, status: parser.status, isHealthy };
  });
  
  const results = await Promise.allSettled(healthChecks);
  console.log('解析器健康检查结果:', results);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const parser = searchParams.get('parser');
    const format = searchParams.get('format') || 'json';
    const healthCheck = searchParams.get('health_check') === 'true';

    // 如果是健康检查请求
    if (healthCheck) {
      await updateParsersHealth();
      return NextResponse.json({
        success: true,
        data: {
          parsers: PARSERS.map(p => ({
            name: p.name,
            status: p.status,
            priority: p.priority,
            platforms: p.platforms
          })),
          timestamp: new Date().toISOString()
        }
      });
    }

    if (!url) {
      return NextResponse.json(
        { error: '缺少必需参数: url' },
        { status: 400 }
      );
    }

    // 检测视频平台
    const platform = detectPlatform(url);
    const availableParsers = getAvailableParsers(platform);

    if (availableParsers.length === 0) {
      return NextResponse.json({
        success: false,
        error: '该平台暂不支持解析',
        data: {
          original_url: url,
          platform: platform,
          available_parsers: []
        }
      });
    }

    // 选择解析器
    let selectedParser;
    if (parser) {
      selectedParser = availableParsers.find(p => p.name === parser);
      if (!selectedParser) {
        return NextResponse.json({
          success: false,
          error: '指定的解析器不存在或不支持该平台',
          data: {
            original_url: url,
            platform: platform,
            available_parsers: availableParsers.map(p => p.name)
          }
        });
      }
    } else {
      // 使用第一个可用的解析器
      selectedParser = availableParsers[0];
    }

    const parseUrl = selectedParser.url + encodeURIComponent(url);

    // 根据format参数返回不同格式
    switch (format) {
      case 'redirect':
        // 直接重定向到解析地址
        return NextResponse.redirect(parseUrl);
        
      case 'iframe': {
        // 返回可嵌入的iframe HTML
        const iframeHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>视频解析 - LunaTV</title>
    <style>
        body { margin: 0; padding: 0; background: #000; }
        iframe { width: 100vw; height: 100vh; border: none; }
    </style>
</head>
<body>
    <iframe src="${parseUrl}" allowfullscreen></iframe>
</body>
</html>`;
        return new NextResponse(iframeHtml, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
        
      case 'json':
      default:
        // 返回JSON格式的解析信息
        return NextResponse.json({
          success: true,
          data: {
            original_url: url,
            platform: platform,
            parse_url: parseUrl,
            parser_name: selectedParser.name,
            available_parsers: availableParsers.map(p => p.name)
          }
        }, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Cache-Control': 'public, max-age=300'
          }
        });
    }

  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: '视频解析服务异常', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

// 支持CORS预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}