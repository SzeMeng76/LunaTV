/**
 * 全局 Fetch 拦截器
 * 自动监控所有外部 API 请求的流量
 */

import { recordExternalTraffic } from './external-traffic-monitor';

// 保存原始的 fetch 函数
const originalFetch = global.fetch;

/**
 * 初始化全局 fetch 拦截器
 */
export function initFetchInterceptor() {
  // 只在服务端拦截
  if (typeof window !== 'undefined') {
    return;
  }

  // 替换全局 fetch
  global.fetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const startTime = Date.now();
    const urlString = url.toString();

    // 判断是否为外部请求（需要记录流量）
    const shouldRecordTraffic = (() => {
      try {
        // 相对路径（如 /api/xxx）不记录
        if (urlString.startsWith('/')) {
          return false;
        }

        const parsedUrl = new URL(urlString);
        const hostname = parsedUrl.hostname.toLowerCase();

        // 过滤本地和内网地址
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '0.0.0.0' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.16.') ||
          hostname.startsWith('172.17.') ||
          hostname.startsWith('172.18.') ||
          hostname.startsWith('172.19.') ||
          hostname.startsWith('172.2') ||
          hostname.startsWith('172.30.') ||
          hostname.startsWith('172.31.')
        ) {
          return false;
        }

        // 只记录 http/https 协议
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          return false;
        }

        return true;
      } catch {
        // URL 解析失败，不记录
        return false;
      }
    })();

    // 计算请求大小
    let requestSize = 0;
    if (options?.body) {
      if (typeof options.body === 'string') {
        requestSize = Buffer.byteLength(options.body, 'utf8');
      } else if (options.body instanceof Buffer) {
        requestSize = options.body.length;
      }
    }

    try {
      // 执行原始 fetch
      const response = await originalFetch(url, options);

      // 只记录外部请求的流量
      if (shouldRecordTraffic) {
        // 克隆响应以读取内容
        const clonedResponse = response.clone();
        const responseText = await clonedResponse.text();
        const responseSize = Buffer.byteLength(responseText, 'utf8');

        // 记录外部流量
        recordExternalTraffic({
          timestamp: startTime,
          url: urlString,
          method: options?.method || 'GET',
          requestSize,
          responseSize,
          duration: Date.now() - startTime,
          statusCode: response.status,
        });

        console.log(`🌐 [External] ${options?.method || 'GET'} ${urlString} - ${response.status} - ${(responseSize / 1024).toFixed(2)} KB`);
      }

      return response;
    } catch (error) {
      // 即使失败也记录（但只记录外部请求）
      if (shouldRecordTraffic) {
        recordExternalTraffic({
          timestamp: startTime,
          url: urlString,
          method: options?.method || 'GET',
          requestSize,
          responseSize: 0,
          duration: Date.now() - startTime,
          statusCode: 0,
        });
      }

      throw error;
    }
  };

  console.log('✅ 全局 Fetch 拦截器已启动，开始监控外部流量');
}
