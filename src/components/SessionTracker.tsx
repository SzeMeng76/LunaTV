'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 会话追踪组件
 * 负责检测会话恢复并记录登入时间
 */
export function SessionTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const checkSessionResume = async () => {
      try {
        // 如果在登录页面，跳过检测（登录页面会自己记录）
        if (pathname === '/login') {
          return;
        }

        // 检查用户是否已登录
        const authCookie = document.cookie.split(';').find(cookie =>
          cookie.trim().startsWith('auth=')
        );

        if (!authCookie) {
          // 用户未登录，不需要记录
          return;
        }

        // 检查上次记录的登入时间
        const lastRecordedLogin = localStorage.getItem('lastRecordedLogin');
        const now = Date.now();
        const sessionTimeout = 4 * 60 * 60 * 1000; // 4小时

        const shouldRecordLogin = !lastRecordedLogin ||
          (now - parseInt(lastRecordedLogin)) > sessionTimeout;

        if (shouldRecordLogin) {
          console.log('检测到新会话，记录登入时间');

          // 记录新的登入时间
          const response = await fetch('/api/user/my-stats', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginTime: now })
          });

          if (response.ok) {
            localStorage.setItem('lastRecordedLogin', now.toString());
            console.log('会话恢复登入时间记录成功');
          } else {
            console.warn('会话恢复登入时间记录失败:', response.status);
          }
        }
      } catch (error) {
        console.error('会话检测失败:', error);
      }
    };

    // 页面加载时检查
    checkSessionResume();

    // 页面可见性变化时也检查（用户切换回来时）
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // 页面变为可见时，延迟一点再检查
        setTimeout(checkSessionResume, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pathname]); // 路径变化时重新检测

  // 这个组件不渲染任何UI
  return null;
}