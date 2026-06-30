/**
 * 下载源 URL 规范化工具
 * 用于统一处理直接 URL 和代理 URL 的 referer/origin 提取
 */

export interface NormalizedDownloadSource {
  sourceUrl: string;
  referer?: string;
  origin?: string;
}

/**
 * 获取默认的 base href
 */
function getDefaultBaseHref(): string {
  if (typeof window !== 'undefined') {
    return window.location.href;
  }
  return 'http://localhost/';
}

/**
 * 解析 HTTP/HTTPS URL
 */
function parseHttpUrl(rawUrl: string | null | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * 提取 URL 的 origin
 */
function extractOrigin(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return undefined;
  }
}

/**
 * 检查是否是代理播放列表路径
 */
function isProxyPlaylistPath(pathname: string): boolean {
  return (
    pathname.includes('/api/proxy/m3u8') ||
    pathname.includes('/api/proxy/stream') ||
    pathname.includes('/api/proxy/segment')
  );
}

/**
 * 规范化下载源 URL
 *
 * 对于代理 URL，从查询参数中提取真实的上游 URL 和 referer
 * 对于普通 URL，直接使用 URL 本身作为 referer
 *
 * @param rawUrl 原始 URL（可能是代理 URL 或直接 URL）
 * @param baseHref 基础 URL（用于解析相对路径）
 * @returns 规范化后的下载源信息
 */
export function normalizeDownloadSource(
  rawUrl: string,
  baseHref = getDefaultBaseHref(),
): NormalizedDownloadSource {
  try {
    const parsed = new URL(rawUrl, baseHref);
    const sourceUrl = parsed.toString();

    // 检测是否是代理播放列表路径
    if (isProxyPlaylistPath(parsed.pathname)) {
      // 从查询参数中提取上游 URL
      const upstreamUrl = parseHttpUrl(parsed.searchParams.get('url'));
      const explicitReferer = parseHttpUrl(parsed.searchParams.get('referer'));

      // 优先使用显式指定的 referer，否则使用上游 URL，最后使用代理 URL
      const referer = explicitReferer || upstreamUrl || sourceUrl;

      return {
        sourceUrl,
        referer,
        origin: extractOrigin(referer),
      };
    }

    // 普通 URL：直接使用 URL 本身
    return {
      sourceUrl,
      referer: sourceUrl,
      origin: parsed.origin,
    };
  } catch {
    // URL 解析失败，返回原始 URL
    return { sourceUrl: rawUrl };
  }
}
