/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useRef, useEffect } from 'react';
import { ClientCache } from '@/lib/client-cache';

/**
 * useDanmu Hook - 弹幕管理
 *
 * 功能：
 * - 弹幕状态管理（开关、加载状态）
 * - 弹幕缓存管理（读取、保存、过期清理）
 * - 弹幕数据加载（API 请求、防重复、防抖）
 * - 弹幕操作处理（开关切换、插件控制）
 */

// ==================== 类型定义 ====================

export interface UseDanmuOptions {
  videoTitle: string;
  videoYear: string;
  videoDoubanId: number;
  currentEpisodeIndex: number;
  currentSource: string;
  artPlayerRef: React.MutableRefObject<any>;
}

export interface UseDanmuReturn {
  // 状态
  externalDanmuEnabled: boolean;
  setExternalDanmuEnabled: (enabled: boolean) => void;

  // 方法
  loadExternalDanmu: () => Promise<any[]>;
  handleDanmuOperationOptimized: (nextState: boolean) => void;

  // Refs（供外部访问）
  externalDanmuEnabledRef: React.MutableRefObject<boolean>;
  danmuLoadingRef: React.MutableRefObject<any>;
  lastDanmuLoadKeyRef: React.MutableRefObject<string>;
  danmuPluginStateRef: React.MutableRefObject<any>;
}

// ==================== 常量 ====================

const DANMU_CACHE_DURATION = 30 * 60; // 30分钟缓存（秒）
const DANMU_CACHE_KEY_PREFIX = 'danmu-cache';
const DANMU_LOAD_TIMEOUT = 15000; // 15秒超时

// ==================== 缓存管理函数 ====================

/**
 * 获取弹幕缓存
 */
async function getDanmuCacheItem(key: string): Promise<{ data: any[]; timestamp: number } | null> {
  try {
    const cacheKey = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
    // 优先从统一存储获取
    const cached = await ClientCache.get(cacheKey);
    if (cached) return cached;

    // 兜底：从localStorage获取（兼容性）
    if (typeof localStorage !== 'undefined') {
      const oldCacheKey = 'lunatv_danmu_cache';
      const localCached = localStorage.getItem(oldCacheKey);
      if (localCached) {
        const parsed = JSON.parse(localCached);
        const cacheMap = new Map(Object.entries(parsed));
        const item = cacheMap.get(key) as { data: any[]; timestamp: number } | undefined;
        if (item && typeof item.timestamp === 'number' && Date.now() - item.timestamp < DANMU_CACHE_DURATION * 1000) {
          return item;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('读取弹幕缓存失败:', error);
    return null;
  }
}

/**
 * 保存弹幕缓存
 */
async function setDanmuCacheItem(key: string, data: any[]): Promise<void> {
  try {
    const cacheKey = `${DANMU_CACHE_KEY_PREFIX}-${key}`;
    const cacheData = { data, timestamp: Date.now() };

    // 主要存储：统一存储
    await ClientCache.set(cacheKey, cacheData, DANMU_CACHE_DURATION);

    // 兜底存储：localStorage（兼容性，但只存储最近几个）
    if (typeof localStorage !== 'undefined') {
      try {
        const oldCacheKey = 'lunatv_danmu_cache';
        let localCache: Map<string, { data: any[]; timestamp: number }> = new Map();

        const existing = localStorage.getItem(oldCacheKey);
        if (existing) {
          const parsed = JSON.parse(existing);
          localCache = new Map(Object.entries(parsed)) as Map<string, { data: any[]; timestamp: number }>;
        }

        // 清理过期项并限制数量（最多保留10个）
        const now = Date.now();
        const validEntries = Array.from(localCache.entries())
          .filter(([, item]) => typeof item.timestamp === 'number' && now - item.timestamp < DANMU_CACHE_DURATION * 1000)
          .slice(-9); // 保留9个，加上新的共10个

        validEntries.push([key, cacheData]);

        const obj = Object.fromEntries(validEntries);
        localStorage.setItem(oldCacheKey, JSON.stringify(obj));
      } catch (e) {
        // localStorage可能满了，忽略错误
      }
    }
  } catch (error) {
    console.warn('保存弹幕缓存失败:', error);
  }
}

// ==================== useDanmu Hook ====================

export function useDanmu(options: UseDanmuOptions): UseDanmuReturn {
  const {
    videoTitle,
    videoYear,
    videoDoubanId,
    currentEpisodeIndex,
    currentSource,
    artPlayerRef,
  } = options;

  // 弹幕开关状态（从 localStorage 继承，默认关闭）
  const [externalDanmuEnabled, setExternalDanmuEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_external_danmu');
      return v === 'true';
    }
    return false;
  });

  // Refs
  const externalDanmuEnabledRef = useRef(externalDanmuEnabled);
  const danmuLoadingRef = useRef<any>(false);
  const lastDanmuLoadKeyRef = useRef<string>('');
  const danmuOperationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const danmuPluginStateRef = useRef<any>(null);

  // 同步 ref
  useEffect(() => {
    externalDanmuEnabledRef.current = externalDanmuEnabled;
  }, [externalDanmuEnabled]);

  // ==================== 加载外部弹幕 ====================

  const loadExternalDanmu = async (): Promise<any[]> => {
    if (!externalDanmuEnabledRef.current) {
      console.log('外部弹幕开关已关闭');
      return [];
    }

    // 生成当前请求的唯一标识
    const currentEpisodeNum = currentEpisodeIndex + 1;
    const requestKey = `${videoTitle}_${videoYear}_${videoDoubanId}_${currentEpisodeNum}`;

    // 智能加载状态检测
    const now = Date.now();
    const loadingState = danmuLoadingRef.current as any;
    const lastLoadTime = loadingState?.timestamp || 0;
    const lastRequestKey = loadingState?.requestKey || '';
    const isStuckLoad = now - lastLoadTime > DANMU_LOAD_TIMEOUT;
    const isSameRequest = lastRequestKey === requestKey;

    // 防止重复请求
    if (loadingState?.loading && isSameRequest && !isStuckLoad) {
      console.log('⏳ 弹幕正在加载中，跳过重复请求');
      return [];
    }

    // 强制重置卡住的加载状态
    if (isStuckLoad && loadingState?.loading) {
      console.warn('🔧 检测到弹幕加载超时，强制重置 (15秒)');
      danmuLoadingRef.current = false;
    }

    // 设置新的加载状态
    danmuLoadingRef.current = {
      loading: true,
      timestamp: now,
      requestKey,
      source: currentSource,
      episode: currentEpisodeNum,
    } as any;
    lastDanmuLoadKeyRef.current = requestKey;

    try {
      // 构建请求参数
      const params = new URLSearchParams();

      if (videoDoubanId && videoDoubanId > 0) {
        params.append('douban_id', videoDoubanId.toString());
      }
      if (videoTitle) {
        params.append('title', videoTitle);
      }
      if (videoYear) {
        params.append('year', videoYear);
      }
      if (currentEpisodeIndex !== null && currentEpisodeIndex >= 0) {
        params.append('episode', currentEpisodeNum.toString());
      }

      if (!params.toString()) {
        console.log('没有可用的参数获取弹幕');
        danmuLoadingRef.current = false;
        return [];
      }

      // 生成缓存键
      const cacheKey = `${videoTitle}_${videoYear}_${videoDoubanId}_${currentEpisodeNum}`;

      // 检查缓存
      console.log('🔍 检查弹幕缓存:', cacheKey);
      const cached = await getDanmuCacheItem(cacheKey);
      if (cached && (now - cached.timestamp) < (DANMU_CACHE_DURATION * 1000)) {
        console.log('✅ 使用弹幕缓存数据，缓存键:', cacheKey);
        console.log('📊 缓存弹幕数量:', cached.data.length);
        danmuLoadingRef.current = false;
        return cached.data;
      }

      // 请求 API
      console.log('开始获取外部弹幕，参数:', params.toString());
      const response = await fetch(`/api/danmu-external?${params}`);
      console.log('弹幕API响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('弹幕API请求失败:', response.status, errorText);
        danmuLoadingRef.current = false;
        return [];
      }

      const data = await response.json();
      console.log('外部弹幕API返回数据:', data);
      console.log('外部弹幕加载成功:', data.total || 0, '条');

      const finalDanmu = data.danmu || [];
      console.log('最终弹幕数据:', finalDanmu.length, '条');

      // 保存到缓存
      console.log('💾 保存弹幕到缓存:', cacheKey);
      await setDanmuCacheItem(cacheKey, finalDanmu);

      return finalDanmu;
    } catch (error) {
      console.error('加载外部弹幕失败:', error);
      return [];
    } finally {
      danmuLoadingRef.current = false;
    }
  };

  // ==================== 弹幕操作处理（防抖优化）====================

  const handleDanmuOperationOptimized = (nextState: boolean) => {
    // 清除之前的防抖定时器
    if (danmuOperationTimeoutRef.current) {
      clearTimeout(danmuOperationTimeoutRef.current);
    }

    // 立即更新UI状态（确保响应性）
    externalDanmuEnabledRef.current = nextState;
    setExternalDanmuEnabled(nextState);

    // 同步保存到localStorage
    try {
      localStorage.setItem('enable_external_danmu', String(nextState));
    } catch (e) {
      console.warn('localStorage设置失败:', e);
    }

    // 防抖处理弹幕数据操作
    danmuOperationTimeoutRef.current = setTimeout(async () => {
      try {
        if (artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
          const plugin = artPlayerRef.current.plugins.artplayerPluginDanmuku;

          if (nextState) {
            // 开启弹幕
            console.log('🚀 优化后开启外部弹幕...');
            const externalDanmu = await loadExternalDanmu();

            // 二次确认状态
            if (externalDanmuEnabledRef.current && artPlayerRef.current?.plugins?.artplayerPluginDanmuku) {
              plugin.load(externalDanmu);
              plugin.show();
              console.log('✅ 外部弹幕已优化加载:', externalDanmu.length, '条');

              if (artPlayerRef.current && externalDanmu.length > 0) {
                artPlayerRef.current.notice.show = `已加载 ${externalDanmu.length} 条弹幕`;
              }
            }
          } else {
            // 关闭弹幕
            console.log('🚫 优化后关闭外部弹幕');
            plugin.hide();
            console.log('✅ 外部弹幕已隐藏');
          }
        }
      } catch (error) {
        console.error('弹幕操作失败:', error);
      }
    }, 300); // 300ms 防抖
  };

  // ==================== 返回值 ====================

  return {
    // 状态
    externalDanmuEnabled,
    setExternalDanmuEnabled,

    // 方法
    loadExternalDanmu,
    handleDanmuOperationOptimized,

    // Refs
    externalDanmuEnabledRef,
    danmuLoadingRef,
    lastDanmuLoadKeyRef,
    danmuPluginStateRef,
  };
}
