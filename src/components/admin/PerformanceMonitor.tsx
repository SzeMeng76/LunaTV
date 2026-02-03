/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';
import { Activity, Database, Zap, HardDrive, Trash2, RefreshCw } from 'lucide-react';

interface PerformanceData {
  metrics: any[];
  recentRequests: {
    timestamp: number;
    method: string;
    path: string;
    statusCode: number;
    duration: number;
    memoryUsed: number;
    dbQueries: number;
    requestSize: number;
    responseSize: number;
  }[];
  currentStatus: {
    system: {
      cpuUsage: number;
      cpuCores: number;
      cpuModel: string;
      memoryUsage: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        systemTotal: number;
        systemUsed: number;
        systemFree: number;
      };
    };
    requestsPerMinute: number;
    dbQueriesPerMinute: number;
    avgResponseTime: number;
    trafficPerMinute: number;
  };
  externalTraffic: {
    totalRequests: number;
    totalTraffic: number;
    requestTraffic: number;
    responseTraffic: number;
    avgDuration: number;
    byDomain: Record<string, { requests: number; traffic: number }>;
  };
}

export default function PerformanceMonitor() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1' | '24'>('1'); // 默认显示最近1小时
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [apiFilter, setApiFilter] = useState<string>('all');

  // 将 API 路径转换为友好的名称
  const getApiName = (path: string): string => {
    const apiNames: Record<string, string> = {
      '/api/douban/details': '豆瓣详情',
      '/api/douban/comments': '豆瓣短评',
      '/api/douban/recommends': '豆瓣推荐',
      '/api/douban/categories': '豆瓣分类',
      '/api/douban': '豆瓣搜索',
      '/api/cron': 'Cron 任务',
      '/api/series': '剧集管理',
      '/api/favorites': '收藏管理',
      '/api/playrecords': '播放记录',
      '/api/skipconfigs': '跳过配置',
      '/api/search': '视频搜索',
      '/api/source-browser/list': '视频列表',
      '/api/detail': '视频详情',
      '/api/danmu-external': '弹幕获取',
      '/api/admin': '管理后台',
    };

    // 精确匹配
    if (apiNames[path]) return apiNames[path];

    // 前缀匹配
    for (const [prefix, name] of Object.entries(apiNames)) {
      if (path.startsWith(prefix)) return name;
    }

    // 短剧 API 统一显示
    if (path.startsWith('/api/shortdrama')) return '短剧 API';

    return path;
  };

  // 格式化流量显示（自动选择 KB/MB/GB）
  const formatTraffic = (bytes: number): string => {
    if (bytes < 1024) {
      return `${bytes.toFixed(2)} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    } else {
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }
  };

  // 过滤请求列表（用于统计，不限制条数）
  const filterRequestsForStats = (requests: any[]) => {
    if (apiFilter === 'all') return requests;

    return requests.filter((req) => {
      if (apiFilter === 'douban') return req.path.startsWith('/api/douban');
      if (apiFilter === 'shortdrama') return req.path.startsWith('/api/shortdrama');
      if (apiFilter === 'cron') return req.path === '/api/cron';
      if (apiFilter === 'admin') return req.path.startsWith('/api/admin');
      if (apiFilter === 'series') return req.path.startsWith('/api/series');
      if (apiFilter === 'favorites') return req.path.startsWith('/api/favorites');
      if (apiFilter === 'playrecords') return req.path.startsWith('/api/playrecords');
      if (apiFilter === 'skipconfigs') return req.path.startsWith('/api/skipconfigs');
      if (apiFilter === 'search') return req.path.startsWith('/api/search');
      if (apiFilter === 'list') return req.path.startsWith('/api/source-browser/list');
      if (apiFilter === 'detail') return req.path.startsWith('/api/detail');
      if (apiFilter === 'danmu') return req.path.startsWith('/api/danmu-external');
      return true;
    });
  };

  // 过滤请求列表（用于显示，最多显示100条）
  const filterRequestsForDisplay = (requests: any[]) => {
    const filtered = filterRequestsForStats(requests);
    // 限制最多显示100条（取最新的100条）
    return filtered.slice(0, 100);
  };

  // 计算过滤后的统计数据
  const getFilteredStats = () => {
    if (!data) return null;

    // 应用API筛选（用于统计，不限制条数）
    const filteredRequests = filterRequestsForStats(data.recentRequests);

    if (filteredRequests.length === 0) {
      return {
        requestsPerMinute: 0,
        avgResponseTime: 0,
        dbQueriesPerMinute: 0,
        trafficPerMinute: 0,
        isCron: false,
      };
    }

    // 计算时间范围内的分钟数
    const minutes = parseInt(timeRange) * 60;

    // 计算平均每分钟请求数（保留2位小数）
    const requestsPerMinute = Number((filteredRequests.length / minutes).toFixed(2));

    // 计算平均响应时间（保留整数）
    const avgResponseTime = Math.round(
      filteredRequests.reduce((sum: number, r: any) => sum + r.duration, 0) / filteredRequests.length
    );

    // 计算平均每分钟DB查询数（保留2位小数）
    const totalDbQueries = filteredRequests.reduce((sum: number, r: any) => sum + r.dbQueries, 0);
    const dbQueriesPerMinute = Number((totalDbQueries / minutes).toFixed(2));

    // 计算平均每分钟流量（保留2位小数，单位：字节）
    const totalTraffic = filteredRequests.reduce(
      (sum: number, r: any) => sum + r.requestSize + r.responseSize,
      0
    );
    const trafficPerMinute = Number((totalTraffic / minutes).toFixed(2));

    // 🚀 检测是否为 Cron 任务筛选
    const isCron = apiFilter === 'cron';

    return {
      requestsPerMinute,
      avgResponseTime,
      dbQueriesPerMinute,
      trafficPerMinute,
      isCron,
    };
  };

  // 🚀 检查是否为 Cron 任务（基于路径判断）
  const isCronTask = (path: string) => {
    return path.includes('/api/cron') || path.includes('/api/admin/cron');
  };

  // 性能评估函数 - 响应时间（区分 Cron 和普通 API）
  const getResponseTimeRating = (avgResponseTime: number, path?: string) => {
    // Cron 任务使用宽松阈值
    if (path && isCronTask(path)) {
      if (avgResponseTime < 30000) { // < 30秒
        return { level: 'excellent', label: '优秀', color: 'text-green-600 dark:text-green-400', tip: '< 30s' };
      } else if (avgResponseTime < 120000) { // < 2分钟
        return { level: 'good', label: '良好', color: 'text-blue-600 dark:text-blue-400', tip: '30s-2min' };
      } else if (avgResponseTime < 300000) { // < 5分钟
        return { level: 'fair', label: '正常', color: 'text-yellow-600 dark:text-yellow-400', tip: '2-5min' };
      } else {
        return { level: 'poor', label: '需优化', color: 'text-red-600 dark:text-red-400', tip: '> 5min' };
      }
    }

    // 普通 API 使用严格阈值
    if (avgResponseTime < 100) {
      return { level: 'excellent', label: '优秀', color: 'text-green-600 dark:text-green-400', tip: '< 100ms' };
    } else if (avgResponseTime < 200) {
      return { level: 'good', label: '良好', color: 'text-blue-600 dark:text-blue-400', tip: '100-200ms' };
    } else if (avgResponseTime < 2000) {
      return { level: 'fair', label: '可接受', color: 'text-yellow-600 dark:text-yellow-400', tip: '200-2000ms' };
    } else {
      return { level: 'poor', label: '需优化', color: 'text-red-600 dark:text-red-400', tip: '> 2000ms' };
    }
  };

  // 性能评估函数 - 每请求DB查询数（区分 Cron 和普通 API）
  const getDbQueriesRating = (requestsPerMinute: number, dbQueriesPerMinute: number, path?: string) => {
    if (requestsPerMinute === 0) return { level: 'unknown', label: '无数据', color: 'text-gray-500', tip: '' };

    const queriesPerRequest = dbQueriesPerMinute / requestsPerMinute;

    // Cron 任务使用宽松阈值（允许更多 DB 查询）
    if (path && isCronTask(path)) {
      if (queriesPerRequest < 50) {
        return { level: 'excellent', label: '优秀', color: 'text-green-600 dark:text-green-400', tip: '< 50次/请求' };
      } else if (queriesPerRequest < 100) {
        return { level: 'good', label: '良好', color: 'text-blue-600 dark:text-blue-400', tip: '50-100次/请求' };
      } else if (queriesPerRequest < 200) {
        return { level: 'fair', label: '正常', color: 'text-yellow-600 dark:text-yellow-400', tip: '100-200次/请求' };
      } else {
        return { level: 'poor', label: '需优化', color: 'text-red-600 dark:text-red-400', tip: '> 200次/请求' };
      }
    }

    // 普通 API 使用严格阈值
    if (queriesPerRequest < 5) {
      return { level: 'excellent', label: '优秀', color: 'text-green-600 dark:text-green-400', tip: '< 5次/请求' };
    } else if (queriesPerRequest < 10) {
      return { level: 'good', label: '良好', color: 'text-blue-600 dark:text-blue-400', tip: '5-10次/请求' };
    } else if (queriesPerRequest < 20) {
      return { level: 'fair', label: '可接受', color: 'text-yellow-600 dark:text-yellow-400', tip: '10-20次/请求' };
    } else {
      return { level: 'poor', label: '需优化', color: 'text-red-600 dark:text-red-400', tip: '> 20次/请求' };
    }
  };

  // 性能评估函数 - API 流量（返回给用户的流量）
  const getTrafficRating = (trafficPerMinute: number) => {
    const trafficKB = trafficPerMinute / 1024; // 转换为 KB
    if (trafficKB < 10) {
      return { level: 'excellent', label: '非常轻量', color: 'text-green-600 dark:text-green-400', tip: '< 10 KB/分钟' };
    } else if (trafficKB < 50) {
      return { level: 'good', label: '轻量', color: 'text-blue-600 dark:text-blue-400', tip: '10-50 KB/分钟' };
    } else if (trafficKB < 200) {
      return { level: 'fair', label: '中等', color: 'text-yellow-600 dark:text-yellow-400', tip: '50-200 KB/分钟' };
    } else {
      return { level: 'poor', label: '较重', color: 'text-orange-600 dark:text-orange-400', tip: '> 200 KB/分钟' };
    }
  };

  // 性能评估函数 - 外部流量（调用外部 API 的流量）
  // 注意：包含图片代理流量，标准相对宽松
  const getExternalTrafficRating = (trafficPerMinute: number) => {
    const trafficMB = trafficPerMinute / 1024 / 1024; // 转换为 MB
    if (trafficMB < 5) {
      return { level: 'excellent', label: '正常', color: 'text-green-600 dark:text-green-400', tip: '< 5 MB/分钟' };
    } else if (trafficMB < 15) {
      return { level: 'good', label: '中等', color: 'text-blue-600 dark:text-blue-400', tip: '5-15 MB/分钟' };
    } else if (trafficMB < 30) {
      return { level: 'fair', label: '较高', color: 'text-yellow-600 dark:text-yellow-400', tip: '15-30 MB/分钟' };
    } else {
      return { level: 'poor', label: '异常高', color: 'text-red-600 dark:text-red-400', tip: '> 30 MB/分钟' };
    }
  };

  // 获取性能数据
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/performance?hours=${timeRange}`);
      if (response.ok) {
        const result = await response.json();
        setData(result.data);
      }
    } catch (error) {
      console.error('获取性能数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 清空数据
  const clearData = async () => {
    if (!confirm('确定要清空所有性能数据吗？')) return;

    try {
      const response = await fetch('/api/admin/performance', {
        method: 'DELETE',
      });
      if (response.ok) {
        alert('性能数据已清空');
        fetchData();
      }
    } catch (error) {
      console.error('清空数据失败:', error);
      alert('清空数据失败');
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchData, 60 * 60 * 1000); // 每1小时刷新
    return () => clearInterval(interval);
  }, [autoRefresh, timeRange]);

  if (loading) {
    return (
      <div className='flex justify-center items-center py-8'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className='text-center py-8 text-gray-500'>
        暂无性能数据
      </div>
    );
  }

  // 获取过滤后的统计数据
  const filteredStats = getFilteredStats();

  return (
    <div className='space-y-6 pb-safe-bottom'>
      {/* 标题和控制按钮 */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <h2 className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
          性能监控
        </h2>
        <div className='flex flex-wrap items-center gap-2 sm:gap-3'>
          {/* 时间范围选择 */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '1' | '24')}
            className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 flex-shrink-0'
          >
            <option value='1'>最近 1 小时</option>
            <option value='24'>最近 24 小时</option>
          </select>

          {/* API 筛选器 */}
          <select
            value={apiFilter}
            onChange={(e) => setApiFilter(e.target.value)}
            className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 flex-shrink-0'
          >
            <option value='all'>全部 API</option>
            <option value='douban'>豆瓣 API</option>
            <option value='shortdrama'>短剧 API</option>
            <option value='search'>视频搜索</option>
            <option value='list'>视频列表</option>
            <option value='detail'>视频详情</option>
            <option value='danmu'>弹幕获取</option>
            <option value='favorites'>收藏管理</option>
            <option value='playrecords'>播放记录</option>
            <option value='skipconfigs'>跳过配置</option>
            <option value='cron'>Cron 任务</option>
            <option value='series'>剧集管理</option>
            <option value='admin'>管理后台</option>
          </select>

          {/* 自动刷新 */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
              autoRefresh
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            自动刷新
          </button>

          {/* 手动刷新 */}
          <button
            onClick={fetchData}
            className='px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-blue-700'
          >
            <RefreshCw className='w-4 h-4' />
            刷新
          </button>

          {/* 清空数据 */}
          <button
            onClick={clearData}
            className='px-3 py-2 bg-red-600 text-white rounded-lg text-sm flex items-center gap-2 hover:bg-red-700'
          >
            <Trash2 className='w-4 h-4' />
            清空数据
          </button>
        </div>
      </div>

      {/* 实时状态卡片 */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4'>
        {/* 进程 CPU 使用率 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>进程 CPU</span>
            <Zap className='w-5 h-5 text-yellow-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {data.currentStatus.system.cpuUsage.toFixed(2)}%
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1 truncate' title={data.currentStatus.system.cpuModel}>
            {data.currentStatus.system.cpuCores} 核 · {data.currentStatus.system.cpuModel.split('@')[0].trim()}
          </div>
        </div>

        {/* 进程内存（LunaTV 专属） */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>进程内存</span>
            <HardDrive className='w-5 h-5 text-blue-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {formatTraffic(data.currentStatus.system.memoryUsage.rss * 1024 * 1024)}
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            堆内存: {formatTraffic(data.currentStatus.system.memoryUsage.heapUsed * 1024 * 1024)}
            <span className='ml-2 text-blue-600 dark:text-blue-400'>
              / {formatTraffic(data.currentStatus.system.memoryUsage.heapTotal * 1024 * 1024)}
            </span>
          </div>
        </div>

        {/* 系统内存 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>系统内存</span>
            <HardDrive className='w-5 h-5 text-green-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {formatTraffic(data.currentStatus.system.memoryUsage.systemUsed * 1024 * 1024)}
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            总共 {formatTraffic(data.currentStatus.system.memoryUsage.systemTotal * 1024 * 1024)}
            <span className='ml-2 text-blue-600 dark:text-blue-400'>
              ({((data.currentStatus.system.memoryUsage.systemUsed / data.currentStatus.system.memoryUsage.systemTotal) * 100).toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* 每分钟请求数 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>请求/分钟</span>
            <Activity className='w-5 h-5 text-green-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {filteredStats?.requestsPerMinute ?? 0}
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            平均响应: {filteredStats?.avgResponseTime ?? 0}ms
            {filteredStats && (
              <span className={`ml-2 font-semibold ${getResponseTimeRating(filteredStats.avgResponseTime, filteredStats.isCron ? '/api/cron' : undefined).color}`}>
                ({getResponseTimeRating(filteredStats.avgResponseTime, filteredStats.isCron ? '/api/cron' : undefined).label})
              </span>
            )}
          </div>
        </div>

        {/* 数据库查询 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>DB 查询/分钟</span>
            <Database className='w-5 h-5 text-purple-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {filteredStats?.dbQueriesPerMinute ?? 0}
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            {filteredStats && filteredStats.requestsPerMinute > 0 && (
              <>
                平均: {(filteredStats.dbQueriesPerMinute / filteredStats.requestsPerMinute).toFixed(1)} 次/请求
                <span className={`ml-2 font-semibold ${getDbQueriesRating(filteredStats.requestsPerMinute, filteredStats.dbQueriesPerMinute, filteredStats.isCron ? '/api/cron' : undefined).color}`}>
                  ({getDbQueriesRating(filteredStats.requestsPerMinute, filteredStats.dbQueriesPerMinute, filteredStats.isCron ? '/api/cron' : undefined).label})
                </span>
              </>
            )}
          </div>
        </div>

        {/* 流量/分钟 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>API 流量/分钟</span>
            <Activity className='w-5 h-5 text-orange-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {((filteredStats?.trafficPerMinute ?? 0) / 1024).toFixed(2)} KB
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            {filteredStats && (
              <span className={`font-semibold ${getTrafficRating(filteredStats.trafficPerMinute).color}`}>
                ({getTrafficRating(filteredStats.trafficPerMinute).label})
              </span>
            )}
          </div>
        </div>

        {/* 外部流量/分钟 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>外部流量/分钟</span>
            <Zap className='w-5 h-5 text-purple-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {data?.externalTraffic ?
              formatTraffic(data.externalTraffic.totalTraffic / parseInt(timeRange) / 60) :
              '0.00 B'
            }
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            {data?.externalTraffic && data.externalTraffic.totalRequests > 0 ? (
              <>
                {data.externalTraffic.totalRequests} 次外部请求
                <span className={`ml-2 font-semibold ${getExternalTrafficRating(data.externalTraffic.totalTraffic / parseInt(timeRange) / 60).color}`}>
                  ({getExternalTrafficRating(data.externalTraffic.totalTraffic / parseInt(timeRange) / 60).label})
                </span>
              </>
            ) : (
              <span className='text-gray-400'>暂无外部请求</span>
            )}
          </div>
        </div>
      </div>

      {/* 外部流量详情（按域名分组） */}
      {data?.externalTraffic && data.externalTraffic.totalRequests > 0 && (
        <details className='bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mt-6'>
          <summary className='px-4 sm:px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'>
            <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 inline'>
              外部流量详情（按域名）
            </h3>
          </summary>
          <div className='border-t border-gray-200 dark:border-gray-700'>
            <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
              <thead className='bg-gray-50 dark:bg-gray-700'>
                <tr>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase'>
                    域名
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase'>
                    请求次数
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase'>
                    总流量
                  </th>
                  <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase'>
                    平均流量/请求
                  </th>
                </tr>
              </thead>
              <tbody className='bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700'>
                {Object.entries(data.externalTraffic.byDomain)
                  .sort((a, b) => b[1].traffic - a[1].traffic)
                  .map(([domain, stats]) => (
                    <tr key={domain}>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                        {domain}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                        {stats.requests}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                        {formatTraffic(stats.traffic)}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                        {formatTraffic(stats.traffic / stats.requests)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
          </div>
        </details>
      )}

      {/* 最近请求列表 */}
      <details className='bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden'>
        <summary className='px-4 sm:px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'>
          <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 inline'>
            最近请求（最新 100 条）
          </h3>
        </summary>
        <div className='border-t border-gray-200 dark:border-gray-700'>
        <div className='overflow-x-auto -mx-4 sm:mx-0'>
          <div className='inline-block min-w-full align-middle'>
            <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
            <thead className='bg-gray-50 dark:bg-gray-700'>
              <tr>
                <th className='px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'>
                  时间
                </th>
                <th className='px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'>
                  API 名称
                </th>
                <th className='px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'>
                  状态码
                </th>
                <th className='px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'>
                  响应时间
                </th>
                <th className='px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'>
                  内存
                </th>
                <th className='px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'>
                  DB 查询
                </th>
                <th className='px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap'>
                  响应大小
                </th>
              </tr>
            </thead>
            <tbody className='bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700'>
              {filterRequestsForDisplay(data.recentRequests).map((request: any, index: number) => {
                const responseSizeKB = (request.responseSize / 1024).toFixed(2);
                const isSuccess = request.statusCode >= 200 && request.statusCode < 300;
                const isError = request.statusCode >= 400;

                return (
                  <tr key={index}>
                    <td className='px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                      {new Date(request.timestamp).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className='px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                      {getApiName(request.path)}
                    </td>
                    <td className='px-4 sm:px-6 py-4 whitespace-nowrap text-sm'>
                      <span className={`${
                        isSuccess
                          ? 'text-green-600 dark:text-green-400'
                          : isError
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-yellow-600 dark:text-yellow-400'
                      }`}>
                        {request.statusCode}
                      </span>
                    </td>
                    <td className='px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                      {request.duration}ms
                    </td>
                    <td className='px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                      {request.memoryUsed.toFixed(2)} MB
                    </td>
                    <td className='px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                      {request.dbQueries > 0 ? request.dbQueries : '-'}
                    </td>
                    <td className='px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
                      {responseSizeKB} KB
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        </div>
      </details>
    </div>
  );
}
