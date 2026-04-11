/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Check, Globe, Plus, X } from 'lucide-react';
import { memo, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';

interface UserEmbyConfigProps {
  initialConfig: { sources: any[] };
  onClose?: () => void;
}

// Query Options 工厂函数
const publicSourcesOptions = () => queryOptions({
  queryKey: ['emby', 'public-sources'],
  queryFn: async () => {
    const res = await fetch('/api/emby/public-sources');
    if (!res.ok) return { sources: [] };
    return res.json();
  },
  staleTime: 5 * 60 * 1000,
});

export const UserEmbyConfig = memo(({ initialConfig }: UserEmbyConfigProps) => {
  const queryClient = useQueryClient();
  const [sources, setSources] = useState(initialConfig.sources || []);
  const deferredSources = useDeferredValue(sources);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testingIndex, setTestingIndex] = useState<number | null>(null);
  const [authMode, setAuthMode] = useState<'apikey' | 'password'>('apikey');

  // Fetch public sources from admin
  const { data: publicSourcesData } = useQuery(publicSourcesOptions());
  const publicSources: any[] = publicSourcesData?.sources || [];

  useEffect(() => {
    setSources(initialConfig.sources || []);
  }, [initialConfig]);

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
  const refUserId = useRef<HTMLInputElement>(null);

  const clearRefs = () => {
    if (refKey.current) refKey.current.value = '';
    if (refName.current) refName.current.value = '';
    if (refServerURL.current) refServerURL.current.value = '';
    if (refApiKey.current) refApiKey.current.value = '';
    if (refUsername.current) refUsername.current.value = '';
    if (refPassword.current) refPassword.current.value = '';
    if (refUserId.current) refUserId.current.value = '';
  };

  const resetForm = () => {
    setFormChecks({ enabled: true, removeEmbyPrefix: false, appendMediaSourceId: false, transcodeMp4: false, proxyPlay: false });
    setEditingIndex(null);
    setShowAddForm(false);
    setAuthMode('apikey');
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
    if (source.ApiKey) {
      setAuthMode('apikey');
    } else if (source.Username) {
      setAuthMode('password');
    } else {
      setAuthMode('apikey');
    }
    setEditingIndex(index);
    setShowAddForm(false);
    setTimeout(() => {
      if (refKey.current) refKey.current.value = source.key || '';
      if (refName.current) refName.current.value = source.name || '';
      if (refServerURL.current) refServerURL.current.value = source.ServerURL || '';
      if (refApiKey.current) refApiKey.current.value = source.ApiKey || '';
      if (refUsername.current) refUsername.current.value = source.Username || '';
      if (refPassword.current) refPassword.current.value = source.Password || '';
      if (refUserId.current) refUserId.current.value = source.UserId || '';
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
      toast.success('删除成功');
      queryClient.invalidateQueries({ queryKey: ['user', 'emby-config'] });
    } catch {
      toast.error('删除失败');
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
        toast.success(`连接成功！用户: ${data.user?.Name || '未知'}`);
      } else {
        toast.error(`连接失败: ${data.error}`);
      }
    } catch {
      toast.error('测试连接失败');
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
    const UserId = refUserId.current?.value || '';

    if (!key || !name || !ServerURL) {
      toast.error('请填写必填字段：标识符、名称、服务器地址');
      return;
    }
    // 根据认证方式验证
    if (authMode === 'apikey' && !ApiKey) {
      toast.error('使用密钥认证时，API Key 为必填项');
      return;
    }
    if (authMode === 'password' && !Username) {
      toast.error('使用账号认证时，用户名为必填项');
      return;
    }
    if (editingIndex === null && sources.some(s => s.key === key)) {
      toast.error('标识符已存在，请使用其他标识符');
      return;
    }

    setIsLoading(true);
    try {
      const completeFormData = { key, name, ServerURL, ApiKey, Username, Password, UserId, ...formChecks };
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
        toast.success('保存成功！');
        queryClient.invalidateQueries({ queryKey: ['user', 'emby-config'] });
        resetForm();
      } else {
        toast.error(`保存失败: ${data.error}`);
      }
    } catch {
      toast.error('保存失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-4'>
      {/* 公共源（只读） */}
      {publicSources.length > 0 && !showAddForm && editingIndex === null && (
        <div className='space-y-2'>
          <div className='flex items-center gap-2 text-xs font-medium text-purple-700 dark:text-purple-400 uppercase tracking-wide'>
            <Globe className='w-3.5 h-3.5' />
            <span>公共源</span>
            <span className='text-purple-400 dark:text-purple-600 normal-case font-normal'>由管理员提供，自动可用</span>
          </div>
          {publicSources.map((source) => (
            <div key={source.key} className='p-3 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/50 dark:bg-purple-900/10'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <h5 className='text-sm font-medium text-gray-900 dark:text-gray-100'>{source.name}</h5>
                  <span className='px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 rounded'>公共</span>
                </div>
                <span className='text-xs text-gray-400 dark:text-gray-500'>只读</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分隔线（只在两区块都有内容时显示） */}
      {publicSources.length > 0 && deferredSources.length > 0 && !showAddForm && editingIndex === null && (
        <div className='border-t border-gray-200 dark:border-gray-700' />
      )}

      {/* 私人源列表 */}
      {deferredSources.length > 0 && !showAddForm && editingIndex === null && (
        <div className='space-y-3'>
          {publicSources.length > 0 && (
            <div className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide'>私人源</div>
          )}
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

          {/* 认证方式切换 */}
          <div>
            <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>认证方式 *</label>
            <div className='flex gap-2'>
              <button
                type='button'
                onClick={() => {
                  setAuthMode('apikey');
                  if (refUsername.current) refUsername.current.value = '';
                  if (refPassword.current) refPassword.current.value = '';
                }}
                className={`flex-1 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  authMode === 'apikey'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                密钥认证
              </button>
              <button
                type='button'
                onClick={() => {
                  setAuthMode('password');
                  if (refApiKey.current) refApiKey.current.value = '';
                }}
                className={`flex-1 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  authMode === 'password'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                账号认证
              </button>
            </div>
          </div>

          {/* 密钥认证 */}
          {authMode === 'apikey' && (
            <>
              <div>
                <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>API Key *</label>
                <input ref={refApiKey} type='text'
                  className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  placeholder='在 Emby 控制台的 API 密钥页面生成' />
              </div>
              <div>
                <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>用户 ID（可选）</label>
                <input ref={refUserId} type='text'
                  className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  placeholder='留空则自动获取' />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  不填则自动获取；如需指定其他用户可手动填写
                </p>
              </div>
            </>
          )}

          {/* 账号认证 */}
          {authMode === 'password' && (
            <div className='grid grid-cols-2 gap-2'>
              <div>
                <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>用户名 *</label>
                <input ref={refUsername} type='text'
                  className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100' />
              </div>
              <div>
                <label className='block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'>密码（可选）</label>
                <input ref={refPassword} type='password'
                  className='w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  placeholder='没有密码可留空' />
              </div>
            </div>
          )}

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
    </div>
  );
});
