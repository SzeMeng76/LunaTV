/**
 * CMS 代理接口 - 解决 Mixed Content 和 CORS 问题
 *
 * 功能：
 * 1. 代理外部 CMS API 请求（HTTP/HTTPS）
 * 2. 解决 HTTPS 页面无法请求 HTTP 资源的问题
 * 3. 解决第三方 API 的 CORS 限制
 * 4. 安全白名单机制，防止被滥用
 * 5. 成人内容源拦截（纵深防御第二层）
 * 6. ☁️ Cloudflare Worker 代理加速（优先使用，失败时降级到本地）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';
import { validateProxyTargetUrl } from '@/lib/proxy-security';

// 使用 Node.js Runtime 以获得更好的网络兼容性
export const runtime = 'nodejs';

// 完整的浏览器请求头伪装
const BROWSER_HEADERS = {
  'User-Agent': DEFAULT_USER_AGENT,
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive',
  'Pragma': 'no-cache',
  'Cache-Control': 'no-cache',
};

// 安全白名单：只允许代理这些合法的 CMS API 模式
const ALLOWED_PATTERNS = [
  /\?ac=class/i,           // 获取分类
  /\?ac=list/i,            // 获取列表
  /\?ac=videolist/i,       // 获取视频列表
  /\?ac=detail/i,          // 获取详情
  /\/api\/vod/i,           // API 路由
  /\/index\.php/i,         // 标准 PHP 入口
  /\/api\.php/i,           // API PHP 入口
  /\/provide\/vod/i,       // 提供接口
];

// CORS 响应头
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'public, max-age=300', // 5分钟缓存
  };
}

// 检查 URL 是否在白名单中
function isUrlAllowed(url: string): boolean {
  return ALLOWED_PATTERNS.some(pattern => pattern.test(url));
}

// 清理 BOM 和空白符（提高非标响应兼容性）
function cleanResponseText(text: string): string {
  // 移除 BOM (Byte Order Mark)
  text = text.replace(/^\uFEFF/, '');
  // 移除开头的空白字符
  text = text.trim();
  return text;
}

// 错误类型判断
function getErrorType(error: any): string {
  const message = error.message || '';

  if (error.name === 'AbortError' || message.includes('timeout')) {
    return 'TIMEOUT';
  }
  if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
    return 'DNS_ERROR';
  }
  if (message.includes('ECONNREFUSED')) {
    return 'CONNECTION_REFUSED';
  }
  if (message.includes('certificate') || message.includes('SSL') || message.includes('TLS')) {
    return 'SSL_ERROR';
  }
  if (message.includes('ECONNRESET')) {
    return 'CONNECTION_RESET';
  }
  if (message.includes('ETIMEDOUT')) {
    return 'NETWORK_TIMEOUT';
  }

  return 'UNKNOWN_ERROR';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const filterParam = searchParams.get('filter'); // 用于控制成人内容过滤

    // 参数验证
    if (!targetUrl) {
      return NextResponse.json(
        { error: 'Missing required parameter: url' },
        { status: 400, headers: getCorsHeaders() }
      );
    }

    // SSRF 防护：验证目标 URL（同时也验证了 URL 格式）
    let validatedUrl: string;
    try {
      validatedUrl = await validateProxyTargetUrl(targetUrl);
    } catch (error) {
      console.error('[CMS Proxy] SSRF validation failed:', error);
      return NextResponse.json(
        { error: 'Invalid or blocked URL' },
        { status: 403, headers: getCorsHeaders() }
      );
    }

    // 解析 URL 用于后续检查
    const parsedUrl = new URL(validatedUrl);

    // 白名单检查
    if (!isUrlAllowed(targetUrl)) {
      console.warn(`[CMS Proxy] Blocked non-whitelisted URL: ${targetUrl}`);
      return NextResponse.json(
        { error: 'URL not in whitelist' },
        { status: 403, headers: getCorsHeaders() }
      );
    }

    // 🔒 纵深防御第二层：成人内容源拦截
    const shouldFilterAdult = filterParam !== 'off'; // 默认启用过滤

    // 获取配置（用于检查成人源和代理设置）
    const config = await getConfig();

    if (shouldFilterAdult) {
      try {
        const sourceConfigs = config.SourceConfig || [];

        // 检查请求的 URL 是否属于成人源
        const requestOrigin = `${parsedUrl.protocol}//${parsedUrl.host}`;
        const isAdultSource = sourceConfigs.some(source => {
          if (!source.is_adult) return false;

          try {
            const sourceUrl = new URL(source.api);
            const sourceOrigin = `${sourceUrl.protocol}//${sourceUrl.host}`;
            return requestOrigin.toLowerCase() === sourceOrigin.toLowerCase();
          } catch {
            return false;
          }
        });

        if (isAdultSource) {
          console.log(`[CMS Proxy] 🛡️ Blocked adult source: ${requestOrigin}`);
          // 静默返回空数据，避免客户端报错
          return NextResponse.json(
            {
              code: 200,
              msg: 'success',
              list: [],
              class: [],
              total: 0
            },
            { status: 200, headers: getCorsHeaders() }
          );
        }
      } catch (configError) {
        // 配置获取失败不应阻断正常请求
        console.warn('[CMS Proxy] Config check failed:', configError);
      }
    }

    // ☁️ 注意：Cloudflare Worker 代理已在 getAvailableApiSites() 中统一应用
    // targetUrl 如果来自已启用代理的源，已经包含代理前缀
    // 这里只需要直接请求即可，不需要再次应用代理

    // 🔄 直接请求目标 URL（可能是原始 URL，也可能是已包含代理的 URL）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20秒超时

    try {
      console.log(`[CMS Proxy] Fetching: ${targetUrl}`);

      // 设置 Referer/Origin 为目标站点的 origin（某些 CMS 会校验）
      const requestHeaders: Record<string, string> = { ...BROWSER_HEADERS };
      requestHeaders['Referer'] = `${parsedUrl.origin}/`;
      requestHeaders['Origin'] = parsedUrl.origin;

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: requestHeaders,
        signal: controller.signal,
        // @ts-ignore - Node.js fetch 特有选项
        compress: true, // 启用压缩
      });

      clearTimeout(timeoutId);

      // 检查响应状态
      if (!response.ok) {
        console.warn(`[CMS Proxy] Upstream error: ${response.status} ${response.statusText}`);
        return NextResponse.json(
          {
            error: 'Upstream server error',
            status: response.status,
            statusText: response.statusText
          },
          { status: 502, headers: getCorsHeaders() }
        );
      }

      // 获取响应内容
      let responseText = await response.text();

      // 清理响应文本（移除 BOM 等）
      responseText = cleanResponseText(responseText);

      // 尝试解析为 JSON（大多数 CMS API 返回 JSON）
      let jsonData;
      try {
        jsonData = JSON.parse(responseText);
      } catch {
        // 非 JSON 响应（可能是 XML 或其他格式）
        console.log('[CMS Proxy] Non-JSON response, returning as text');
        return new NextResponse(responseText, {
          status: 200,
          headers: {
            ...getCorsHeaders(),
            'Content-Type': response.headers.get('content-type') || 'text/plain; charset=utf-8',
          }
        });
      }

      // 返回 JSON 响应
      return NextResponse.json(jsonData, {
        status: 200,
        headers: {
          ...getCorsHeaders(),
          'X-Proxy-Via': 'Local-Server', // 🔍 标记请求经过本地代理
        }
      });

    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      const errorType = getErrorType(fetchError);
      console.error(`[CMS Proxy] Fetch error (${errorType}):`, fetchError.message);

      // 根据错误类型返回不同的错误信息
      const errorMessages: Record<string, string> = {
        'TIMEOUT': 'Request timeout (20s)',
        'DNS_ERROR': 'DNS resolution failed',
        'CONNECTION_REFUSED': 'Connection refused',
        'SSL_ERROR': 'SSL/TLS certificate error',
        'CONNECTION_RESET': 'Connection reset by peer',
        'NETWORK_TIMEOUT': 'Network timeout',
        'UNKNOWN_ERROR': 'Unknown network error',
      };

      return NextResponse.json(
        {
          error: errorMessages[errorType] || 'Network error',
          type: errorType,
          details: fetchError.message
        },
        { status: 502, headers: getCorsHeaders() }
      );
    }

  } catch (error: any) {
    console.error('[CMS Proxy] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message
      },
      { status: 500, headers: getCorsHeaders() }
    );
  }
}

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders()
  });
}
