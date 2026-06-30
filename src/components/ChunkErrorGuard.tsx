'use client';

import { useEffect } from 'react';

/**
 * 全局兜底：监听 window 上未被 React Error Boundary 捕获的 ChunkLoadError，
 * 自动硬刷新一次（10s TTL 防循环）。
 *
 * 触发场景：
 * - event handler 里的 next/dynamic / 动态 import() 失败
 * - Suspense 边界外的懒加载
 * - 部署后旧 chunk 已被覆盖
 */
export function ChunkErrorGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const RELOAD_KEY = 'chunk_reload_window';
    const TTL = 10_000;

    const maybeReload = (msg: string) => {
      try {
        const prev = sessionStorage.getItem(RELOAD_KEY);
        const now = Date.now();
        if (!prev || now - parseInt(prev, 10) > TTL) {
          sessionStorage.setItem(RELOAD_KEY, String(now));
          // eslint-disable-next-line no-console
          console.warn('[ChunkErrorGuard] 捕获 ChunkLoadError，硬刷新页面：', msg);
          window.location.reload();
          return true;
        }
      } catch {
        // sessionStorage 不可用时仍尝试刷新一次
        window.location.reload();
        return true;
      }
      return false;
    };

    const looksLikeChunkError = (msg?: string, name?: string) => {
      if (!msg && !name) return false;
      const text = `${name || ''} ${msg || ''}`;
      return (
        text.includes('ChunkLoadError') ||
        text.includes('Failed to load chunk') ||
        text.includes('Loading chunk') ||
        text.includes('Loading CSS chunk') ||
        // Turbopack 形式
        /Failed to load chunk .*_next\/static\/chunks/.test(text)
      );
    };

    const onError = (e: ErrorEvent) => {
      const err = e.error as Error | undefined;
      if (looksLikeChunkError(e.message || err?.message, err?.name)) {
        if (maybeReload(e.message || err?.message || 'chunk error')) {
          e.preventDefault();
        }
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      const msg =
        typeof reason === 'string'
          ? reason
          : reason?.message || String(reason || '');
      const name = reason?.name;
      if (looksLikeChunkError(msg, name)) {
        if (maybeReload(msg)) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}

export default ChunkErrorGuard;
