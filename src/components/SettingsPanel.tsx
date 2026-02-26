/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  Check,
  ChevronDown,
  ExternalLink,
  X,
} from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { UserEmbyConfig } from './UserEmbyConfig';
import { useEmbyConfigQuery } from '@/hooks/useUserMenuQueries';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  try { return JSON.parse(v) as T; } catch { return v as unknown as T; }
}

const doubanDataSourceOptions = [
  { value: 'direct', label: '直连（服务器直接请求豆瓣）' },
  { value: 'cors-proxy-zwei', label: 'Cors Proxy By Zwei' },
  { value: 'cmliussss-cdn-tencent', label: '豆瓣 CDN By CMLiussss（腾讯云）' },
  { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
  { value: 'custom', label: '自定义代理' },
];

const doubanImageProxyTypeOptions = [
  { value: 'direct', label: '直连（浏览器直接请求豆瓣）' },
  { value: 'server', label: '服务器代理（由服务器代理请求豆瓣）' },
  { value: 'img3', label: '豆瓣官方精品 CDN（阿里云）' },
  { value: 'cmliussss-cdn-tencent', label: '豆瓣 CDN By CMLiussss（腾讯云）' },
  { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
  { value: 'baidu', label: '百度图片代理（境内CDN，Chrome可能触发下载）' },
  { value: 'custom', label: '自定义代理' },
];

const bufferModeOptions = [
  { value: 'standard' as const, label: '默认模式', description: '标准缓冲设置，适合网络稳定的环境', icon: '🎯', color: 'green' },
  { value: 'enhanced' as const, label: '增强模式', description: '1.5倍缓冲，适合偶尔卡顿的网络环境', icon: '⚡', color: 'blue' },
  { value: 'max' as const, label: '强力模式', description: '3倍大缓冲，起播稍慢但播放更流畅', icon: '🚀', color: 'purple' },
];

function getThanksInfo(dataSource: string) {
  switch (dataSource) {
    case 'cors-proxy-zwei':
      return { text: 'Thanks to @Zwei', url: 'https://github.com/bestzwei' };
    case 'cmliussss-cdn-tencent':
    case 'cmliussss-cdn-ali':
      return { text: 'Thanks to @CMLiussss', url: 'https://github.com/cmliu' };
    default:
      return null;
  }
}

const Toggle = memo(({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className='flex items-center cursor-pointer'>
    <div className='relative'>
      <input type='checkbox' className='sr-only peer' checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
      <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
    </div>
  </label>
));
Toggle.displayName = 'Toggle';

export const SettingsPanel = memo(({ isOpen, onClose }: SettingsPanelProps) => {
  // ── Settings state (localStorage-backed) ──────────────────────────────────
  const [defaultAggregateSearch, setDefaultAggregateSearch] = useState(true);
  const [doubanProxyUrl, setDoubanProxyUrl] = useState('');
  const [enableOptimization, setEnableOptimization] = useState(false);
  const [fluidSearch, setFluidSearch] = useState(true);
  const [liveDirectConnect, setLiveDirectConnect] = useState(false);
  const [playerBufferMode, setPlayerBufferMode] = useState<'standard' | 'enhanced' | 'max'>('standard');
  const [doubanDataSource, setDoubanDataSource] = useState('direct');
  const [doubanImageProxyType, setDoubanImageProxyType] = useState('direct');
  const [doubanImageProxyUrl, setDoubanImageProxyUrl] = useState('');
  const [continueWatchingMinProgress, setContinueWatchingMinProgress] = useState(5);
  const [continueWatchingMaxProgress, setContinueWatchingMaxProgress] = useState(100);
  const [enableContinueWatchingFilter, setEnableContinueWatchingFilter] = useState(false);
  const [enableAutoSkip, setEnableAutoSkip] = useState(true);
  const [enableAutoNextEpisode, setEnableAutoNextEpisode] = useState(true);
  const [requireClearConfirmation, setRequireClearConfirmation] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'TS' | 'MP4'>('TS');
  const [exactSearch, setExactSearch] = useState(true);
  const [isDoubanDropdownOpen, setIsDoubanDropdownOpen] = useState(false);
  const [isDoubanImageProxyDropdownOpen, setIsDoubanImageProxyDropdownOpen] = useState(false);

  // ── Emby config via TanStack Query ────────────────────────────────────────
  const { data: embyConfig = { sources: [] } } = useEmbyConfigQuery(isOpen);

  // ── Load settings from localStorage on mount ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const RC = (window as any).RUNTIME_CONFIG || {};

    setDefaultAggregateSearch(readLS('defaultAggregateSearch', true));
    setEnableOptimization(readLS('enableOptimization', false));
    setFluidSearch(readLS('fluidSearch', RC.FLUID_SEARCH !== false));
    setLiveDirectConnect(readLS('liveDirectConnect', false));
    setDoubanProxyUrl(readLS('doubanProxyUrl', RC.DOUBAN_PROXY || ''));
    setDoubanDataSource(localStorage.getItem('doubanDataSource') ?? RC.DOUBAN_PROXY_TYPE ?? 'direct');
    setDoubanImageProxyType(localStorage.getItem('doubanImageProxyType') ?? RC.DOUBAN_IMAGE_PROXY_TYPE ?? 'server');
    setDoubanImageProxyUrl(readLS('doubanImageProxyUrl', RC.DOUBAN_IMAGE_PROXY || ''));
    setContinueWatchingMinProgress(readLS('continueWatchingMinProgress', 5));
    setContinueWatchingMaxProgress(readLS('continueWatchingMaxProgress', 100));
    setEnableContinueWatchingFilter(readLS('enableContinueWatchingFilter', false));
    setEnableAutoSkip(readLS('enableAutoSkip', true));
    setEnableAutoNextEpisode(readLS('enableAutoNextEpisode', true));
    setRequireClearConfirmation(readLS('requireClearConfirmation', false));
    const fmt = localStorage.getItem('downloadFormat');
    if (fmt === 'TS' || fmt === 'MP4') setDownloadFormat(fmt);
    const es = localStorage.getItem('exactSearch');
    if (es !== null) setExactSearch(es === 'true');
    setPlayerBufferMode(readLS('playerBufferMode', 'standard'));
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const set = <T,>(setter: (v: T) => void, key: string, stringify = true) =>
    (v: T) => {
      setter(v);
      localStorage.setItem(key, stringify ? JSON.stringify(v) : String(v));
    };

  const handleAggregateToggle = set(setDefaultAggregateSearch, 'defaultAggregateSearch');
  const handleOptimizationToggle = set(setEnableOptimization, 'enableOptimization');
  const handleFluidSearchToggle = set(setFluidSearch, 'fluidSearch');
  const handleLiveDirectConnectToggle = set(setLiveDirectConnect, 'liveDirectConnect');
  const handleRequireClearConfirmationToggle = set(setRequireClearConfirmation, 'requireClearConfirmation');
  const handleDownloadFormatChange = set<'TS' | 'MP4'>(setDownloadFormat, 'downloadFormat', false);
  const handleExactSearchToggle = (v: boolean) => { setExactSearch(v); localStorage.setItem('exactSearch', String(v)); };
  const handleDoubanProxyUrlChange = (v: string) => { setDoubanProxyUrl(v); localStorage.setItem('doubanProxyUrl', v); };
  const handleDoubanDataSourceChange = (v: string) => { setDoubanDataSource(v); localStorage.setItem('doubanDataSource', v); };
  const handleDoubanImageProxyTypeChange = (v: string) => { setDoubanImageProxyType(v); localStorage.setItem('doubanImageProxyType', v); };
  const handleDoubanImageProxyUrlChange = (v: string) => { setDoubanImageProxyUrl(v); localStorage.setItem('doubanImageProxyUrl', v); };
  const handleBufferModeChange = (v: 'standard' | 'enhanced' | 'max') => { setPlayerBufferMode(v); localStorage.setItem('playerBufferMode', v); };
  const handleContinueWatchingMinProgressChange = (v: number) => { setContinueWatchingMinProgress(v); localStorage.setItem('continueWatchingMinProgress', v.toString()); };
  const handleContinueWatchingMaxProgressChange = (v: number) => { setContinueWatchingMaxProgress(v); localStorage.setItem('continueWatchingMaxProgress', v.toString()); };
  const handleEnableContinueWatchingFilterToggle = set(setEnableContinueWatchingFilter, 'enableContinueWatchingFilter');

  const handleEnableAutoSkipToggle = (v: boolean) => {
    setEnableAutoSkip(v);
    localStorage.setItem('enableAutoSkip', JSON.stringify(v));
    window.dispatchEvent(new Event('localStorageChanged'));
  };

  const handleEnableAutoNextEpisodeToggle = (v: boolean) => {
    setEnableAutoNextEpisode(v);
    localStorage.setItem('enableAutoNextEpisode', JSON.stringify(v));
    window.dispatchEvent(new Event('localStorageChanged'));
  };

  const handleResetSettings = () => {
    const RC = (window as any).RUNTIME_CONFIG || {};
    const defaultDoubanProxyType = RC.DOUBAN_PROXY_TYPE || 'direct';
    const defaultDoubanProxy = RC.DOUBAN_PROXY || '';
    const defaultDoubanImageProxyType = RC.DOUBAN_IMAGE_PROXY_TYPE || 'server';
    const defaultDoubanImageProxyUrl = RC.DOUBAN_IMAGE_PROXY || '';
    const defaultFluidSearch = RC.FLUID_SEARCH !== false;

    setDefaultAggregateSearch(true);
    setEnableOptimization(false);
    setFluidSearch(defaultFluidSearch);
    setLiveDirectConnect(false);
    setDoubanProxyUrl(defaultDoubanProxy);
    setDoubanDataSource(defaultDoubanProxyType);
    setDoubanImageProxyType(defaultDoubanImageProxyType);
    setDoubanImageProxyUrl(defaultDoubanImageProxyUrl);
    setContinueWatchingMinProgress(5);
    setContinueWatchingMaxProgress(100);
    setEnableContinueWatchingFilter(false);
    setEnableAutoSkip(true);
    setEnableAutoNextEpisode(true);
    setPlayerBufferMode('standard');
    setDownloadFormat('TS');

    localStorage.setItem('defaultAggregateSearch', JSON.stringify(true));
    localStorage.setItem('enableOptimization', JSON.stringify(false));
    localStorage.setItem('fluidSearch', JSON.stringify(defaultFluidSearch));
    localStorage.setItem('liveDirectConnect', JSON.stringify(false));
    localStorage.setItem('doubanProxyUrl', defaultDoubanProxy);
    localStorage.setItem('doubanDataSource', defaultDoubanProxyType);
    localStorage.setItem('doubanImageProxyType', defaultDoubanImageProxyType);
    localStorage.setItem('doubanImageProxyUrl', defaultDoubanImageProxyUrl);
    localStorage.setItem('continueWatchingMinProgress', '5');
    localStorage.setItem('continueWatchingMaxProgress', '100');
    localStorage.setItem('enableContinueWatchingFilter', JSON.stringify(false));
    localStorage.setItem('enableAutoSkip', JSON.stringify(true));
    localStorage.setItem('enableAutoNextEpisode', JSON.stringify(true));
    localStorage.setItem('requireClearConfirmation', JSON.stringify(false));
    localStorage.setItem('playerBufferMode', 'standard');
    localStorage.setItem('downloadFormat', 'TS');
  };

  if (!isOpen) return null;

  const panel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-1000'
        onClick={onClose}
        onTouchMove={e => e.preventDefault()}
        onWheel={e => e.preventDefault()}
        style={{ touchAction: 'none' }}
      />

      {/* 设置面板 */}
      <div className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl z-1001 flex flex-col'>
        {/* 内容容器 */}
        <div
          className='flex-1 p-6 overflow-y-auto'
          data-panel-content
          style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
        >
          {/* 标题栏 */}
          <div className='flex items-center justify-between mb-6'>
            <div className='flex items-center gap-3'>
              <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>本地设置</h3>
              <button
                onClick={handleResetSettings}
                className='px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 hover:border-red-300 dark:border-red-800 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors'
                title='重置为默认设置'
              >
                恢复默认
              </button>
            </div>
            <button
              onClick={onClose}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          {/* 设置项 */}
          <div className='space-y-6'>
            {/* Emby 配置 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>Emby私人影库</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>配置你的私人 Emby 服务器</p>
              </div>
              <UserEmbyConfig initialConfig={embyConfig} />
            </div>

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 豆瓣数据源 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>豆瓣数据代理</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>选择获取豆瓣数据的方式</p>
              </div>
              <div className='relative' data-dropdown='douban-datasource'>
                <button
                  type='button'
                  onClick={() => setIsDoubanDropdownOpen(!isDoubanDropdownOpen)}
                  className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
                >
                  {doubanDataSourceOptions.find(o => o.value === doubanDataSource)?.label}
                </button>
                <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
                  <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isDoubanDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {isDoubanDropdownOpen && (
                  <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                    {doubanDataSourceOptions.map(option => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => { handleDoubanDataSourceChange(option.value); setIsDoubanDropdownOpen(false); }}
                        className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${doubanDataSource === option.value ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}
                      >
                        <span className='truncate'>{option.label}</span>
                        {doubanDataSource === option.value && <Check className='w-4 h-4 text-green-600 dark:text-green-400 shrink-0 ml-2' />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {getThanksInfo(doubanDataSource) && (
                <div className='mt-3'>
                  <button
                    type='button'
                    onClick={() => window.open(getThanksInfo(doubanDataSource)!.url, '_blank')}
                    className='flex items-center justify-center gap-1.5 w-full px-3 text-xs text-gray-500 dark:text-gray-400 cursor-pointer'
                  >
                    <span className='font-medium'>{getThanksInfo(doubanDataSource)!.text}</span>
                    <ExternalLink className='w-3.5 opacity-70' />
                  </button>
                </div>
              )}
            </div>

            {doubanDataSource === 'custom' && (
              <div className='space-y-3'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>豆瓣代理地址</h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>自定义代理服务器地址</p>
                </div>
                <input
                  type='text'
                  className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
                  placeholder='例如: https://proxy.example.com/fetch?url='
                  value={doubanProxyUrl}
                  onChange={e => handleDoubanProxyUrlChange(e.target.value)}
                />
              </div>
            )}

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 豆瓣图片代理 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>豆瓣图片代理</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>选择获取豆瓣图片的方式</p>
              </div>
              <div className='relative' data-dropdown='douban-image-proxy'>
                <button
                  type='button'
                  onClick={() => setIsDoubanImageProxyDropdownOpen(!isDoubanImageProxyDropdownOpen)}
                  className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
                >
                  {doubanImageProxyTypeOptions.find(o => o.value === doubanImageProxyType)?.label}
                </button>
                <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
                  <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${isDoubanImageProxyDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {isDoubanImageProxyDropdownOpen && (
                  <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                    {doubanImageProxyTypeOptions.map(option => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => { handleDoubanImageProxyTypeChange(option.value); setIsDoubanImageProxyDropdownOpen(false); }}
                        className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${doubanImageProxyType === option.value ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}
                      >
                        <span className='truncate'>{option.label}</span>
                        {doubanImageProxyType === option.value && <Check className='w-4 h-4 text-green-600 dark:text-green-400 shrink-0 ml-2' />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {getThanksInfo(doubanImageProxyType) && (
                <div className='mt-3'>
                  <button
                    type='button'
                    onClick={() => window.open(getThanksInfo(doubanImageProxyType)!.url, '_blank')}
                    className='flex items-center justify-center gap-1.5 w-full px-3 text-xs text-gray-500 dark:text-gray-400 cursor-pointer'
                  >
                    <span className='font-medium'>{getThanksInfo(doubanImageProxyType)!.text}</span>
                    <ExternalLink className='w-3.5 opacity-70' />
                  </button>
                </div>
              )}
            </div>

            {doubanImageProxyType === 'custom' && (
              <div className='space-y-3'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>豆瓣图片代理地址</h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>自定义图片代理服务器地址</p>
                </div>
                <input
                  type='text'
                  className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
                  placeholder='例如: https://proxy.example.com/fetch?url='
                  value={doubanImageProxyUrl}
                  onChange={e => handleDoubanImageProxyUrlChange(e.target.value)}
                />
              </div>
            )}

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 开关设置 */}
            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>默认聚合搜索结果</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>搜索时默认按标题和年份聚合显示结果</p>
              </div>
              <Toggle checked={defaultAggregateSearch} onChange={handleAggregateToggle} />
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>优选和测速</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>如出现播放器劫持问题可关闭</p>
              </div>
              <Toggle checked={enableOptimization} onChange={handleOptimizationToggle} />
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>流式搜索输出</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>启用搜索结果实时流式输出，关闭后使用传统一次性搜索</p>
              </div>
              <Toggle checked={fluidSearch} onChange={handleFluidSearchToggle} />
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>精确搜索</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>开启后，搜索结果将过滤掉不包含搜索词的内容</p>
              </div>
              <Toggle checked={exactSearch} onChange={handleExactSearchToggle} />
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>IPTV 视频浏览器直连</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>开启 IPTV 视频浏览器直连时，需要自备 Allow CORS 插件</p>
              </div>
              <Toggle checked={liveDirectConnect} onChange={handleLiveDirectConnectToggle} />
            </div>

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 播放缓冲优化 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>播放缓冲优化</h4>
                <p className='text-xs text-gray-400 dark:text-gray-500 mt-1'>根据网络环境选择合适的缓冲模式，减少播放卡顿</p>
              </div>
              <div className='space-y-2'>
                {bufferModeOptions.map(option => {
                  const isSelected = playerBufferMode === option.value;
                  const colorClasses = {
                    green: {
                      selected: 'border-transparent bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 ring-2 ring-green-400/60 dark:ring-green-500/50 shadow-[0_0_15px_-3px_rgba(34,197,94,0.4)] dark:shadow-[0_0_15px_-3px_rgba(34,197,94,0.3)]',
                      icon: 'bg-linear-to-br from-green-100 to-emerald-100 dark:from-green-800/50 dark:to-emerald-800/50',
                      check: 'text-green-500', label: 'text-green-700 dark:text-green-300',
                    },
                    blue: {
                      selected: 'border-transparent bg-linear-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 ring-2 ring-blue-400/60 dark:ring-blue-500/50 shadow-[0_0_15px_-3px_rgba(59,130,246,0.4)] dark:shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]',
                      icon: 'bg-linear-to-br from-blue-100 to-cyan-100 dark:from-blue-800/50 dark:to-cyan-800/50',
                      check: 'text-blue-500', label: 'text-blue-700 dark:text-blue-300',
                    },
                    purple: {
                      selected: 'border-transparent bg-linear-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 ring-2 ring-purple-400/60 dark:ring-purple-500/50 shadow-[0_0_15px_-3px_rgba(168,85,247,0.4)] dark:shadow-[0_0_15px_-3px_rgba(168,85,247,0.3)]',
                      icon: 'bg-linear-to-br from-purple-100 to-pink-100 dark:from-purple-800/50 dark:to-pink-800/50',
                      check: 'text-purple-500', label: 'text-purple-700 dark:text-purple-300',
                    },
                  } as const;
                  const colors = colorClasses[option.color as keyof typeof colorClasses];
                  return (
                    <button
                      key={option.value}
                      type='button'
                      onClick={() => handleBufferModeChange(option.value)}
                      className={`w-full p-3 rounded-xl border-2 transition-all duration-300 text-left flex items-center gap-3 ${isSelected ? colors.selected : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm bg-white dark:bg-gray-800'}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all duration-300 ${isSelected ? colors.icon : 'bg-gray-100 dark:bg-gray-700'}`}>
                        {option.icon}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2'>
                          <span className={`font-medium transition-colors duration-300 ${isSelected ? colors.label : 'text-gray-900 dark:text-gray-100'}`}>{option.label}</span>
                        </div>
                        <p className='text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1'>{option.description}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 ${isSelected ? `${colors.check} scale-100` : 'text-transparent scale-75'}`}>
                        <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 20 20'>
                          <path fillRule='evenodd' d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z' clipRule='evenodd' />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 跳过片头片尾 */}
            <div className='space-y-4'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>跳过片头片尾设置</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>控制播放器默认的片头片尾跳过行为</p>
              </div>
              <div className='flex items-center justify-between'>
                <div>
                  <h5 className='text-sm font-medium text-gray-700 dark:text-gray-300'>启用自动跳过</h5>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>开启后将自动跳过片头片尾，关闭则显示手动跳过按钮</p>
                </div>
                <Toggle checked={enableAutoSkip} onChange={handleEnableAutoSkipToggle} />
              </div>
              <div className='flex items-center justify-between'>
                <div>
                  <h5 className='text-sm font-medium text-gray-700 dark:text-gray-300'>片尾自动播放下一集</h5>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>开启后片尾结束时自动跳转到下一集</p>
                </div>
                <Toggle checked={enableAutoNextEpisode} onChange={handleEnableAutoNextEpisodeToggle} />
              </div>
              <div className='flex items-center justify-between'>
                <div>
                  <h5 className='text-sm font-medium text-gray-700 dark:text-gray-300'>清空记录确认提示</h5>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>开启后点击清空按钮时会弹出确认对话框，防止误操作</p>
                </div>
                <Toggle checked={requireClearConfirmation} onChange={handleRequireClearConfirmationToggle} />
              </div>
              <div className='text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800'>
                💡 这些设置会作为新视频的默认配置。对于已配置的视频，请在播放页面的"跳过设置"中单独调整。
              </div>
            </div>

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 继续观看进度筛选 */}
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>继续观看进度筛选</h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>是否启用"继续观看"的播放进度筛选功能</p>
                </div>
                <Toggle checked={enableContinueWatchingFilter} onChange={handleEnableContinueWatchingFilterToggle} />
              </div>
              {enableContinueWatchingFilter && (
                <>
                  <div>
                    <h5 className='text-sm font-medium text-gray-600 dark:text-gray-400 mb-3'>进度范围设置</h5>
                  </div>
                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2'>最小进度 (%)</label>
                      <input
                        type='number' min='0' max='100'
                        className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        value={continueWatchingMinProgress}
                        onChange={e => handleContinueWatchingMinProgressChange(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2'>最大进度 (%)</label>
                      <input
                        type='number' min='0' max='100'
                        className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        value={continueWatchingMaxProgress}
                        onChange={e => handleContinueWatchingMaxProgressChange(Math.max(0, Math.min(100, parseInt(e.target.value) || 100)))}
                      />
                    </div>
                  </div>
                  <div className='text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg'>
                    当前设置：显示播放进度在 {continueWatchingMinProgress}% - {continueWatchingMaxProgress}% 之间的内容
                  </div>
                </>
              )}
              {!enableContinueWatchingFilter && (
                <div className='text-xs text-gray-500 dark:text-gray-400 bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800'>
                  筛选已关闭：将显示所有播放时间超过2分钟的内容
                </div>
              )}
            </div>

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            {/* 下载格式 */}
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>下载格式</h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>选择视频下载时的默认格式</p>
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <button
                  type='button'
                  onClick={() => handleDownloadFormatChange('TS')}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 ${downloadFormat === 'TS' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}`}
                >
                  <div className='flex flex-col items-center gap-2'>
                    <div className={`text-2xl ${downloadFormat === 'TS' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>📦</div>
                    <div className='text-center'>
                      <div className={`text-sm font-semibold ${downloadFormat === 'TS' ? 'text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-gray-100'}`}>TS格式</div>
                      <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>推荐，兼容性好</div>
                    </div>
                    {downloadFormat === 'TS' && (
                      <div className='w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center'>
                        <svg className='w-3 h-3' fill='currentColor' viewBox='0 0 20 20'><path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' /></svg>
                      </div>
                    )}
                  </div>
                </button>
                <button
                  type='button'
                  onClick={() => handleDownloadFormatChange('MP4')}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 ${downloadFormat === 'MP4' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}`}
                >
                  <div className='flex flex-col items-center gap-2'>
                    <div className={`text-2xl ${downloadFormat === 'MP4' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>🎬</div>
                    <div className='text-center'>
                      <div className={`text-sm font-semibold ${downloadFormat === 'MP4' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>MP4格式</div>
                      <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>通用格式</div>
                    </div>
                    {downloadFormat === 'MP4' && (
                      <div className='w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center'>
                        <svg className='w-3 h-3' fill='currentColor' viewBox='0 0 20 20'><path fillRule='evenodd' d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' clipRule='evenodd' /></svg>
                      </div>
                    )}
                  </div>
                </button>
              </div>
              <div className='text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800'>
                💡 TS格式下载速度快，兼容性好；MP4格式经过转码，体积略小，兼容性更广
              </div>
            </div>
          </div>

          {/* 底部说明 */}
          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>这些设置保存在本地浏览器中</p>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
});

SettingsPanel.displayName = 'SettingsPanel';
