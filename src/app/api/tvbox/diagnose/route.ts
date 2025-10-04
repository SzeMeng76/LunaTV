/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { GET as getTVBoxConfig } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getBaseUrl(req: NextRequest): string {
  const envBase = (process.env.SITE_BASE || '').trim().replace(/\/$/, '');
  if (envBase) return envBase;
  const proto = (req.headers.get('x-forwarded-proto') || 'https')
    .split(',')[0]
    .trim();
  const host = (
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    ''
  )
    .split(',')[0]
    .trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function isPrivateHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const h = u.hostname;
    return (
      h === 'localhost' ||
      h === '0.0.0.0' ||
      h === '127.0.0.1' ||
      h.startsWith('10.') ||
      h.startsWith('172.16.') ||
      h.startsWith('172.17.') ||
      h.startsWith('172.18.') ||
      h.startsWith('172.19.') ||
      h.startsWith('172.2') || // 172.20-172.31 简化判断
      h.startsWith('192.168.')
    );
  } catch {
    return false;
  }
}

async function tryFetchHead(
  url: string,
  timeoutMs = 3500
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      redirect: 'follow',
      signal: ctrl.signal as any,
      cache: 'no-store',
    } as any);
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    clearTimeout(timer);
    return { ok: false, error: e?.message || 'fetch error' };
  }
}

// 调用 health 端点检查 spider jar 健康状态
async function checkSpiderHealth(
  spider: string
): Promise<{
  accessible: boolean;
  status?: number;
  contentLength?: string;
  lastModified?: string;
  error?: string;
}> {
  try {
    const cleanUrl = spider.split(';')[0];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(cleanUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeoutId);

    return {
      accessible: response.ok,
      status: response.status,
      contentLength: response.headers.get('content-length') || undefined,
      lastModified: response.headers.get('last-modified') || undefined,
    };
  } catch (error) {
    return {
      accessible: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const baseUrl = getBaseUrl(req);
    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: 'cannot determine base url' },
        { status: 500 }
      );
    }

    // 从请求中获取 token 参数并传递给 tvbox API
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    console.log('[Diagnose] Backend - Received token:', token ? '***' + token.slice(-4) : 'none');
    console.log('[Diagnose] Backend - Request URL:', req.url);

    // 直接调用 tvbox API 函数，而不是通过 HTTP fetch
    // 构建模拟请求对象
    let configUrl = `${baseUrl}/api/tvbox?format=json`;
    if (token) {
      configUrl += `&token=${encodeURIComponent(token)}`;
    }

    console.log('[Diagnose] Backend - Direct calling tvbox GET with URL:', configUrl);

    // 创建模拟请求
    const mockRequest = new NextRequest(configUrl, {
      headers: req.headers,
    });

    const cfgRes = await getTVBoxConfig(mockRequest);
    const contentType = cfgRes.headers.get('content-type') || '';
    const text = await cfgRes.text();
    let parsed: any = null;
    let parseError: string | undefined;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      parseError = e?.message || 'json parse error';
    }

    const result: any = {
      ok: cfgRes.ok,
      status: cfgRes.status,
      contentType,
      size: text.length,
      baseUrl,
      configUrl,
      receivedToken: token ? '***' + token.slice(-4) : 'none', // 显示 token 的后4位用于调试
      hasJson: !!parsed,
      issues: [] as string[],
    };

    if (!cfgRes.ok) {
      result.issues.push(`config request failed: ${cfgRes.status}`);
    }
    if (!contentType.includes('text/plain')) {
      result.issues.push('content-type is not text/plain');
    }
    if (!parsed) {
      result.issues.push(`json parse failed: ${parseError}`);
    }

    if (parsed) {
      const sites = Array.isArray(parsed.sites) ? parsed.sites : [];
      const lives = Array.isArray(parsed.lives) ? parsed.lives : [];
      const spider = parsed.spider || '';
      result.sitesCount = sites.length;
      result.livesCount = lives.length;
      result.parsesCount = Array.isArray(parsed.parses)
        ? parsed.parses.length
        : 0;

      // 传递 Spider 状态透明化字段
      if (parsed.spider_url) {
        result.spider_url = parsed.spider_url;
      }
      if (parsed.spider_md5) {
        result.spider_md5 = parsed.spider_md5;
      }
      if (parsed.spider_cached !== undefined) {
        result.spider_cached = parsed.spider_cached;
      }
      if (parsed.spider_real_size !== undefined) {
        result.spider_real_size = parsed.spider_real_size;
      }
      if (parsed.spider_tried !== undefined) {
        result.spider_tried = parsed.spider_tried;
      }
      if (parsed.spider_success !== undefined) {
        result.spider_success = parsed.spider_success;
      }
      if (parsed.spider_backup) {
        result.spider_backup = parsed.spider_backup;
      }
      if (parsed.spider_candidates) {
        result.spider_candidates = parsed.spider_candidates;
      }

      // 检查私网地址
      const privateApis = sites.filter(
        (s: any) => typeof s?.api === 'string' && isPrivateHost(s.api)
      ).length;
      result.privateApis = privateApis;
      if (privateApis > 0) {
        result.issues.push(`found ${privateApis} private api urls`);
      }
      if (typeof spider === 'string' && spider) {
        result.spider = spider;
        result.spiderPrivate = isPrivateHost(spider);
        if (result.spiderPrivate) {
          result.issues.push('spider url is private/not public');
        } else if (
          spider.startsWith('http://') ||
          spider.startsWith('https://')
        ) {
          // 使用增强的健康检查
          const healthCheck = await checkSpiderHealth(spider);
          result.spiderReachable = healthCheck.accessible;
          result.spiderStatus = healthCheck.status;
          result.spiderContentLength = healthCheck.contentLength;
          result.spiderLastModified = healthCheck.lastModified;

          if (!healthCheck.accessible) {
            result.issues.push(
              `spider unreachable: ${healthCheck.status || healthCheck.error}`
            );
          } else {
            // 验证文件大小（spider jar 通常大于 100KB）
            if (healthCheck.contentLength) {
              const sizeKB = parseInt(healthCheck.contentLength) / 1024;
              result.spiderSizeKB = Math.round(sizeKB);
              if (sizeKB < 50) {
                result.issues.push(
                  `spider jar size suspicious: ${result.spiderSizeKB}KB (expected >100KB)`
                );
              }
            }
          }
        }
      }
    }

    // 最终状态
    result.pass =
      result.ok &&
      result.hasJson &&
      (!result.issues || result.issues.length === 0);
    return NextResponse.json(result, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (e: any) {
    console.error('Diagnose failed', e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
