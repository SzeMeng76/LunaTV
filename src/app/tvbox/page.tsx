'use client';

import { AlertTriangle, Monitor, Shield, Smartphone, Tv, Activity } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';

interface SecurityConfig {
  enableAuth: boolean;
  token: string;
  enableIpWhitelist: boolean;
  allowedIPs: string[];
  enableRateLimit: boolean;
  rateLimit: number;
}

interface DiagnosisResult {
  spider?: string;
  spiderPrivate?: boolean;
  spiderReachable?: boolean;
  spiderStatus?: number;
  spiderSizeKB?: number;
  spiderLastModified?: string;
  contentLength?: string;
  lastModified?: string;
  spider_url?: string;
  spider_md5?: string;
  spider_cached?: boolean;
  spider_real_size?: number;
  spider_tried?: number;
  spider_success?: boolean;
  spider_backup?: string;
  spider_candidates?: string[];
  status?: number;
  contentType?: string;
  hasJson?: boolean;
  receivedToken?: string;
  size?: number;
  sitesCount?: number;
  livesCount?: number;
  parsesCount?: number;
  privateApis?: number;
  configUrl?: string;
  issues?: string[];
  pass?: boolean;
  error?: string;
}

export default function TVBoxConfigPage() {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'json' | 'base64'>('json');
  const [configMode, setConfigMode] = useState<'standard' | 'safe' | 'fast' | 'yingshicang'>('standard');
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig | null>(null);
  const [siteName, setSiteName] = useState('MoonTV');
  const [loading, setLoading] = useState(true);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [refreshingJar, setRefreshingJar] = useState(false);
  const [jarRefreshMsg, setJarRefreshMsg] = useState<string | null>(null);

  // 获取安全配置（使用普通用户可访问的接口）
  const fetchSecurityConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/tvbox-config');
      if (response.ok) {
        const data = await response.json();
        setSecurityConfig(data.securityConfig || null);
        setSiteName(data.siteName || 'MoonTV');
      }
    } catch (error) {
      console.error('获取安全配置失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityConfig();
  }, [fetchSecurityConfig]);

  const getConfigUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const baseUrl = window.location.origin;
    const params = new URLSearchParams();

    params.append('format', format);

    // 如果启用了Token验证，自动添加token参数
    if (securityConfig?.enableAuth && securityConfig.token) {
      params.append('token', securityConfig.token);
    }

    // 添加配置模式参数
    if (configMode !== 'standard') {
      params.append('mode', configMode);
    }

    return `${baseUrl}/api/tvbox?${params.toString()}`;
  }, [format, configMode, securityConfig]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getConfigUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed silently
    }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    setDiagnosisResult(null);
    try {
      const params = new URLSearchParams();
      if (securityConfig?.enableAuth && securityConfig.token) {
        params.append('token', securityConfig.token);
      }
      const response = await fetch(`/api/tvbox/diagnose?${params.toString()}`);
      const data = await response.json();
      setDiagnosisResult(data);
    } catch (error) {
      setDiagnosisResult({ error: '诊断失败，请稍后重试' });
    } finally {
      setDiagnosing(false);
    }
  };

  const handleRefreshJar = async () => {
    setRefreshingJar(true);
    setJarRefreshMsg(null);
    try {
      const response = await fetch('/api/tvbox/spider-status', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setJarRefreshMsg(`✓ JAR 缓存已刷新 (${data.jar_status.source.split('/').pop()})`);
        // 如果当前有诊断结果，重新诊断
        if (diagnosisResult) {
          setTimeout(() => handleDiagnose(), 500);
        }
      } else {
        setJarRefreshMsg(`✗ 刷新失败: ${data.error}`);
      }
    } catch (error) {
      setJarRefreshMsg('✗ 刷新失败，请稍后重试');
    } finally {
      setRefreshingJar(false);
      setTimeout(() => setJarRefreshMsg(null), 5000);
    }
  };

  return (
    <PageLayout activePath="/tvbox">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* 页面标题 */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Tv className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                TVBox 配置
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                将 {siteName} 的视频源导入到 TVBox 应用中使用
              </p>
            </div>
          </div>
        </div>

        {/* 安全状态提示 */}
        {!loading && securityConfig && (
          <div className="mb-6">
            {(securityConfig.enableAuth || securityConfig.enableIpWhitelist || securityConfig.enableRateLimit) ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-800 dark:text-green-200 mb-1">
                      🔒 已启用安全配置
                    </h3>
                    <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                      {securityConfig.enableAuth && (
                        <p>• Token验证：已启用（URL已自动包含token）</p>
                      )}
                      {securityConfig.enableIpWhitelist && (
                        <p>• IP白名单：已启用（限制 {securityConfig.allowedIPs.length} 个IP访问）</p>
                      )}
                      {securityConfig.enableRateLimit && (
                        <p>• 频率限制：每分钟最多 {securityConfig.rateLimit} 次请求</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                      ⚠️ 安全提醒
                    </h3>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      当前未启用任何安全配置，任何人都可以访问您的TVBox配置。建议在管理后台启用安全选项。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 配置链接卡片 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            🔗 配置链接
          </h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              格式类型
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'json' | 'base64')}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="json">JSON 格式（推荐）</option>
              <option value="base64">Base64 格式</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {format === 'json'
                ? '标准 JSON 配置，TVBox 主流分支支持'
                : 'Base64 编码配置，适合特殊环境'}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              配置模式
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                <input
                  type="radio"
                  name="configMode"
                  value="standard"
                  checked={configMode === 'standard'}
                  onChange={(e) => setConfigMode(e.target.value as 'standard' | 'safe' | 'fast' | 'yingshicang')}
                  className="mr-2 w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white block">标准</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">日常使用</span>
                </div>
              </label>
              <label className="flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                <input
                  type="radio"
                  name="configMode"
                  value="safe"
                  checked={configMode === 'safe'}
                  onChange={(e) => setConfigMode(e.target.value as 'standard' | 'safe' | 'fast' | 'yingshicang')}
                  className="mr-2 w-4 h-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white block">精简</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">兼容性</span>
                </div>
              </label>
              <label className="flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-green-500 dark:hover:border-green-400 transition-colors">
                <input
                  type="radio"
                  name="configMode"
                  value="fast"
                  checked={configMode === 'fast'}
                  onChange={(e) => setConfigMode(e.target.value as 'standard' | 'safe' | 'fast' | 'yingshicang')}
                  className="mr-2 w-4 h-4 text-green-600 focus:ring-green-500"
                />
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white block">快速</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">频繁换源</span>
                </div>
              </label>
              <label className="flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 transition-colors">
                <input
                  type="radio"
                  name="configMode"
                  value="yingshicang"
                  checked={configMode === 'yingshicang'}
                  onChange={(e) => setConfigMode(e.target.value as 'standard' | 'safe' | 'fast' | 'yingshicang')}
                  className="mr-2 w-4 h-4 text-purple-600 focus:ring-purple-500"
                />
                <div className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white block">影视仓</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">专用优化</span>
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {configMode === 'standard'
                ? '📊 包含 IJK 优化、DoH DNS、广告过滤，适合日常使用'
                : configMode === 'safe'
                ? '🔒 仅核心配置，TVBox 兼容性问题时使用'
                : configMode === 'fast'
                ? '⚡ 优化切换速度，移除超时配置，减少卡顿和 SSL 错误'
                : '🎬 专为影视仓优化，包含播放规则和兼容性修复'}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={getConfigUrl()}
              className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${copied
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
                } transform hover:scale-105`}
            >
              {copied ? '✓ 已复制' : '复制'}
            </button>
          </div>
        </div>

        {/* 配置诊断 */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                🔍 配置诊断
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshJar}
                disabled={refreshingJar}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {refreshingJar ? '刷新中...' : '🔄 刷新 JAR'}
              </button>
              <button
                onClick={handleDiagnose}
                disabled={diagnosing}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {diagnosing ? '诊断中...' : '开始诊断'}
              </button>
            </div>
          </div>

          {/* JAR 刷新消息 */}
          {jarRefreshMsg && (
            <div className={`mb-4 p-3 rounded-lg ${jarRefreshMsg.startsWith('✓') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
              {jarRefreshMsg}
            </div>
          )}

          {diagnosisResult && (
            <div className="space-y-4">
              {diagnosisResult.error ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                  <p className="text-red-700 dark:text-red-300">{diagnosisResult.error}</p>
                </div>
              ) : (
                <>
                  {/* 基本信息 */}
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                    <h3 className="font-semibold text-green-900 dark:text-green-300 mb-3">✓ 基本信息</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-gray-600 dark:text-gray-400">状态码:</div>
                      <div className="text-gray-900 dark:text-gray-100 font-medium">{diagnosisResult.status || 'N/A'}</div>

                      <div className="text-gray-600 dark:text-gray-400">Content-Type:</div>
                      <div className="text-gray-900 dark:text-gray-100 font-mono text-xs">{diagnosisResult.contentType || 'N/A'}</div>

                      <div className="text-gray-600 dark:text-gray-400">JSON解析:</div>
                      <div className={diagnosisResult.hasJson ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                        {diagnosisResult.hasJson ? '✓ 成功' : '✗ 失败'}
                      </div>

                      {diagnosisResult.receivedToken && (
                        <>
                          <div className="text-gray-600 dark:text-gray-400">接收到的Token:</div>
                          <div className="text-gray-900 dark:text-gray-100 font-mono text-xs">{diagnosisResult.receivedToken}</div>
                        </>
                      )}

                      <div className="text-gray-600 dark:text-gray-400">配置大小:</div>
                      <div className="text-gray-900 dark:text-gray-100 font-medium">{diagnosisResult.size ? `${diagnosisResult.size.toLocaleString()} 字节` : 'N/A'}</div>
                    </div>
                  </div>

                  {/* Spider JAR 状态 */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Spider JAR:</h3>
                    <div className="font-mono text-xs text-gray-600 dark:text-gray-300 break-all mb-2">
                      {diagnosisResult.spider}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {diagnosisResult.spiderPrivate === false && (
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                          ✓ 公网地址
                        </span>
                      )}
                      {diagnosisResult.spiderReachable !== undefined && (
                        diagnosisResult.spiderReachable ? (
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                            ✓ 可访问 {diagnosisResult.spiderStatus && `(${diagnosisResult.spiderStatus})`}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                            ✗ 不可访问 {diagnosisResult.spiderStatus && `(${diagnosisResult.spiderStatus})`}
                          </span>
                        )
                      )}
                      {diagnosisResult.spiderSizeKB !== undefined && (
                        <span className={`px-2 py-1 rounded ${
                          diagnosisResult.spiderSizeKB < 50
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        }`}>
                          {diagnosisResult.spiderSizeKB < 50 ? '⚠' : '✓'} {diagnosisResult.spiderSizeKB}KB
                        </span>
                      )}
                    </div>
                    {diagnosisResult.spiderLastModified && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        最后修改: {new Date(diagnosisResult.spiderLastModified).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </div>

                  {/* Spider Jar 状态 */}
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Spider JAR 状态
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">来源</div>
                        <div className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">
                          {diagnosisResult.spider_url || 'unknown'}
                        </div>
                      </div>
                      <div>
                        <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">MD5</div>
                        <div className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">
                          {diagnosisResult.spider_md5 || 'unknown'}
                        </div>
                      </div>
                      <div>
                        <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">缓存状态</div>
                        <div className={`font-medium ${diagnosisResult.spider_cached ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                          {diagnosisResult.spider_cached ? '✓ 已缓存' : '⚡ 实时下载'}
                        </div>
                      </div>
                      <div>
                        <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">文件大小</div>
                        <div className="text-gray-900 dark:text-gray-100 font-medium">
                          {diagnosisResult.spider_real_size ? `${Math.round(diagnosisResult.spider_real_size / 1024)}KB` : 'unknown'}
                        </div>
                      </div>
                      <div>
                        <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">尝试次数</div>
                        <div className={`font-medium ${diagnosisResult.spider_tried && diagnosisResult.spider_tried > 2 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                          {diagnosisResult.spider_tried || 0} 次
                        </div>
                      </div>
                      <div>
                        <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">获取状态</div>
                        <div className={`font-medium ${diagnosisResult.spider_success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {diagnosisResult.spider_success ? '✓ 成功' : '✗ 降级 (fallback)'}
                        </div>
                      </div>
                    </div>

                    {/* 智能建议 */}
                    {diagnosisResult.spider_success === false && (
                      <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                        <p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium mb-1">⚠️ JAR 获取建议</p>
                        <ul className="text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                          <li>• 所有远程源均不可用，正在使用内置备用 JAR</li>
                          <li>• 建议检查网络连接或点击"刷新 JAR"重试</li>
                        </ul>
                      </div>
                    )}

                    {diagnosisResult.spider_success && diagnosisResult.spider_tried && diagnosisResult.spider_tried > 2 && (
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-1">💡 优化建议</p>
                        <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
                          <li>• 多个源失败后才成功，建议检查网络稳定性</li>
                          {diagnosisResult.spider_url?.includes('github') && (
                            <li>• GitHub 源访问可能受限，建议配置代理</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* 配置统计 */}
                  {(diagnosisResult.sitesCount !== undefined || diagnosisResult.livesCount !== undefined) && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">配置统计:</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300">
                        {diagnosisResult.sitesCount !== undefined && (
                          <>
                            <div>影视源:</div>
                            <div className="text-gray-900 dark:text-gray-100 font-medium">{diagnosisResult.sitesCount}</div>
                          </>
                        )}
                        {diagnosisResult.livesCount !== undefined && (
                          <>
                            <div>直播源:</div>
                            <div className="text-gray-900 dark:text-gray-100 font-medium">{diagnosisResult.livesCount}</div>
                          </>
                        )}
                        {diagnosisResult.parsesCount !== undefined && (
                          <>
                            <div>解析源:</div>
                            <div className="text-gray-900 dark:text-gray-100 font-medium">{diagnosisResult.parsesCount}</div>
                          </>
                        )}
                        {diagnosisResult.privateApis !== undefined && (
                          <>
                            <div>私网API:</div>
                            <div className={diagnosisResult.privateApis > 0 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                              {diagnosisResult.privateApis}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 备用代理 */}
                  {diagnosisResult.spider_backup && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">备用代理:</h3>
                      <p className="font-mono text-xs text-blue-700 dark:text-blue-300 break-all">
                        {diagnosisResult.spider_backup}
                      </p>
                    </div>
                  )}

                  {/* 候选列表 */}
                  {diagnosisResult.spider_candidates && diagnosisResult.spider_candidates.length > 0 && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">候选列表:</h3>
                      <div className="space-y-1">
                        {diagnosisResult.spider_candidates.map((candidate, idx) => (
                          <div key={idx} className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all">
                            {idx + 1}. {candidate}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 问题列表 */}
                  {diagnosisResult.issues && diagnosisResult.issues.length > 0 && (
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
                      <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-2">发现问题:</h3>
                      <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                        {diagnosisResult.issues.map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {!diagnosisResult && !diagnosing && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              点击"开始诊断"检查配置健康状态
            </p>
          )}
        </div>

        {/* 快速开始 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            📋 快速开始
          </h2>
          <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
            <li>复制上方配置链接</li>
            <li>打开 TVBox → 设置 → 配置地址</li>
            <li>粘贴链接并确认导入</li>
            <li>等待配置加载完成即可使用</li>
          </ol>
        </div>

        {/* 核心特性 */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 mb-6 border border-blue-200 dark:border-blue-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            ✨ 核心特性
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                智能 Spider 管理
              </h3>
              <ul className="text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                <li>• 自动探测多源（GitHub）</li>
                <li>• 智能重试 + 失败源记录</li>
                <li>• 动态缓存（成功 4h / 失败 10min）</li>
                <li>• JAR 文件验证 + 真实 MD5</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                配置优化
              </h3>
              <ul className="text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                <li>• IJK 硬解码/软解码配置</li>
                <li>• DoH DNS（解决 DNS 污染）</li>
                <li>• 广告过滤规则</li>
                <li>• 实时同步，无缓存延迟</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 常见问题 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            ❓ 常见问题
          </h2>
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: 源切换卡顿怎么办？</h3>
              <p className="text-gray-600 dark:text-gray-400">A: 使用快速模式（移除超时配置，优化切换速度）</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: TVBox 报错或不兼容？</h3>
              <p className="text-gray-600 dark:text-gray-400">A: 切换到精简模式（仅核心配置，提高兼容性）</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: 使用影视仓怎么配置？</h3>
              <p className="text-gray-600 dark:text-gray-400">A: 选择影视仓模式（包含播放规则和兼容性修复）</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: 如何更新配置？</h3>
              <p className="text-gray-600 dark:text-gray-400">A: TVBox → 设置 → 配置地址 → 刷新，配置即时生效</p>
            </div>
            {securityConfig?.enableAuth && (
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: Token 认证相关？</h3>
                <p className="text-gray-600 dark:text-gray-400">A: 配置链接已自动包含 Token，请勿泄露给他人</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}