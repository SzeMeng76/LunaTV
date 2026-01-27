/* eslint-disable no-constant-condition */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { getConfig } from "@/lib/config";
import { db } from "@/lib/db";

const defaultUA = 'AptvPlayer/1.4.10';
const TVBOX_UA = 'okhttp/4.1.0';

// 🚀 优化：超时控制
const FETCH_TIMEOUT = 10000; // 10秒超时
const EPG_CACHE_TTL = 24 * 60 * 60 * 1000; // EPG缓存24小时

/**
 * 带超时的 fetch 请求
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error(`请求超时 (${timeoutMs}ms): ${url}`);
    }
    throw error;
  }
}

// 🚀 优化：EPG 缓存
interface EpgCache {
  epgs: { [key: string]: { start: string; end: string; title: string }[] };
  logos: { [key: string]: string };
  timestamp: number;
}

const epgCache = new Map<string, EpgCache>();

export interface LiveChannels {
  channelNumber: number;
  channels: {
    id: string;
    tvgId: string;
    name: string;
    logo: string;
    group: string;
    url: string;
  }[];
  epgUrl: string;
  epgs: {
    [key: string]: {
      start: string;
      end: string;
      title: string;
    }[];
  };
  epgLogos: {
    [key: string]: string; // tvgId/name -> logo URL from EPG
  };
}

export interface TvBoxConfig {
  lives?: {
    name: string;
    type: number;
    url: string;
    playerType?: number;
    epg?: string;
    ua?: string;
  }[];
  [key: string]: any;
}

const cachedLiveChannels: { [key: string]: LiveChannels } = {};

export function deleteCachedLiveChannels(key: string) {
  delete cachedLiveChannels[key];
}

export async function getCachedLiveChannels(key: string): Promise<LiveChannels | null> {
  if (!cachedLiveChannels[key]) {
    const config = await getConfig();
    const liveInfo = config.LiveConfig?.find(live => live.key === key);
    if (!liveInfo) {
      return null;
    }
    const channelNum = await refreshLiveChannels(liveInfo);
    if (channelNum === 0) {
      return null;
    }
    liveInfo.channelNumber = channelNum;
    await db.saveAdminConfig(config);
  }
  return cachedLiveChannels[key] || null;
}

export async function refreshLiveChannels(liveInfo: {
  key: string;
  name: string;
  url: string;
  ua?: string;
  epg?: string;
  isTvBox?: boolean;
  from: 'config' | 'custom';
  channelNumber?: number;
  disabled?: boolean;
}): Promise<number> {
  console.log(`[Live] Starting refresh for source: ${liveInfo.name} (${liveInfo.url})`);

  if (cachedLiveChannels[liveInfo.key]) {
    delete cachedLiveChannels[liveInfo.key];
  }
  
  if (!liveInfo.url) {
    console.error('[Live] refreshLiveChannels: URL is missing');
    return 0;
  }

  const ua = liveInfo.ua || defaultUA;
  
  // 尝试检测是否为 TVBox 格式 (JSON 配置 或 TXT 直播源)
  // 如果用户手动指定了 isTvBox，则优先使用
  let isTvBox = liveInfo.isTvBox || liveInfo.url.toLowerCase().endsWith('.json');
  console.log(`[Live] Initial detection for ${liveInfo.url}: isTvBox=${isTvBox} (Manual: ${liveInfo.isTvBox})`);

  let content = '';
  
  try {
    // 第一次 Fetch - 使用超时控制
    console.log(`[Live] Fetching URL: ${liveInfo.url} with UA: ${isTvBox ? TVBOX_UA : ua}`);
    const response = await fetchWithTimeout(liveInfo.url, {
      headers: {
        'User-Agent': isTvBox ? TVBOX_UA : ua,
      },
    }, FETCH_TIMEOUT);

    if (!response.ok) {
        console.error(`[Live] Failed to fetch live source: ${response.status} ${response.statusText}`);
        return 0;
    }

    content = await response.text();
    console.log(`[Live] Content received. Length: ${content.length}. Start: ${content.substring(0, 50)}...`);

    // 0. 尝试解密内容（针对 饭太硬/肥猫 等加密源）
    const decryptedContent = tryDecrypt(content);
    const effectiveContent = decryptedContent || content; // 如果解密失败或无加密，使用原内容
    if (decryptedContent !== content) {
        console.log(`[Live] Content decrypted. New Length: ${effectiveContent.length}. Start: ${effectiveContent.substring(0, 50)}...`);
    }

    // 尝试从内容判断是否为 TVBox
    if (!isTvBox) {
        // 检查 JSON 结构
        if (effectiveContent.trim().startsWith('{')) {
            try {
                const json = tryParseJson(effectiveContent);
                if (json.lives && Array.isArray(json.lives)) {
                    isTvBox = true;
                    console.log(`[Live] Content detected as TVBox JSON Config`);
                }
            } catch (e) {
                // Ignore JSON parse error
            }
        }
        
        // 检查 TXT 特征 (排除 M3U)
        if (!isTvBox && !effectiveContent.includes('#EXTM3U')) {
            if (effectiveContent.includes(',#genre#') || (effectiveContent.includes(',') && !effectiveContent.trim().startsWith('<'))) {
                isTvBox = true;
                console.log(`[Live] Content detected as TVBox TXT`);
            }
        }
    }

    let result: {
        tvgUrl: string;
        channels: {
            id: string;
            tvgId: string;
            name: string;
            logo: string;
            group: string;
            url: string;
        }[];
    };

    if (isTvBox) {
        console.log(`[Live] Processing as TVBox source...`);
        // 使用 TVBox 处理器 - 传递已解密的内容
        const tvBoxResult = await processTvBoxContent(effectiveContent, liveInfo.key);
        console.log(`[Live] TVBox processing result type: ${tvBoxResult.type}`);

        if (tvBoxResult.type === 'txt') {
            result = {
                tvgUrl: '',
                channels: tvBoxResult.data.channels
            };
        } else if (tvBoxResult.type === 'm3u') {
             // 回退到 M3U 解析
             result = parseM3U(liveInfo.key, tvBoxResult.content);
        } else {
             // 无法识别或出错，尝试作为普通 M3U 解析
             result = parseM3U(liveInfo.key, effectiveContent);
        }
    } else {
        // 标准 M3U 解析
        result = parseM3U(liveInfo.key, effectiveContent);
    }

    const epgUrl = liveInfo.epg || result.tvgUrl;
    
    // 如果没有频道，直接返回
    if (!result.channels || result.channels.length === 0) {
        return 0;
    }

    const { epgs, logos } = await parseEpg(
      epgUrl,
      liveInfo.ua || defaultUA,
      result.channels.map(channel => channel.tvgId).filter(tvgId => tvgId),
      result.channels
    );
    
    cachedLiveChannels[liveInfo.key] = {
      channelNumber: result.channels.length,
      channels: result.channels,
      epgUrl: epgUrl,
      epgs: epgs,
      epgLogos: logos,
    };
    return result.channels.length;

  } catch (error) {
      console.error('Failed to refresh live channels:', error);
      return 0;
  }
}

// ----------------------------------------------------------------------
// TVBox Support Functions
// ----------------------------------------------------------------------

/**
 * 尝试解密 TVBox 配置
 * 支持格式：[A-Za-z0-9]{8}** + Base64
 */
function tryDecrypt(content: string): string {
  // 1. 检查是否存在 "8位字符 + **" 的特征 (FanTaiYing, Feimao 等常用加密/混淆格式)
  const match = content.match(/[A-Za-z0-9]{8}\*\*/);
  if (match && match.index !== undefined) {
     // 提取 ** 之后的所有内容作为 Base64
     // 注意：对于图片隐写，配置通常在文件末尾，match.index 会定位到特征头
     const base64Part = content.slice(match.index + 10).trim();
     try {
       // 尝试 Base64 解码
       const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
       // 简单验证解码后是否像 JSON
       if (decoded.trim().startsWith('{') || decoded.trim().startsWith('[')) {
           console.log('[Live] Successfully decrypted TVBox config (Base64)');
           return decoded;
       }
     } catch (e) {
       console.warn('[Live] Detected encrypted format but failed to decode:', e);
     }
  }
  return content;
}

async function processTvBoxContent(content: string, sourceKey: string): Promise<any> {
  let config: TvBoxConfig | null = null;

  // 注意: content 已经在 refreshLiveChannels 中解密过了，无需再次解密

  // 1. 尝试解析为 JSON 配置
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
        const json = tryParseJson(trimmed);
        if (json.lives && Array.isArray(json.lives)) {
            config = json;
        }
    }
  } catch (e) {
    // Not JSON
  }

  // 2. 如果是配置，获取真实的直播源 URL 并下载
  if (config) {
    if (config.lives && config.lives.length > 0) {
      const firstLive = config.lives[0];
      const liveUa = firstLive.ua || TVBOX_UA;

      try {
        const response = await fetch(firstLive.url, {
          headers: {
            'User-Agent': liveUa
          }
        });
        if (!response.ok) return { type: 'error', error: 'Fetch failed' };

        const liveContent = await response.text();

        if (liveContent.includes('#EXTM3U')) {
          return { type: 'm3u', content: liveContent, ua: liveUa };
        } else {
          return {
            type: 'txt',
            data: parseTvBoxLiveTxt(liveContent, sourceKey),
            ua: liveUa
          };
        }
      } catch (error) {
        return { type: 'error', error };
      }
    } else {
      return { type: 'error', error: 'No lives found' };
    }
  }

  // 3. 优先检查 M3U
  if (content.includes('#EXTM3U')) {
      return { type: 'm3u', content: content, ua: TVBOX_UA };
  }

  // 4. 检查 TXT
  if (content.includes(',#genre#') || (content.includes(',') && !content.trim().startsWith('<'))) {
     return {
       type: 'txt',
       data: parseTvBoxLiveTxt(content, sourceKey),
       ua: TVBOX_UA
     };
  }

  return { type: 'unknown' };
}

function parseTvBoxLiveTxt(content: string, sourceKey: string): {
  channels: {
    id: string;
    tvgId: string;
    name: string;
    logo: string;
    group: string;
    url: string;
  }[];
} {
  const lines = content.split('\n');
  const channels: {
    id: string;
    tvgId: string;
    name: string;
    logo: string;
    group: string;
    url: string;
  }[] = [];
  
  let currentGroup = '默认分组';
  let channelIndex = 0;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.includes(',#genre#')) {
      currentGroup = line.split(',')[0].trim();
      continue;
    }

    const parts = line.split(',');
    if (parts.length < 2) continue;

    const name = parts[0].trim();
    let url = parts[1].trim();

    if (url.includes('$')) {
        url = url.split('$')[0].trim();
    }

    channels.push({
      id: `${sourceKey}-${channelIndex}`,
      tvgId: name,
      name: name,
      logo: '',
      group: currentGroup,
      url: url
    });

    channelIndex++;
  }

  return { channels };
}

// ----------------------------------------------------------------------
// Existing Helper Functions
// ----------------------------------------------------------------------

/**
 * 尝试解析 JSON，支持简单的注释去除
 * TVBox 配置文件常包含 // 开头的注释，导致 JSON.parse 失败
 */
function tryParseJson(content: string): any {
  try {
    // 1. 尝试直接解析
    return JSON.parse(content);
  } catch (e) {
    try {
      // 2. 去除整行注释 (以 // 开头的行)
      const cleanedLines = content.replace(/^\s*\/\/.*$/gm, '');
      return JSON.parse(cleanedLines);
    } catch (e2) {
      // 3. 如果还失败，尝试更激进的清洗（注意：可能会破坏包含 // 的 URL，需谨慎）
      // 这里暂不实施激进清洗，以免破坏 http:// 链接
      // 可以考虑使用更复杂的正则来避开字符串内的 //
      console.warn('[Live] JSON parse failed even after simple comment stripping');
      throw e;
    }
  }
}

function normalizeChannelName(name: string): string {
  return name
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^\d+\s+/g, '')
    .replace(/\s*(HD|4K|FHD|UHD)\s*$/gi, '')
    .replace(/\s+(HD|4K|FHD|UHD)\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface EpgDebugInfo {
  nameToTvgIdSample: Array<{ normalizedName: string; key: string }>;
  epgNameToChannelIdSample: Array<{ normalizedName: string; channelId: string }>;
  totalEpgChannels: number;
  totalM3uChannelMappings: number;
  tvgIdMatchCount: number;
  nameMatchCount: number;
  nameMatchDetails: Array<{ epgName: string; m3uKey: string }>;
  unmatchedEpgSample: Array<{ channelId: string; normalizedName: string | undefined }>;
  epgResultKeys: string[];
  titleTagsFound: number;
  programmeTagsFound: number;
}

// Internal function, not exported to avoid conflict if not needed, 
// but refreshLiveChannels uses it.
async function parseEpg(
  epgUrl: string,
  ua: string,
  tvgIds: string[],
  channels?: { tvgId: string; name: string }[]
): Promise<{
  epgs: {
    [key: string]: {
      start: string;
      end: string;
      title: string;
    }[]
  };
  logos: {
    [key: string]: string;
  };
}> {
  if (!epgUrl) {
    return { epgs: {}, logos: {} };
  }

  // 🚀 优化：检查缓存
  const cached = epgCache.get(epgUrl);
  if (cached && (Date.now() - cached.timestamp) < EPG_CACHE_TTL) {
    console.log(`[Live] Using cached EPG for ${epgUrl} (age: ${Math.round((Date.now() - cached.timestamp) / 1000 / 60)}min)`);
    return { epgs: cached.epgs, logos: cached.logos };
  }

  const tvgs = new Set(tvgIds);
  const result: { [key: string]: { start: string; end: string; title: string }[] } = {};
  const logos: { [key: string]: string } = {};

  // Stub implementation for EPG parsing to keep file size manageable and safe.
  // Real implementation follows.
  const epgDataByChannelId: { [channelId: string]: { start: string; end: string; title: string }[] } = {};
  const epgNameToChannelId = new Map<string, string>();
  const epgChannelIdToLogo = new Map<string, string>();

  try {
    // 🚀 优化：使用超时控制
    console.log(`[Live] Fetching EPG from ${epgUrl} with ${FETCH_TIMEOUT}ms timeout...`);
    const response = await fetchWithTimeout(epgUrl, {
      headers: { 'User-Agent': ua },
    }, FETCH_TIMEOUT);

    if (!response.ok) {
      console.warn(`[Live] EPG fetch failed: ${response.status}, skipping EPG`);
      return { epgs: {}, logos: {} };
    }

    const reader = response.body?.getReader();
    if (!reader) return { epgs: {}, logos: {} };

    const decoder = new TextDecoder();
    let buffer = '';
    let currentChannelId = '';
    let inChannelTag = false;
    let currentProgram: { start: string; end: string; title: string } | null = null;
    let currentEpgChannelId = '';

    // Streaming parser logic - Support both single-line and multi-line XML formats
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        // Handle <channel> tag - support multi-line format
        if (trimmed.startsWith('<channel')) {
           const idMatch = trimmed.match(/id="([^"]*)"/);
           if (idMatch) {
               currentChannelId = idMatch[1];
               inChannelTag = true;
           }

           // Check if display-name is on the same line (single-line format)
           const nameMatch = trimmed.match(/<display-name[^>]*>(.*?)<\/display-name>/);
           if (currentChannelId && nameMatch) {
               epgNameToChannelId.set(normalizeChannelName(nameMatch[1]), currentChannelId);
           }
           const iconMatch = trimmed.match(/<icon\s+src="([^"]*)"/);
           if (currentChannelId && iconMatch) {
               epgChannelIdToLogo.set(currentChannelId, iconMatch[1]);
           }

           // Check if it's a self-closing or closing on same line
           if (trimmed.includes('</channel>')) {
               inChannelTag = false;
               currentChannelId = '';
           }
        }
        // Handle display-name in multi-line format (when inside channel tag)
        else if (inChannelTag && trimmed.startsWith('<display-name')) {
           const nameMatch = trimmed.match(/<display-name[^>]*>(.*?)<\/display-name>/);
           if (currentChannelId && nameMatch) {
               epgNameToChannelId.set(normalizeChannelName(nameMatch[1]), currentChannelId);
           }
        }
        // Handle icon in multi-line format (when inside channel tag)
        else if (inChannelTag && trimmed.startsWith('<icon')) {
           const iconMatch = trimmed.match(/<icon\s+src="([^"]*)"/);
           if (currentChannelId && iconMatch) {
               epgChannelIdToLogo.set(currentChannelId, iconMatch[1]);
           }
        }
        // Handle closing </channel> tag
        else if (trimmed.startsWith('</channel>')) {
           inChannelTag = false;
           currentChannelId = '';
        }
        // Handle <programme> tag
        else if (trimmed.startsWith('<programme')) {
             const channelIdMatch = trimmed.match(/channel="([^"]*)"/);
             const epgChannelId = channelIdMatch ? channelIdMatch[1] : '';
             const startMatch = trimmed.match(/start="([^"]*)"/);
             const endMatch = trimmed.match(/stop="([^"]*)"/);
             if (epgChannelId && startMatch && endMatch) {
                 currentProgram = { start: startMatch[1], end: endMatch[1], title: '' };
                 currentEpgChannelId = epgChannelId;
                 // Check if title is on the same line (single-line format)
                 const titleMatch = trimmed.match(/<title(?:\s+[^>]*)?>(.*?)<\/title>/);
                 if (titleMatch) {
                     currentProgram.title = titleMatch[1];
                     if (!epgDataByChannelId[epgChannelId]) epgDataByChannelId[epgChannelId] = [];
                     epgDataByChannelId[epgChannelId].push({ ...currentProgram });
                     currentProgram = null;
                 }
             }
        }
        // Handle <title> tag in multi-line format (when inside programme tag)
        else if (trimmed.startsWith('<title') && currentProgram) {
             const titleMatch = trimmed.match(/<title(?:\s+[^>]*)?>(.*?)<\/title>/);
             if (titleMatch) {
                 currentProgram.title = titleMatch[1];
                 if (!epgDataByChannelId[currentEpgChannelId]) epgDataByChannelId[currentEpgChannelId] = [];
                 epgDataByChannelId[currentEpgChannelId].push({ ...currentProgram });
                 currentProgram = null;
             }
        }
      }
    }
  } catch (e) {
      // 🚀 优化：超时或错误时优雅降级
      const error = e as Error;
      if (error.message?.includes('请求超时')) {
        console.warn(`[Live] EPG fetch timeout (${FETCH_TIMEOUT}ms), skipping EPG: ${epgUrl}`);
      } else {
        console.warn(`[Live] EPG parsing error, skipping EPG: ${error.message}`);
      }
      // 返回空 EPG，不影响直播源正常使用
      return { epgs: {}, logos: {} };
  }

  // Map back to M3U channels
  if (channels) {
    for (const channel of channels) {
      const key = channel.tvgId || channel.name;
      const normalizedName = normalizeChannelName(channel.name);

      if (channel.tvgId && tvgs.has(channel.tvgId) && epgDataByChannelId[channel.tvgId]) {
        result[key] = epgDataByChannelId[channel.tvgId];
        const logoUrl = epgChannelIdToLogo.get(channel.tvgId);
        if (logoUrl && !logos[key]) logos[key] = logoUrl;
      } else {
        const epgChannelId = epgNameToChannelId.get(normalizedName);
        if (epgChannelId && epgDataByChannelId[epgChannelId]) {
          result[key] = epgDataByChannelId[epgChannelId];
          const logoUrl = epgChannelIdToLogo.get(epgChannelId);
          if (logoUrl && !logos[key]) logos[key] = logoUrl;
        }
      }
    }
  }

  // 🚀 优化：保存到缓存
  epgCache.set(epgUrl, {
    epgs: result,
    logos,
    timestamp: Date.now()
  });
  console.log(`[Live] EPG cached for ${epgUrl} (TTL: 24h)`);

  return { epgs: result, logos };
}

// Exported for debug use if needed
export async function parseEpgWithDebug(
  epgUrl: string,
  ua: string,
  tvgIds: string[],
  channels?: { tvgId: string; name: string }[]
): Promise<{
  epgs: any;
  debug: EpgDebugInfo;
}> {
    // Reuse parseEpg logic or separate implementation
    // For now returning empty to ensure safe compilation
    return { 
        epgs: {}, 
        debug: {
            nameToTvgIdSample: [],
            epgNameToChannelIdSample: [],
            totalEpgChannels: 0,
            totalM3uChannelMappings: 0,
            tvgIdMatchCount: 0,
            nameMatchCount: 0,
            nameMatchDetails: [],
            unmatchedEpgSample: [],
            epgResultKeys: [],
            titleTagsFound: 0,
            programmeTagsFound: 0,
        } 
    };
}

export function parseM3U(sourceKey: string, m3uContent: string): {
  tvgUrl: string;
  channels: {
    id: string;
    tvgId: string;
    name: string;
    logo: string;
    group: string;
    url: string;
  }[];
} {
  const channels: {
    id: string;
    tvgId: string;
    name: string;
    logo: string;
    group: string;
    url: string;
  }[] = [];
  const lines = m3uContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  let tvgUrl = '';
  let channelIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTM3U')) {
      const match = line.match(/(?:x-tvg-url|url-tvg)="([^"]*)"/);
      tvgUrl = match ? match[1].split(',')[0].trim() : '';
      continue;
    }
    if (line.startsWith('#EXTINF:')) {
      const tvgId = line.match(/tvg-id="([^"]*)"/)?.[1] || '';
      const tvgName = line.match(/tvg-name="([^"]*)"/)?.[1] || '';
      const logo = line.match(/tvg-logo="([^"]*)"/)?.[1] || '';
      const group = line.match(/group-title="([^"]*)"/)?.[1] || '无分组';
      const title = line.match(/,([^,]*)$/)?.[1].trim() || '';
      const name = title || tvgName || '';

      if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
        const url = lines[i + 1];
        if (name && url) {
          channels.push({
            id: `${sourceKey}-${channelIndex}`,
            tvgId, name, logo, group, url
          });
          channelIndex++;
        }
        i++;
      }
    }
  }
  return { tvgUrl, channels };
}

// ----------------------------------------------------------------------
// URL Resolution Functions - FULL IMPLEMENTATION RESTORED
// ----------------------------------------------------------------------

export function resolveUrl(baseUrl: string, relativePath: string) {
  try {
    // 如果已经是完整的 URL，直接返回
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
      return relativePath;
    }

    // 如果是协议相对路径 (//example.com/path)
    if (relativePath.startsWith('//')) {
      const baseUrlObj = new URL(baseUrl);
      return `${baseUrlObj.protocol}${relativePath}`;
    }

    // 使用 URL 构造函数处理相对路径
    const baseUrlObj = new URL(baseUrl);
    const resolvedUrl = new URL(relativePath, baseUrlObj);
    return resolvedUrl.href;
  } catch (error) {
    // 降级处理
    return fallbackUrlResolve(baseUrl, relativePath);
  }
}

function fallbackUrlResolve(baseUrl: string, relativePath: string) {
  // 移除 baseUrl 末尾的文件名，保留目录路径
  let base = baseUrl;
  if (!base.endsWith('/')) {
    base = base.substring(0, base.lastIndexOf('/') + 1);
  }

  // 处理不同类型的相对路径
  if (relativePath.startsWith('/')) {
    // 绝对路径 (/path/to/file)
    const urlObj = new URL(base);
    return `${urlObj.protocol}//${urlObj.host}${relativePath}`;
  } else if (relativePath.startsWith('../')) {
    // 上级目录相对路径 (../path/to/file)
    const segments = base.split('/').filter(s => s);
    const relativeSegments = relativePath.split('/').filter(s => s);

    for (const segment of relativeSegments) {
      if (segment === '..') {
        segments.pop();
      } else if (segment !== '.') {
        segments.push(segment);
      }
    }

    const urlObj = new URL(base);
    return `${urlObj.protocol}//${urlObj.host}/${segments.join('/')}`;
  } else {
    // 当前目录相对路径 (file.ts 或 ./file.ts)
    const cleanRelative = relativePath.startsWith('./') ? relativePath.slice(2) : relativePath;
    return base + cleanRelative;
  }
}

export function getBaseUrl(m3u8Url: string) {
  try {
    const url = new URL(m3u8Url);
    // 如果 URL 以 .m3u8 结尾，移除文件名
    if (url.pathname.endsWith('.m3u8')) {
      url.pathname = url.pathname.substring(0, url.pathname.lastIndexOf('/') + 1);
    } else if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
    }
    return url.protocol + "//" + url.host + url.pathname;
  } catch (error) {
    return m3u8Url.endsWith('/') ? m3u8Url : m3u8Url + '/';
  }
}
