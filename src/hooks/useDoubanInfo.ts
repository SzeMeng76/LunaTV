/* eslint-disable no-console */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { getDoubanComments, getDoubanDetails } from '@/lib/douban.client';
import type { DoubanComment } from '@/lib/types';

// ============================================================================
// Types
// ============================================================================

/** 演员/导演信息 */
export interface DoubanCelebrity {
  id: string;
  name: string;
  avatar: string;
  role: string;
  avatars?: {
    small: string;
    medium: string;
    large: string;
  };
}

/** 推荐影片 */
export interface DoubanRecommendation {
  id: string;
  title: string;
  poster: string;
  rate: string;
}

/** 电影详情 */
export interface DoubanMovieDetail {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
  directors?: string[];
  screenwriters?: string[];
  cast?: string[];
  genres?: string[];
  countries?: string[];
  languages?: string[];
  episodes?: number;
  episode_length?: number;
  movie_duration?: number;
  first_aired?: string;
  plot_summary?: string;
  celebrities?: DoubanCelebrity[];
  recommendations?: DoubanRecommendation[];
  actors?: DoubanCelebrity[]; // 演员列表（从 celebrities 提取）
}

/** Hook 返回类型 */
export interface UseDoubanInfoResult {
  // 详情数据
  detail: DoubanMovieDetail | null;
  detailLoading: boolean;
  detailError: Error | null;

  // 评论数据
  comments: DoubanComment[];
  commentsLoading: boolean;
  commentsError: Error | null;
  commentsTotal: number;

  // 刷新函数
  refreshDetail: () => Promise<void>;
  refreshComments: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * 豆瓣信息 Hook
 * 用于并行获取电影详情和评论数据
 *
 * @param doubanId - 豆瓣电影 ID
 * @param options - 配置选项
 */
export function useDoubanInfo(
  doubanId: string | number | null | undefined,
  options: {
    /** 是否自动获取详情，默认 true */
    fetchDetail?: boolean;
    /** 是否自动获取评论，默认 true */
    fetchComments?: boolean;
    /** 评论数量，默认 6 */
    commentsCount?: number;
    /** 评论排序方式，默认 new_score */
    commentsSort?: 'new_score' | 'time';
  } = {},
): UseDoubanInfoResult {
  const {
    fetchDetail: shouldFetchDetail = true,
    fetchComments: shouldFetchComments = true,
    commentsCount = 6,
    commentsSort = 'new_score',
  } = options;

  // 详情状态
  const [detail, setDetail] = useState<DoubanMovieDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<Error | null>(null);

  // 评论状态
  const [comments, setComments] = useState<DoubanComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<Error | null>(null);
  const [commentsTotal, setCommentsTotal] = useState(0);

  // 获取详情
  const refreshDetail = useCallback(async () => {
    if (!doubanId) return;

    setDetailLoading(true);
    setDetailError(null);

    try {
      const result = await getDoubanDetails(String(doubanId));

      if (result.code === 200 && result.data) {
        setDetail(result.data as DoubanMovieDetail);
      } else {
        throw new Error(result.message || '获取详情失败');
      }
    } catch (error) {
      console.error('[useDoubanInfo] Failed to fetch detail:', error);
      setDetailError(error instanceof Error ? error : new Error('未知错误'));
    } finally {
      setDetailLoading(false);
    }
  }, [doubanId]);

  // 获取评论
  const refreshComments = useCallback(async () => {
    if (!doubanId) return;

    setCommentsLoading(true);
    setCommentsError(null);

    try {
      const result = await getDoubanComments({
        id: String(doubanId),
        start: 0,
        limit: commentsCount,
        sort: commentsSort,
      });

      if (result.code === 200 && result.data) {
        setComments(result.data.comments || []);
        setCommentsTotal(result.data.count || 0);
      } else {
        throw new Error(result.message || '获取评论失败');
      }
    } catch (error) {
      console.error('[useDoubanInfo] Failed to fetch comments:', error);
      setCommentsError(error instanceof Error ? error : new Error('未知错误'));
    } finally {
      setCommentsLoading(false);
    }
  }, [doubanId, commentsCount, commentsSort]);

  // 初始化加载
  useEffect(() => {
    if (!doubanId) {
      // 重置状态
      setDetail(null);
      setComments([]);
      setCommentsTotal(0);
      return;
    }

    // 并行请求
    const promises: Promise<void>[] = [];

    if (shouldFetchDetail) {
      promises.push(refreshDetail());
    }

    if (shouldFetchComments) {
      promises.push(refreshComments());
    }

    Promise.allSettled(promises);
  }, [
    doubanId,
    shouldFetchDetail,
    shouldFetchComments,
    refreshDetail,
    refreshComments,
  ]);

  return {
    detail,
    detailLoading,
    detailError,
    comments,
    commentsLoading,
    commentsError,
    commentsTotal,
    refreshDetail,
    refreshComments,
  };
}

export default useDoubanInfo;
