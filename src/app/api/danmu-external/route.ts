/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { NextRequest, NextResponse } from 'next/server';
import { getRandomUserAgent, DEFAULT_USER_AGENT } from '@/lib/user-agent';

interface PlatformUrl {
  platform: string;
  url: string;
}

interface DanmuApiResponse {
  code: number;
  name: string;
  danum: number;
  danmuku: any[];
}

interface DanmuItem {
  text: string;
  time: number;
  color?: string;
  mode?: number;
}

// 从caiji.cyou API搜索视频链接
async function searchFromCaijiAPI(title: string, episode?: string | null): Promise<PlatformUrl[]> {
  try {
    console.log(`🔎 在caiji.cyou搜索: "${title}", 集数: ${episode || '未指定'}`);
    
    // 尝试多种标题格式进行搜索
    const searchTitles = [
      title, // 原始标题
      title.replace(/·/g, ''), // 移除中间点
      title.replace(/·/g, ' '), // 中间点替换为空格
      title.replace(/·/g, '-'), // 中间点替换为连字符
    ];
    
    // 去重
    const uniqueTitles = Array.from(new Set(searchTitles));
    console.log(`🔍 尝试搜索标题变体: ${uniqueTitles.map(t => `"${t}"`).join(', ')}`);
    
    for (const searchTitle of uniqueTitles) {
      console.log(`🔎 搜索标题: "${searchTitle}"`);
      const searchUrl = `https://www.caiji.cyou/api.php/provide/vod/?wd=${encodeURIComponent(searchTitle)}`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
        },
      });
    
      if (!response.ok) {
        console.log(`❌ 搜索"${searchTitle}"失败:`, response.status);
        continue; // 尝试下一个标题
      }
      
      const data: any = await response.json();
      if (!data.list || data.list.length === 0) {
        console.log(`📭 搜索"${searchTitle}"未找到内容`);
        continue; // 尝试下一个标题
      }
      
      console.log(`🎬 搜索"${searchTitle}"找到 ${data.list.length} 个匹配结果`);
      
      // 智能选择最佳匹配结果
      let bestMatch: any = null;
      let exactMatch: any = null;
      
      for (const result of data.list) {
        console.log(`📋 候选: "${result.vod_name}" (类型: ${result.type_name})`);
        
        // 标题完全匹配（优先级最高）
        if (result.vod_name === searchTitle || result.vod_name === title) {
          console.log(`🎯 找到完全匹配: "${result.vod_name}"`);
          exactMatch = result;
          break;
        }
        
        // 跳过明显不合适的内容
        const isUnwanted = result.vod_name.includes('解说') || 
                          result.vod_name.includes('预告') ||
                          result.vod_name.includes('花絮') ||
                          result.vod_name.includes('动态漫') ||
                          result.vod_name.includes('之精彩');
        
        if (isUnwanted) {
          console.log(`❌ 跳过不合适内容: "${result.vod_name}"`);
          continue;
        }
        
        // 选择第一个合适的结果
        if (!bestMatch) {
          bestMatch = result;
          console.log(`✅ 选择为候选: "${result.vod_name}"`);
        }
      }
      
      // 优先使用完全匹配，否则使用最佳匹配
      const selectedResult = exactMatch || bestMatch;
      
      if (selectedResult) {
        console.log(`✅ 使用搜索结果"${searchTitle}": "${selectedResult.vod_name}"`);
        // 找到结果就处理并返回，不再尝试其他标题变体
        return await processSelectedResult(selectedResult, episode);
      }
    }
    
    console.log('📭 所有标题变体都未找到匹配内容');
    return [];
    
  } catch (error) {
    console.error('❌ Caiji API搜索失败:', error);
    return [];
  }
}

// 处理选中的结果
async function processSelectedResult(selectedResult: any, episode?: string | null): Promise<PlatformUrl[]> {
  try {
    console.log(`🔄 处理选中的结果: "${selectedResult.vod_name}"`);
    const firstResult: any = selectedResult;
    const detailUrl = `https://www.caiji.cyou/api.php/provide/vod/?ac=detail&ids=${firstResult.vod_id}`;
    
    const detailResponse = await fetch(detailUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
      },
    });
    
    if (!detailResponse.ok) return [];
    
    const detailData: any = await detailResponse.json();
    if (!detailData.list || detailData.list.length === 0) return [];
    
    const videoInfo: any = detailData.list[0];
    console.log(`🎭 视频详情: "${videoInfo.vod_name}" (${videoInfo.vod_year})`);
    
    const urls: PlatformUrl[] = [];
    
    // 解析播放链接
    if (videoInfo.vod_play_url) {
      const playUrls = videoInfo.vod_play_url.split('#');
      console.log(`📺 找到 ${playUrls.length} 集`);
      
      // 如果指定了集数，尝试找到对应集数的链接
      let targetUrl = '';
      if (episode && parseInt(episode) > 0) {
        const episodeNum = parseInt(episode);
        // 支持多种集数格式: "20$", "第20集$", "E20$", "EP20$" 等
        const targetEpisode = playUrls.find((url: string) => {
          return url.startsWith(`${episodeNum}$`) || 
                 url.startsWith(`第${episodeNum}集$`) ||
                 url.startsWith(`E${episodeNum}$`) ||
                 url.startsWith(`EP${episodeNum}$`);
        });
        if (targetEpisode) {
          targetUrl = targetEpisode.split('$')[1];
          console.log(`🎯 找到第${episode}集: ${targetUrl}`);
        } else {
          console.log(`❌ 未找到第${episode}集的链接`);
        }
      }
      
      // 如果没有指定集数或找不到指定集数，使用第一集
      if (!targetUrl && playUrls.length > 0) {
        targetUrl = playUrls[0].split('$')[1];
        console.log(`📺 使用第1集: ${targetUrl}`);
      }
      
      if (targetUrl) {
        // 根据URL判断平台
        let platform = 'unknown';
        if (targetUrl.includes('bilibili.com')) {
          platform = 'bilibili_caiji';
        } else if (targetUrl.includes('v.qq.com') || targetUrl.includes('qq.com')) {
          platform = 'tencent_caiji';
        } else if (targetUrl.includes('iqiyi.com')) {
          platform = 'iqiyi_caiji';
        } else if (targetUrl.includes('youku.com') || targetUrl.includes('v.youku.com')) {
          platform = 'youku_caiji';
        } else if (targetUrl.includes('mgtv.com') || targetUrl.includes('w.mgtv.com')) {
          platform = 'mgtv_caiji';
        }
        
        // 统一修复所有平台的链接格式：将.htm转换为.html
        if (targetUrl.endsWith('.htm')) {
          targetUrl = targetUrl.replace(/\.htm$/, '.html');
          console.log(`🔧 修复${platform}链接格式: ${targetUrl}`);
        }
        
        console.log(`🎯 识别平台: ${platform}, URL: ${targetUrl}`);
        
        urls.push({
          platform: platform,
          url: targetUrl,
        });
      }
    }
    
    console.log(`✅ Caiji API返回 ${urls.length} 个播放链接`);
    return urls;
    
  } catch (error) {
    console.error('❌ Caiji API搜索失败:', error);
    return [];
  }
}

// 用户代理池 - 防止被封IP
// 请求限制器 - 防止被封IP
let lastDoubanRequestTime = 0;
const MIN_DOUBAN_REQUEST_INTERVAL = 1000; // 1秒最小间隔

function randomDelay(min = 500, max = 1500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// 从豆瓣页面提取平台视频链接
async function extractPlatformUrls(doubanId: string, episode?: string | null): Promise<PlatformUrl[]> {
  if (!doubanId) return [];

  // 添加超时控制 - 在try块外定义以便catch块使用
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  
  try {
    // 请求限流：确保请求间隔 - 防止被封IP
    const now = Date.now();
    const timeSinceLastRequest = now - lastDoubanRequestTime;
    if (timeSinceLastRequest < MIN_DOUBAN_REQUEST_INTERVAL) {
      await new Promise(resolve => 
        setTimeout(resolve, MIN_DOUBAN_REQUEST_INTERVAL - timeSinceLastRequest)
      );
    }
    lastDoubanRequestTime = Date.now();

    // 添加随机延时 - 防止被封IP
    await randomDelay(300, 1000);

    // 设置超时控制
    timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`https://movie.douban.com/subject/${doubanId}/`, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        // 随机添加Referer - 防止被封IP
        ...(Math.random() > 0.5 ? { 'Referer': 'https://www.douban.com/' } : {}),
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`❌ 豆瓣页面请求失败: ${response.status}`);
      return [];
    }
    
    const html = await response.text();
    console.log(`📄 豆瓣页面HTML长度: ${html.length}`);
    const urls: PlatformUrl[] = [];

    // 提取豆瓣跳转链接中的各种视频平台URL
    
    // 腾讯视频
    const doubanLinkMatches = html.match(/play_link:\s*"[^"]*v\.qq\.com[^"]*"/g);
    if (doubanLinkMatches && doubanLinkMatches.length > 0) {
      console.log(`🎬 找到 ${doubanLinkMatches.length} 个腾讯视频链接`);
      
      // 如果指定了集数，尝试找到对应集数的链接
      let selectedMatch = doubanLinkMatches[0]; // 默认使用第一个
      if (episode && doubanLinkMatches.length > 1) {
        const episodeNum = parseInt(episode);
        if (episodeNum > 0 && episodeNum <= doubanLinkMatches.length) {
          selectedMatch = doubanLinkMatches[episodeNum - 1];
          console.log(`🎯 选择第${episode}集腾讯视频链接`);
        }
      }
      
      const urlMatch = selectedMatch.match(/https%3A%2F%2Fv\.qq\.com[^"&]*/);
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[0]).split('?')[0];
        console.log(`🔗 腾讯视频链接: ${decodedUrl}`);
        urls.push({ platform: 'tencent', url: decodedUrl });
      }
    }

    // 爱奇艺
    const iqiyiMatches = html.match(/play_link:\s*"[^"]*iqiyi\.com[^"]*"/g);
    if (iqiyiMatches && iqiyiMatches.length > 0) {
      console.log(`📺 找到 ${iqiyiMatches.length} 个爱奇艺链接`);
      
      // 如果指定了集数，尝试找到对应集数的链接
      let selectedMatch = iqiyiMatches[0]; // 默认使用第一个
      if (episode && iqiyiMatches.length > 1) {
        const episodeNum = parseInt(episode);
        if (episodeNum > 0 && episodeNum <= iqiyiMatches.length) {
          selectedMatch = iqiyiMatches[episodeNum - 1];
          console.log(`🎯 选择第${episode}集爱奇艺链接`);
        }
      }
      
      const urlMatch = selectedMatch.match(/https?%3A%2F%2F[^"&]*iqiyi\.com[^"&]*/);
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[0]).split('?')[0];
        console.log(`🔗 爱奇艺链接: ${decodedUrl}`);
        urls.push({ platform: 'iqiyi', url: decodedUrl });
      }
    }

    // 优酷
    const youkuMatches = html.match(/play_link:\s*"[^"]*youku\.com[^"]*"/g);
    if (youkuMatches && youkuMatches.length > 0) {
      console.log(`🎞️ 找到 ${youkuMatches.length} 个优酷链接`);
      
      // 如果指定了集数，尝试找到对应集数的链接
      let selectedMatch = youkuMatches[0]; // 默认使用第一个
      if (episode && youkuMatches.length > 1) {
        const episodeNum = parseInt(episode);
        if (episodeNum > 0 && episodeNum <= youkuMatches.length) {
          selectedMatch = youkuMatches[episodeNum - 1];
          console.log(`🎯 选择第${episode}集优酷链接`);
        }
      }
      
      const urlMatch = selectedMatch.match(/https?%3A%2F%2F[^"&]*youku\.com[^"&]*/);
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[0]).split('?')[0];
        console.log(`🔗 优酷链接: ${decodedUrl}`);
        urls.push({ platform: 'youku', url: decodedUrl });
      }
    }

    // 直接提取腾讯视频链接
    const qqMatches = html.match(/https:\/\/v\.qq\.com\/x\/cover\/[^"'\s]+/g);
    if (qqMatches && qqMatches.length > 0) {
      console.log(`🎭 找到直接腾讯链接: ${qqMatches[0]}`);
      urls.push({
        platform: 'tencent_direct',
        url: qqMatches[0].split('?')[0],
      });
    }

    // B站链接提取（直接链接）
    const biliMatches = html.match(/https:\/\/www\.bilibili\.com\/video\/[^"'\s]+/g);
    if (biliMatches && biliMatches.length > 0) {
      console.log(`📺 找到B站直接链接: ${biliMatches[0]}`);
      urls.push({
        platform: 'bilibili', 
        url: biliMatches[0].split('?')[0],
      });
    }

    // B站链接提取（豆瓣跳转链接）
    const biliDoubanMatches = html.match(/play_link:\s*"[^"]*bilibili\.com[^"]*"/g);
    if (biliDoubanMatches && biliDoubanMatches.length > 0) {
      console.log(`📱 找到 ${biliDoubanMatches.length} 个B站豆瓣链接`);
      
      // 如果指定了集数，尝试找到对应集数的链接
      let selectedMatch = biliDoubanMatches[0]; // 默认使用第一个
      if (episode && biliDoubanMatches.length > 1) {
        const episodeNum = parseInt(episode);
        if (episodeNum > 0 && episodeNum <= biliDoubanMatches.length) {
          selectedMatch = biliDoubanMatches[episodeNum - 1];
          console.log(`🎯 选择第${episode}集B站豆瓣链接`);
        }
      }
      
      const urlMatch = selectedMatch.match(/https?%3A%2F%2F[^"&]*bilibili\.com[^"&]*/);
      if (urlMatch) {
        const decodedUrl = decodeURIComponent(urlMatch[0]).split('?')[0];
        console.log(`🔗 B站豆瓣链接: ${decodedUrl}`);
        urls.push({ platform: 'bilibili_douban', url: decodedUrl });
      }
    }

    // 转换移动版链接为PC版链接（弹幕库API需要PC版）
    const convertedUrls = urls.map(urlObj => {
      let convertedUrl = urlObj.url;
      
      // 优酷移动版转PC版
      if (convertedUrl.includes('m.youku.com/alipay_video/id_')) {
        convertedUrl = convertedUrl.replace(
          /https:\/\/m\.youku\.com\/alipay_video\/id_([^.]+)\.html/,
          'https://v.youku.com/v_show/id_$1.html'
        );
        console.log(`🔄 优酷移动版转PC版: ${convertedUrl}`);
      }
      
      // 爱奇艺移动版转PC版
      if (convertedUrl.includes('m.iqiyi.com/')) {
        convertedUrl = convertedUrl.replace('m.iqiyi.com', 'www.iqiyi.com');
        console.log(`🔄 爱奇艺移动版转PC版: ${convertedUrl}`);
      }
      
      // 腾讯视频移动版转PC版
      if (convertedUrl.includes('m.v.qq.com/')) {
        convertedUrl = convertedUrl.replace('m.v.qq.com', 'v.qq.com');
        console.log(`🔄 腾讯移动版转PC版: ${convertedUrl}`);
      }
      
      // B站移动版转PC版
      if (convertedUrl.includes('m.bilibili.com/')) {
        convertedUrl = convertedUrl.replace('m.bilibili.com', 'www.bilibili.com');
        // 移除豆瓣来源参数
        convertedUrl = convertedUrl.split('?')[0];
        console.log(`🔄 B站移动版转PC版: ${convertedUrl}`);
      }
      
      return { ...urlObj, url: convertedUrl };
    });

    console.log(`✅ 总共提取到 ${convertedUrls.length} 个平台链接`);
    return convertedUrls;
  } catch (error) {
    // 清理超时定时器
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('❌ 豆瓣请求超时 (10秒):', doubanId);
    } else {
      console.error('❌ 提取平台链接失败:', error);
    }
    return [];
  }
}

// 从XML API获取弹幕数据（支持多个备用URL）
async function fetchDanmuFromXMLAPI(videoUrl: string): Promise<DanmuItem[]> {
  const xmlApiUrls = [
    'https://fc.lyz05.cn',
    'https://danmu.smone.us'
  ];
  
  // 尝试每个API URL
  for (let i = 0; i < xmlApiUrls.length; i++) {
    const baseUrl = xmlApiUrls[i];
    const apiName = i === 0 ? '主用XML API' : `备用XML API ${i}`;
    const controller = new AbortController();
    const timeout = 15000; // 15秒超时
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const apiUrl = `${baseUrl}/?url=${encodeURIComponent(videoUrl)}`;
      console.log(`🌐 正在请求${apiName}:`, apiUrl);
      
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Accept': 'application/xml, text/xml, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });
      
      clearTimeout(timeoutId);
      console.log(`📡 ${apiName}响应状态:`, response.status, response.statusText);

      if (!response.ok) {
        console.log(`❌ ${apiName}响应失败:`, response.status);
        continue; // 尝试下一个API
      }

      const responseText = await response.text();
      console.log(`📄 ${apiName}原始响应长度:`, responseText.length);
      
      // 使用正则表达式解析XML（Node.js兼容）
      const danmakuRegex = /<d p="([^"]*)"[^>]*>([^<]*)<\/d>/g;
      const danmuList: DanmuItem[] = [];
      let match;
      const count = 0;
      
      // 🚀 激进性能优化策略 - 基于ArtPlayer源码深度分析
      // 核心问题: 大量弹幕导致内存占用和计算密集
      // 解决方案: 智能分段加载 + 动态密度控制 + 预计算优化

      const SEGMENT_DURATION = 300; // 5分钟分段
      const MAX_DANMU_PER_SEGMENT = 500; // 每段最大弹幕数
      // const MAX_CONCURRENT_DANMU = 50; // 同时显示的最大弹幕数 - 在前端控制
      const BATCH_SIZE = 200; // 减小批处理大小，更频繁让出控制权

      const timeSegments: { [key: number]: DanmuItem[] } = {};
      let totalProcessed = 0;
      let batchCount = 0;

      while ((match = danmakuRegex.exec(responseText)) !== null) {
        try {
          const pAttr = match[1];
          const text = match[2];

          if (!pAttr || !text) continue;

          // 🔥 激进预过滤: 更严格的质量控制
          const trimmedText = text.trim();
          if (trimmedText.length === 0 ||
              trimmedText.length > 50 || // 更严格的长度限制
              trimmedText.length < 2 ||  // 过短弹幕通常是无意义的
              /^[^\u4e00-\u9fa5a-zA-Z0-9]+$/.test(trimmedText) || // 纯符号弹幕
              trimmedText.includes('弹幕正在赶来') ||
              trimmedText.includes('视频不错') ||
              trimmedText.includes('666') ||
              /^\d+$/.test(trimmedText) || // 纯数字弹幕
              /^[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/.test(trimmedText)) { // 纯标点符号
            continue;
          }

          // XML格式解析
          const params = pAttr.split(',');
          if (params.length < 4) continue;

          const time = parseFloat(params[0]) || 0;
          const mode = parseInt(params[1]) || 0;
          const colorInt = parseInt(params[3]) || 16777215;

          // 时间范围和有效性检查
          if (time < 0 || time > 86400 || !Number.isFinite(time)) continue;

          // 🎯 智能分段: 按时间分段存储，便于按需加载
          const segmentIndex = Math.floor(time / SEGMENT_DURATION);
          if (!timeSegments[segmentIndex]) {
            timeSegments[segmentIndex] = [];
          }

          // 🎯 密度控制: 每段限制弹幕数量，优先保留质量高的
          if (timeSegments[segmentIndex].length >= MAX_DANMU_PER_SEGMENT) {
            // 如果当前段已满，随机替换（保持弹幕多样性）
            if (Math.random() < 0.1) { // 10%概率替换
              const randomIndex = Math.floor(Math.random() * timeSegments[segmentIndex].length);
              timeSegments[segmentIndex][randomIndex] = {
                text: trimmedText,
                time: time,
                color: '#' + colorInt.toString(16).padStart(6, '0').toUpperCase(),
                mode: mode === 4 ? 1 : mode === 5 ? 2 : 0,
              };
            }
            continue;
          }

          timeSegments[segmentIndex].push({
            text: trimmedText,
            time: time,
            color: '#' + colorInt.toString(16).padStart(6, '0').toUpperCase(),
            mode: mode === 4 ? 1 : mode === 5 ? 2 : 0,
          });

          totalProcessed++;
          batchCount++;

          // 🔄 更频繁的批量处理控制
          if (batchCount >= BATCH_SIZE) {
            await new Promise(resolve => setTimeout(resolve, 0));
            batchCount = 0;

            // 进度反馈，避免用户以为卡死
            if (totalProcessed % 1000 === 0) {
              console.log(`📊 已处理 ${totalProcessed} 条弹幕，分段数: ${Object.keys(timeSegments).length}`);
            }
          }
        } catch (error) {
          console.error(`❌ 解析第${totalProcessed}条XML弹幕失败:`, error);
        }
      }

      // 🎯 将分段数据重新整合为时间排序的数组
      console.log(`📈 分段统计: 共 ${Object.keys(timeSegments).length} 个时间段`);

      for (const segmentIndex of Object.keys(timeSegments).sort((a, b) => parseInt(a) - parseInt(b))) {
        const segment = timeSegments[parseInt(segmentIndex)];
        // 段内按时间排序，提高播放时的查找效率
        segment.sort((a, b) => a.time - b.time);
        danmuList.push(...segment);
      }
      
      console.log(`📊 ${apiName}找到 ${danmuList.length} 条弹幕数据`);
      
      if (danmuList.length === 0) {
        console.log(`📭 ${apiName}未返回弹幕数据`);
        console.log(`🔍 ${apiName}响应前500字符:`, responseText.substring(0, 500));
        continue; // 尝试下一个API
      }
      
      // 🎯 优化后的最终处理，避免重复操作
      // 由于上面已经分段排序，这里只需要简单去重和最终验证
      const filteredDanmu = danmuList.filter(item =>
        !item.text.includes('官方弹幕库') &&
        !item.text.includes('哔哩哔哩') // 额外过滤平台相关内容
      );

      // 🚀 性能统计和限制
      const maxAllowedDanmu = 20000; // 设置合理的最大弹幕数量
      let finalDanmu = filteredDanmu;

      if (filteredDanmu.length > maxAllowedDanmu) {
        console.warn(`⚠️ 弹幕数量过多 (${filteredDanmu.length})，采用智能采样至 ${maxAllowedDanmu} 条`);

        // 🎯 智能采样：保持时间分布均匀
        const sampleRate = maxAllowedDanmu / filteredDanmu.length;
        finalDanmu = filteredDanmu.filter((_, index) => {
          return index === 0 || // 保留第一条
                 index === filteredDanmu.length - 1 || // 保留最后一条
                 Math.random() < sampleRate || // 随机采样
                 index % Math.ceil(1 / sampleRate) === 0; // 均匀采样
        }).slice(0, maxAllowedDanmu);
      }
      
      console.log(`✅ ${apiName}优化处理完成: ${finalDanmu.length} 条优质弹幕`);

      // 🎯 优化统计信息，减少不必要的计算
      if (finalDanmu.length > 0) {
        const firstTime = finalDanmu[0].time;
        const lastTime = finalDanmu[finalDanmu.length - 1].time;
        const duration = lastTime - firstTime;

        console.log(`📊 ${apiName}弹幕概览: ${Math.floor(firstTime/60)}:${String(Math.floor(firstTime%60)).padStart(2,'0')} - ${Math.floor(lastTime/60)}:${String(Math.floor(lastTime%60)).padStart(2,'0')} (${Math.floor(duration/60)}分钟)`);

        // 只在弹幕较少时显示详细统计
        if (finalDanmu.length <= 1000) {
          console.log(`📋 ${apiName}弹幕样例:`, finalDanmu.slice(0, 5).map(item =>
            `${Math.floor(item.time/60)}:${String(Math.floor(item.time%60)).padStart(2,'0')} "${item.text.substring(0, 15)}"`
          ).join(', '));
        }
      }

      return finalDanmu; // 成功获取优化后的弹幕

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error(`❌ ${apiName}请求超时 (${timeout/1000}秒):`, videoUrl);
      } else {
        console.error(`❌ ${apiName}请求失败:`, error);
      }
      // 继续尝试下一个API
    }
  }
  
  // 所有API都失败了
  console.log('❌ 所有XML API都无法获取弹幕数据');
  return [];
}

// 从danmu.icu获取弹幕数据
async function fetchDanmuFromAPI(videoUrl: string): Promise<DanmuItem[]> {
  const controller = new AbortController();
  
  // 根据平台设置不同的超时时间
  let timeout = 20000; // 默认20秒
  if (videoUrl.includes('iqiyi.com')) {
    timeout = 30000; // 爱奇艺30秒
  } else if (videoUrl.includes('youku.com')) {
    timeout = 25000; // 优酷25秒
  } else if (videoUrl.includes('mgtv.com') || videoUrl.includes('w.mgtv.com')) {
    timeout = 25000; // 芒果TV25秒
  }
  
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  console.log(`⏰ 设置超时时间: ${timeout/1000}秒`);
  
  try {
    const apiUrl = `https://api.danmu.icu/?url=${encodeURIComponent(videoUrl)}`;
    console.log('🌐 正在请求弹幕API:', apiUrl);
    
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://danmu.icu/',
      },
    });
    
    clearTimeout(timeoutId);
    console.log('📡 API响应状态:', response.status, response.statusText);

    if (!response.ok) {
      console.log('❌ API响应失败:', response.status);
      return [];
    }

    const responseText = await response.text();
    console.log('📄 API原始响应:', responseText.substring(0, 500) + '...');
    
    let data: DanmuApiResponse;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON解析失败:', parseError);
      console.log('响应内容:', responseText.substring(0, 200));
      return [];
    }
    
    if (!data.danmuku || !Array.isArray(data.danmuku)) return [];

    // 转换为Artplayer格式
    // API返回格式: [时间, 位置, 颜色, "", 文本, "", "", "字号"]
    console.log(`获取到 ${data.danmuku.length} 条原始弹幕数据`);
    
    const danmuList = data.danmuku.map((item: any[]) => {
      // 正确解析时间 - 第一个元素就是时间(秒)
      const time = parseFloat(item[0]) || 0;
      const text = (item[4] || '').toString().trim();
      const color = item[2] || '#FFFFFF';
      
      // 转换位置: top=1顶部, bottom=2底部, right=0滚动
      let mode = 0;
      if (item[1] === 'top') mode = 1;
      else if (item[1] === 'bottom') mode = 2;
      else mode = 0; // right 或其他都是滚动

      return {
        text: text,
        time: time,
        color: color,
        mode: mode,
      };
    }).filter(item => {
      const valid = item.text.length > 0 && 
                   !item.text.includes('弹幕正在赶来') && 
                   !item.text.includes('官方弹幕库') &&
                   item.time >= 0;
      return valid;
    }).sort((a, b) => a.time - b.time); // 按时间排序

    // 显示时间分布统计
    const timeStats = danmuList.reduce((acc, item) => {
      const timeRange = Math.floor(item.time / 60); // 按分钟分组
      acc[timeRange] = (acc[timeRange] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    
    console.log('📊 弹幕时间分布(按分钟):', timeStats);
    console.log('📋 前10条弹幕:', danmuList.slice(0, 10).map(item => 
      `${item.time}s: "${item.text.substring(0, 20)}"`
    ));
    
    return danmuList;

  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error(`❌ 弹幕API请求超时 (${timeout/1000}秒):`, videoUrl);
      console.log('💡 建议: 爱奇艺、优酷和芒果TV的弹幕API响应较慢，请稍等片刻');
    } else {
      console.error('❌ 获取弹幕失败:', error);
    }
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const doubanId = searchParams.get('douban_id');
  const title = searchParams.get('title');
  const year = searchParams.get('year');
  const episode = searchParams.get('episode'); // 新增集数参数

  console.log('=== 弹幕API请求参数 ===');
  console.log('豆瓣ID:', doubanId);
  console.log('标题:', title);
  console.log('年份:', year);
  console.log('集数:', episode);

  if (!doubanId && !title) {
    return NextResponse.json({ 
      error: 'Missing required parameters: douban_id or title' 
    }, { status: 400 });
  }

  try {
    let platformUrls: PlatformUrl[] = [];

    // 优先从豆瓣页面提取链接
    if (doubanId) {
      console.log('🔍 优先从豆瓣页面提取链接...');
      platformUrls = await extractPlatformUrls(doubanId, episode);
      console.log('📝 豆瓣提取结果:', platformUrls);
    }

    // 如果豆瓣没有结果，使用caiji.cyou API作为备用
    if (platformUrls.length === 0 && title) {
      console.log('🔍 豆瓣未找到链接，使用Caiji API备用搜索...');
      const caijiUrls = await searchFromCaijiAPI(title, episode);
      if (caijiUrls.length > 0) {
        platformUrls = caijiUrls;
        console.log('📺 Caiji API备用结果:', platformUrls);
      }
    }

    // 如果找不到任何链接，直接返回空结果，不使用测试数据
    // （删除了不合适的fallback测试链接逻辑）

    if (platformUrls.length === 0) {
      console.log('❌ 未找到任何视频平台链接，返回空弹幕结果');
      console.log('💡 建议: 检查标题是否正确，或者该内容可能暂不支持弹幕');
      
      return NextResponse.json({ 
        danmu: [],
        platforms: [],
        total: 0,
        message: `未找到"${title}"的视频平台链接，无法获取弹幕数据`
      });
    }

    // 并发获取多个平台的弹幕（使用XML API + JSON API备用）
    const danmuPromises = platformUrls.map(async ({ platform, url }) => {
      console.log(`🔄 处理平台: ${platform}, URL: ${url}`);
      
      // 首先尝试XML API (主用)
      let danmu = await fetchDanmuFromXMLAPI(url);
      console.log(`📊 ${platform} XML API获取到 ${danmu.length} 条弹幕`);
      
      // 如果XML API失败或结果很少，尝试JSON API作为备用
      if (danmu.length === 0) {
        console.log(`🔄 ${platform} XML API无结果，尝试JSON API备用...`);
        const jsonDanmu = await fetchDanmuFromAPI(url);
        console.log(`📊 ${platform} JSON API获取到 ${jsonDanmu.length} 条弹幕`);
        
        if (jsonDanmu.length > 0) {
          danmu = jsonDanmu;
          console.log(`✅ ${platform} 使用JSON API备用数据: ${danmu.length} 条弹幕`);
        }
      } else {
        console.log(`✅ ${platform} 使用XML API数据: ${danmu.length} 条弹幕`);
      }
      
      return { platform, danmu, url };
    });

    const results = await Promise.allSettled(danmuPromises);
    
    // 合并所有成功的弹幕数据
    let allDanmu: DanmuItem[] = [];
    const platformInfo: any[] = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.danmu.length > 0) {
        allDanmu = allDanmu.concat(result.value.danmu);
        platformInfo.push({
          platform: result.value.platform,
          url: result.value.url,
          count: result.value.danmu.length,
        });
      }
    });

    // 按时间排序
    allDanmu.sort((a, b) => a.time - b.time);

    // 🚀 优化去重处理：更精确的重复检测
    const uniqueDanmu: DanmuItem[] = [];
    const seenMap = new Map<string, boolean>();

    // 批量处理去重，避免阻塞
    const DEDUP_BATCH_SIZE = 100;
    for (let i = 0; i < allDanmu.length; i += DEDUP_BATCH_SIZE) {
      const batch = allDanmu.slice(i, i + DEDUP_BATCH_SIZE);

      batch.forEach(danmu => {
        // 创建更精确的唯一标识：时间(保留2位小数) + 文本内容 + 颜色
        const normalizedText = danmu.text.trim().toLowerCase();
        const timeKey = Math.round(danmu.time * 100) / 100; // 精确到0.01秒
        const uniqueKey = `${timeKey}_${normalizedText}_${danmu.color || 'default'}`;

        if (!seenMap.has(uniqueKey)) {
          seenMap.set(uniqueKey, true);
          uniqueDanmu.push(danmu);
        }
      });

      // 让出执行权，避免阻塞
      if (i % (DEDUP_BATCH_SIZE * 5) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    console.log(`🎯 弹幕去重优化: ${allDanmu.length} -> ${uniqueDanmu.length} 条`);

    return NextResponse.json({
      danmu: uniqueDanmu,
      platforms: platformInfo,
      total: uniqueDanmu.length,
    });

  } catch (error) {
    console.error('外部弹幕获取失败:', error);
    return NextResponse.json({ 
      error: '获取外部弹幕失败',
      danmu: []
    }, { status: 500 });
  }
}