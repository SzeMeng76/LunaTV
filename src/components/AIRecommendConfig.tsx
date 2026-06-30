/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface AIRecommendConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const AIRecommendConfig = ({ config, refreshConfig }: AIRecommendConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [aiSettings, setAiSettings] = useState({
    enabled: false,
    apiUrl: '',  // 🔥 不给默认值
    apiKey: '',
    model: '',  // 🔥 不给默认值
    temperature: 0.7,
    maxTokens: 3000,
    enableOrchestrator: false,
    enableWebSearch: false,
    tavilyApiKeys: [] as string[]
  });

  // Tavily API Keys 原始输入（逗号分隔的字符串）
  const [tavilyKeysInput, setTavilyKeysInput] = useState('');

  // Tavily API 用量状态
  const [tavilyUsage, setTavilyUsage] = useState<{
    loading: boolean;
    data: Array<{
      key: string;
      fullKey: string;
      index: number;
      keyUsage: number;
      keyLimit: number;
      planUsage: number;
      planLimit: number;
      currentPlan: string;
      error?: string;
      wafBlocked?: boolean;
    }> | null;
    lastUpdated: string | null;
  }>({
    loading: false,
    data: null,
    lastUpdated: null
  });

  // 常用模型参考（建议使用支持联网搜索的模型）
  const MODEL_EXAMPLES = [
    'gpt-5 (OpenAI)',
    'o3-mini (OpenAI)',
    'claude-4-opus (Anthropic)',
    'claude-4-sonnet (Anthropic)', 
    'gemini-2.5-flash (Google)',
    'gemini-2.5-pro (Google)',
    'deepseek-reasoner (DeepSeek)',
    'deepseek-chat (DeepSeek)',
    'deepseek-coder (DeepSeek)',
    'qwen3-max (阿里云)',
    'glm-4-plus (智谱AI)',
    'llama-4 (Meta)',
    'grok-4 (xAI)'
  ];

  // 从config加载设置
  useEffect(() => {
    if (config?.AIRecommendConfig) {
      const keys = config.AIRecommendConfig.tavilyApiKeys || [];
      setAiSettings({
        enabled: config.AIRecommendConfig.enabled ?? false,
        apiUrl: config.AIRecommendConfig.apiUrl || '',  // 🔥 不给默认值，保持空字符串
        apiKey: config.AIRecommendConfig.apiKey || '',
        model: config.AIRecommendConfig.model || '',  // 🔥 不给默认值，保持空字符串
        temperature: config.AIRecommendConfig.temperature ?? 0.7,
        maxTokens: config.AIRecommendConfig.maxTokens ?? 3000,
        enableOrchestrator: config.AIRecommendConfig.enableOrchestrator ?? false,
        enableWebSearch: config.AIRecommendConfig.enableWebSearch ?? false,
        tavilyApiKeys: keys
      });
      // 设置输入框的显示值
      setTavilyKeysInput(keys.join(', '));
    }
  }, [config]);

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 保存AI推荐配置
  const handleSave = async () => {
    // 先分割Tavily Keys输入
    const keys = tavilyKeysInput
      .split(/[,\n]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const settingsToSave = {
      ...aiSettings,
      tavilyApiKeys: keys
    };

    // 基本验证
    if (settingsToSave.enabled) {
      // 🔥 检查是否至少配置了一种模式
      const hasAIModel = !!(settingsToSave.apiUrl.trim() && settingsToSave.apiKey.trim() && settingsToSave.model.trim());
      const hasTavilySearch = !!(settingsToSave.enableOrchestrator && settingsToSave.enableWebSearch && keys.length > 0);

      if (!hasAIModel && !hasTavilySearch) {
        showMessage('error', '请至少配置一种模式：\n1. AI模型（API地址+密钥+模型）\n2. Tavily搜索（启用智能协调器+联网搜索+Tavily Key）');
        return;
      }

      // 如果配置了AI模型，验证参数
      if (hasAIModel) {
        if (settingsToSave.temperature < 0 || settingsToSave.temperature > 2) {
          showMessage('error', '温度参数应在0-2之间');
          return;
        }
        if (settingsToSave.maxTokens < 1 || settingsToSave.maxTokens > 150000) {
          showMessage('error', '最大Token数应在1-150000之间（GPT-5支持128k，推理模型建议2000+）');
          return;
        }
      }

      // 如果启用了联网搜索，验证Tavily API Keys
      if (settingsToSave.enableOrchestrator && settingsToSave.enableWebSearch && keys.length === 0) {
        showMessage('error', '启用联网搜索需要至少配置一个Tavily API Key');
        return;
      }
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      showMessage('success', 'AI推荐配置保存成功');
      setHasUnsavedChanges(false);
      await refreshConfig();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 测试API连接
  const handleTest = async () => {
    if (!aiSettings.apiUrl.trim() || !aiSettings.apiKey.trim()) {
      showMessage('error', '请先填写API地址和密钥');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/ai-recommend/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: aiSettings.apiUrl,
          apiKey: aiSettings.apiKey,
          model: aiSettings.model
        })
      });

      if (!response.ok) {
        let errorMessage = 'API连接测试失败';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      showMessage('success', 'API连接测试成功！');
    } catch (err) {
      console.error('测试连接错误:', err);
      let errorMessage = 'API连接测试失败';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        // 处理对象错误，避免显示 [object Object]
        if ('message' in err) {
          errorMessage = String(err.message);
        } else {
          errorMessage = 'API连接失败，请检查网络或API配置';
        }
      }
      showMessage('error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 获取 Tavily API 用量
  const fetchTavilyUsage = async (singleKeyIndex?: number) => {
    // 先保存输入到 state（如果用户刚输入还没失焦）
    const keys = tavilyKeysInput
      .split(/[,\n]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0);

    setAiSettings(prev => ({ ...prev, tavilyApiKeys: keys }));

    let keysToCheck: string[];

    if (singleKeyIndex !== undefined) {
      // 查询单个 Key
      keysToCheck = [keys[singleKeyIndex]];
    } else {
      // 查询所有 Key
      keysToCheck = keys.filter(k => k.trim().length > 0);
    }

    if (keysToCheck.length === 0) {
      showMessage('error', '没有可用的 Tavily API Key');
      return;
    }

    setTavilyUsage(prev => ({ ...prev, loading: true }));

    try {
      // 通过后端 API 代理查询，避免浏览器 CORS 和 WAF 问题
      const response = await fetch('/api/admin/ai-recommend/usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKeys: keysToCheck })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '查询失败');
      }

      const { results } = await response.json();

      // 将结果映射回正确的索引
      const mappedResults = results.map((result: any, idx: number) => ({
        ...result,
        index: singleKeyIndex !== undefined ? singleKeyIndex : idx
      }));

      if (singleKeyIndex !== undefined) {
        // 单个查询：更新或添加该 Key 的数据
        setTavilyUsage(prev => {
          const existingData = prev.data || [];
          const newData = [...existingData];
          const existingIndex = newData.findIndex(d => d.index === singleKeyIndex);

          if (existingIndex >= 0) {
            newData[existingIndex] = mappedResults[0];
          } else {
            newData.push(mappedResults[0]);
          }

          return {
            loading: false,
            data: newData.sort((a, b) => a.index - b.index),
            lastUpdated: new Date().toLocaleString('zh-CN')
          };
        });
        showMessage('success', '✅ 统计数据已更新！请点击下方"保存配置"按钮保存Key到配置文件');
      } else {
        // 全部查询：替换所有数据
        setTavilyUsage({
          loading: false,
          data: mappedResults,
          lastUpdated: new Date().toLocaleString('zh-CN')
        });
        showMessage('success', '✅ 统计数据已更新！请点击下方"保存配置"按钮保存Key到配置文件');
      }
    } catch (err) {
      console.error('获取 Tavily 用量失败:', err);
      showMessage('error', err instanceof Error ? err.message : '获取用量失败，请稍后重试');
      setTavilyUsage(prev => ({ ...prev, loading: false }));
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
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}
      
      {/* 基础设置 */}
      <div className='bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm'>
        <div className='mb-6'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2'>基础设置</h3>
          <div className='space-y-2'>
            <div className='flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg'>
              <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 20 20'>
                <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
              </svg>
              <span>🤖 支持OpenAI兼容的API接口，包括ChatGPT、Claude、Gemini等模型</span>
            </div>
            <div className='flex items-center space-x-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg'>
              <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 20 20'>
                <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
              </svg>
              <span>🆓 <strong>新功能</strong>：可以只配置Tavily搜索（免费），无需AI模型！适合预算有限的用户</span>
            </div>
            <div className='flex items-center space-x-2 text-sm text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-lg'>
              <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 20 20'>
                <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
              </svg>
              <span>📋 <strong>配置说明</strong>：请至少配置一种模式（AI模型 或 Tavily搜索），或两者都配置以获得最佳体验</span>
            </div>
          </div>
        </div>

        {/* 启用开关 */}
        <div className='mb-6'>
          <label className='flex items-center cursor-pointer'>
            <input
              type='checkbox'
              className='sr-only'
              checked={aiSettings.enabled}
              onChange={(e) => setAiSettings(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              aiSettings.enabled
                ? 'bg-blue-600'
                : 'bg-gray-200 dark:bg-gray-600'
            }`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                aiSettings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </div>
            <span className='ml-3 text-sm font-medium text-gray-900 dark:text-gray-100'>
              启用AI推荐功能
            </span>
          </label>
          <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
            开启后用户可以在主页看到AI推荐按钮并与AI对话获取影视推荐
          </p>
        </div>

        {/* API配置 */}
        {aiSettings.enabled && (
          <div className='space-y-4'>
            {/* 配置模式提示 */}
            <div className='bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
              <h4 className='text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2'>💡 配置模式选择</h4>
              <div className='text-xs text-gray-700 dark:text-gray-300 space-y-1'>
                <p><strong>模式一：AI模型 + Tavily搜索（推荐）</strong> - 配置以下所有选项，获得最佳体验</p>
                <p><strong>模式二：仅AI模型</strong> - 配置API地址/密钥/模型，跳过智能协调器</p>
                <p><strong>模式三：仅Tavily搜索（免费）</strong> - 跳过API配置，直接配置智能协调器和Tavily Keys</p>
              </div>
            </div>

            {/* API地址 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                API地址 <span className='text-xs text-gray-500 dark:text-gray-400'>(Tavily纯搜索模式可留空)</span>
              </label>
              <div className='relative'>
                <input
                  type='url'
                  value={aiSettings.apiUrl}
                  onChange={(e) => setAiSettings(prev => ({ ...prev, apiUrl: e.target.value }))}
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                  placeholder='https://api.openai.com/v1'
                />
                <button
                  type="button"
                  onClick={() => {
                    const url = aiSettings.apiUrl.trim();
                    if (url && !url.endsWith('/v1') && !url.includes('/chat/completions')) {
                      const newUrl = url.endsWith('/') ? url + 'v1' : url + '/v1';
                      setAiSettings(prev => ({ ...prev, apiUrl: newUrl }));
                      showMessage('success', '已自动添加 /v1 后缀');
                    }
                  }}
                  className='absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded transition-colors'
                >
                  +/v1
                </button>
              </div>
              <div className='mt-2 space-y-2'>
                <p className='text-xs text-gray-500 dark:text-gray-400'>
                  <span className='text-yellow-600 dark:text-yellow-400'>💡 提示：</span>
                  大多数OpenAI兼容API需要在地址末尾添加 <code className='bg-gray-100 dark:bg-gray-800 px-1 rounded'>/v1</code>
                </p>
                <div className='grid grid-cols-1 gap-1 text-xs'>
                  <details className='text-gray-500 dark:text-gray-400'>
                    <summary className='cursor-pointer hover:text-gray-700 dark:hover:text-gray-300'>
                      📝 常见API地址示例 (点击展开)
                    </summary>
                    <div className='mt-2 space-y-1 pl-4 border-l-2 border-gray-200 dark:border-gray-700'>
                      {[
                        { name: 'OpenAI', url: 'https://api.openai.com/v1' },
                        { name: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
                        { name: '硅基流动', url: 'https://api.siliconflow.cn/v1' },
                        { name: '月之暗面', url: 'https://api.moonshot.cn/v1' },
                        { name: '智谱AI', url: 'https://open.bigmodel.cn/api/paas/v4' },
                        { name: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
                        { name: '百度文心', url: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1' },
                        { name: '自部署', url: 'http://localhost:11434/v1' }
                      ].map((provider) => (
                        <div key={provider.name} className='flex items-center justify-between group'>
                          <span>• {provider.name}: <code>{provider.url}</code></span>
                          <button
                            type="button"
                            onClick={() => {
                              setAiSettings(prev => ({ ...prev, apiUrl: provider.url }));
                              showMessage('success', `已设置为 ${provider.name} API地址`);
                            }}
                            className='opacity-0 group-hover:opacity-100 ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded transition-all'
                          >
                            使用
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </div>

            {/* API密钥 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                API密钥 <span className='text-xs text-gray-500 dark:text-gray-400'>(Tavily纯搜索模式可留空)</span>
              </label>
              <input
                type='password'
                value={aiSettings.apiKey}
                onChange={(e) => setAiSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                placeholder='sk-...'
              />
              <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                请妥善保管API密钥，不要泄露给他人
              </p>
            </div>

            {/* 模型名称 */}
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                模型名称 <span className='text-xs text-gray-500 dark:text-gray-400'>(Tavily纯搜索模式可留空)</span>
              </label>
              <input
                type='text'
                value={aiSettings.model}
                onChange={(e) => setAiSettings(prev => ({ ...prev, model: e.target.value }))}
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                placeholder='请自行填入正确的官方API模型名称，如：gpt-5'
              />
              <div className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
                <p className='mb-1'>常用模型参考（建议使用支持联网搜索的模型）：</p>
                <p className='mb-2 text-orange-600 dark:text-orange-400'>⚠️ 请确保填入的模型名称与API提供商的官方文档一致</p>
                <div className='flex flex-wrap gap-2'>
                  {MODEL_EXAMPLES.map((example, index) => (
                    <button
                      key={index}
                      type='button'
                      onClick={() => {
                        const modelName = example.split(' (')[0];
                        setAiSettings(prev => ({ ...prev, model: modelName }));
                      }}
                      className='inline-block px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded cursor-pointer transition-colors'
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 高级参数 */}
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  温度参数: {aiSettings.temperature}
                </label>
                <input
                  type='range'
                  min='0'
                  max='2'
                  step='0.1'
                  value={aiSettings.temperature}
                  onChange={(e) => setAiSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                  className='w-full'
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  控制回复的随机性，0=确定性，2=最随机
                </p>
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  最大Token数
                </label>
                <input
                  type='number'
                  min='1'
                  max='4000'
                  value={aiSettings.maxTokens}
                  onChange={(e) => setAiSettings(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  限制AI回复的最大长度。推荐设置：GPT-5/o1/o3/o4推理模型建议2000+，普通模型500-4000即可。
                  <span className="text-yellow-600 dark:text-yellow-400">⚠️ 设置过低可能导致空回复！</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 智能协调器设置（高级） */}
      {aiSettings.enabled && (
        <div className='bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm'>
          <div className='mb-6'>
            <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2'>智能协调器设置（高级）</h3>
            <div className='flex items-center space-x-2 text-sm text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-lg'>
              <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 20 20'>
                <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
              </svg>
              <span>🔥 开启后AI可自动判断是否需要联网搜索获取最新信息（如：最新上映、演员动态等）</span>
            </div>
          </div>

          {/* 启用智能协调器 */}
          <div className='mb-6'>
            <label className='flex items-center cursor-pointer'>
              <input
                type='checkbox'
                className='sr-only'
                checked={aiSettings.enableOrchestrator}
                onChange={(e) => setAiSettings(prev => ({ ...prev, enableOrchestrator: e.target.checked }))}
              />
              <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                aiSettings.enableOrchestrator
                  ? 'bg-purple-600'
                  : 'bg-gray-200 dark:bg-gray-600'
              }`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  aiSettings.enableOrchestrator ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </div>
              <span className='ml-3 text-sm font-medium text-gray-900 dark:text-gray-100'>
                启用智能协调器（意图分析）
              </span>
            </label>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              开启后AI会自动分析用户问题，判断是否需要联网搜索最新信息
            </p>
          </div>

          {/* 联网搜索设置 */}
          {aiSettings.enableOrchestrator && (
            <div className='space-y-4 pl-6 border-l-2 border-purple-200 dark:border-purple-800'>
              {/* 启用联网搜索 */}
              <div>
                <label className='flex items-center cursor-pointer'>
                  <input
                    type='checkbox'
                    className='sr-only'
                    checked={aiSettings.enableWebSearch}
                    onChange={(e) => setAiSettings(prev => ({ ...prev, enableWebSearch: e.target.checked }))}
                  />
                  <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    aiSettings.enableWebSearch
                      ? 'bg-green-600'
                      : 'bg-gray-200 dark:bg-gray-600'
                  }`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      aiSettings.enableWebSearch ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </div>
                  <span className='ml-3 text-sm font-medium text-gray-900 dark:text-gray-100'>
                    启用联网搜索（Tavily）
                  </span>
                </label>
                <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                  使用Tavily搜索引擎获取最新影视资讯、演员动态等实时信息
                </p>
              </div>

              {/* Tavily API Keys */}
              {aiSettings.enableWebSearch && (
                <div>
                  <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                    Tavily API Keys（每个账号1000次/月免费）
                  </label>
                  <input
                    type='text'
                    value={tavilyKeysInput}
                    onChange={(e) => {
                      // 直接保存原始输入，不做分割
                      setTavilyKeysInput(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    onBlur={() => {
                      // 失焦时分割并更新到settings（用于显示数量）
                      const keys = tavilyKeysInput
                        .split(/[,\n]+/)
                        .map(k => k.trim())
                        .filter(k => k.length > 0);
                      setAiSettings(prev => ({ ...prev, tavilyApiKeys: keys }));
                    }}
                    className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm'
                    placeholder='tvly-xxxxxxxxxxxxxx, tvly-yyyyyyyyyyyyyy, tvly-zzzzzzzzzzzzzz'
                  />
                  <div className='mt-2 space-y-2'>
                    <p className='text-xs text-gray-500 dark:text-gray-400'>
                      <span className='text-green-600 dark:text-green-400'>💡 提示：</span>
                      多个API Key用<strong>逗号</strong>分隔，系统会自动轮询使用以提高免费额度
                    </p>
                    <div className='text-xs bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg space-y-1'>
                      <p className='font-semibold text-blue-700 dark:text-blue-300'>📊 免费额度说明：</p>
                      <ul className='list-disc list-inside space-y-0.5 text-blue-600 dark:text-blue-400'>
                        <li>每个Tavily账号提供 <strong>1000次</strong> 免费API调用/月</li>
                        <li>配置多个Key可实现轮询，失败时自动切换下一个Key</li>
                        <li>例如：配置5个Key = 5000次/月免费额度</li>
                        <li>
                          免费注册地址：
                          <a
                            href='https://tavily.com'
                            target='_blank'
                            rel='noopener noreferrer'
                            className='underline hover:text-blue-800 dark:hover:text-blue-200 ml-1'
                          >
                            https://tavily.com
                          </a>
                        </li>
                      </ul>
                    </div>
                    {aiSettings.tavilyApiKeys.length > 0 && (
                      <p className='text-xs text-green-600 dark:text-green-400'>
                        ✅ 已配置 <strong>{aiSettings.tavilyApiKeys.length}</strong> 个API Key
                        （预计每月 <strong>{aiSettings.tavilyApiKeys.length * 1000}</strong> 次免费调用）
                      </p>
                    )}
                  </div>

                  {/* Tavily API 用量查询 */}
                  {aiSettings.tavilyApiKeys.length > 0 && (
                    <div className='mt-4 space-y-3'>
                      <div className='flex items-center justify-between'>
                        <h4 className='text-sm font-semibold text-gray-900 dark:text-gray-100'>
                          📊 API 用量统计
                        </h4>
                        <div className='flex gap-2'>
                          {aiSettings.tavilyApiKeys.length > 1 && (
                            <button
                              onClick={() => fetchTavilyUsage()}
                              disabled={tavilyUsage.loading}
                              className='px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-1.5'
                            >
                              <svg className={`h-3.5 w-3.5 ${tavilyUsage.loading ? 'animate-spin' : ''}`} fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' />
                              </svg>
                              查询全部
                            </button>
                          )}
                        </div>
                      </div>

                      {aiSettings.tavilyApiKeys.length > 1 && (
                        <div className='text-xs bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-lg text-yellow-700 dark:text-yellow-300 flex items-center gap-2'>
                          <svg className='h-4 w-4 flex-shrink-0' fill='currentColor' viewBox='0 0 20 20'>
                            <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
                          </svg>
                          <span>💡 提示：点击下方每个Key卡片的"查询"按钮可单独查询，或点击上方"查询全部"一次性查询所有Key</span>
                        </div>
                      )}

                      {tavilyUsage.lastUpdated && (
                        <p className='text-xs text-gray-500 dark:text-gray-400'>
                          最后更新: {tavilyUsage.lastUpdated}
                        </p>
                      )}

                      {/* 显示所有配置的 Key（即使未查询） */}
                      <div className='space-y-2'>
                        {aiSettings.tavilyApiKeys.map((key, index) => {
                          // 查找该 Key 的用量数据
                          const usage = tavilyUsage.data?.find(d => d.index === index);

                          return (
                            <div
                              key={index}
                              className='bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/10 dark:to-blue-900/10 border border-purple-200 dark:border-purple-800 rounded-lg p-3'
                            >
                              <div className='flex items-center justify-between mb-2'>
                                <span className='text-xs font-mono text-gray-600 dark:text-gray-400'>
                                  Key #{index + 1}: {key.substring(0, 12)}...
                                </span>
                                <div className='flex items-center gap-2'>
                                  {usage && (
                                    <span className='text-xs font-semibold text-purple-700 dark:text-purple-300'>
                                      {usage.currentPlan}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => fetchTavilyUsage(index)}
                                    disabled={tavilyUsage.loading}
                                    className='px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded transition-colors'
                                    title='查询此Key的用量'
                                  >
                                    {usage ? '刷新' : '查询'}
                                  </button>
                                </div>
                              </div>

                              {!usage ? (
                                <div className='text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 py-2'>
                                  <svg className='h-3.5 w-3.5' fill='currentColor' viewBox='0 0 20 20'>
                                    <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
                                  </svg>
                                  点击"查询"按钮获取用量信息
                                </div>
                              ) : usage.wafBlocked ? (
                                <div className='space-y-2'>
                                  <div className='text-xs bg-orange-50 dark:bg-orange-900/20 px-3 py-2 rounded-lg border border-orange-200 dark:border-orange-800'>
                                    <div className='flex items-start gap-2 text-orange-700 dark:text-orange-300'>
                                      <svg className='h-4 w-4 flex-shrink-0 mt-0.5' fill='currentColor' viewBox='0 0 20 20'>
                                        <path fillRule='evenodd' d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z' clipRule='evenodd' />
                                      </svg>
                                      <div className='flex-1'>
                                        <p className='font-semibold mb-1'>⚠️ Tavily Usage API 暂时不可用</p>
                                        <p className='mb-2'>Tavily 的用量查询接口被 AWS WAF 拦截（HTTP 202 Challenge），这是 Tavily 服务端的配置问题。</p>
                                        <p className='mb-2'>
                                          <strong>临时解决方案：</strong>请访问
                                          <a
                                            href='https://app.tavily.com'
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='underline hover:text-orange-800 dark:hover:text-orange-200 ml-1 font-semibold'
                                          >
                                            Tavily 官网控制台
                                          </a>
                                          {' '}查看 API 用量
                                        </p>
                                        <p className='text-xs text-orange-600 dark:text-orange-400'>
                                          💡 提示：搜索功能正常工作，只是用量查询接口有问题。我们会持续关注 Tavily 的修复进度。
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : usage.error ? (
                                <div className='text-xs text-red-600 dark:text-red-400 flex items-center gap-1'>
                                  <svg className='h-3.5 w-3.5' fill='currentColor' viewBox='0 0 20 20'>
                                    <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z' clipRule='evenodd' />
                                  </svg>
                                  {usage.error}
                                </div>
                              ) : (
                                <div className='space-y-2'>
                                  {/* Key 用量 */}
                                  <div>
                                    <div className='flex justify-between items-center mb-1'>
                                      <span className='text-xs text-gray-600 dark:text-gray-400'>Key 用量</span>
                                      <span className='text-xs font-semibold text-gray-900 dark:text-gray-100'>
                                        {usage.keyUsage} / {usage.keyLimit}
                                        <span className='text-gray-500 dark:text-gray-400 ml-1'>
                                          ({((usage.keyUsage / usage.keyLimit) * 100).toFixed(1)}%)
                                        </span>
                                      </span>
                                    </div>
                                    <div className='h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          (usage.keyUsage / usage.keyLimit) > 0.9
                                            ? 'bg-red-500'
                                            : (usage.keyUsage / usage.keyLimit) > 0.7
                                            ? 'bg-yellow-500'
                                            : 'bg-green-500'
                                        }`}
                                        style={{ width: `${Math.min((usage.keyUsage / usage.keyLimit) * 100, 100)}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Plan 用量 */}
                                  <div>
                                    <div className='flex justify-between items-center mb-1'>
                                      <span className='text-xs text-gray-600 dark:text-gray-400'>Plan 用量</span>
                                      <span className='text-xs font-semibold text-gray-900 dark:text-gray-100'>
                                        {usage.planUsage} / {usage.planLimit}
                                        <span className='text-gray-500 dark:text-gray-400 ml-1'>
                                          ({((usage.planUsage / usage.planLimit) * 100).toFixed(1)}%)
                                        </span>
                                      </span>
                                    </div>
                                    <div className='h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'>
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          (usage.planUsage / usage.planLimit) > 0.9
                                            ? 'bg-red-500'
                                            : (usage.planUsage / usage.planLimit) > 0.7
                                            ? 'bg-yellow-500'
                                            : 'bg-purple-500'
                                        }`}
                                        style={{ width: `${Math.min((usage.planUsage / usage.planLimit) * 100, 100)}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* 剩余额度提示 */}
                                  <div className='text-xs text-gray-600 dark:text-gray-400 pt-1'>
                                    剩余: {usage.keyLimit - usage.keyUsage} 次
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className='flex flex-wrap gap-3'>
        {/* 测试连接按钮 - 只在启用AI时显示 */}
        {aiSettings.enabled && (
          <button
            onClick={handleTest}
            disabled={isLoading}
            className='flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors'
          >
            <svg className='h-4 w-4 mr-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' />
            </svg>
            {isLoading ? '测试中...' : '测试连接'}
          </button>
        )}
        
        {/* 保存按钮 - 始终显示 */}
        <button
          onClick={handleSave}
          disabled={isLoading}
          className={`flex items-center px-4 py-2 ${
            hasUnsavedChanges
              ? 'bg-orange-600 hover:bg-orange-700 animate-pulse'
              : 'bg-blue-600 hover:bg-blue-700'
          } disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors`}
        >
          <svg className='h-4 w-4 mr-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
          </svg>
          {isLoading ? '保存中...' : hasUnsavedChanges ? '⚠️ 保存配置（有未保存更改）' : '保存配置'}
        </button>
      </div>
    </div>
  );
};

export default AIRecommendConfig;