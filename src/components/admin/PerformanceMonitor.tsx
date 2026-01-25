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
}

export default function PerformanceMonitor() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1' | '24'>('24');
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
      '/api/admin': '管理后台',
    };

    // 精确匹配
    if (apiNames[path]) return apiNames[path];

    // 前缀匹配
    for (const [prefix, name] of Object.entries(apiNames)) {
      if (path.startsWith(prefix)) return name;
    }

    return path;
  };

  // 过滤请求列表
  const filterRequests = (requests: any[]) => {
    if (apiFilter === 'all') return requests;

    return requests.filter((req) => {
      if (apiFilter === 'douban') return req.path.startsWith('/api/douban');
      if (apiFilter === 'cron') return req.path === '/api/cron';
      if (apiFilter === 'admin') return req.path.startsWith('/api/admin');
      if (apiFilter === 'series') return req.path.startsWith('/api/series');
      if (apiFilter === 'favorites') return req.path.startsWith('/api/favorites');
      return true;
    });
  };

  // 获取性能数据
  const fetchData = async () => {
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
            <option value='cron'>Cron 任务</option>
            <option value='admin'>管理后台</option>
            <option value='series'>剧集管理</option>
            <option value='favorites'>收藏管理</option>
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
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4'>
        {/* CPU 使用率 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>CPU 使用率</span>
            <Zap className='w-5 h-5 text-yellow-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {data.currentStatus.system.cpuUsage.toFixed(2)}%
          </div>
        </div>

        {/* 内存使用 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>系统内存</span>
            <HardDrive className='w-5 h-5 text-blue-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {data.currentStatus.system.memoryUsage.systemUsed.toFixed(0)} MB
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            已用 / 总共 {data.currentStatus.system.memoryUsage.systemTotal.toFixed(0)} MB
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
            {data.currentStatus.requestsPerMinute}
          </div>
          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
            平均响应: {data.currentStatus.avgResponseTime}ms
          </div>
        </div>

        {/* 数据库查询 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>DB 查询/分钟</span>
            <Database className='w-5 h-5 text-purple-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {data.currentStatus.dbQueriesPerMinute}
          </div>
        </div>

        {/* 流量/分钟 */}
        <div className='bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>流量/分钟</span>
            <Activity className='w-5 h-5 text-orange-500' />
          </div>
          <div className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
            {(data.currentStatus.trafficPerMinute / 1024).toFixed(2)} KB
          </div>
        </div>
      </div>

      {/* 最近请求列表 */}
      <div className='bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden'>
        <div className='px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
          <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200'>
            最近请求（最新 100 条）
          </h3>
        </div>
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
              {filterRequests(data.recentRequests).map((request: any, index: number) => {
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
    </div>
  );
}
