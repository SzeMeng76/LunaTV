'use client';

import { useState, useEffect } from 'react';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

/**
 * 检查当前用户是否已登录（客户端）
 * 用于控制 query 的 enabled 选项，避免未登录时发送无用请求
 */
export function useIsAuthenticated(): boolean {
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    const auth = getAuthInfoFromBrowserCookie();
    setIsAuth(!!auth?.username);
  }, []);

  return isAuth;
}
