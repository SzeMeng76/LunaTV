/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface EmbyConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const EmbyConfig = ({ config, refreshConfig }: EmbyConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [editingSource, setEditingSource] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // 表单状态
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    enabled: true,
    ServerURL: '',
    ApiKey: '',
    Username: '',
    Password: '',
    UserId: '',
    removeEmbyPrefix: false,
    appendMediaSourceId: false,
    transcodeMp4: false,
    proxyPlay: false,
  });

  // 从配置加载源列表
  useEffect(() => {
    if (config?.EmbyConfig?.Sources) {
      setSources(config.EmbyConfig.Sources);
    }
  }, [config]);

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 重置表单
  const resetForm = () => {
    setFormData({
      key: '',
      name: '',
      enabled: true,
      ServerURL: '',
      ApiKey: '',
      Username: '',
      Password: '',
      UserId: '',
      removeEmbyPrefix: false,
      appendMediaSourceId: false,
      transcodeMp4: false,
      proxyPlay: false,
    });
    setEditingSource(null);
    setShowAddForm(false);
  };

  // 开始编辑
  const handleEdit = (source: any) => {
    setFormData({ ...source });
    setEditingSource(source);
    setShowAddForm(false);
  };

  // 开始添加
  const handleAdd = () => {
    resetForm();
    setShowAddForm(true);
  };

  // 保存源
  const handleSave = async () => {
    if (!formData.key || !formData.name || !formData.ServerURL) {
      showMessage('error', '请填写必填字段：标识符、名称、服务器地址');
      return;
    }

    if (!editingSource && sources.some(s => s.key === formData.key)) {
      showMessage('error', '标识符已存在，请使用其他标识符');
      return;
    }

    setIsLoading(true);
    try {
      // 如果没有 UserId，先测试连接获取 UserId
      let dataToSave = { ...formData };
      if (!dataToSave.UserId) {
        const testResponse = await fetch('/api/admin/emby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'test',
            ServerURL: formData.ServerURL,
            ApiKey: formData.ApiKey,
            Username: formData.Username,
            Password: formData.Password,
          }),
        });

        const testResult = await testResponse.json();
        if (!testResult.success) {
          showMessage('error', '连接测试失败，请检查配置: ' + (testResult.message || ''));
          setIsLoading(false);
          return;
        }

        if (testResult.userId) {
          dataToSave.UserId = testResult.userId;
        }
      }

      let newSources;
      if (editingSource) {
        newSources = sources.map(s =>
          s.key === editingSource.key ? dataToSave : s
        );
      } else {
        newSources = [...sources, dataToSave];
      }

      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          EmbyConfig: { Sources: newSources },
        }),
      });

      if (!response.ok) throw new Error('保存失败');

      await refreshConfig();
      resetForm();
      showMessage('success', editingSource ? '更新成功' : '添加成功');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 删除源
  const handleDelete = async (source: any) => {
    if (!confirm(`确定要删除 "${source.name}" 吗？`)) return;

    setIsLoading(true);
    try {
      const newSources = sources.filter(s => s.key !== source.key);

      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          EmbyConfig: { Sources: newSources },
        }),
      });

      if (!response.ok) throw new Error('删除失败');

      await refreshConfig();
      showMessage('success', '删除成功');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 切换启用状态
  const handleToggleEnabled = async (source: any) => {
    setIsLoading(true);
    try {
      const newSources = sources.map(s =>
        s.key === source.key ? { ...s, enabled: !s.enabled } : s
      );

      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          EmbyConfig: { Sources: newSources },
        }),
      });

      if (!response.ok) throw new Error('更新失败');

      await refreshConfig();
      showMessage('success', source.enabled ? '已禁用' : '已启用');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : '更新失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 测试连接
  const handleTest = async (source: any) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/emby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          ServerURL: source.ServerURL,
          ApiKey: source.ApiKey,
          Username: source.Username,
          Password: source.Password,
        }),
      });

      const result = await response.json();
      if (result.success) {
        // 如果测试成功且返回了 userId，更新 formData
        if (result.userId && editingSource && editingSource.key === source.key) {
          setFormData(prev => ({ ...prev, UserId: result.userId }));
        }
        showMessage('success', result.message || 'Emby 连接测试成功');
      } else {
        showMessage('error', result.message || 'Emby 连接测试失败');
      }
    } catch (err) {
      showMessage('error', '连接测试失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {/* 消息提示 */}
      {message && (
        <div className={`flex items-center space-x-2 p-3 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          <span>{message.text}</span>
        </div>
      )}

      {/* 源列表 */}
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100'>
            Emby 源列表 ({sources.length})
          </h3>
          <button
            onClick={handleAdd}
            disabled={isLoading || showAddForm}
            className='px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-1'
          >
            <Plus className='h-4 w-4' />
            <span>添加新源</span>
          </button>
        </div>

        {sources.length === 0 ? (
          <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
            暂无Emby源，点击"添加新源"开始配置
          </div>
        ) : (
          sources.map((source) => (
            <div
              key={source.key}
              className='border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800'
            >
              <div className='flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3'>
                <div className='flex-1'>
                  <div className='flex items-center gap-3 flex-wrap'>
                    <h4 className='text-base font-medium text-gray-900 dark:text-gray-100'>
                      {source.name}
                    </h4>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded ${
                        source.enabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {source.enabled ? '已启用' : '已禁用'}
                    </span>
                  </div>
                  <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
                    标识符: {source.key}
                  </p>
                  <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
                    服务器: {source.ServerURL}
                  </p>
                </div>
                <div className='flex gap-2 flex-wrap sm:flex-nowrap'>
                  <button
                    onClick={() => handleToggleEnabled(source)}
                    disabled={isLoading}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
                      source.enabled
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {source.enabled ? '禁用' : '启用'}
                  </button>
                  <button
                    onClick={() => handleTest(source)}
                    disabled={isLoading}
                    className='px-2 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50'
                  >
                    测试
                  </button>
                  <button
                    onClick={() => handleEdit(source)}
                    className='px-2 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors'
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(source)}
                    disabled={isLoading}
                    className='px-2 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50'
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 添加/编辑表单 */}
      {(showAddForm || editingSource) && (
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-gray-50 dark:bg-gray-800/50'>
          <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100 mb-4'>
            {editingSource ? '编辑 Emby 源' : '添加新的 Emby 源'}
          </h3>

          <div className='space-y-4'>
            {/* 标识符 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                标识符 *
              </label>
              <input
                type='text'
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                disabled={!!editingSource}
                placeholder='home, office, etc.'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-700'
              />
              <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                唯一标识符，只能包含字母、数字、下划线，创建后不可修改
              </p>
            </div>

            {/* 名称 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                显示名称 *
              </label>
              <input
                type='text'
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder='家庭Emby, 公司Emby, etc.'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              />
            </div>

            {/* 服务器地址 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                Emby 服务器地址 *
              </label>
              <input
                type='text'
                value={formData.ServerURL}
                onChange={(e) => setFormData({ ...formData, ServerURL: e.target.value })}
                placeholder='https://emby.example.com/emby'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              />
              <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                如果是反代，请包含完整路径，例如: https://emby.example.com/emby
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                API Key（推荐）
              </label>
              <input
                type='password'
                value={formData.ApiKey}
                onChange={(e) => setFormData({ ...formData, ApiKey: e.target.value })}
                placeholder='在 Emby 设置中生成'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              />
            </div>

            {/* 用户名密码 */}
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  用户名
                </label>
                <input
                  type='text'
                  value={formData.Username}
                  onChange={(e) => setFormData({ ...formData, Username: e.target.value })}
                  placeholder='可选'
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                />
              </div>
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  密码
                </label>
                <input
                  type='password'
                  value={formData.Password}
                  onChange={(e) => setFormData({ ...formData, Password: e.target.value })}
                  placeholder='可选'
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                />
              </div>
            </div>

            {/* 高级选项 */}
            <div className='space-y-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
              <h4 className='text-sm font-medium text-gray-900 dark:text-white mb-3'>
                高级选项
              </h4>

              {/* 选项1: 移除Emby前缀 */}
              <div className='flex items-center justify-between'>
                <div className='flex-1'>
                  <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    播放链接移除/emby前缀
                  </label>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    启用后将从播放链接中移除 /emby 前缀
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() => setFormData({ ...formData, removeEmbyPrefix: !formData.removeEmbyPrefix })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.removeEmbyPrefix ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.removeEmbyPrefix ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* 选项2: 拼接MediaSourceId参数 */}
              <div className='flex items-center justify-between'>
                <div className='flex-1'>
                  <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    拼接MediaSourceId参数
                  </label>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    启用后将调用 PlaybackInfo API 获取 MediaSourceId 并添加到播放链接
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() => setFormData({ ...formData, appendMediaSourceId: !formData.appendMediaSourceId })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.appendMediaSourceId ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.appendMediaSourceId ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* 选项3: 转码mp4 */}
              <div className='flex items-center justify-between'>
                <div className='flex-1'>
                  <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    转码mp4
                  </label>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    启用后将使用 stream.mp4 格式并移除 Static 参数
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() => setFormData({ ...formData, transcodeMp4: !formData.transcodeMp4 })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.transcodeMp4 ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.transcodeMp4 ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* 选项4: 视频播放代理 */}
              <div className='flex items-center justify-between'>
                <div className='flex-1'>
                  <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    视频播放代理
                  </label>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    启用后视频播放将通过服务器代理
                  </p>
                </div>
                <button
                  type='button'
                  onClick={() => setFormData({ ...formData, proxyPlay: !formData.proxyPlay })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.proxyPlay ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.proxyPlay ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 启用开关 */}
            <div className='flex items-center space-x-2'>
              <input
                type='checkbox'
                id='enabled'
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className='w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-600'
              />
              <label htmlFor='enabled' className='text-sm text-gray-700 dark:text-gray-300'>
                启用此源
              </label>
            </div>

            {/* 操作按钮 */}
            <div className='flex justify-end space-x-2 pt-4'>
              <button
                onClick={resetForm}
                disabled={isLoading}
                className='px-4 py-2 text-sm font-medium bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50'
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className='px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50'
              >
                {isLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmbyConfig;
