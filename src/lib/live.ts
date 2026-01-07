/* eslint-disable no-constant-condition */

import { getConfig } from "@/lib/config";
import { db } from "@/lib/db";

const defaultUA = 'AptvPlayer/1.4.10'

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
  from: 'config' | 'custom';
  channelNumber?: number;
  disabled?: boolean;
}): Promise<number> {
  if (cachedLiveChannels[liveInfo.key]) {
    delete cachedLiveChannels[liveInfo.key];
  }
  const ua = liveInfo.ua || defaultUA;
  const response = await fetch(liveInfo.url, {
    headers: {
      'User-Agent': ua,
    },
  });
  const data = await response.text();
  const result = parseM3U(liveInfo.key, data);
  const epgUrl = liveInfo.epg || result.tvgUrl;
  const { epgs, logos } = await parseEpg(
    epgUrl,
    liveInfo.ua || defaultUA,
    result.channels.map(channel => channel.tvgId).filter(tvgId => tvgId),
    result.channels // 传入完整的频道列表用于名称匹配
  );
  cachedLiveChannels[liveInfo.key] = {
    channelNumber: result.channels.length,
    channels: result.channels,
    epgUrl: epgUrl,
    epgs: epgs,
    epgLogos: logos,
  };
  return result.channels.length;
}

/**
 * 清理频道名称用于匹配
 * 移除常见前缀、特殊字符等，但保留 (a) (b) (c) 等版本标识
 */
function normalizeChannelName(name: string): string {
  return name
    // 移除前缀如 [TW-I]、[HK]、01、02 等
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^\d+\s+/g, '')
    // 移除质量标识如 HD、4K 等（但保留在括号外的）
    .replace(/\s*(HD|4K|FHD|UHD)\s*$/gi, '')
    .replace(/\s+(HD|4K|FHD|UHD)\s+/gi, ' ')
    // 移除多余空格
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
    [key: string]: string; // tvgId/name -> logo URL
  };
}> {
  if (!epgUrl) {
    return { epgs: {}, logos: {} };
  }

  const tvgs = new Set(tvgIds);
  const result: { [key: string]: { start: string; end: string; title: string }[] } = {};
  const logos: { [key: string]: string } = {};

  // 第一阶段：收集 EPG 数据（按 EPG channel ID 存储）
  const epgDataByChannelId: { [channelId: string]: { start: string; end: string; title: string }[] } = {};

  // 存储 EPG 频道名称到 channel ID 的映射（用于名称匹配）
  const epgNameToChannelId = new Map<string, string>();
  // 反向映射：EPG channel ID 到标准化名称数组（支持一个ID对应多个名称）
  const epgChannelIdToNames = new Map<string, string[]>();
  // EPG channel ID 到 logo URL 的映射
  const epgChannelIdToLogo = new Map<string, string>();

  try {
    const response = await fetch(epgUrl, {
      headers: {
        'User-Agent': ua,
      },
    });
    if (!response.ok) {
      return { epgs: {}, logos: {} };
    }

    // 使用 ReadableStream 逐行处理，避免将整个文件加载到内存
    const reader = response.body?.getReader();
    if (!reader) {
      return { epgs: {}, logos: {} };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEpgChannelId = '';
    let currentProgram: { start: string; end: string; title: string } | null = null;
    let currentChannelId = ''; // 用于跨行解析 <channel> 标签

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // 保留最后一行（可能不完整）
      buffer = lines.pop() || '';

      // 处理完整的行
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // 解析 <channel> 开始标签
        if (trimmedLine.startsWith('<channel')) {
          const channelIdMatch = trimmedLine.match(/id="([^"]*)"/);
          currentChannelId = channelIdMatch ? channelIdMatch[1] : '';

          // 查找 display-name（可能在同一行）
          const displayNameMatch = trimmedLine.match(/<display-name[^>]*>(.*?)<\/display-name>/);
          if (currentChannelId && displayNameMatch) {
            const displayName = displayNameMatch[1];
            const normalizedDisplayName = normalizeChannelName(displayName);
            epgNameToChannelId.set(normalizedDisplayName, currentChannelId);

            // 支持一个 channel ID 对应多个 display-name
            if (!epgChannelIdToNames.has(currentChannelId)) {
              epgChannelIdToNames.set(currentChannelId, []);
            }
            epgChannelIdToNames.get(currentChannelId)!.push(normalizedDisplayName);
          }

          // 提取 icon URL（可能在同一行）
          const iconMatch = trimmedLine.match(/<icon\s+src="([^"]*)"/);
          if (currentChannelId && iconMatch) {
            const iconUrl = iconMatch[1];
            epgChannelIdToLogo.set(currentChannelId, iconUrl);
          }

          continue;
        }

        // 解析 <display-name> 标签（在 <channel> 后的单独一行）
        if (trimmedLine.startsWith('<display-name') && currentChannelId) {
          const displayNameMatch = trimmedLine.match(/<display-name[^>]*>(.*?)<\/display-name>/);
          if (displayNameMatch) {
            const displayName = displayNameMatch[1];
            const normalizedDisplayName = normalizeChannelName(displayName);
            epgNameToChannelId.set(normalizedDisplayName, currentChannelId);

            if (!epgChannelIdToNames.has(currentChannelId)) {
              epgChannelIdToNames.set(currentChannelId, []);
            }
            epgChannelIdToNames.get(currentChannelId)!.push(normalizedDisplayName);
          }
          continue;
        }

        // 解析 <icon> 标签（在单独一行）
        if (trimmedLine.startsWith('<icon') && currentChannelId) {
          const iconMatch = trimmedLine.match(/<icon\s+src="([^"]*)"/);
          if (iconMatch) {
            const iconUrl = iconMatch[1];
            epgChannelIdToLogo.set(currentChannelId, iconUrl);
          }
          continue;
        }

        // 结束 channel 标签
        if (trimmedLine === '</channel>') {
          currentChannelId = '';
          continue;
        }

        // 解析 <programme> 标签 - 直接按 EPG channel ID 存储
        if (trimmedLine.startsWith('<programme')) {

          // 提取 channel ID
          const channelIdMatch = trimmedLine.match(/channel="([^"]*)"/);
          const epgChannelId = channelIdMatch ? channelIdMatch[1] : '';

          // 提取开始时间
          const startMatch = trimmedLine.match(/start="([^"]*)"/);
          const start = startMatch ? startMatch[1] : '';

          // 提取结束时间
          const endMatch = trimmedLine.match(/stop="([^"]*)"/);
          const end = endMatch ? endMatch[1] : '';

          if (epgChannelId && start && end) {
            currentProgram = { start, end, title: '' };
            currentEpgChannelId = epgChannelId;

            // 检查是否 <title> 在同一行（内联格式）
            const inlineTitleMatch = trimmedLine.match(/<title(?:\s+[^>]*)?>(.*?)<\/title>/);
            if (inlineTitleMatch) {
              currentProgram.title = inlineTitleMatch[1];

              // 保存到 EPG channel ID 对应的数组
              if (!epgDataByChannelId[epgChannelId]) {
                epgDataByChannelId[epgChannelId] = [];
              }
              epgDataByChannelId[epgChannelId].push({ ...currentProgram });
              currentProgram = null;
            }
          }
        }
        // 解析 <title> 标签
        else if (trimmedLine.startsWith('<title') && currentProgram) {
          const titleMatch = trimmedLine.match(/<title(?:\s+[^>]*)?>(.*?)<\/title>/);
          if (titleMatch && currentProgram) {
            currentProgram.title = titleMatch[1];

            // 保存到 EPG channel ID 对应的数组
            if (!epgDataByChannelId[currentEpgChannelId]) {
              epgDataByChannelId[currentEpgChannelId] = [];
            }
            epgDataByChannelId[currentEpgChannelId].push({ ...currentProgram });

            currentProgram = null;
          }
        }
        // 处理 </programme> 标签
        else if (trimmedLine === '</programme>') {
          currentProgram = null;
          currentEpgChannelId = '';
        }
      }
    }
  } catch (error) {
    // ignore
  }

  // 第二阶段：为每个 M3U 频道分配 EPG 数据
  if (channels) {
    for (const channel of channels) {
      const key = channel.tvgId || channel.name;
      const normalizedName = normalizeChannelName(channel.name);

      // 优先使用 tvg-id 精确匹配
      if (channel.tvgId && tvgs.has(channel.tvgId) && epgDataByChannelId[channel.tvgId]) {
        result[key] = epgDataByChannelId[channel.tvgId];
        const logoUrl = epgChannelIdToLogo.get(channel.tvgId);
        if (logoUrl && !logos[key]) {
          logos[key] = logoUrl;
        }
      } else {
        // 使用名称匹配：通过标准化名称查找 EPG channel ID
        const epgChannelId = epgNameToChannelId.get(normalizedName);
        if (epgChannelId && epgDataByChannelId[epgChannelId]) {
          result[key] = epgDataByChannelId[epgChannelId];
          const logoUrl = epgChannelIdToLogo.get(epgChannelId);
          if (logoUrl && !logos[key]) {
            logos[key] = logoUrl;
          }
          console.log(`[EPG] 名称匹配成功: "${normalizedName}" -> EPG channel ${epgChannelId} (${epgDataByChannelId[epgChannelId].length} programmes)`);
        }
      }
    }
  }

  return { epgs: result, logos };
}

// 新增诊断版本的 parseEpg，返回详细的调试信息
export async function parseEpgWithDebug(
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
  debug: EpgDebugInfo;
}> {
  const debugInfo: EpgDebugInfo = {
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
  };

  if (!epgUrl) {
    return { epgs: {}, debug: debugInfo };
  }

  const tvgs = new Set(tvgIds);
  const result: { [key: string]: { start: string; end: string; title: string }[] } = {};

  // 第一阶段：收集 EPG 数据（按 EPG channel ID 存储）
  const epgDataByChannelId: { [channelId: string]: { start: string; end: string; title: string }[] } = {};

  // 构建频道名称到 tvgId 的映射（用于后备匹配）
  const nameToTvgId = new Map<string, string>();
  if (channels) {
    for (const channel of channels) {
      const normalizedName = normalizeChannelName(channel.name);
      if (normalizedName) {
        // 如果有 tvg-id 就用 tvg-id，否则用频道名称作为 key
        const key = channel.tvgId || channel.name;
        nameToTvgId.set(normalizedName, key);
      }
    }
    debugInfo.totalM3uChannelMappings = nameToTvgId.size;
    // 采样前 10 个
    debugInfo.nameToTvgIdSample = Array.from(nameToTvgId.entries())
      .slice(0, 10)
      .map(([normalizedName, key]) => ({ normalizedName, key }));
  }

  // 存储 EPG 频道名称到 channel ID 的映射（用于名称匹配）
  const epgNameToChannelId = new Map<string, string>();
  // 反向映射：EPG channel ID 到标准化名称数组（支持一个ID对应多个名称）
  const epgChannelIdToNames = new Map<string, string[]>();
  // EPG channel ID 到 logo URL 的映射
  const epgChannelIdToLogo = new Map<string, string>();

  try {
    const response = await fetch(epgUrl, {
      headers: {
        'User-Agent': ua,
      },
    });
    if (!response.ok) {
      return { epgs: {}, debug: debugInfo };
    }

    // 使用 ReadableStream 逐行处理，避免将整个文件加载到内存
    const reader = response.body?.getReader();
    if (!reader) {
      return { epgs: {}, debug: debugInfo };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let currentEpgChannelId = '';
    let currentProgram: { start: string; end: string; title: string } | null = null;
    let currentChannelId = ''; // 用于跨行解析 <channel> 标签

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // 保留最后一行（可能不完整）
      buffer = lines.pop() || '';

      // 处理完整的行
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // 解析 <channel> 开始标签
        if (trimmedLine.startsWith('<channel')) {
          const channelIdMatch = trimmedLine.match(/id="([^"]*)"/);
          currentChannelId = channelIdMatch ? channelIdMatch[1] : '';

          // 查找 display-name（可能在同一行）
          const displayNameMatch = trimmedLine.match(/<display-name[^>]*>(.*?)<\/display-name>/);
          if (currentChannelId && displayNameMatch) {
            const displayName = displayNameMatch[1];
            const normalizedDisplayName = normalizeChannelName(displayName);
            epgNameToChannelId.set(normalizedDisplayName, currentChannelId);

            // 支持一个 channel ID 对应多个 display-name
            if (!epgChannelIdToNames.has(currentChannelId)) {
              epgChannelIdToNames.set(currentChannelId, []);
            }
            epgChannelIdToNames.get(currentChannelId)!.push(normalizedDisplayName);
          }

          // 提取 icon URL（可能在同一行）
          const iconMatch = trimmedLine.match(/<icon\s+src="([^"]*)"/);
          if (currentChannelId && iconMatch) {
            const iconUrl = iconMatch[1];
            epgChannelIdToLogo.set(currentChannelId, iconUrl);
          }

          continue;
        }

        // 解析 <display-name> 标签（在 <channel> 后的单独一行）
        if (trimmedLine.startsWith('<display-name') && currentChannelId) {
          const displayNameMatch = trimmedLine.match(/<display-name[^>]*>(.*?)<\/display-name>/);
          if (displayNameMatch) {
            const displayName = displayNameMatch[1];
            const normalizedDisplayName = normalizeChannelName(displayName);
            epgNameToChannelId.set(normalizedDisplayName, currentChannelId);

            if (!epgChannelIdToNames.has(currentChannelId)) {
              epgChannelIdToNames.set(currentChannelId, []);
            }
            epgChannelIdToNames.get(currentChannelId)!.push(normalizedDisplayName);
          }
          continue;
        }

        // 解析 <icon> 标签（在单独一行）
        if (trimmedLine.startsWith('<icon') && currentChannelId) {
          const iconMatch = trimmedLine.match(/<icon\s+src="([^"]*)"/);
          if (iconMatch) {
            const iconUrl = iconMatch[1];
            epgChannelIdToLogo.set(currentChannelId, iconUrl);
          }
          continue;
        }

        // 结束 channel 标签
        if (trimmedLine === '</channel>') {
          currentChannelId = '';
          continue;
        }

        // 解析 <programme> 标签 - 直接按 EPG channel ID 存储
        if (trimmedLine.startsWith('<programme')) {
          debugInfo.programmeTagsFound++;

          // 提取 channel ID
          const channelIdMatch = trimmedLine.match(/channel="([^"]*)"/);
          const epgChannelId = channelIdMatch ? channelIdMatch[1] : '';

          // 提取开始时间
          const startMatch = trimmedLine.match(/start="([^"]*)"/);
          const start = startMatch ? startMatch[1] : '';

          // 提取结束时间
          const endMatch = trimmedLine.match(/stop="([^"]*)"/);
          const end = endMatch ? endMatch[1] : '';

          if (epgChannelId && start && end) {
            currentProgram = { start, end, title: '' };
            currentEpgChannelId = epgChannelId;

            // 检查是否 <title> 在同一行（内联格式）
            const inlineTitleMatch = trimmedLine.match(/<title(?:\s+[^>]*)?>(.*?)<\/title>/);
            if (inlineTitleMatch) {
              currentProgram.title = inlineTitleMatch[1];

              // 保存到 EPG channel ID 对应的数组
              if (!epgDataByChannelId[epgChannelId]) {
                epgDataByChannelId[epgChannelId] = [];
              }
              epgDataByChannelId[epgChannelId].push({ ...currentProgram });
              debugInfo.titleTagsFound++;
              currentProgram = null;
            }
          }
        }
        // 解析 <title> 标签
        else if (trimmedLine.startsWith('<title') && currentProgram) {
          debugInfo.titleTagsFound++;
          const titleMatch = trimmedLine.match(/<title(?:\s+[^>]*)?>(.*?)<\/title>/);
          if (titleMatch && currentProgram) {
            currentProgram.title = titleMatch[1];

            // 保存到 EPG channel ID 对应的数组
            if (!epgDataByChannelId[currentEpgChannelId]) {
              epgDataByChannelId[currentEpgChannelId] = [];
            }
            epgDataByChannelId[currentEpgChannelId].push({ ...currentProgram });

            currentProgram = null;
          }
        }
        // 处理 </programme> 标签
        else if (trimmedLine === '</programme>') {
          currentProgram = null;
          currentEpgChannelId = '';
        }
      }
    }

    // 在解析完成后，设置 EPG 频道总数和采样
    debugInfo.totalEpgChannels = epgNameToChannelId.size;
    debugInfo.epgNameToChannelIdSample = Array.from(epgNameToChannelId.entries())
      .slice(0, 10)
      .map(([normalizedName, channelId]) => ({ normalizedName, channelId }));
    debugInfo.epgResultKeys = Object.keys(result).slice(0, 10);

  } catch (error) {
    // ignore
  }

  // 第二阶段：为每个 M3U 频道分配 EPG 数据，并更新 debug 统计
  if (channels) {
    for (const channel of channels) {
      const key = channel.tvgId || channel.name;
      const normalizedName = normalizeChannelName(channel.name);

      // 优先使用 tvg-id 精确匹配
      if (channel.tvgId && tvgs.has(channel.tvgId) && epgDataByChannelId[channel.tvgId]) {
        result[key] = epgDataByChannelId[channel.tvgId];
        debugInfo.tvgIdMatchCount++;
        const logoUrl = epgChannelIdToLogo.get(channel.tvgId);
        if (logoUrl && !result[key]) {
          // logos not used in debug version
        }
      } else {
        // 使用名称匹配：通过标准化名称查找 EPG channel ID
        const epgChannelId = epgNameToChannelId.get(normalizedName);
        if (epgChannelId && epgDataByChannelId[epgChannelId]) {
          result[key] = epgDataByChannelId[epgChannelId];
          debugInfo.nameMatchCount++;
          // 只记录前 10 个名称匹配详情
          if (debugInfo.nameMatchDetails.length < 10) {
            debugInfo.nameMatchDetails.push({
              epgName: normalizedName,
              m3uKey: key,
            });
          }
        }
      }
    }
  }

  debugInfo.epgResultKeys = Object.keys(result).slice(0, 10);

  return { epgs: result, debug: debugInfo };
}

/**
 * 解析M3U文件内容，提取频道信息
 * @param m3uContent M3U文件的内容字符串
 * @returns 频道信息数组
 */
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

    // 检查是否是 #EXTM3U 行，提取 tvg-url
    if (line.startsWith('#EXTM3U')) {
      // 支持两种格式：x-tvg-url 和 url-tvg
      const tvgUrlMatch = line.match(/(?:x-tvg-url|url-tvg)="([^"]*)"/);
      tvgUrl = tvgUrlMatch ? tvgUrlMatch[1].split(',')[0].trim() : '';
      continue;
    }

    // 检查是否是 #EXTINF 行
    if (line.startsWith('#EXTINF:')) {
      // 提取 tvg-id
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
      const tvgId = tvgIdMatch ? tvgIdMatch[1] : '';

      // 提取 tvg-name
      const tvgNameMatch = line.match(/tvg-name="([^"]*)"/);
      const tvgName = tvgNameMatch ? tvgNameMatch[1] : '';

      // 提取 tvg-logo
      const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/);
      const logo = tvgLogoMatch ? tvgLogoMatch[1] : '';

      // 提取 group-title
      const groupTitleMatch = line.match(/group-title="([^"]*)"/);
      const group = groupTitleMatch ? groupTitleMatch[1] : '无分组';

      // 提取标题（#EXTINF 行最后的逗号后面的内容）
      const titleMatch = line.match(/,([^,]*)$/);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // 优先使用 tvg-name，如果没有则使用标题
      const name = title || tvgName || '';

      // 检查下一行是否是URL
      if (i + 1 < lines.length && !lines[i + 1].startsWith('#')) {
        const url = lines[i + 1];

        // 只有当有名称和URL时才添加到结果中
        if (name && url) {
          channels.push({
            id: `${sourceKey}-${channelIndex}`,
            tvgId,
            name,
            logo,
            group,
            url
          });
          channelIndex++;
        }

        // 跳过下一行，因为已经处理了
        i++;
      }
    }
  }

  return { tvgUrl, channels };
}

// utils/urlResolver.js
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

// 获取 M3U8 的基础 URL
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