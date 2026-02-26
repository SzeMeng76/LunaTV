/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Check, Plus, X } from 'lucide-react';
import { memo, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface UserEmbyConfigProps {
  initialConfig: { sources: any[] };
  onClose?: () => void;
}

export const UserEmbyConfig = memo(({ initialConfig }: UserEmbyConfigProps) => {
  const queryClient = useQueryClient();
  const [sources, setSources] = useState(initialConfig.sources || []);
  const deferredSources = useDeferredValue(sources);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testingIndex, setTestingIndex] = useState<number | null>(null);

  useEffect(() => {
    setSources(initialConfig.sources || []);
  }, [initialConfig]);

  // Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Checkbox state only (text inputs use refs for performance)
  const [formChecks, setFormChecks] = useState({
    enabled: true,
    removeEmbyPrefix: false,
    appendMediaSourceId: false,
    transcodeMp4: false,
    proxyPlay: false,
  });

  // Uncontrolled text inputs
  const refKey = useRef<HTMLInputElement>(null);
  const refName = useRef<HTMLInputElement>(null);
  const refServerURL = useRef<HTMLInputElement>(null);
  const refApiKey = useRef<HTMLInputElement>(null);
  const refUsername = useRef<HTMLInputElement>(null);
  const refPassword = useRef<HTMLInputElement>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const clearRefs = () => {
    if (refKey.current) refKey.current.value = '';
    if (refName.current) refName.current.value = '';
    if (refServerURL.current) refServerURL.current.value = '';
    if (refApiKey.current) refApiKey.current.value = '';
    if (refUsername.current) refUsername.current.value = '';
    if (refPassword.current) refPassword.current.value = '';
  };

  const resetForm = () => {
    setFormChecks({ enabled: true, removeEmbyPrefix: false, appendMediaSourceId: false, transcodeMp4: false, proxyPlay: false });
    setEditingIndex(null);
    setShowAddForm(false);
    clearRefs();
  };

  const handleAdd = () => {
    resetForm();
    setShowAddForm(true);
  };

  const handleEdit = (index: number) => {
    const source = sources[index];
    setFormChecks({
      enabled: source.enabled ?? true,
      removeEmbyPrefix: source.removeEmbyPrefix ?? false,
      appendMediaSourceId: source.appendMediaSourceId ?? false,
      transcodeMp4: source.transcodeMp4 ?? false,
      proxyPlay: source.proxyPlay ?? false,
    });
    setEditingIndex(index);
    setShowAddForm(false);
    setTimeout(() => {
      if (refKey.current) refKey.current.value = source.key || '';
      if (refName.current) refName.current.value = source.name || '';
      if (refServerURL.current) refServerURL.current.value = source.ServerURL || '';
      if (refApiKey.current) refApiKey.current.value = source.ApiKey || '';
      if (refUsername.current) refUsername.current.value = source.Username || '';
      if (refPassword.current) refPassword.current.value = source.Password || '';
    }, 0);
  };

  const handleDelete = async (index: number) => {
    if (!confirm('确定要删除这个 Emby 源吗？')) return;
    const newSources = sources.filter((_, i) => i !== index);
    setSources(newSources);
    try {
      await fetch('/api/user/emby-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { sources: newSources } }),
      });
      showNotification('删除成功', 'success');
      queryClient.invalidateQueries({ queryKey: ['user', 'emby-config'] });
    } catch {
      showNotification('删除失败', 'error');
    }
  };

  const handleTest = async (index: number) => {
    const source = sources[index];
    setTestingIndex(index);
    try {
      const res = await fetch('/api/emby/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`连接成功！用户: ${data.user?.Name || '未知'}`, 'success');
      } else {
        showNotification(`连接失败: ${data.error}`, 'error');
      }
    } catch {
      showNotification('测试连接失败', 'error');
    } finally {
      setTestingIndex(null);
    }
  };

  const handleSave = async () => {
    const key = refKey.current?.value || '';
    const name = refName.current?.value || '';
    const ServerURL = refServerURL.current?.value || '';
    const ApiKey = refApiKey.current?.value || '';
    const Username = refUsername.current?.value || '';
    const Password = refPassword.current?.value || '';

    if (!key || !name || !ServerURL) {
      showNotification('请填写必填字段：标识符、名称、服务器地址', 'error');
      return;
    }
    if (editingIndex === null && sources.some(s => s.key === key)) {
      showNotification('标识符已存在，请使用其他标识符', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const completeFormData = { key, name, ServerURL, ApiKey, Username, Password, ...formChecks };
      const newSources = editingIndex !== null
        ? sources.map((s, i) => i === editingIndex ? completeFormData : s)
        : [...sources, completeFormData];

      const res = await fetch('/api/user/emby-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { sources: newSources } }),
      });
      const data = await res.json();
      if (data.success) {
        setSources(newSources);
        showNotification('保存成功！', 'success');
        queryClient.invalidateQueries({ queryKey: ['user', 'emby-config'] });
        resetForm();
      } else {
        showNotification(`保存失败: ${data.error}`, 'error');
      }
    } catch {
      showNotification('保存失败，请重试', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-4'>
      {/* 源列表 */}
      {deferredSources.length > 0 && !showAddForm && editingIndex === null && (
        <div className='space-y-3'>
          {deferredSources.map((source, index) => (
            <div key={source.key} className='p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50'>
              <div className='flex items-start justify-between'>
                <div className='flex-1'>
                  <div className='flex items-center gap-2'>
                    <h5 className='font-medium text-gray-900 dark:text-gray-100'>{source.name}</h5>
                    {source.enabled
                      ? <span className='px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded'>已启用</span>
                      : <span className='px-2 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded'>已禁用</span>
                    }
                  </div>
                  <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>{source.ServerURL}</p>
                  <p className='text-xs text-gray-500 dark:text-gray-500 mt-1'>标识符: {source.key}</p>
                </div>
                <div className='flex items-center gap-2'>
                  <button onClick={() => handleTest(index)} disabled={testingIndex === index}
                    className='px-3 py-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded transition-colors disabled:opacity-50'>
                    {testingIndex === index ? '测试中...' : '测试'}
                  </button>
                  <button onClick={() => handleEdit(index)}
                    className='px-3 py-1 text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded transition-colors'>
                    编辑
                  </button>
                  <button onClick={() => handleDelete(index)}
                    className='px-3 py-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded transition-colors'>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加按钮 */}
      {!showAddForm && editingIndex === null && (
        <button onClick={handleAdd}
          className='w-full px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center justify-center gap-2'>
          <Plus className='w-4 h-4' />
          添加 Emby 源
        </button>
      )}

      {/* 添加/编辑表单 */}
      {(showAddForm || editingIndex !== null) && (
        <div className='p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3 bg-white dark:bg-gray-800'>
          <div className='flex items-center justify-between mb-3'>
            <h5 className='font-medium text-gray-900 dark:text-gray-100'>
              {editingIndex !== null ? '编辑 Emby 源' : '添加 Emby 源'}
            </h5>
            <button onClick={resetForm} className='text-gray-500 hover:text-gray-700 dark:text-gray-400'>
              <X className='w-5 h-5' />
            </button>
          </div>

          <div>
            <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>标识符 *</label>
            <input ref={refKey} type='text' disabled={editingIndex !== null}
              className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50'
              placeholder='例如: wumei' />
          </div>

          <div>
            <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>名称 *</label>
            <input ref={refName} type='text'
              className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              placeholder='例如: 无名Emby' />
          </div>

          <div>
            <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>服务器地址 *</label>
            <input ref={refServerURL} type='text'
              className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              placeholder='http://192.168.1.100:8096' />
          </div>

          <div>
            <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>API Key</label>
            <input ref={refApiKey} type='text'
              className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              placeholder='推荐使用 API Key' />
          </div>

          <div className='grid grid-cols-2 gap-2'>
            <div>
              <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>用户名</label>
              <input ref={refUsername} type='text'
                className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100' />
            </div>
            <div>
              <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>密码</label>
              <input ref={refPassword} type='password'
                className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100' />
            </div>
          </div>

          <label className='flex items-center gap-2 text-sm'>
            <input type='checkbox' checked={formChecks.enabled}
              onChange={(e) => setFormChecks(prev => ({ ...prev, enabled: e.target.checked }))}
              className='w-4 h-4 text-green-500 border-gray-300 rounded focus:ring-green-500' />
            <span className='text-gray-700 dark:text-gray-300'>启用此源</span>
          </label>

          <details className='mt-2'>
            <summary className='text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200'>高级选项</summary>
            <div className='mt-2 space-y-2 pl-2 border-l-2 border-gray-200 dark:border-gray-700'>
              {[
                { key: 'transcodeMp4', label: '转码mp4（推荐MKV格式启用）' },
                { key: 'proxyPlay', label: '视频播放代理' },
                { key: 'removeEmbyPrefix', label: '移除/emby前缀' },
                { key: 'appendMediaSourceId', label: '拼接MediaSourceId参数' },
              ].map(({ key, label }) => (
                <label key={key} className='flex items-center gap-2 text-xs'>
                  <input type='checkbox' checked={formChecks[key as keyof typeof formChecks]}
                    onChange={(e) => setFormChecks(prev => ({ ...prev, [key]: e.target.checked }))}
                    className='w-3 h-3 text-blue-500 border-gray-300 rounded focus:ring-blue-500' />
                  <span className='text-gray-600 dark:text-gray-400'>{label}</span>
                </label>
              ))}
            </div>
          </details>

          <div className='flex gap-2 pt-2'>
            <button onClick={handleSave} disabled={isLoading}
              className='flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 rounded-lg transition-colors'>
              {isLoading ? '保存中...' : '保存'}
            </button>
            <button onClick={resetForm}
              className='px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors'>
              取消
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {showToast && (
        <div className='fixed top-20 left-1/2 -translate-x-1/2 z-[1100]'>
          <div className={`px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 ${toastType === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
            {toastType === 'success' ? <Check className='w-5 h-5' /> : <X className='w-5 h-5' />}
            <span className='font-medium'>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
});
