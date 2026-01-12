/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { getBaseUrl, resolveUrl } from "@/lib/live";

export const runtime = 'nodejs';

// 连接池管理
import * as https from 'https';
import * as http from 'http';

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  keepAliveMsecs: 30000,
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  keepAliveMsecs: 30000,
});

// 性能统计
const stats = {
  requests: 0,
  errors: 0,
  avgResponseTime: 0,
  totalBytes: 0,
};

export async function GET(request: Request) {
  const startTime = Date.now();
  stats.requests++;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const allowCORS = searchParams.get('allowCORS') === 'true';
  const source = searchParams.get('moontv-source');
  
  if (!url) {
    stats.errors++;
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    stats.errors++;
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';

  let response: Response | null = null;
  let responseUsed = false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

  try {
    const decodedUrl = decodeURIComponent(url);

    // 选择合适的 agent
    const isHttps = decodedUrl.startsWith('https:');
    const agent = isHttps ? httpsAgent : httpAgent;

    // 参考 hls.js fetch-loader，构建标准headers
    const headers: Record<string, string> = {
      'User-Agent': ua,
      'Accept': 'application/vnd.apple.mpegurl, application/x-mpegurl, application/octet-stream, */*',
      'Accept-Encoding': 'identity', // 避免gzip压缩导致的处理复杂性
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Connection': 'keep-alive'
    };

    response = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      credentials: 'same-origin',
      signal: controller.signal,
      headers: new Headers(headers),
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - Node.js specific option
      agent: typeof window === 'undefined' ? agent : undefined,
    });

    clearTimeout(timeoutId);

    // 参考 hls.js fetch-loader 的错误处理逻辑
    if (!response.ok) {
      stats.errors++;
      clearTimeout(timeoutId);
      
      // 直接返回原始的HTTP错误，让hls.js处理
      // 不返回JSON，因为hls.js期望的是M3U8内容或标准HTTP错误
      return new NextResponse(
        `HTTP Error ${response.status}: ${response.statusText}`, 
        { 
          status: response.status,
          statusText: response.statusText,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
    
    // 检查内容是否为 M3U8
    const isM3U8 = contentType.toLowerCase().includes('mpegurl') || 
                   contentType.toLowerCase().includes('octet-stream') ||
                   decodedUrl.includes('.m3u8');

    if (isM3U8) {
      // 获取最终的响应URL（处理重定向后的URL）
      const finalUrl = response.url;
      const m3u8Content = await response.text();
      responseUsed = true;

      // 更新统计信息
      if (contentLength > 0) {
        stats.totalBytes += contentLength;
      } else {
        stats.totalBytes += m3u8Content.length;
      }

      // 使用最终的响应URL作为baseUrl，而不是原始的请求URL
      const baseUrl = getBaseUrl(finalUrl);

      // 重写 M3U8 内容
      const modifiedContent = rewriteM3U8Content(m3u8Content, baseUrl, request, allowCORS, source);

      const headers = new Headers();
      headers.set('Content-Type', contentType || 'application/vnd.apple.mpegurl');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept, User-Agent');
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
      headers.set('Content-Length', modifiedContent.length.toString());

      // 更新性能统计
      const responseTime = Date.now() - startTime;
      stats.avgResponseTime = (stats.avgResponseTime * (stats.requests - 1) + responseTime) / stats.requests;

      return new Response(modifiedContent, { headers, status: 200 });
    }

    // 直接代理非M3U8内容
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'application/vnd.apple.mpegurl');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept, User-Agent');
    responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');

    // 复制原始响应的相关头部
    const originalHeaders = ['Content-Length', 'Content-Range', 'Accept-Ranges'];
    originalHeaders.forEach(header => {
      const value = response?.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    });

    // 更新统计信息
    if (contentLength > 0) {
      stats.totalBytes += contentLength;
    }

    const responseTime = Date.now() - startTime;
    stats.avgResponseTime = (stats.avgResponseTime * (stats.requests - 1) + responseTime) / stats.requests;

    return new Response(response?.body, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (error: any) {
    stats.errors++;
    clearTimeout(timeoutId);
    
    // 处理不同类型的错误
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 408 });
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return NextResponse.json({ error: 'Network connection failed' }, { status: 503 });
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('M3U8 proxy error:', error);
    }
    return NextResponse.json({ 
      error: 'Failed to fetch m3u8',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });

  } finally {
    clearTimeout(timeoutId);
    
    // 确保 response 被正确关闭以释放资源
    if (response && !responseUsed) {
      try {
        response.body?.cancel();
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to close response body:', error);
        }
      }
    }

    // 定期打印统计信息
    if (stats.requests % 100 === 0 && process.env.NODE_ENV === 'development') {
      console.log(`M3U8 Proxy Stats - Requests: ${stats.requests}, Errors: ${stats.errors}, Avg Response Time: ${stats.avgResponseTime.toFixed(2)}ms, Total Bytes: ${(stats.totalBytes / 1024 / 1024).toFixed(2)}MB`);
    }
  }
}

function rewriteM3U8Content(content: string, baseUrl: string, req: Request, allowCORS: boolean, sourceKey: string | null) {
  // 从 referer 头提取协议信息
  const referer = req.headers.get('referer');
  let protocol = 'http';
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      protocol = refererUrl.protocol.replace(':', '');
    } catch (error) {
      // ignore
    }
  }

  const host = req.headers.get('host');
  const proxyBase = `${protocol}://${host}/api/proxy`;
  const sourceParam = sourceKey ? `&moontv-source=${sourceKey}` : '';

  const lines = content.split('\n');
  const rewrittenLines: string[] = [];
  const variables = new Map<string, string>(); // 用于 EXT-X-DEFINE 变量替换

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // 处理 TS 片段 URL 和其他媒体文件
    if (line && !line.startsWith('#')) {
      const resolvedUrl = resolveUrl(baseUrl, line);
      const proxyUrl = allowCORS ? resolvedUrl : `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
      rewrittenLines.push(proxyUrl);
      continue;
    }

    // 处理变量定义 (EXT-X-DEFINE)
    if (line.startsWith('#EXT-X-DEFINE:')) {
      line = processDefineVariables(line, variables);
    }

    // 处理 EXT-X-MAP 标签中的 URI
    if (line.startsWith('#EXT-X-MAP:')) {
      line = rewriteMapUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理 EXT-X-KEY 标签中的 URI
    if (line.startsWith('#EXT-X-KEY:')) {
      line = rewriteKeyUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理 EXT-X-MEDIA 标签中的 URI (音频轨道等)
    if (line.startsWith('#EXT-X-MEDIA:')) {
      line = rewriteMediaUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理 LL-HLS 部分片段 (EXT-X-PART)
    if (line.startsWith('#EXT-X-PART:')) {
      line = rewritePartUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理内容导向 (EXT-X-CONTENT-STEERING)
    if (line.startsWith('#EXT-X-CONTENT-STEERING:')) {
      line = rewriteContentSteeringUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理会话数据 (EXT-X-SESSION-DATA) - 可能包含 URI
    if (line.startsWith('#EXT-X-SESSION-DATA:')) {
      line = rewriteSessionDataUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理会话密钥 (EXT-X-SESSION-KEY)
    if (line.startsWith('#EXT-X-SESSION-KEY:')) {
      line = rewriteSessionKeyUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理嵌套的 M3U8 文件 (EXT-X-STREAM-INF)
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      rewrittenLines.push(line);
      // 下一行通常是 M3U8 URL
      if (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          let resolvedUrl = resolveUrl(baseUrl, nextLine);
          resolvedUrl = substituteVariables(resolvedUrl, variables);
          const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
          rewrittenLines.push(proxyUrl);
        } else {
          rewrittenLines.push(nextLine);
        }
      }
      continue;
    }

    // 处理日期范围标签中的 URI (EXT-X-DATERANGE)
    if (line.startsWith('#EXT-X-DATERANGE:')) {
      line = rewriteDateRangeUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理预加载提示 (EXT-X-PRELOAD-HINT)
    if (line.startsWith('#EXT-X-PRELOAD-HINT:')) {
      line = rewritePreloadHintUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理渲染报告 (EXT-X-RENDITION-REPORT)
    if (line.startsWith('#EXT-X-RENDITION-REPORT:')) {
      line = rewriteRenditionReportUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理服务器控制 (EXT-X-SERVER-CONTROL)
    if (line.startsWith('#EXT-X-SERVER-CONTROL:')) {
      line = rewriteServerControlUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    // 处理跳过片段 (EXT-X-SKIP)
    if (line.startsWith('#EXT-X-SKIP:')) {
      line = rewriteSkipUri(line, baseUrl, proxyBase, variables, sourceParam);
    }

    rewrittenLines.push(line);
  }

  return rewrittenLines.join('\n');
}

// 变量替换函数 - 参考 hls.js 标准实现
const VARIABLE_REPLACEMENT_REGEX = /\{\$([a-zA-Z0-9-_]+)\}/g;

function substituteVariables(text: string, variables: Map<string, string>): string {
  if (variables.size === 0) {
    return text;
  }
  
  return text.replace(VARIABLE_REPLACEMENT_REGEX, (variableReference: string, variableName: string) => {
    const variableValue = variables.get(variableName);
    if (variableValue === undefined) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Missing variable definition for: "${variableName}"`);
      }
      return variableReference; // 保持原始引用如果变量未定义
    }
    return variableValue;
  });
}

// 处理变量定义
function processDefineVariables(line: string, variables: Map<string, string>): string {
  const nameMatch = line.match(/NAME="([^"]+)"/);
  const valueMatch = line.match(/VALUE="([^"]+)"/);
  
  if (nameMatch && valueMatch) {
    variables.set(nameMatch[1], valueMatch[1]);
  }
  
  return line; // 返回原始标签，让客户端处理
}

function rewriteMapUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = '') {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

function rewriteKeyUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = '') {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/key?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

function rewriteMediaUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = '') {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    
    // 检查URI是否有效，避免nan值
    if (!originalUri || originalUri === 'nan' || originalUri.includes('nan')) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('检测到无效的音频轨道URI:', originalUri, '原始行:', line);
      }
      // 移除URI属性，让HLS.js忽略这个音频轨道
      return line.replace(/,?URI="[^"]*"/, '');
    }
    
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    
    try {
      const resolvedUrl = resolveUrl(baseUrl, originalUri);
      const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
      return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('解析音频轨道URI失败:', originalUri, error);
      }
      // 移除URI属性，让HLS.js忽略这个音频轨道
      return line.replace(/,?URI="[^"]*"/, '');
    }
  }
  return line;
}

// 处理 LL-HLS 部分片段
function rewritePartUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

// 处理内容导向
function rewriteContentSteeringUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  const serverUriMatch = line.match(/SERVER-URI="([^"]+)"/);
  if (serverUriMatch) {
    let originalUri = serverUriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
    return line.replace(serverUriMatch[0], `SERVER-URI="${proxyUrl}"`);
  }
  return line;
}

// 处理会话数据
function rewriteSessionDataUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

// 处理会话密钥
function rewriteSessionKeyUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/key?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

// 处理日期范围标签中的 URI
function rewriteDateRangeUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  // SCTE-35 或其他可能包含 URI 的属性
  const uriMatches = Array.from(line.matchAll(/([A-Z-]+)="([^"]*(?:https?:\/\/|\/)[^"]*)"/g));
  let result = line;
  
  for (const match of uriMatches) {
    const [fullMatch, , originalUri] = match;
    if (originalUri.includes('://') || originalUri.startsWith('/')) {
      let uri = originalUri;
      if (variables) {
        uri = substituteVariables(uri, variables);
      }
      try {
        const resolvedUrl = resolveUrl(baseUrl, uri);
        const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
        result = result.replace(fullMatch, fullMatch.replace(originalUri, proxyUrl));
      } catch (error) {
        // 保持原始 URI 如果解析失败
      }
    }
  }
  
  return result;
}

// 处理预加载提示 - LL-HLS 功能
function rewritePreloadHintUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    
    try {
      const resolvedUrl = resolveUrl(baseUrl, originalUri);
      // 根据 TYPE 属性选择适当的代理端点
      const typeMatch = line.match(/TYPE=([^,\s]+)/);
      const type = typeMatch ? typeMatch[1] : 'PART';
      
      let proxyUrl: string;
      if (type === 'PART') {
        proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
      } else if (type === 'MAP') {
        proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
      } else {
        proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
      }
      
      return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('解析预加载提示URI失败:', originalUri, error);
      }
      return line;
    }
  }
  return line;
}

// 处理渲染报告
function rewriteRenditionReportUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    let originalUri = uriMatch[1];
    if (variables) {
      originalUri = substituteVariables(originalUri, variables);
    }
    
    try {
      const resolvedUrl = resolveUrl(baseUrl, originalUri);
      const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}${sourceParam}`;
      return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('解析渲染报告URI失败:', originalUri, error);
      }
      return line;
    }
  }
  return line;
}

// 处理服务器控制
function rewriteServerControlUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  // EXT-X-SERVER-CONTROL 通常不包含 URI，但为了完整性保留此函数
  // 如果将来有包含 URI 的扩展，可以在此处理
  return line;
}

// 处理跳过片段
function rewriteSkipUri(line: string, baseUrl: string, proxyBase: string, variables?: Map<string, string>, sourceParam: string = ''): string {
  // EXT-X-SKIP 不包含 URI，只包含 SKIPPED-SEGMENTS 等属性
  // 保持原样返回
  return line;
}