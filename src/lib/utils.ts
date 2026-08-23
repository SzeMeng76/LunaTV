import { clsx, type ClassValue } from 'clsx';
import he from 'he';
import Hls from 'hls.js';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for merging Tailwind CSS classes
 * Combines clsx and tailwind-merge for optimal class handling
 *
 * @example
 * cn('px-2 py-1', condition && 'bg-blue-500')
 * cn('px-2', 'px-4') // => 'px-4' (tailwind-merge handles conflicts)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 增强的设备检测逻辑，参考最新的设备特征
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

// iOS 设备检测 (包括 iPad 的新版本检测)
const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/i.test(userAgent) && !(window as any).MSStream;
const isIOS13Plus = isIOS || (
  typeof window !== 'undefined' &&
  userAgent.includes('Macintosh') &&
  typeof navigator !== 'undefined' &&
  navigator.maxTouchPoints >= 1
);

// iPad 专门检测 (包括新的 iPad Pro)
const isIPad = typeof window !== 'undefined' && (/iPad/i.test(userAgent) || (
  userAgent.includes('Macintosh') &&
  typeof navigator !== 'undefined' &&
  navigator.maxTouchPoints > 2
));

// Android 设备检测
const isAndroid = /Android/i.test(userAgent);

// 移动设备检测 (更精确的判断)
const isMobile = isIOS13Plus || isAndroid || /webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

// 平板设备检测
const isTablet = isIPad || (isAndroid && !/Mobile/i.test(userAgent)) ||
  (typeof window !== 'undefined' && typeof screen !== 'undefined' && screen.width >= 768);

// Safari 浏览器检测 (更精确)
const isSafari = /^(?:(?!chrome|android).)*safari/i.test(userAgent) && !isAndroid;

// WebKit 检测
const isWebKit = /WebKit/i.test(userAgent);

// 设备性能等级估算
const getDevicePerformanceLevel = (): 'low' | 'medium' | 'high' => {
  if (typeof navigator === 'undefined') return 'medium';

  // 基于硬件并发数判断
  const cores = navigator.hardwareConcurrency || 4;

  if (isMobile) {
    return cores >= 6 ? 'medium' : 'low';
  } else {
    return cores >= 8 ? 'high' : cores >= 4 ? 'medium' : 'low';
  }
};

const devicePerformance = typeof window !== 'undefined' ? getDevicePerformanceLevel() : 'medium';

// 导出设备检测结果供其他模块使用
export {
  isIOS,
  isIOS13Plus,
  isIPad,
  isAndroid,
  isMobile,
  isTablet,
  isSafari,
  isWebKit,
  devicePerformance,
  getDevicePerformanceLevel
};

function getBangumiImageProxyConfig(): {
  proxyType: 'server' | 'cmliussss' | 'corsapi' | 'sakura' | 'custom' | 'direct';
  proxyUrl: string;
} {
  let bangumiImageProxyType: 'server' | 'cmliussss' | 'corsapi' | 'sakura' | 'custom' | 'direct' = 'server';
  let bangumiImageProxyUrl = '';

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const storedType = localStorage.getItem('bangumiImageProxyType');
    const runtimeType = (window as any).RUNTIME_CONFIG?.BANGUMI_IMAGE_PROXY_TYPE;
    bangumiImageProxyType = (storedType || runtimeType || 'server') as 'server' | 'cmliussss' | 'corsapi' | 'sakura' | 'custom' | 'direct';
    bangumiImageProxyUrl =
      localStorage.getItem('bangumiImageProxyUrl') ||
      (window as any).RUNTIME_CONFIG?.BANGUMI_IMAGE_PROXY ||
      '';
  }

  return { proxyType: bangumiImageProxyType, proxyUrl: bangumiImageProxyUrl };
}

function getDoubanImageProxyConfig(): {
  proxyType:
  | 'direct'
  | 'server'
  | 'img3'
  | 'cmliussss-cdn-tencent'
  | 'cmliussss-cdn-ali'
  | 'baidu'
  | 'custom';
  proxyUrl: string;
} {
  // 安全地访问 localStorage（避免服务端渲染报错）
  let doubanImageProxyType: 'direct' | 'server' | 'img3' | 'cmliussss-cdn-tencent' | 'cmliussss-cdn-ali' | 'baidu' | 'custom' = 'server'; // 默认值
  let doubanImageProxy = '';

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const storedType = localStorage.getItem('doubanImageProxyType');
    const runtimeType = (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE;

    // 自动修复：如果localStorage或RUNTIME_CONFIG是'direct'，自动改为'server'
    let effectiveStoredType = storedType;
    if (storedType === 'direct') {
      effectiveStoredType = 'server';
      // 自动更新localStorage，避免下次还是'direct'
      localStorage.setItem('doubanImageProxyType', 'server');
    }

    const effectiveRuntimeType = (runtimeType === 'direct') ? 'server' : runtimeType;

    doubanImageProxyType = (effectiveStoredType || effectiveRuntimeType || 'server') as 'direct' | 'server' | 'img3' | 'cmliussss-cdn-tencent' | 'cmliussss-cdn-ali' | 'baidu' | 'custom';
    doubanImageProxy =
      localStorage.getItem('doubanImageProxyUrl') ||
      (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY ||
      '';
  }

  return {
    proxyType: doubanImageProxyType,
    proxyUrl: doubanImageProxy,
  };
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  // 处理 manmankan 图片防盗链
  if (originalUrl.includes('manmankan.com')) {
    return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
  }

  // Bangumi 图片代理（lain.bgm.tv 在国内无法直接访问）
  if (originalUrl.includes('lain.bgm.tv') || originalUrl.includes('bgm.tv/pic')) {
    const { proxyType: bangumiProxyType, proxyUrl: bangumiProxyUrl } = getBangumiImageProxyConfig();
    switch (bangumiProxyType) {
      case 'cmliussss':
        return originalUrl.replace(/lain\.bgm\.tv/g, 'img.doubanio.cmliussss.net');
      case 'sakura':
        // 桜色镜像站：全域名镜像 bgm.tv -> bangumi.lol
        return originalUrl.replace(/lain\.bgm\.tv/g, 'lain.bangumi.lol').replace(/bgm\.tv/g, 'bangumi.lol');
      case 'corsapi': {
        const base = bangumiProxyUrl || 'https://corsapi.smone.workers.dev';
        return `${base.replace(/\/$/, '')}/?url=${encodeURIComponent(originalUrl)}`;
      }
      case 'custom':
        if (bangumiProxyUrl) return `${bangumiProxyUrl}${encodeURIComponent(originalUrl)}`;
        return `/api/proxy/logo?url=${encodeURIComponent(originalUrl)}`;
      case 'direct':
        return originalUrl;
      case 'server':
      default:
        return `/api/proxy/logo?url=${encodeURIComponent(originalUrl)}`;
    }
  }

  // 仅处理豆瓣图片代理
  if (!originalUrl.includes('doubanio.com')) {
    return originalUrl;
  }

  const { proxyType, proxyUrl } = getDoubanImageProxyConfig();
  switch (proxyType) {
    case 'server':
      return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
    case 'img3':
      return originalUrl.replace(/img\d+\.doubanio\.com/g, 'img3.doubanio.com');
    case 'cmliussss-cdn-tencent':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.net'
      );
    case 'cmliussss-cdn-ali':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.com'
      );
    case 'baidu':
      return `https://image.baidu.com/search/down?url=${encodeURIComponent(originalUrl)}`;
    case 'custom':
      return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
    case 'direct':
    default:
      return originalUrl;
  }
}

// ============ 新增：增强的视频源测试类型（向后兼容） ============
export type VideoSourceTestStatus = 'ok' | 'partial' | 'failed';

export interface VideoSourceTestResult {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  speedKBps?: number;        // 新增：数值型速度，便于计算
  hasError?: boolean;        // 新增：是否有错误
  status?: VideoSourceTestStatus;  // 新增：测试状态
  message?: string;          // 新增：详细消息
  playable?: boolean;        // 新增：是否可播放
  testedAt?: number;         // 新增：测试时间戳
}

// 视频播放代理配置（Cloudflare Worker 加速播放流，与 VideoProxyConfig 共用同一开关）
function getVideoPlayProxyConfig(): { enabled: boolean; proxyUrl: string } {
  if (typeof window === 'undefined') return { enabled: false, proxyUrl: '' };
  const rc = (window as any).RUNTIME_CONFIG;
  return {
    enabled: !!rc?.VIDEO_PROXY_ENABLED,
    proxyUrl: (rc?.VIDEO_PROXY_URL || '').replace(/\/$/, ''),
  };
}

// 把真实播放地址包一层 Cloudflare Worker 代理（m3u8 走 /m3u8 端点，自动重写 .ts 子链接；其他格式走通用 /?url= 端点）
export function applyVideoPlayProxy(url: string): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;

  const { enabled, proxyUrl } = getVideoPlayProxyConfig();
  if (!enabled || !proxyUrl) return url;

  // 已经代理过，避免套娃
  if (url.startsWith(proxyUrl)) return url;

  const isM3u8 = /\.m3u8(\?|#|$)/i.test(url);
  const endpoint = isM3u8 ? '/m3u8' : '/';
  return `${proxyUrl}${endpoint}?url=${encodeURIComponent(url)}`;
}

// Worker 代理请求失败（超时/502等）时，从代理地址还原出真实地址，用于自动降级直连
export function stripVideoPlayProxy(url: string): string | null {
  if (!url) return null;
  const { proxyUrl } = getVideoPlayProxyConfig();
  if (!proxyUrl || !url.startsWith(proxyUrl)) return null;

  try {
    const parsed = new URL(url);
    const raw = parsed.searchParams.get('url');
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return null;
  }
}

// 直连原始地址失败（上游要求特定 Referer/UA 或不返回 CORS 头）时，最后一层兜底：
// 改走本站自带的 /api/proxy/m3u8，由服务端代为请求并改写分片/密钥 URI。
// 与 applyVideoPlayProxy 的外部 Worker 相互独立，不依赖 VideoProxyConfig 是否启用。
export function applyFirstPartyM3u8Proxy(url: string): string {
  if (!url || typeof window === 'undefined') return url;
  return `/api/proxy/m3u8?url=${encodeURIComponent(url)}`;
}

// 判断某地址是否已经指向本站的第一方 m3u8 代理，避免重复包裹
export function isFirstPartyM3u8Proxy(url: string): boolean {
  return !!url && url.startsWith('/api/proxy/m3u8?url=');
}

// 新增：格式化速度显示
export function formatVideoLoadSpeed(speedKBps?: number): string {
  if (!speedKBps || !Number.isFinite(speedKBps) || speedKBps <= 0) {
    return '未知';
  }
  if (speedKBps >= 1024) {
    return `${(speedKBps / 1024).toFixed(1)} MB/s`;
  }
  return `${speedKBps.toFixed(1)} KB/s`;
}
// ============ 结束新增类型 ============

/**
 * 从m3u8地址获取视频质量等级和网络信息
 * @param m3u8Url m3u8播放列表的URL
 * @param options 配置选项
 * @param options.timeoutMs 超时时间（毫秒），默认 5000ms
 * @returns Promise<VideoSourceTestResult> 视频质量等级和网络信息（向后兼容）
 */
export async function getVideoResolutionFromM3u8(
  m3u8Url: string,
  options: { timeoutMs?: number } = {}
): Promise<VideoSourceTestResult> {
  const { timeoutMs = 5000 } = options;
  try {
    // 检测是否为iPad（无论什么浏览器）
    const isIPad = /iPad/i.test(userAgent);
    
    if (isIPad) {
      // iPad使用最简单的ping测试，不创建任何video或HLS实例
      console.log('iPad检测，使用简化测速避免崩溃');
      
      const startTime = performance.now();
      try {
        await fetch(m3u8Url, { 
          method: 'HEAD', 
          mode: 'no-cors',
          signal: AbortSignal.timeout(2000)
        });
        const pingTime = Math.round(performance.now() - startTime);
        
        return {
          quality: '未知', // iPad不检测视频质量避免崩溃
          loadSpeed: '未知', // iPad不检测下载速度
          pingTime,
          status: 'partial',
          message: 'iPad 简化测速',
          hasError: false,
          playable: false,
          testedAt: Date.now(),
        };
      } catch (error) {
        return {
          quality: '未知',
          loadSpeed: '未知',
          pingTime: 9999,
          status: 'failed',
          message: 'iPad 测速失败',
          hasError: true,
          playable: false,
          testedAt: Date.now(),
        };
      }
    }
    
    // 非iPad设备使用优化后的测速逻辑
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      
      // 移动设备使用更小的视频元素减少内存占用
      if (isMobile) {
        video.width = 32;
        video.height = 18;
        video.style.display = 'none';
        video.style.position = 'absolute';
        video.style.left = '-9999px';
      }

      // 测量ping时间
      const pingStart = performance.now();
      let pingTime = 0;

      const pingPromise = fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          pingTime = performance.now() - pingStart;
        })
        .catch(() => {
          pingTime = performance.now() - pingStart;
        });

      // 基于最新 hls.js v1.6.13 和设备性能的智能优化配置
      const hlsConfig = {
        debug: false,

        // Worker 配置 - 根据设备性能和浏览器能力
        enableWorker: !isMobile && !isSafari && devicePerformance !== 'low',

        // 低延迟模式 - 仅在高性能非移动设备上启用
        lowLatencyMode: !isMobile && devicePerformance === 'high',

        // v1.6.13 新增：优化片段解析错误处理
        fragLoadingRetryDelay: isMobile ? 500 : 300,
        fragLoadingMaxRetry: 3,

        // v1.6.13 新增：时间戳处理优化（针对直播回搜修复）
        allowAugmentingTimeStamp: true,

        // 缓冲管理 - 基于设备性能分级
        maxBufferLength: devicePerformance === 'low' ? 3 :
                        devicePerformance === 'medium' ? 8 : 15,
        maxBufferSize: devicePerformance === 'low' ? 1 * 1024 * 1024 :
                      devicePerformance === 'medium' ? 5 * 1024 * 1024 : 15 * 1024 * 1024,
        backBufferLength: isTablet ? 20 : isMobile ? 10 : 30,
        frontBufferFlushThreshold: devicePerformance === 'low' ? 15 :
                                  devicePerformance === 'medium' ? 30 : 60,

        // v1.6.13 增强：更智能的缓冲区管理
        maxBufferHole: 0.3, // 允许较小的缓冲区空洞
        appendErrorMaxRetry: 5, // 增加append错误重试次数以利用v1.6.13修复

        // 自适应比特率 - 根据设备类型和性能调整
        abrEwmaDefaultEstimate: devicePerformance === 'low' ? 1500000 :
                               devicePerformance === 'medium' ? 3000000 : 6000000,
        abrBandWidthFactor: 0.95,
        abrBandWidthUpFactor: isMobile ? 0.6 : 0.7,
        abrMaxWithRealBitrate: true,
        maxStarvationDelay: isMobile ? 2 : 4,
        maxLoadingDelay: isMobile ? 2 : 4,

        // v1.6.13 新增：DRM相关优化（虽然你项目不用DRM，但有助于稳定性）
        keyLoadRetryDelay: 1000,
        keyLoadMaxRetry: 3,

        // 浏览器特殊优化
        liveDurationInfinity: !isSafari,
        progressive: false,

        // 移动设备网络优化
        ...(isMobile && {
          manifestLoadingRetryDelay: 2000,
          levelLoadingRetryDelay: 2000,
          manifestLoadingMaxRetry: 3,
          levelLoadingMaxRetry: 3,
        })
      };

      const hls = new Hls(hlsConfig);

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout loading video metadata'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        try {
          if (hls) hls.destroy();
        } catch (e) {
          console.warn('HLS cleanup error:', e);
        }
        try {
          if (video && video.parentNode) {
            video.parentNode.removeChild(video);
          } else if (video) {
            video.remove();
          }
        } catch (e) {
          console.warn('Video cleanup error:', e);
        }
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Failed to load video metadata'));
      };

      let actualLoadSpeed = '未知';
      let actualSpeedKBps = 0;  // 新增：保存数值型速度
      let hasSpeedCalculated = false;
      let hasMetadataLoaded = false;
      let fragmentStartTime = 0;

      const checkAndResolve = async () => {
        if (hasMetadataLoaded && (hasSpeedCalculated || actualLoadSpeed !== '未知')) {
          await pingPromise;
          
          const width = video.videoWidth;
          let quality = '未知';
          
          if (width && width > 0) {
            quality = width >= 3840 ? '4K'
              : width >= 2560 ? '2K'
              : width >= 1920 ? '1080p'
              : width >= 1280 ? '720p'
              : width >= 854 ? '480p'
              : 'SD';
          }

          cleanup();
          resolve({
            quality,
            loadSpeed: actualLoadSpeed,
            pingTime: Math.round(pingTime),
            speedKBps: actualSpeedKBps > 0 ? actualSpeedKBps : undefined,
            status: 'ok',
            message: '测速完成',
            hasError: false,
            playable: true,
            testedAt: Date.now(),
          });
        }
      };

      // 监听片段加载
      hls.on(Hls.Events.FRAG_LOADING, () => {
        if (!hasSpeedCalculated) {
          fragmentStartTime = performance.now();
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
        if (fragmentStartTime > 0 && data && data.payload && !hasSpeedCalculated) {
          const loadTime = performance.now() - fragmentStartTime;
          const size = data.payload.byteLength || 0;

          if (loadTime > 0 && size > 0) {
            const speedKBps = size / 1024 / (loadTime / 1000);
            actualSpeedKBps = speedKBps;  // 保存数值型速度
            actualLoadSpeed = speedKBps >= 1024
              ? `${(speedKBps / 1024).toFixed(2)} MB/s`
              : `${speedKBps.toFixed(2)} KB/s`;
            hasSpeedCalculated = true;
            checkAndResolve();
          }
        }
      });

      // 监听视频元数据加载完成
      video.addEventListener('loadedmetadata', () => {
        hasMetadataLoaded = true;
        checkAndResolve();
      });

      // 监听HLS错误 - v1.6.13增强处理
      hls.on(Hls.Events.ERROR, (event: any, data: any) => {
        console.warn('HLS测速错误:', data);

        // v1.6.13 特殊处理：片段解析错误不应该导致测速失败
        if (data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
          console.log('测速中遇到片段解析错误，v1.6.13已修复，继续测速');
          return;
        }

        // v1.6.13 特殊处理：时间戳错误也不应该导致测速失败
        if (data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR &&
            data.err && data.err.message &&
            data.err.message.includes('timestamp')) {
          console.log('测速中遇到时间戳错误，v1.6.13已修复，继续测速');
          return;
        }

        if (data.fatal) {
          cleanup();
          reject(new Error(`HLS Error: ${data.type} - ${data.details}`));
        }
      });

      // 为分片请求添加时间戳参数破除浏览器缓存
      hls.config.xhrSetup = function(xhr: XMLHttpRequest, url: string) {
        const urlWithTimestamp = url.includes('?')
          ? `${url}&_t=${Date.now()}`
          : `${url}?_t=${Date.now()}`;
        xhr.open('GET', urlWithTimestamp, true);
      };

      // 加载m3u8
      try {
        hls.loadSource(m3u8Url);
        hls.attachMedia(video);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  } catch (error) {
    throw new Error(`测速失败: ${error}`);
  }
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';

  const cleanedText = text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .trim(); // 去掉首尾空格

  // 使用 he 库解码 HTML 实体
  return he.decode(cleanedText);
}

/**
 * 判断剧集是否已完结
 * @param remarks 备注信息（如"已完结"、"更新至20集"、"HD"等）
 * @returns 是否已完结
 */
export function isSeriesCompleted(remarks?: string): boolean {
  if (!remarks) return false;

  // 匹配规则：
  // - "完结" 或 "已完结"
  // - "全XX集"（如"全30集"）
  // - 单独的"完"（但不包括"完整"）
  return /完结|已完结|全\d+集|完(?!整)/.test(remarks);
}

