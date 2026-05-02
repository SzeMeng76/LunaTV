'use client';

import { CheckCircle, Layout } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface HomePageConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const HomePageConfig = ({ config, refreshConfig }: HomePageConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [homePageSettings, setHomePageSettings] = useState({
    showHeroBanner: true,
    showContinueWatching: true,
    showUpcomingReleases: true,
    showHotMovies: true,
    showHotTvShows: true,
    showNewAnime: true,
    showHotVariety: true,
    showHotShortDramas: true,
  });

  useEffect(() => {
    if (config?.HomePageConfig) {
      setHomePageSettings({
        showHeroBanner: config.HomePageConfig.showHeroBanner ?? true,
        showContinueWatching: config.HomePageConfig.showContinueWatching ?? true,
        showUpcomingReleases: config.HomePageConfig.showUpcomingReleases ?? true,
        showHotMovies: config.HomePageConfig.showHotMovies ?? true,
        showHotTvShows: config.HomePageConfig.showHotTvShows ?? true,
        showNewAnime: config.HomePageConfig.showNewAnime ?? true,
        showHotVariety: config.HomePageConfig.showHotVariety ?? true,
        showHotShortDramas: config.HomePageConfig.showHotShortDramas ?? true,
      });
    }
  }, [config]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/homepage-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(homePageSettings)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      showMessage('success', '首页模块配置保存成功');
      await refreshConfig();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setHomePageSettings({
      showHeroBanner: true,
      showContinueWatching: true,
      showUpcomingReleases: true,
      showHotMovies: true,
      showHotTvShows: true,
      showNewAnime: true,
      showHotVariety: true,
      showHotShortDramas: true,
    });
  };

  const ToggleSwitch = ({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) => (
    <label className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'>
      <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>{label}</span>
      <button
        type='button'
        role='switch'
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );

  return (
    <div className='space-y-6'>
      {message && (
        <div className={`flex items-center space-x-2 p-3 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : null}
          <span>{message.text}</span>
        </div>
      )}

      <div className='bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm'>
        <div className='mb-6'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2'>
            <Layout className='h-5 w-5 text-blue-500' />
            首页模块显示设置
          </h3>
          <p className='text-sm text-gray-500 dark:text-gray-400'>
            控制首页各个模块的显示与隐藏，关闭的模块将不会在首页显示
          </p>
        </div>

        <div className='space-y-3'>
          <ToggleSwitch
            checked={homePageSettings.showHeroBanner}
            onChange={(checked) => setHomePageSettings(prev => ({ ...prev, showHeroBanner: checked }))}
            label='Hero Banner 轮播'
          />
          <ToggleSwitch
            checked={homePageSettings.showContinueWatching}
            onChange={(checked) => setHomePageSettings(prev => ({ ...prev, showContinueWatching: checked }))}
            label='继续观看'
          />
          <ToggleSwitch
            checked={homePageSettings.showUpcomingReleases}
            onChange={(checked) => setHomePageSettings(prev => ({ ...prev, showUpcomingReleases: checked }))}
            label='即将上映'
          />
          <ToggleSwitch
            checked={homePageSettings.showHotMovies}
            onChange={(checked) => setHomePageSettings(prev => ({ ...prev, showHotMovies: checked }))}
            label='热门电影'
          />
          <ToggleSwitch
            checked={homePageSettings.showHotTvShows}
            onChange={(checked) => setHomePageSettings(prev => ({ ...prev, showHotTvShows: checked }))}
            label='热门剧集'
          />
          <ToggleSwitch
            checked={homePageSettings.showNewAnime}
            onChange={(checked) => setHomePageSettings(prev => ({ ...prev, showNewAnime: checked }))}
            label='新番放送'
          />
          <ToggleSwitch
            checked={homePageSettings.showHotVariety}
            onChange={(checked) => setHomePageSettings(prev => ({ ...prev, showHotVariety: checked }))}
            label='热门综艺'
          />
          <ToggleSwitch
            checked={homePageSettings.showHotShortDramas}
            onChange={(checked) => setHomePageSettings(prev => ({ ...prev, showHotShortDramas: checked }))}
            label='热门短剧'
          />
        </div>

        <div className='mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
          <button
            type='button'
            onClick={handleReset}
            className='px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors'
          >
            恢复默认
          </button>
          <button
            type='button'
            onClick={handleSave}
            disabled={isLoading}
            className='px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {isLoading ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomePageConfig;
