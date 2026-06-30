'use client';

import { Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { isAIRecommendFeatureDisabled } from '@/lib/ai-recommend.client';

import AIRecommendModal from './AIRecommendModal';
import ModernNav from './ModernNav';
import { useSite } from './SiteProvider';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

// 不需要导航栏的独立路由
const STANDALONE_ROUTES = [
  '/login',
  '/register',
  '/oidc-register',
  '/warning',
  '/source-test',
  '/watch-room/screen',
];

function isStandaloneRoute(pathname: string) {
  return STANDALONE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export default function NavigationShell() {
  const pathname = usePathname();
  const { siteName } = useSite();
  const isStandalone = isStandaloneRoute(pathname);

  // AI 推荐功能
  const [showAIRecommendModal, setShowAIRecommendModal] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(true);

  useEffect(() => {
    const disabled = isAIRecommendFeatureDisabled();
    setAiEnabled(!disabled);
  }, []);

  // 独立路由不显示导航栏
  if (isStandalone) {
    return null;
  }

  return (
    <>
      {/* Modern Navigation - Top (Desktop) & Bottom (Mobile) */}
      <ModernNav
        showAIButton={aiEnabled ?? false}
        onAIButtonClick={() => setShowAIRecommendModal(true)}
      />

      {/* 移动端头部 - Logo和用户菜单 */}
      <div className='md:hidden fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm'>
        <div className='flex items-center justify-between h-11 px-4'>
          {/* Logo */}
          <div className='text-base font-bold bg-linear-to-r from-green-600 via-emerald-600 to-teal-600 dark:from-green-400 dark:via-emerald-400 dark:to-teal-400 bg-clip-text text-transparent'>
            {siteName}
          </div>

          {/* AI Button, Theme Toggle & User Menu */}
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

      {/* AI 推荐弹窗 */}
      <AIRecommendModal
        isOpen={showAIRecommendModal}
        onClose={() => setShowAIRecommendModal(false)}
      />
    </>
  );
}
