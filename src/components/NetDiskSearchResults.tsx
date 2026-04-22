'use client';

import { useState, useEffect } from 'react';
import { ClipboardIcon, EyeIcon, EyeSlashIcon, LinkIcon } from '@heroicons/react/24/outline';

interface NetDiskLink {
  url: string;
  password: string;
  note: string;
  datetime: string;
  source: string;
  images?: string[];
}

interface NetDiskSearchResultsProps {
  results: { [key: string]: NetDiskLink[] } | null;
  loading: boolean;
  error: string | null;
  total: number;
}

const CLOUD_TYPES = {
  baidu: { name: '百度网盘', color: 'bg-blue-500', lightColor: 'bg-blue-500/10 hover:bg-blue-500/20', icon: '📁', domain: 'pan.baidu.com' },
  aliyun: { name: '阿里云盘', color: 'bg-orange-500', lightColor: 'bg-orange-500/10 hover:bg-orange-500/20', icon: '☁️', domain: 'alipan.com' },
  quark: { name: '夸克网盘', color: 'bg-purple-500', lightColor: 'bg-purple-500/10 hover:bg-purple-500/20', icon: '⚡', domain: 'pan.quark.cn' },
  guangya: { name: '光鸭云盘', color: 'bg-amber-500', lightColor: 'bg-amber-500/10 hover:bg-amber-500/20', icon: '🦆', domain: 'guangya.com' },
  tianyi: { name: '天翼云盘', color: 'bg-red-500', lightColor: 'bg-red-500/10 hover:bg-red-500/20', icon: '📱', domain: 'cloud.189.cn' },
  uc: { name: 'UC网盘', color: 'bg-green-500', lightColor: 'bg-green-500/10 hover:bg-green-500/20', icon: '🌐', domain: 'drive.uc.cn' },
  mobile: { name: '移动云盘', color: 'bg-cyan-500', lightColor: 'bg-cyan-500/10 hover:bg-cyan-500/20', icon: '📲', domain: 'caiyun.139.com' },
  '115': { name: '115网盘', color: 'bg-gray-500', lightColor: 'bg-gray-500/10 hover:bg-gray-500/20', icon: '💾', domain: '115.com' },
  pikpak: { name: 'PikPak', color: 'bg-pink-500', lightColor: 'bg-pink-500/10 hover:bg-pink-500/20', icon: '📦', domain: 'mypikpak.com' },
  xunlei: { name: '迅雷网盘', color: 'bg-yellow-500', lightColor: 'bg-yellow-500/10 hover:bg-yellow-500/20', icon: '⚡', domain: 'pan.xunlei.com' },
  '123': { name: '123网盘', color: 'bg-indigo-500', lightColor: 'bg-indigo-500/10 hover:bg-indigo-500/20', icon: '🔢', domain: '123pan.com' },
  magnet: { name: '磁力链接', color: 'bg-black', lightColor: 'bg-black/10 hover:bg-black/20', icon: '🧲', domain: 'magnet:' },
  ed2k: { name: '电驴链接', color: 'bg-teal-500', lightColor: 'bg-teal-500/10 hover:bg-teal-500/20', icon: '🐴', domain: 'ed2k://' },
  others: { name: '其他', color: 'bg-gray-400', lightColor: 'bg-gray-400/10 hover:bg-gray-400/20', icon: '📄', domain: '' }
};

export default function NetDiskSearchResults({ results, loading, error, total }: NetDiskSearchResultsProps) {
  const [visiblePasswords, setVisiblePasswords] = useState<{ [key: string]: boolean }>({});
  const [copiedItems, setCopiedItems] = useState<{ [key: string]: boolean }>({});
  const [selectedFilter, setSelectedFilter] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'selected'>('all');
  const [expandedTitles, setExpandedTitles] = useState<{ [key: string]: boolean }>({});
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // 检测屏幕尺寸用于响应式 sticky top
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)');
    setIsLargeScreen(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const togglePasswordVisibility = (key: string) => {
    setVisiblePasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTitleExpansion = (key: string) => {
    setExpandedTitles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedItems(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 筛选结果
  const filteredResults = results && filterMode === 'selected' && selectedFilter.length > 0
    ? Object.fromEntries(
        Object.entries(results).filter(([type]) => selectedFilter.includes(type))
      )
    : results;

  // 快速跳转到指定网盘类型
  const scrollToCloudType = (type: string) => {
    const element = document.getElementById(`cloud-type-${type}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 切换筛选标签
  const toggleFilterTag = (type: string) => {
    setSelectedFilter(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  // 获取有结果的网盘类型统计
  const availableTypes = results 
    ? Object.entries(results).map(([type, links]) => ({
        type,
        count: links.length,
        info: CLOUD_TYPES[type as keyof typeof CLOUD_TYPES] || CLOUD_TYPES.others
      })).sort((a, b) => b.count - a.count) // 按数量降序排列
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-300">正在搜索网盘资源...</span>
      </div>
    );
  }

  if (error) {
    // 判断是否为功能未启用的错误
    const isFunctionDisabled = error.includes('未启用') || error.includes('未配置') || error.includes('配置不完整');
    
    return (
      <div className={`${isFunctionDisabled ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'} border rounded-lg p-4 animate-fade-in`}>
        <div className="flex items-start">
          <div className="shrink-0 mt-0.5">
            {isFunctionDisabled ? (
              <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.707 7.293a1 1 0 0 0-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 1 0 1.414 1.414L10 11.414l1.293 1.293a1 1 0 0 0 1.414-1.414L11.414 10l1.293-1.293a1 1 0 0 0-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="ml-3 flex-1">
            <h3 className={`text-sm font-medium ${isFunctionDisabled ? 'text-blue-800 dark:text-blue-200' : 'text-red-800 dark:text-red-200'}`}>
              {isFunctionDisabled ? '网盘搜索功能未启用' : '网盘搜索失败'}
            </h3>
            <div className={`mt-2 text-sm ${isFunctionDisabled ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'}`}>
              {error}
            </div>
            
            {/* 用户友好的解决建议 */}
            <div className={`mt-3 p-3 ${isFunctionDisabled ? 'bg-blue-100 dark:bg-blue-800/30' : 'bg-red-100 dark:bg-red-800/30'} rounded-md`}>
              <div className={`text-xs ${isFunctionDisabled ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                💡 <strong>解决方案：</strong>
                {isFunctionDisabled ? (
                  <div className="mt-1">
                    • 联系管理员启用网盘搜索功能<br/>
                    • 管理员可在后台设置中配置PanSou服务地址<br/>
                    • 暂时可以使用影视搜索功能查找内容
                  </div>
                ) : (
                  <div className="mt-1">
                    • 检查网络连接是否正常<br/>
                    • 稍后重试或使用不同关键词搜索<br/>
                    • 如问题持续，请联系管理员检查服务状态
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!results || Object.keys(results).length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 text-gray-400">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0 1 12 15c-2.206 0-4.206.896-5.656 2.344M6.343 6.343A8 8 0 1 1 17.657 17.657 8 8 0 016.343 6.343z" />
          </svg>
        </div>
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">未找到相关资源</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">尝试使用其他关键词搜索</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 快速筛选和导航栏 - 使用负top值消除空隙 */}
      <div
        className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-lg border-b border-gray-200 dark:border-gray-700 sticky z-10 mb-6"
        style={{
          top: isLargeScreen ? '-25px' : '-17px', // sm: 24px padding + 1px border = 25px; mobile: 16px + 1px = 17px
          marginLeft: isLargeScreen ? '-1.5rem' : '-1rem',
          marginRight: isLargeScreen ? '-1.5rem' : '-1rem',
          paddingLeft: isLargeScreen ? '1.5rem' : '1rem',
          paddingRight: isLargeScreen ? '1.5rem' : '1rem',
          paddingTop: '1rem',
          paddingBottom: '1rem',
        }}
      >
        <div>
          {/* 筛选模式切换 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 space-y-3 sm:space-y-0">
            <div className="flex items-center space-x-2">
              <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100">快速筛选</h3>
              <div className="group relative hidden sm:block">
                <svg className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-3 py-2 text-xs text-white bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                  <div className="text-center">
                    💡 使用技巧：<br/>
                    • 显示全部：点击标签快速跳转<br/>
                    • 仅显示选中：点击标签筛选显示
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end space-x-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 hidden md:inline">
                {filterMode === 'all' ? '点击标签跳转到对应类型 →' : '点击标签筛选显示 →'}
              </span>
              <button
                onClick={() => {
                  setFilterMode(filterMode === 'all' ? 'selected' : 'all');
                  if (filterMode === 'selected') {
                    setSelectedFilter([]);
                  }
                }}
                className={`px-3 py-1.5 sm:py-1 text-xs rounded-full transition-colors relative ${
                  filterMode === 'selected'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
                title={filterMode === 'all' ? '切换到筛选模式' : '切换到跳转模式'}
              >
                {filterMode === 'all' ? '显示全部' : '仅显示选中'}
                {filterMode === 'all' && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-orange-400 rounded-full animate-pulse"></span>
                )}
              </button>
            </div>
          </div>

          {/* 网盘类型标签 */}
          <div className="flex flex-wrap gap-2">
            {availableTypes.map(({ type, count, info }) => (
              <button
                key={type}
                onClick={() => {
                  if (filterMode === 'all') {
                    scrollToCloudType(type);
                  } else {
                    toggleFilterTag(type);
                  }
                }}
                className={`inline-flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border transition-colors ${
                  filterMode === 'selected' && selectedFilter.includes(type)
                    ? `${info.color} text-white border-transparent`
                    : `${info.lightColor} border-gray-300 dark:border-gray-600`
                } text-xs sm:text-sm font-medium`}
                title={filterMode === 'all' ? '点击跳转' : '点击筛选'}
              >
                <span className="text-sm sm:text-lg">{info.icon}</span>
                <span className="whitespace-nowrap">
                  <span className="block sm:hidden">
                    {info.name.length > 4 ? info.name.substring(0, 4) : info.name}
                  </span>
                  <span className="hidden sm:block">
                    {info.name}
                  </span>
                </span>
                <span className="bg-white/20 px-1 sm:px-1.5 py-0.5 rounded text-xs">
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* 筛选状态提示 */}
          <div className="mt-3">
            {filterMode === 'all' ? (
              <div className="flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                </svg>
                <span>🎯 <strong>快速跳转模式</strong> - 点击任意标签快速滚动到对应网盘类型</span>
              </div>
            ) : (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedFilter.length === 0 ? (
                  <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>📌 点击上方标签选择要显示的网盘类型，或切换到"显示全部"模式使用快速跳转</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>✅ 已选择 <strong>{selectedFilter.length}</strong> 种网盘类型，点击标签可取消选择</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* 搜索结果统计 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <div className="flex items-center">
          <svg className="h-5 w-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-blue-800 dark:text-blue-200">
            {filterMode === 'selected' && selectedFilter.length > 0 ? (
              <>显示 <strong>{Object.keys(filteredResults || {}).length}</strong> 种筛选的网盘类型 (总共 <strong>{total}</strong> 个资源)</>
            ) : (
              <>共找到 <strong>{total}</strong> 个网盘资源，覆盖 <strong>{Object.keys(results).length}</strong> 种网盘类型</>
            )}
          </span>
        </div>
      </div>

      {/* 按网盘类型分组展示 */}
      <div className="space-y-6">
        {Object.entries(filteredResults || {}).map(([type, links]) => {
          const cloudType = CLOUD_TYPES[type as keyof typeof CLOUD_TYPES] || CLOUD_TYPES.others;

          return (
            <div key={type} id={`cloud-type-${type}`} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 scroll-mt-24">
            {/* 网盘类型头部 */}
            <div className={`${cloudType.color} text-white px-4 py-3 rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{cloudType.icon}</span>
                  <h3 className="font-medium">{cloudType.name}</h3>
                  <span className="bg-white/20 px-2 py-1 rounded-full text-xs">
                    {links.length} 个链接
                  </span>
                </div>
              </div>
            </div>

            {/* 链接列表 */}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {links.map((link, index) => {
                const linkKey = `${type}-${index}`;
                const isPasswordVisible = visiblePasswords[linkKey];
                const isCopied = copiedItems[linkKey];
                const isTitleExpanded = expandedTitles[linkKey];
                const title = link.note || '未命名资源';
                const shouldShowExpandMobile = title.length > 30;
                const shouldShowExpandDesktop = title.length > 80;

                return (
                  <div key={index} className="p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between space-y-3 sm:space-y-0">
                      <div className="flex-1 min-w-0">
                        {/* 资源标题 */}
                        <div className="mb-2">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words pr-2">
                            {/* 移动端显示 */}
                            <span className="block sm:hidden">
                              {shouldShowExpandMobile ? (
                                <div className="space-y-2">
                                  <span>{isTitleExpanded ? title : `${title.substring(0, 30)}...`}</span>
                                  <div className="flex justify-start">
                                    <button
                                      onClick={() => toggleTitleExpansion(linkKey)}
                                      className="inline-flex items-center space-x-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-800/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium rounded-md border border-blue-200 dark:border-blue-700 transition-all duration-200 ease-in-out"
                                    >
                                      <span>{isTitleExpanded ? '收起' : '展开'}</span>
                                      <svg
                                        className={`h-3 w-3 transition-transform duration-200 ${isTitleExpanded ? 'rotate-180' : ''}`}
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                      >
                                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                title
                              )}
                            </span>
                            {/* 桌面端显示 */}
                            <span className="hidden sm:block">
                              {shouldShowExpandDesktop ? (
                                <div className="space-y-2">
                                  <span className={`block ${isTitleExpanded ? '' : 'line-clamp-2'}`}>
                                    {title}
                                  </span>
                                  <button
                                    onClick={() => toggleTitleExpansion(linkKey)}
                                    className="inline-flex items-center space-x-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-800/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs font-medium rounded-md border border-blue-200 dark:border-blue-700 transition-all duration-200 ease-in-out"
                                  >
                                    <span>{isTitleExpanded ? '收起' : '展开'}</span>
                                    <svg
                                      className={`h-3 w-3 transition-transform duration-200 ${isTitleExpanded ? 'rotate-180' : ''}`}
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <span className="line-clamp-2">
                                  {title}
                                </span>
                              )}
                            </span>
                          </h4>
                        </div>

                        {/* 链接和密码 */}
                        <div className="space-y-2">
                          <div className="flex items-start space-x-2">
                            <LinkIcon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono break-all block w-full">
                                <span className="block sm:hidden">
                                  {link.url.length > 40 ? `${link.url.substring(0, 40)}...` : link.url}
                                </span>
                                <span className="hidden sm:block">
                                  {link.url}
                                </span>
                              </code>
                            </div>
                            <button
                              onClick={() => copyToClipboard(link.url, `url-${linkKey}`)}
                              className={`p-1 transition-colors shrink-0 ${
                                copiedItems[`url-${linkKey}`]
                                  ? 'text-green-500'
                                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                              }`}
                              title={copiedItems[`url-${linkKey}`] ? "已复制" : "复制链接"}
                            >
                              {copiedItems[`url-${linkKey}`] ? (
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <ClipboardIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>

                          {link.password && (
                            <div className="flex items-start space-x-2">
                              <svg className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded font-mono block">
                                  {isPasswordVisible ? link.password : '****'}
                                </code>
                              </div>
                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  onClick={() => togglePasswordVisibility(linkKey)}
                                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                  title={isPasswordVisible ? "隐藏密码" : "显示密码"}
                                >
                                  {isPasswordVisible ? (
                                    <EyeSlashIcon className="h-4 w-4" />
                                  ) : (
                                    <EyeIcon className="h-4 w-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => copyToClipboard(link.password, `pwd-${linkKey}`)}
                                  className={`p-1 transition-colors ${
                                    copiedItems[`pwd-${linkKey}`]
                                      ? 'text-green-500'
                                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                  }`}
                                  title={copiedItems[`pwd-${linkKey}`] ? "已复制" : "复制密码"}
                                >
                                  {copiedItems[`pwd-${linkKey}`] ? (
                                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  ) : (
                                    <ClipboardIcon className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 元信息 */}
                        <div className="mt-3 flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-4 text-xs text-gray-500 dark:text-gray-400">
                          <span className="truncate">来源: {link.source}</span>
                          <span className="truncate">时间: {new Date(link.datetime).toLocaleString('zh-CN')}</span>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="sm:ml-4 shrink-0">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-2 sm:py-1 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors w-full sm:w-auto justify-center"
                        >
                          访问链接
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}