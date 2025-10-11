/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Copy, Key, Settings, X } from 'lucide-react';
import { useState } from 'react';

interface TVBoxTokenManagerProps {
  username: string;
  tvboxToken?: string;
  tvboxEnabledSources?: string[];
  allSources: Array<{ key: string; name: string }>;
  onUpdate: () => void;
}

export function TVBoxTokenCell({ tvboxToken }: { tvboxToken?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (tvboxToken) {
      await navigator.clipboard.writeText(tvboxToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!tvboxToken) {
    return (
      <span className='text-xs text-gray-400 dark:text-gray-500'>
        未设置
      </span>
    );
  }

  return (
    <div className='flex items-center space-x-2'>
      <span className='text-xs font-mono text-gray-600 dark:text-gray-400'>
        {tvboxToken.substring(0, 8)}...
      </span>
      <button
        onClick={handleCopy}
        className='p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded'
        title='复制完整Token'
      >
        <Copy className={`w-3 h-3 ${copied ? 'text-green-600' : 'text-gray-400'}`} />
      </button>
    </div>
  );
}

export function TVBoxTokenModal({
  username,
  tvboxToken,
  tvboxEnabledSources = [],
  allSources,
  onClose,
  onUpdate,
}: TVBoxTokenManagerProps & { onClose: () => void }) {
  const [selectedSources, setSelectedSources] = useState<string[]>(tvboxEnabledSources);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (regenerate = false) => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/user-tvbox-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          tvboxEnabledSources: selectedSources,
          regenerateToken: regenerate,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '保存失败');
      }

      setMessage({ type: 'success', text: regenerate ? 'Token已重新生成' : '配置已保存' });
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 1500);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '保存失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除用户 ${username} 的 TVBox Token 吗？`)) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/user-tvbox-token?username=${encodeURIComponent(username)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '删除失败');
      }

      setMessage({ type: 'success', text: 'Token已删除' });
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 1500);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '删除失败' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSource = (sourceKey: string) => {
    setSelectedSources((prev) =>
      prev.includes(sourceKey)
        ? prev.filter((k) => k !== sourceKey)
        : [...prev, sourceKey]
    );
  };

  const toggleAll = () => {
    setSelectedSources(selectedSources.length === allSources.length ? [] : allSources.map((s) => s.key));
  };

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'>
      <div className='bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col'>
        {/* 头部 */}
        <div className='flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700'>
          <div className='flex items-center space-x-3'>
            <Key className='w-5 h-5 text-blue-600' />
            <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
              TVBox Token 管理 - {username}
            </h3>
          </div>
          <button
            onClick={onClose}
            className='p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* 内容 */}
        <div className='flex-1 overflow-y-auto p-6 space-y-6'>
          {/* 消息提示 */}
          {message && (
            <div
              className={`p-3 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Token 状态 */}
          <div className='space-y-2'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
              当前Token
            </label>
            {tvboxToken ? (
              <div className='p-3 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono text-sm text-gray-900 dark:text-gray-100 break-all'>
                {tvboxToken}
              </div>
            ) : (
              <div className='p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 rounded-lg text-sm'>
                该用户尚未设置 TVBox Token
              </div>
            )}
          </div>

          {/* 源权限设置 */}
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
                可访问的源 ({selectedSources.length}/{allSources.length})
              </label>
              <button
                onClick={toggleAll}
                className='text-xs text-blue-600 hover:text-blue-700'
              >
                {selectedSources.length === allSources.length ? '取消全选' : '全选'}
              </button>
            </div>
            <div className='text-xs text-gray-500 dark:text-gray-400'>
              留空表示可以访问所有源
            </div>
            <div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-60 overflow-y-auto'>
              {allSources.map((source) => (
                <label
                  key={source.key}
                  className='flex items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0'
                >
                  <input
                    type='checkbox'
                    checked={selectedSources.includes(source.key)}
                    onChange={() => toggleSource(source.key)}
                    className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                  />
                  <span className='ml-3 text-sm text-gray-900 dark:text-gray-100'>
                    {source.name} ({source.key})
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* 底部操作按钮 */}
        <div className='flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700'>
          <div className='space-x-2'>
            {tvboxToken && (
              <button
                onClick={handleDelete}
                disabled={isSaving}
                className='px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50'
              >
                删除Token
              </button>
            )}
          </div>
          <div className='flex items-center space-x-2'>
            <button
              onClick={onClose}
              disabled={isSaving}
              className='px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50'
            >
              取消
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className='px-4 py-2 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-lg disabled:opacity-50 flex items-center space-x-1'
            >
              <Settings className='w-4 h-4' />
              <span>{tvboxToken ? '重新生成' : '生成Token'}</span>
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className='px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50'
            >
              {isSaving ? '保存中...' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
