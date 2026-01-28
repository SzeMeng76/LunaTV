'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { isAIRecommendFeatureDisabled } from '@/lib/ai-recommend.client';

import AIRecommendModal from './AIRecommendModal';
import { BackButton } from './BackButton';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import ModernNav from './ModernNav';
import Sidebar from './Sidebar';
import { useSite } from './SiteProvider';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  useModernNav?: boolean; // 新增：是否使用2025现代化导航
}

const PageLayout = ({
  children,
  activePath = '/',
  useModernNav = true,
}: PageLayoutProps) => {
  const { siteName } = useSite();

  // ✨ AI 推荐功能 - 全局管理
  const [showAIRecommendModal, setShowAIRecommendModal] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(true);

  // 检查 AI 功能是否开启
  useEffect(() => {
    if (isAIRecommendFeatureDisabled()) {
      setAiEnabled(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/ai-recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });
        if (!cancelled) {
          setAiEnabled(response.status !== 403);
        }
      } catch (error) {
        if (!cancelled) {
          setAiEnabled(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (useModernNav) {
    // 2025 Modern Navigation Layout
    return (
      <>
        <div className='w-full min-h-screen'>
          {/* Modern Navigation - Top (Desktop) & Bottom (Mobile) */}
          <ModernNav showAIButton={aiEnabled ?? false} onAIButtonClick={() => setShowAIRecommendModal(true)} />

        {/* 移动端头部 - Logo和用户菜单 */}
        <div className='md:hidden fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm'>
          <div className='flex items-center justify-between h-11 px-4'>
            {/* Logo */}
            <div className='text-base font-bold bg-linear-to-r from-green-600 via-emerald-600 to-teal-600 dark:from-green-400 dark:via-emerald-400 dark:to-teal-400 bg-clip-text text-transparent'>
              {siteName}
            </div>

            {/* ✨ AI Button, Theme Toggle & User Menu */}
            <div className='flex items-center gap-1.5'>
              {aiEnabled && (
                <button
                  onClick={() => setShowAIRecommendModal(true)}
                  className='relative p-1.5 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 active:scale-95 transition-all duration-200 shadow-lg shadow-blue-500/30 group'
                  aria-label='AI 推荐'
                >
                  <Sparkles className='h-4 w-4 group-hover:scale-110 transition-transform duration-300' />
                </button>
              )}
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </div>

        {/* Main Content - 移动端44px顶部 + 底部导航栏空间，桌面端64px */}
        <main className='w-full min-h-screen pt-[44px] md:pt-16 pb-16 md:pb-8'>
          <div className='w-full max-w-[2560px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-20'>
            {children}
          </div>
        </main>
      </div>

      {/* ✨ AI 推荐弹窗 */}
      <AIRecommendModal
        isOpen={showAIRecommendModal}
        onClose={() => setShowAIRecommendModal(false)}
      />
    </>
    );
  }

  // Legacy Sidebar Layout (原来的设计)
  return (
    <div className='w-full min-h-screen'>
      {/* 移动端头部 */}
      <MobileHeader showBackButton={['/play', '/live'].includes(activePath)} />

      {/* 主要布局容器 */}
      <div className='flex md:grid md:grid-cols-[auto_1fr] w-full min-h-screen md:min-h-auto'>
        {/* 侧边栏 - 桌面端显示，移动端隐藏 */}
        <div className='hidden md:block'>
          <Sidebar activePath={activePath} />
        </div>

        {/* 主内容区域 */}
        <div className='relative min-w-0 flex-1 transition-all duration-300'>
          {/* 桌面端左上角返回按钮 */}
          {['/play', '/live'].includes(activePath) && (
            <div className='absolute top-3 left-1 z-20 hidden md:flex'>
              <BackButton />
            </div>
          )}

          {/* ✨ 桌面端顶部按钮 - AI, Theme Toggle & User Menu */}
          <div className='absolute top-2 right-4 z-20 hidden md:flex items-center gap-2'>
            {aiEnabled && (
              <button
                onClick={() => setShowAIRecommendModal(true)}
                className='relative p-2 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 active:scale-95 transition-all duration-200 shadow-lg shadow-blue-500/30 group'
                aria-label='AI 推荐'
              >
                <Sparkles className='h-5 w-5 group-hover:scale-110 transition-transform duration-300' />
              </button>
            )}
            <ThemeToggle />
            <UserMenu />
          </div>

          {/* 主内容 */}
          <main
            className='flex-1 md:min-h-0 mb-14 md:mb-0 md:mt-0 mt-12'
            style={{
              // 悬浮胶囊导航栏高度约 56px + 底部 1rem 间距 + 安全区
              paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
            }}
          >
            {children}
          </main>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className='md:hidden'>
        <MobileBottomNav activePath={activePath} />
      </div>

      {/* ✨ AI 推荐弹窗 */}
      <AIRecommendModal
        isOpen={showAIRecommendModal}
        onClose={() => setShowAIRecommendModal(false)}
      />
    </div>
  );
};

export default PageLayout;
