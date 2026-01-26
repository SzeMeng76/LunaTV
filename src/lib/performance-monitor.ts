/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 性能监控模块
 * 收集和聚合应用性能数据
 */

import { RequestMetrics, HourlyMetrics, SystemMetrics } from './performance.types';
import { db } from './db';

// 内存中的请求数据缓存（最近48小时）
const requestCache: RequestMetrics[] = [];
const MAX_CACHE_SIZE = 10000; // 最多缓存 10000 条请求
const MAX_CACHE_AGE = 48 * 60 * 60 * 1000; // 48 小时（毫秒）

// Kvrocks 存储 key
const PERFORMANCE_KEY = 'performance:requests';
const PERFORMANCE_LOADED = 'performance:loaded';

// 系统指标缓存
const systemMetricsCache: SystemMetrics[] = [];
const MAX_SYSTEM_METRICS = 1000;

// 数据库查询计数器
let dbQueryCount = 0;
let lastDbQueryReset = Date.now();

// CPU 使用率跟踪（用于计算百分比）
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = process.hrtime.bigint();

// 标记是否已从 Kvrocks 加载数据
let dataLoaded = false;

/**
 * 增加数据库查询计数（由 db 模块调用）
 */
export function incrementDbQuery(): void {
  dbQueryCount++;
}

/**
 * 获取当前 DB 查询计数
 */
export function getDbQueryCount(): number {
  return dbQueryCount;
}

/**
 * 重置 DB 查询计数
 */
export function resetDbQueryCount(): void {
  dbQueryCount = 0;
  lastDbQueryReset = Date.now();
}

/**
 * 从 Kvrocks 加载历史数据到内存
 */
async function loadFromKvrocks(): Promise<void> {
  if (dataLoaded) return;

  try {
    const cached = await db.getCache(PERFORMANCE_KEY);
    if (cached && Array.isArray(cached)) {
      // 过滤掉超过 48 小时的数据
      const now = Date.now();
      const cutoffTime = now - MAX_CACHE_AGE;
      const validData = cached.filter((item: RequestMetrics) => item.timestamp >= cutoffTime);

      requestCache.push(...validData);
      console.log(`✅ 从 Kvrocks 加载了 ${validData.length} 条性能监控数据`);
    }
    dataLoaded = true;
  } catch (error) {
    console.error('❌ 从 Kvrocks 加载性能数据失败:', error);
    dataLoaded = true; // 即使失败也标记为已加载，避免重复尝试
  }
}

/**
 * 保存数据到 Kvrocks
 */
async function saveToKvrocks(snapshot: RequestMetrics[]): Promise<void> {
  try {
    // 保存数据快照到 Kvrocks，不设置过期时间（手动管理 48 小时清理）
    console.log(`💾 [Performance] 保存 ${snapshot.length} 条数据到 Kvrocks`);
    await db.setCache(PERFORMANCE_KEY, snapshot);
  } catch (error) {
    console.error('❌ 保存性能数据到 Kvrocks 失败:', error);
  }
}

/**
 * 记录单次请求的性能数据
 */
export function recordRequest(metrics: RequestMetrics): void {
  console.log(`📝 [Performance] 记录请求: ${metrics.method} ${metrics.path} (${metrics.statusCode})`);

  // 首次调用时从 Kvrocks 加载历史数据（异步，不阻塞）
  if (!dataLoaded) {
    loadFromKvrocks().catch(err => {
      console.error('❌ 加载性能数据失败:', err);
    });
  }

  // 添加到缓存
  requestCache.push(metrics);
  console.log(`📊 [Performance] 当前缓存数量: ${requestCache.length}`);

  // 立即创建快照用于保存（在清理之前）
  const snapshot = [...requestCache];
  console.log(`📸 [Performance] 创建快照: ${snapshot.length} 条`);

  // 清理超过 48 小时的旧数据
  const now = Date.now();
  const cutoffTime = now - MAX_CACHE_AGE;
  while (requestCache.length > 0 && requestCache[0].timestamp < cutoffTime) {
    requestCache.shift();
  }

  // 限制缓存大小，移除最旧的数据
  if (requestCache.length > MAX_CACHE_SIZE) {
    requestCache.shift();
  }

  // 异步保存快照到 Kvrocks（不阻塞主流程）
  saveToKvrocks(snapshot).catch((error) => {
    console.error('❌ 保存性能数据到 Kvrocks 失败:', error);
  });
}

/**
 * 获取当前数据库查询计数并重置
 */
export function getAndResetDbQueryCount(): number {
  const count = dbQueryCount;
  dbQueryCount = 0;
  lastDbQueryReset = Date.now();
  return count;
}

/**
 * 获取当前系统资源使用情况
 */
export function collectSystemMetrics(): SystemMetrics {
  const memUsage = process.memoryUsage();
  const os = require('os');

  // ✅ 正确的 CPU 使用率计算
  const currentCpuUsage = process.cpuUsage(lastCpuUsage);
  const currentTime = process.hrtime.bigint();

  // 计算时间间隔（微秒）
  const elapsedNs = currentTime - lastCpuTime;
  const elapsedTimeMicroseconds = Number(elapsedNs / 1000n);

  // 计算 CPU 时间使用（微秒）
  const cpuTimeUsedMicroseconds = currentCpuUsage.user + currentCpuUsage.system;

  // 获取 CPU 核心数
  const numberOfCores = os.cpus().length;

  // 计算总可用 CPU 时间
  const totalAvailableCpuTimeMicroseconds = elapsedTimeMicroseconds * numberOfCores;

  // 计算 CPU 使用率百分比
  let cpuPercent = 0;
  if (totalAvailableCpuTimeMicroseconds > 0) {
    cpuPercent = (cpuTimeUsedMicroseconds / totalAvailableCpuTimeMicroseconds) * 100;
  }

  // 更新上次记录的值
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = process.hrtime.bigint();

  // 系统总内存和可用内存
  const totalSystemMemory = os.totalmem();
  const freeSystemMemory = os.freemem();
  const usedSystemMemory = totalSystemMemory - freeSystemMemory;

  return {
    timestamp: Date.now(),
    cpuUsage: cpuPercent,
    memoryUsage: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100, // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
      rss: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
      external: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
      systemTotal: Math.round(totalSystemMemory / 1024 / 1024 * 100) / 100,
      systemUsed: Math.round(usedSystemMemory / 1024 / 1024 * 100) / 100,
      systemFree: Math.round(freeSystemMemory / 1024 / 1024 * 100) / 100,
    },
    eventLoopDelay: 0, // 暂时设为 0，后续可以用 perf_hooks 实现
  };
}

/**
 * 记录系统指标
 */
export function recordSystemMetrics(): void {
  const metrics = collectSystemMetrics();
  systemMetricsCache.push(metrics);

  // 限制缓存大小
  if (systemMetricsCache.length > MAX_SYSTEM_METRICS) {
    systemMetricsCache.shift();
  }
}

/**
 * 聚合指定时间范围内的请求数据
 */
export function aggregateMetrics(startTime: number, endTime: number): HourlyMetrics {
  // 过滤时间范围内的请求
  const requests = requestCache.filter(
    (r) => r.timestamp >= startTime && r.timestamp < endTime
  );

  if (requests.length === 0) {
    return {
      hour: new Date(startTime).toISOString(),
      totalRequests: 0,
      successRequests: 0,
      errorRequests: 0,
      avgDuration: 0,
      maxDuration: 0,
      avgMemory: 0,
      maxMemory: 0,
      totalDbQueries: 0,
      totalTraffic: 0,
      topPaths: [],
      slowestPaths: [],
    };
  }

  // 计算基础指标
  const totalRequests = requests.length;
  const successRequests = requests.filter((r) => r.statusCode >= 200 && r.statusCode < 300).length;
  const errorRequests = requests.filter((r) => r.statusCode >= 400).length;

  const durations = requests.map((r) => r.duration);
  const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const maxDuration = Math.max(...durations);

  const memories = requests.map((r) => r.memoryUsed);
  const avgMemory = Math.round((memories.reduce((a, b) => a + b, 0) / memories.length) * 100) / 100;
  const maxMemory = Math.round(Math.max(...memories) * 100) / 100;

  const totalDbQueries = requests.reduce((sum, r) => sum + r.dbQueries, 0);
  const totalTraffic = requests.reduce((sum, r) => sum + r.requestSize + r.responseSize, 0);

  return {
    hour: new Date(startTime).toISOString(),
    totalRequests,
    successRequests,
    errorRequests,
    avgDuration,
    maxDuration,
    avgMemory,
    maxMemory,
    totalDbQueries,
    totalTraffic,
    topPaths: [],
    slowestPaths: [],
  };
}

/**
 * 获取最近 N 小时的聚合数据
 */
export function getRecentMetrics(hours: number): HourlyMetrics[] {
  const now = Date.now();
  const metrics: HourlyMetrics[] = [];

  for (let i = hours - 1; i >= 0; i--) {
    const endTime = now - i * 3600000; // 每小时 3600000 毫秒
    const startTime = endTime - 3600000;
    metrics.push(aggregateMetrics(startTime, endTime));
  }

  return metrics;
}

/**
 * 获取最近的请求列表
 */
export async function getRecentRequests(limit: number = 100, hours?: number): Promise<RequestMetrics[]> {
  // 从 Kvrocks 加载最新数据
  try {
    const cached = await db.getCache(PERFORMANCE_KEY);
    if (cached && Array.isArray(cached)) {
      // 过滤掉超过 48 小时的数据
      const now = Date.now();
      const cutoffTime = now - MAX_CACHE_AGE;
      const validData = cached.filter((item: RequestMetrics) => item.timestamp >= cutoffTime);

      // 更新内存缓存
      requestCache.length = 0;
      requestCache.push(...validData);

      console.log(`✅ 从 Kvrocks 加载了 ${validData.length} 条性能监控数据`);

      // 🔑 关键修复：如果过滤后数据量减少，说明有旧数据被清理，需要更新 Kvrocks
      if (validData.length < cached.length) {
        console.log(`🧹 清理 Kvrocks 中的旧性能数据: ${cached.length} -> ${validData.length} 条`);
        await saveToKvrocks(validData);
      }
    }
  } catch (error) {
    console.error('❌ 从 Kvrocks 加载性能数据失败:', error);
  }

  // 如果指定了时间范围，按时间过滤
  let filteredRequests = requestCache;
  if (hours !== undefined) {
    const now = Date.now();
    const timeRangeMs = hours * 60 * 60 * 1000;
    const startTime = now - timeRangeMs;
    filteredRequests = requestCache.filter((r) => r.timestamp >= startTime);
    console.log(`🕐 [Performance] 时间过滤: ${hours}小时内有 ${filteredRequests.length} 条请求`);

    // 如果指定了时间范围，返回该时间范围内的所有数据（不限制条数）
    return filteredRequests.reverse();
  }

  // 如果没有指定时间范围，返回最近的 N 条请求，按时间倒序
  return filteredRequests.slice(-limit).reverse();
}

/**
 * 获取当前系统状态
 */
export async function getCurrentStatus() {
  // 首次调用时从 Kvrocks 加载历史数据
  await loadFromKvrocks();

  const systemMetrics = collectSystemMetrics();
  const recentRequests = requestCache.filter(
    (r) => r.timestamp > Date.now() - 60000 // 最近1分钟
  );

  // 计算流量/分钟（请求大小 + 响应大小）
  const trafficPerMinute = recentRequests.reduce(
    (sum, r) => sum + r.requestSize + r.responseSize,
    0
  );

  return {
    system: systemMetrics,
    requestsPerMinute: recentRequests.length,
    dbQueriesPerMinute: recentRequests.reduce((sum, r) => sum + r.dbQueries, 0),
    avgResponseTime: recentRequests.length > 0
      ? Math.round(recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length)
      : 0,
    trafficPerMinute, // 字节数
  };
}

/**
 * 清空缓存数据
 */
export async function clearCache(): Promise<void> {
  requestCache.length = 0;
  systemMetricsCache.length = 0;
  dbQueryCount = 0;

  // 同时删除 Kvrocks 中的持久化数据
  try {
    await db.deleteCache(PERFORMANCE_KEY);
    console.log('✅ 已清空 Kvrocks 中的性能监控数据');
  } catch (error) {
    console.error('❌ 清空 Kvrocks 数据失败:', error);
  }
}

// 自动数据收集定时器
let collectionInterval: NodeJS.Timeout | null = null;

/**
 * 启动自动数据收集
 */
export function startAutoCollection(): void {
  if (collectionInterval) return; // 已经启动

  console.log('🚀 启动性能监控自动数据收集...');

  // 每 1 小时收集一次系统指标
  collectionInterval = setInterval(() => {
    recordSystemMetrics();
  }, 60 * 60 * 1000); // 1小时
}

/**
 * 停止自动数据收集
 */
export function stopAutoCollection(): void {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
    console.log('⏹️ 停止性能监控自动数据收集');
  }
}
