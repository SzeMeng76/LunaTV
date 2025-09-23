'use client';

import { useState, useEffect } from 'react';
import { 
  TrashIcon, 
  ArrowPathIcon,
  ChartBarIcon,
  ClockIcon,
  ServerIcon,
  DocumentTextIcon,
  FilmIcon,
  MagnifyingGlassIcon,
  FolderIcon,
  VideoCameraIcon,
  PlayIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface CacheStats {
  douban: { count: number; size: number; types: Record<string, number> };
  shortdrama: { count: number; size: number; types: Record<string, number> };
  tmdb: { count: number; size: number; types: Record<string, number> };
  danmu: { count: number; size: number };
  netdisk: { count: number; size: number };
  youtube: { count: number; size: number };
  search: { count: number; size: number };
  other: { count: number; size: number };
  total: { count: number; size: number };
  timestamp: string;
  formattedSizes: {
    douban: string;
    shortdrama: string;
    tmdb: string;
    danmu: string;
    netdisk: string;
    youtube: string;
    search: string;
    other: string;
    total: string;
  };
}

interface CacheType {
  key: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
}

const CACHE_TYPES: CacheType[] = [
  {
    key: 'douban',
    name: '豆瓣数据',
    description: '电影/电视剧详情、分类、推荐等数据缓存',
    icon: FilmIcon,
    color: 'text-green-600 bg-green-100'
  },
  {
    key: 'shortdrama',
    name: '短剧数据',
    description: '短剧分类、推荐、列表、集数等数据缓存',
    icon: PlayIcon,
    color: 'text-orange-600 bg-orange-100'
  },
  {
    key: 'tmdb',
    name: 'TMDB数据',
    description: 'TMDB演员搜索、作品信息等数据缓存',
    icon: FilmIcon,
    color: 'text-purple-600 bg-purple-100'
  },
  {
    key: 'danmu',
    name: '弹幕数据',
    description: '外部弹幕API获取的弹幕内容缓存',
    icon: DocumentTextIcon,
    color: 'text-blue-600 bg-blue-100'
  },
  {
    key: 'netdisk',
    name: '网盘搜索',
    description: '网盘搜索结果缓存（百度、阿里、夸克等）',
    icon: FolderIcon,
    color: 'text-purple-600 bg-purple-100'
  },
  {
    key: 'youtube',
    name: 'YouTube搜索',
    description: 'YouTube视频搜索结果缓存（API和演示模式）',
    icon: VideoCameraIcon,
    color: 'text-red-600 bg-red-100'
  }
];

export default function CacheManager() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // 获取缓存统计
  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/cache');
      if (!response.ok) throw new Error('获取缓存统计失败');
      
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
        setLastRefresh(new Date());
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取缓存统计失败');
    } finally {
      setLoading(false);
    }
  };

  // 清理缓存
  const clearCache = async (type: string) => {
    if (!confirm(`确定要清理${CACHE_TYPES.find(t => t.key === type)?.name || type}缓存吗？`)) {
      return;
    }

    setClearing(type);
    setError(null);
    
    try {
      const response = await fetch(`/api/admin/cache?type=${type}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('清理缓存失败');
      
      const result = await response.json();
      if (result.success) {
        // 清理成功后刷新统计
        await fetchStats();
        
        // 显示成功消息
        const message = result.data.message;
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('globalSuccess', {
            detail: { message }
          }));
        }
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '清理缓存失败');
    } finally {
      setClearing(null);
    }
  };

  // 清理过期缓存
  const clearExpiredCache = async () => {
    await clearCache('expired');
  };

  // 清理所有缓存
  const clearAllCache = async () => {
    if (!confirm('⚠️ 确定要清理所有缓存吗？这将清除豆瓣、短剧、TMDB、弹幕、网盘搜索、YouTube搜索等所有缓存数据。')) {
      return;
    }
    await clearCache('all');
  };

  // 组件加载时获取统计
  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* 标题和刷新按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ChartBarIcon className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            缓存管理
          </h2>
        </div>
        
        <div className="flex items-center space-x-2">
          {lastRefresh && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              <ClockIcon className="inline h-4 w-4 mr-1" />
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchStats}
            disabled={loading}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-3" />
            <span className="text-red-800 dark:text-red-200">{error}</span>
          </div>
        </div>
      )}

      {/* 总览统计 */}
      {stats && (
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.total.count}</div>
              <div className="text-blue-100">缓存项总数</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.formattedSizes.total}</div>
              <div className="text-blue-100">占用存储空间</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">
                {Object.keys(CACHE_TYPES).length}
              </div>
              <div className="text-blue-100">缓存类型</div>
            </div>
          </div>
        </div>
      )}

      {/* 缓存类型详情 */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {CACHE_TYPES.map(cacheType => {
            const typeStats = stats[cacheType.key as keyof typeof stats] as any;
            const Icon = cacheType.icon;
            
            return (
              <div key={cacheType.key} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${cacheType.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {cacheType.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {cacheType.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {typeStats?.count || 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">缓存项</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {stats.formattedSizes[cacheType.key as keyof typeof stats.formattedSizes]}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">存储大小</div>
                  </div>
                </div>

                {/* 豆瓣缓存子类型统计 */}
                {cacheType.key === 'douban' && typeStats?.types && (
                  <div className="mb-4 space-y-1">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">类型分布：</div>
                    {Object.entries(typeStats.types).map(([type, count]) => (
                      <div key={type} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">{type}:</span>
                        <span className="font-mono text-gray-900 dark:text-gray-100">{count as number}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 短剧缓存子类型统计 */}
                {cacheType.key === 'shortdrama' && typeStats?.types && (
                  <div className="mb-4 space-y-1">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">类型分布：</div>
                    {Object.entries(typeStats.types).map(([type, count]) => (
                      <div key={type} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">{type}:</span>
                        <span className="font-mono text-gray-900 dark:text-gray-100">{count as number}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* TMDB缓存子类型统计 */}
                {cacheType.key === 'tmdb' && typeStats?.types && (
                  <div className="mb-4 space-y-1">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">类型分布：</div>
                    {Object.entries(typeStats.types).map(([type, count]) => (
                      <div key={type} className="flex justify-between text-xs">
                        <span className="text-gray-600 dark:text-gray-400">{type}:</span>
                        <span className="font-mono text-gray-900 dark:text-gray-100">{count as number}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => clearCache(cacheType.key)}
                  disabled={clearing === cacheType.key || (typeStats?.count || 0) === 0}
                  className="w-full inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {clearing === cacheType.key ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                      清理中...
                    </>
                  ) : (
                    <>
                      <TrashIcon className="h-4 w-4 mr-2" />
                      清理缓存
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 批量操作 */}
      {stats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            批量操作
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={clearExpiredCache}
              disabled={clearing === 'expired'}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md hover:bg-orange-100 dark:hover:bg-orange-900/30 disabled:opacity-50"
            >
              {clearing === 'expired' ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                  清理中...
                </>
              ) : (
                <>
                  <ClockIcon className="h-4 w-4 mr-2" />
                  清理过期缓存
                </>
              )}
            </button>

            <button
              onClick={clearAllCache}
              disabled={clearing === 'all'}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              {clearing === 'all' ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                  清理中...
                </>
              ) : (
                <>
                  <TrashIcon className="h-4 w-4 mr-2" />
                  清理所有缓存
                </>
              )}
            </button>
          </div>
          
          <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            <p className="flex items-start">
              <ExclamationTriangleIcon className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-orange-500" />
              注意：清理缓存后，相应的数据将需要重新从源服务器获取，可能会影响加载速度。
            </p>
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && !stats && (
        <div className="flex items-center justify-center py-12">
          <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-500 mr-3" />
          <span className="text-gray-600 dark:text-gray-300">正在获取缓存统计...</span>
        </div>
      )}
    </div>
  );
}