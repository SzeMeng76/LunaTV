import { isIP } from 'net';
import CacheableLookup from 'cacheable-lookup';

// 创建全局 DNS 缓存实例（带 TTL 支持）
const cacheable = new CacheableLookup({
  maxTtl: 300, // 最大缓存 5 分钟
  errorTtl: 0.15, // 错误缓存 0.15 秒（快速重试）
});

/**
 * DNS 查询重试机制（指数退避）
 * 解决 EAI_AGAIN 临时性 DNS 失败问题
 */
async function lookupWithRetry(
  hostname: string,
  options: any,
  maxRetries = 3,
  initialDelay = 500
): Promise<any[]> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // 使用 cacheable-lookup 的 lookupAsync 方法
      const result = await cacheable.lookupAsync(hostname, options);

      // 转换为数组格式（兼容原 lookup 返回格式）
      if (Array.isArray(result)) {
        return result;
      }
      return [result];
    } catch (error: any) {
      lastError = error;

      // 只对临时性错误重试
      const isRetryable =
        error.code === 'EAI_AGAIN' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT';

      if (isRetryable && i < maxRetries - 1) {
        // 指数退避：500ms, 1000ms, 2000ms
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`[DNS] Retry ${i + 1}/${maxRetries} for ${hostname} after ${delay}ms (error: ${error.code})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export function normalizeHeaderUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function isBlockedHostname(hostname: string): boolean {
  return (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata.google.internal'
  );
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 224 && b === 0 && c === 0) ||
    a >= 224
  );
}

function isBlockedIPv6(address: string): boolean {
  const normalized = address.toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8')
  );
}

function isBlockedAddress(address: string): boolean {
  const version = isIP(normalizeHostname(address));
  if (version === 4) return isBlockedIPv4(address);
  if (version === 6) return isBlockedIPv6(normalizeHostname(address));
  return true;
}

export async function validateProxyTargetUrl(rawUrl: string): Promise<string> {
  // 如果禁用了 SSRF 防护，仅做基本 URL 格式验证
  // ⚠️ 警告：禁用 SSRF 防护会允许访问内网资源，仅适用于私有部署环境
  if (process.env.DISABLE_SSRF_PROTECTION === 'true') {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('Invalid url');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https supported');
    }

    return parsed.toString();
  }

  // 完整的 SSRF 防护验证
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid url');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https supported');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL credentials are not supported');
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (isBlockedHostname(hostname)) {
    throw new Error('Blocked host');
  }

  const literalVersion = isIP(hostname);
  if (literalVersion) {
    if (isBlockedAddress(hostname)) throw new Error('Blocked IP address');
    return parsed.toString();
  }

  // 使用带重试机制的 DNS 查询（cacheable-lookup + 指数退避）
  const records = await lookupWithRetry(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error('Host did not resolve');

  if (records.some((record) => isBlockedAddress(record.address))) {
    throw new Error('Host resolves to a blocked IP address');
  }

  return parsed.toString();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithValidatedRedirects(
  rawUrl: string,
  init: RequestInit,
  options: { timeoutMs: number; maxRedirects?: number },
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = rawUrl;

  for (let i = 0; i <= maxRedirects; i++) {
    const validatedUrl = await validateProxyTargetUrl(currentUrl);
    const response = await fetchWithTimeout(
      validatedUrl,
      { ...init, redirect: 'manual' },
      options.timeoutMs,
    );

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has('location')
    ) {
      if (i === maxRedirects) throw new Error('Too many redirects');
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect location missing');
      currentUrl = new URL(location, validatedUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error('Too many redirects');
}
