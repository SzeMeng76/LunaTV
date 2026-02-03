/**
 * 外部流量监控模块
 * 统计应用调用外部 API 的流量
 *
 * 注意：流量数据仅保存在内存中（最多 1000 条，48 小时）
 * 不再持久化到 Kvrocks，以防止 WAL 爆满和浪费 Upstash 命令
 */

interface ExternalTrafficMetrics {
  timestamp: number;
  url: string;
  method: string;
  requestSize: number;
  responseSize: number;
  duration: number;
  statusCode: number;
}

// 内存中的外部流量缓存
const externalTrafficCache: ExternalTrafficMetrics[] = [];
const MAX_CACHE_SIZE = 1000;
const MAX_CACHE_AGE = 48 * 60 * 60 * 1000; // 48小时（与性能监控保持一致）

// 数据加载标志
let dataLoaded = false;

/**
 * 从 Kvrocks 加载历史数据（已禁用持久化）
 */
async function loadFromKvrocks(): Promise<void> {
  if (dataLoaded) return;
  // 持久化已禁用，直接标记为已加载
  dataLoaded = true;
}

/**
 * 保存数据到 Kvrocks（已禁用持久化）
 */
async function saveToKvrocks(): Promise<void> {
  // 持久化已禁用，不再保存到 Kvrocks
  return;
}

/**
 * 记录外部请求流量
 */
export function recordExternalTraffic(metrics: ExternalTrafficMetrics): void {
  // 首次调用时标记已加载（持久化已禁用）
  if (!dataLoaded) {
    dataLoaded = true;
  }

  // 添加到内存缓存
  externalTrafficCache.push(metrics);

  // 清理超过48小时的旧数据
  const now = Date.now();
  const cutoffTime = now - MAX_CACHE_AGE;
  while (externalTrafficCache.length > 0 && externalTrafficCache[0].timestamp < cutoffTime) {
    externalTrafficCache.shift();
  }

  // 限制缓存大小
  while (externalTrafficCache.length > MAX_CACHE_SIZE) {
    externalTrafficCache.shift();
  }

  // 持久化已禁用，不再保存到 Kvrocks
}

/**
 * 获取外部流量统计（按时间范围）
 */
export async function getExternalTrafficStats(hours: number = 1) {
  const now = Date.now();
  const startTime = now - hours * 60 * 60 * 1000;

  // 过滤时间范围内的数据
  const filteredData = externalTrafficCache.filter(
    (item) => item.timestamp >= startTime
  );

  if (filteredData.length === 0) {
    return {
      totalRequests: 0,
      totalTraffic: 0,
      requestTraffic: 0,
      responseTraffic: 0,
      avgDuration: 0,
      byDomain: {},
    };
  }

  // 计算总流量
  const totalTraffic = filteredData.reduce(
    (sum, item) => sum + item.requestSize + item.responseSize,
    0
  );
  const requestTraffic = filteredData.reduce((sum, item) => sum + item.requestSize, 0);
  const responseTraffic = filteredData.reduce((sum, item) => sum + item.responseSize, 0);

  // 计算平均响应时间
  const avgDuration = Math.round(
    filteredData.reduce((sum, item) => sum + item.duration, 0) / filteredData.length
  );

  // 按域名分组统计
  const byDomain: Record<string, { requests: number; traffic: number }> = {};
  filteredData.forEach((item) => {
    try {
      const domain = new URL(item.url).hostname;
      if (!byDomain[domain]) {
        byDomain[domain] = { requests: 0, traffic: 0 };
      }
      byDomain[domain].requests++;
      byDomain[domain].traffic += item.requestSize + item.responseSize;
    } catch (e) {
      // 忽略无效 URL
    }
  });

  return {
    totalRequests: filteredData.length,
    totalTraffic,
    requestTraffic,
    responseTraffic,
    avgDuration,
    byDomain,
  };
}

/**
 * 包装 fetch 函数，自动统计外部流量
 */
export async function monitoredFetch(
  url: string | URL,
  options?: RequestInit
): Promise<Response> {
  const startTime = Date.now();

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
    // 执行实际的 fetch 请求
    const response = await fetch(url, options);

    // 克隆响应以读取内容
    const clonedResponse = response.clone();
    const responseText = await clonedResponse.text();
    const responseSize = Buffer.byteLength(responseText, 'utf8');

    // 记录流量
    recordExternalTraffic({
      timestamp: startTime,
      url: url.toString(),
      method: options?.method || 'GET',
      requestSize,
      responseSize,
      duration: Date.now() - startTime,
      statusCode: response.status,
    });

    return response;
  } catch (error) {
    // 即使失败也记录（响应大小为0）
    recordExternalTraffic({
      timestamp: startTime,
      url: url.toString(),
      method: options?.method || 'GET',
      requestSize,
      responseSize: 0,
      duration: Date.now() - startTime,
      statusCode: 0,
    });

    throw error;
  }
}
