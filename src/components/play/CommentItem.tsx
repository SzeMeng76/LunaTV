/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { memo } from 'react';

interface CommentItemProps {
  comment: any;
}

/**
 * 单个评论项组件 - 进一步拆分以优化性能
 */
const CommentItem = memo(function CommentItem({ comment }: CommentItemProps) {
  return (
    <div className='bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'>
      <div className='flex items-start gap-3'>
        {/* 用户头像 */}
        <div className='shrink-0'>
          {comment.avatar ? (
            <img
              src={comment.avatar}
              alt={comment.username}
              className='w-10 h-10 rounded-full object-cover'
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className='w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-400'>
              {comment.username.charAt(0)}
            </div>
          )}
        </div>

        {/* 短评内容 */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-1 flex-wrap'>
            <span className='font-medium text-gray-800 dark:text-gray-200'>
              {comment.username}
            </span>

            {/* 评分星级 */}
            {comment.rating > 0 && (
              <div className='flex items-center'>
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    className={`w-3 h-3 ${
                      i < comment.rating
                        ? 'text-yellow-400'
                        : 'text-gray-300 dark:text-gray-600'
                    }`}
                    fill='currentColor'
                    viewBox='0 0 20 20'
                  >
                    <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                  </svg>
                ))}
              </div>
            )}

            {/* 时间和地点 */}
            <span className='text-xs text-gray-500 dark:text-gray-400'>
              {comment.time}
              {comment.location && ` · ${comment.location}`}
            </span>
          </div>

          {/* 短评正文 */}
          <p className='text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap'>
            {comment.content}
          </p>

          {/* 有用数 */}
          {comment.useful_count > 0 && (
            <div className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
              {comment.useful_count} 人认为有用
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default CommentItem;
