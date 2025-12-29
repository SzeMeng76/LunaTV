'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  variant = 'warning',
}: ConfirmDialogProps) {
  // 阻止背景滚动
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // ESC键关闭
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
      button: 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white',
    },
    warning: {
      icon: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
      button: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 text-white',
    },
    info: {
      icon: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
      button: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white',
    },
  };

  const styles = variantStyles[variant];

  const dialogContent = (
    <div className='fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in'>
      {/* 背景遮罩 */}
      <div
        className='absolute inset-0 bg-black/50 backdrop-blur-sm'
        onClick={onCancel}
      />

      {/* 对话框 */}
      <div className='relative w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 animate-slide-up'>
        {/* 关闭按钮 */}
        <button
          onClick={onCancel}
          className='absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-100 dark:hover:bg-gray-700'
          aria-label='关闭'
        >
          <X className='w-5 h-5' />
        </button>

        {/* 标题 */}
        <div className='p-6 border-b border-gray-200 dark:border-gray-700'>
          <div className='flex items-center gap-3'>
            <div className={`p-2 rounded-full ${styles.icon}`}>
              <AlertTriangle className='w-6 h-6' />
            </div>
            <h2 className='text-xl font-bold text-gray-900 dark:text-white'>
              {title}
            </h2>
          </div>
        </div>

        {/* 内容 */}
        <div className='p-6'>
          <p className='text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed'>
            {message}
          </p>
        </div>

        {/* 按钮 */}
        <div className='p-6 pt-0 flex items-center gap-3'>
          <button
            onClick={onCancel}
            className='flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors'
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow-md ${styles.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  // 使用 Portal 渲染到 body
  return typeof document !== 'undefined'
    ? createPortal(dialogContent, document.body)
    : null;
}
