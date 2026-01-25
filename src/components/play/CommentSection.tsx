/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { memo } from 'react';
import CommentItem from './CommentItem';

interface CommentSectionProps {
  comments: any[];
  loading: boolean;
  error: string | null;
  videoDoubanId?: string | number;
}

/**
 * 评论区组件 - 独立拆分以优化性能
 * 使用 React.memo 防止不必要的重新渲染
 */
const CommentSection = memo(function CommentSection({
  comments,
  loading,
  error,
  videoDoubanId,
}: CommentSectionProps) {
  // 如果正在加载、有错误或没有评论，不显示
  if (loading || error || !comments || comments.length === 0) {
    return null;
  }

  return (
    <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
      <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
        <span>💬</span>
        <span>豆瓣短评</span>
      </h3>
      <div className='space-y-4'>
        {comments.slice(0, 10).map((comment: any, index: number) => (
          <CommentItem key={index} comment={comment} />
        ))}
      </div>

      {/* 查看更多链接 */}
      {videoDoubanId && (
        <div className='mt-4 text-center'>
          <a
            href={`https://movie.douban.com/subject/${videoDoubanId}/comments?status=P`}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline'
          >
            查看更多短评
            <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14' />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
});

export default CommentSection;
