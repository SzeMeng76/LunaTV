'use client';

import { AlertTriangle, Monitor, Shield, Smartphone, Tv, Activity, Heart, Wrench, Globe, Zap, CheckCircle2, XCircle, Clock, Search } from 'lucide-react';
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

interface Source {
  key: string;
  name: string;
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

// 智能健康检查结果
interface SmartHealthResult {
  success: boolean;
  timestamp: number;
  executionTime: number;
  network: {
    environment: 'domestic' | 'international';
    region: string;
    detectionMethod: string;
    optimized: boolean;
  };
  spider: {
    current: {
      success: boolean;
      source: string;
      size: number;
      md5: string;
      cached: boolean;
      tried_sources: number;
    };
    cached: any;
  };
  reachability: {
    total_tested: number;
    successful: number;
    health_score: number;
    tests: Array<{
      url: string;
      success: boolean;
      responseTime: number;
      statusCode?: number;
      error?: string;
      size?: number;
    }>;
  };
  recommendations: string[];
  status: {
    overall: 'excellent' | 'good' | 'needs_attention';
    spider_available: boolean;
    network_stable: boolean;
    recommendations_count: number;
  };
  error?: string;
}

// JAR源修复结果
interface JarFixResult {
  success: boolean;
  timestamp: number;
  executionTime: number;
  summary: {
    total_tested: number;
    successful: number;
    failed: number;
    user_region: 'domestic' | 'international';
    avg_response_time: number;
  };
  test_results: Array<{
    url: string;
    name: string;
    success: boolean;
    responseTime: number;
    size?: number;
    error?: string;
    statusCode?: number;
  }>;
  recommended_sources: Array<{
    url: string;
    name: string;
    success: boolean;
    responseTime: number;
    size?: number;
  }>;
  recommendations: {
    immediate: string[];
    configuration: string[];
    troubleshooting: string[];
  };
  fixed_config_urls: string[];
  status: {
    jar_available: boolean;
    network_quality: 'good' | 'fair' | 'poor';
    needs_troubleshooting: boolean;
  };
  error?: string;
  emergency_recommendations?: string[];
}

export default function TVBoxConfigPage() {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'json' | 'base64'>('json');
  const [configMode, setConfigMode] = useState<'standard' | 'safe' | 'fast' | 'yingshicang'>('standard');

  // 🎯 智能搜索和过滤控制
  const [enableAdultFilter, setEnableAdultFilter] = useState(true); // 默认启用过滤
  const [enableSmartProxy, setEnableSmartProxy] = useState(true); // 默认启用智能搜索
  const [enableStrictMode, setEnableStrictMode] = useState(false); // 默认不启用严格模式

  const [securityConfig, setSecurityConfig] = useState<SecurityConfig | null>(null);
  const [siteName, setSiteName] = useState('MoonTV');
  const [loading, setLoading] = useState(true);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [refreshingJar, setRefreshingJar] = useState(false);
  const [jarRefreshMsg, setJarRefreshMsg] = useState<string | null>(null);

  // 🔑 新增：用户专属配置状态
  const [userToken, setUserToken] = useState('');
  const [userEnabledSources, setUserEnabledSources] = useState<string[]>([]);
  const [allSources, setAllSources] = useState<Source[]>([]);

  // 智能健康检查状态
  const [smartHealthResult, setSmartHealthResult] = useState<SmartHealthResult | null>(null);
  const [smartHealthLoading, setSmartHealthLoading] = useState(false);

  // JAR源修复状态
  const [jarFixResult, setJarFixResult] = useState<JarFixResult | null>(null);
  const [jarFixLoading, setJarFixLoading] = useState(false);

  // 深度诊断状态
  const [deepDiagnosticResult, setDeepDiagnosticResult] = useState<any>(null);
  const [deepDiagnosticLoading, setDeepDiagnosticLoading] = useState(false);

  // 自定义 JAR URL 测试状态
  const [customJarUrl, setCustomJarUrl] = useState('');
  const [customJarTestResult, setCustomJarTestResult] = useState<any>(null);
  const [customJarTestLoading, setCustomJarTestLoading] = useState(false);
  const [hasCustomJarConfig, setHasCustomJarConfig] = useState(false); // 是否有管理员配置的自定义 JAR

  // Tab状态
  const [activeTab, setActiveTab] = useState<'basic' | 'smart-health' | 'jar-fix' | 'deep-diagnostic'>('basic');

  // 获取安全配置（使用普通用户可访问的接口）
  const fetchSecurityConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/tvbox-config');
      if (response.ok) {
        const data = await response.json();
        setSecurityConfig(data.securityConfig || null);
        setSiteName(data.siteName || 'MoonTV');
        // 🔑 新增：设置用户专属配置
        setUserToken(data.userToken || '');
        setUserEnabledSources(data.userEnabledSources || []);
        setAllSources(data.allSources || []);
      }
    } catch (error) {
      console.error('获取安全配置失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityConfig();
    fetchCustomJarConfig(); // 获取自定义 JAR 配置
  }, [fetchSecurityConfig]);

  // 获取自定义 JAR 配置
  const fetchCustomJarConfig = async () => {
    try {
      const response = await fetch('/api/tvbox/custom-jar');
      if (response.ok) {
        const data = await response.json();
        if (data.enabled && data.jarUrl) {
          setCustomJarUrl(data.jarUrl);
          setHasCustomJarConfig(true);
        }
      }
    } catch (error) {
      console.error('获取自定义 JAR 配置失败:', error);
    }
  };

  const getConfigUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const baseUrl = window.location.origin;
    const params = new URLSearchParams();

    params.append('format', format);

    // 🔑 优先使用用户专属 Token，如果没有则使用全局 Token
    if (userToken) {
      params.append('token', userToken);
    } else if (securityConfig?.enableAuth && securityConfig.token) {
      params.append('token', securityConfig.token);
    }

    // 添加配置模式参数
    if (configMode !== 'standard') {
      params.append('mode', configMode);
    }

    // 🎯 智能搜索和过滤参数
    if (!enableAdultFilter) {
      params.append('filter', 'off');
    }
    if (!enableSmartProxy) {
      params.append('proxy', 'off');
    }
    if (enableStrictMode) {
      params.append('strict', '1');
    }

    return `${baseUrl}/api/tvbox?${params.toString()}`;
  }, [format, configMode, securityConfig, userToken, enableAdultFilter, enableSmartProxy, enableStrictMode]);

  // 通用复制函数，支持 HTTP 和 HTTPS
  const copyToClipboard = async (text: string) => {
    try {
      // 尝试使用现代 Clipboard API（仅在 HTTPS 或 localhost 下可用）
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // 备用方案：使用传统方法支持 HTTP
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } finally {
          textArea.remove();
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(getConfigUrl());
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  // 智能健康检查
  const handleSmartHealthCheck = async () => {
    setSmartHealthLoading(true);
    setSmartHealthResult(null);
    try {
      const response = await fetch('/api/tvbox/smart-health');
      const data = await response.json();
      setSmartHealthResult(data);
    } catch (error) {
      setSmartHealthResult({
        success: false,
        error: '智能健康检查失败，请稍后重试',
      } as SmartHealthResult);
    } finally {
      setSmartHealthLoading(false);
    }
  };

  // JAR源修复诊断
  const handleJarFix = async () => {
    setJarFixLoading(true);
    setJarFixResult(null);
    try {
      const response = await fetch('/api/tvbox/jar-fix');
      const data = await response.json();
      setJarFixResult(data);
    } catch (error) {
      setJarFixResult({
        success: false,
        error: 'JAR源修复诊断失败，请稍后重试',
      } as JarFixResult);
    } finally {
      setJarFixLoading(false);
    }
  };

  // 深度诊断
  const handleDeepDiagnostic = async () => {
    setDeepDiagnosticLoading(true);
    setDeepDiagnosticResult(null);
    try {
      const response = await fetch('/api/tvbox/jar-diagnostic');
      const data = await response.json();
      setDeepDiagnosticResult(data);
    } catch (error) {
      setDeepDiagnosticResult({
        error: '深度诊断失败，请稍后重试',
      });
    } finally {
      setDeepDiagnosticLoading(false);
    }
  };

  // 测试自定义 JAR URL 通过代理
  const handleTestCustomJar = async () => {
    if (!customJarUrl.trim()) {
      alert('请输入 JAR URL');
      return;
    }

    setCustomJarTestLoading(true);
    setCustomJarTestResult(null);

    try {
      const startTime = Date.now();
      // 通过本地代理测试自定义 JAR
      const proxyUrl = `/api/proxy/spider.jar?url=${encodeURIComponent(customJarUrl)}&refresh=1`;
      const response = await fetch(proxyUrl, { method: 'HEAD' });
      const responseTime = Date.now() - startTime;

      const result = {
        success: response.ok,
        url: customJarUrl,
        proxyUrl: proxyUrl,
        statusCode: response.status,
        responseTime: responseTime,
        size: response.headers.get('content-length'),
        source: response.headers.get('x-spider-source'),
        cached: response.headers.get('x-spider-cached'),
        spiderSuccess: response.headers.get('x-spider-success'),
        error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`,
      };

      setCustomJarTestResult(result);
    } catch (error) {
      setCustomJarTestResult({
        success: false,
        url: customJarUrl,
        error: error instanceof Error ? error.message : '未知错误',
      });
    } finally {
      setCustomJarTestLoading(false);
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

        {/* 🎯 新功能提示 */}
        <div className="mb-6">
          <div className="bg-linear-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Search className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                  ✨ 智能搜索和内容过滤功能
                  <span className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">NEW</span>
                </h3>
                <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1.5">
                  <p>
                    <strong>🎯 智能搜索代理：</strong>
                    自动优化搜索结果，相关度高的内容优先显示，解决 TVBox 搜索不精确的问题
                  </p>
                  <p>
                    <strong>🔒 成人内容过滤：</strong>
                    基于 29+ 敏感关键词智能过滤，保护家庭观看环境
                  </p>
                  <p>
                    <strong>⚡ 严格匹配模式：</strong>
                    过滤不相关结果，只返回高度匹配的内容
                  </p>
                  <p className="text-xs mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                    💡 默认已启用家庭安全模式，您可以在下方自定义配置。TVBox 端无需任何设置，自动生效！
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 用户专属配置提示 */}
        {!loading && userToken && (
          <div className="mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
                    🔑 您的专属TVBox配置
                  </h3>
                  <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <p>• 此配置链接仅供您个人使用，请勿分享给他人</p>
                    {userEnabledSources.length > 0 ? (
                      <p>• 源限制：您可以访问 {userEnabledSources.length} 个指定源</p>
                    ) : (
                      <p>• 源权限：您可以访问所有可用源（{allSources.length} 个）</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 安全状态提示 */}
        {!loading && securityConfig && !userToken && (
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

          {/* 🎯 智能搜索和内容过滤 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              🎯 智能搜索和内容过滤
            </label>
            <div className="space-y-3">
              {/* 成人内容过滤 */}
              <label className="flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                <input
                  type="checkbox"
                  checked={enableAdultFilter}
                  onChange={(e) => setEnableAdultFilter(e.target.checked)}
                  className="mr-3 w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center">
                    <Shield className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      启用成人内容过滤
                    </span>
                    <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                      推荐
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    基于 29+ 敏感关键词过滤不良内容，保护家庭环境
                  </p>
                </div>
              </label>

              {/* 智能搜索代理 */}
              <label className="flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                <input
                  type="checkbox"
                  checked={enableSmartProxy}
                  onChange={(e) => setEnableSmartProxy(e.target.checked)}
                  className="mr-3 w-4 h-4 text-blue-600 focus:ring-blue-500 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center">
                    <Search className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      启用智能搜索代理
                    </span>
                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                      推荐
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    智能排序搜索结果，最相关的内容优先显示
                  </p>
                </div>
              </label>

              {/* 严格匹配模式 */}
              <label className="flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-yellow-500 dark:hover:border-yellow-400 transition-colors">
                <input
                  type="checkbox"
                  checked={enableStrictMode}
                  onChange={(e) => setEnableStrictMode(e.target.checked)}
                  className="mr-3 w-4 h-4 text-yellow-600 focus:ring-yellow-500 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2 text-yellow-600 dark:text-yellow-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      严格匹配模式
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    只返回高度相关的搜索结果，过滤不精确匹配
                  </p>
                </div>
              </label>
            </div>
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                <strong>提示：</strong>
                {enableAdultFilter && enableSmartProxy
                  ? ' 家庭模式已启用，搜索结果已优化且过滤不良内容'
                  : !enableAdultFilter
                  ? ' ⚠️ 成人内容过滤已关闭，搜索结果可能包含敏感内容'
                  : !enableSmartProxy
                  ? ' ⚠️ 智能搜索已关闭，将直连原始 API（可能不精确）'
                  : ''}
              </p>
            </div>
          </div>

          {/* ⚡ 快捷复制配置链接 */}
          <div className="mb-4">
            <div className="bg-linear-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-1">
                  ⚡ 快捷复制配置
                </h3>
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  一键复制不同模式的配置链接，支持 URL 参数和路径前缀两种方式
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 家庭安全模式按钮 */}
                <button
                  onClick={async () => {
                    const baseUrl = window.location.origin;
                    const params = new URLSearchParams();
                    params.append('format', format);
                    if (userToken) {
                      params.append('token', userToken);
                    } else if (securityConfig?.enableAuth && securityConfig.token) {
                      params.append('token', securityConfig.token);
                    }
                    if (configMode !== 'standard') {
                      params.append('mode', configMode);
                    }
                    const url = `${baseUrl}/api/tvbox?${params.toString()}`;

                    const success = await copyToClipboard(url);
                    if (success) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className="group flex items-center justify-between px-3 py-2.5 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 rounded-lg hover:border-green-400 dark:hover:border-green-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xl">🏠</span>
                    <div className="text-left">
                      <div className="text-xs font-semibold text-green-700 dark:text-green-300">
                        家庭安全模式
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400">
                        过滤成人内容 + 智能搜索
                      </div>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </button>

                {/* 完整内容模式按钮（URL 参数） */}
                <button
                  onClick={async () => {
                    const baseUrl = window.location.origin;
                    const params = new URLSearchParams();
                    params.append('format', format);
                    if (userToken) {
                      params.append('token', userToken);
                    } else if (securityConfig?.enableAuth && securityConfig.token) {
                      params.append('token', securityConfig.token);
                    }
                    if (configMode !== 'standard') {
                      params.append('mode', configMode);
                    }
                    params.append('filter', 'off'); // 关闭过滤
                    const url = `${baseUrl}/api/tvbox?${params.toString()}`;

                    const success = await copyToClipboard(url);
                    if (success) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className="group flex items-center justify-between px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-700 rounded-lg hover:border-orange-400 dark:hover:border-orange-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xl">🔓</span>
                    <div className="text-left">
                      <div className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                        完整内容模式
                      </div>
                      <div className="text-xs text-orange-600 dark:text-orange-400">
                        URL 参数模式
                      </div>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </button>

                {/* 完整内容模式按钮（路径前缀） */}
                <button
                  onClick={async () => {
                    const baseUrl = window.location.origin;
                    const params = new URLSearchParams();
                    params.append('format', format);
                    if (userToken) {
                      params.append('token', userToken);
                    } else if (securityConfig?.enableAuth && securityConfig.token) {
                      params.append('token', securityConfig.token);
                    }
                    if (configMode !== 'standard') {
                      params.append('mode', configMode);
                    }
                    // 使用 /adult/ 路径前缀
                    const url = `${baseUrl}/adult/api/tvbox?${params.toString()}`;

                    const success = await copyToClipboard(url);
                    if (success) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className="group flex items-center justify-between px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xl">⭐</span>
                    <div className="text-left">
                      <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                        完整内容模式
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        路径前缀（OrionTV）
                      </div>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </button>
              </div>

              <div className="mt-3 p-2.5 bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                <p className="text-xs text-purple-800 dark:text-purple-200 mb-1.5">
                  💡 <strong>提示：</strong>点击按钮即可复制对应模式的配置链接
                </p>
                <ul className="text-xs text-purple-700 dark:text-purple-300 space-y-0.5 ml-4">
                  <li>🏠 <strong>家庭安全模式：</strong>过滤成人内容（推荐家庭用户）</li>
                  <li>🔓 <strong>URL 参数模式：</strong>适用于 TVBox 等标准客户端</li>
                  <li>⭐ <strong>路径前缀模式：</strong>适用于 OrionTV 等不支持 URL 参数的客户端</li>
                </ul>
              </div>
            </div>
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

        {/* 配置诊断 - 多标签页 */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
          {/* 标签页头部 */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 pb-0">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  🔍 配置诊断
                </h2>
              </div>
              <button
                onClick={handleRefreshJar}
                disabled={refreshingJar}
                className="w-full sm:w-auto px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors text-sm"
              >
                {refreshingJar ? '刷新中...' : '🔄 刷新 JAR'}
              </button>
            </div>

            {/* 标签导航 */}
            <div className="flex gap-2 px-4 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveTab('basic')}
                className={`flex-shrink-0 px-4 py-2 font-medium transition-colors border-b-2 whitespace-nowrap ${
                  activeTab === 'basic'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                基础诊断
              </button>
              <button
                onClick={() => setActiveTab('smart-health')}
                className={`flex-shrink-0 px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'smart-health'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Heart className="w-4 h-4" />
                智能健康
              </button>
              <button
                onClick={() => setActiveTab('jar-fix')}
                className={`flex-shrink-0 px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'jar-fix'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Wrench className="w-4 h-4" />
                源修复
              </button>
              <button
                onClick={() => setActiveTab('deep-diagnostic')}
                className={`flex-shrink-0 px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'deep-diagnostic'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Search className="w-4 h-4" />
                深度诊断
              </button>
            </div>
          </div>

          {/* 标签页内容 */}
          <div className="p-6">
            {/* 基础诊断标签页 */}
            {activeTab === 'basic' && (
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    检查配置基本信息和 Spider JAR 状态
                  </p>
                  <button
                    onClick={handleDiagnose}
                    disabled={diagnosing}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex-shrink-0"
                  >
                    {diagnosing ? '诊断中...' : '开始诊断'}
                  </button>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
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
                  <div className="p-4 bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Spider JAR 状态
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300">
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

                  {/* 本地代理信息 */}
                  {diagnosisResult.spider_backup && (
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300">🔄 本地代理端点</h3>
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                        所有 JAR 文件通过本地代理提供，避免国内直连 GitHub 失败
                      </p>
                      <div className="p-3 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-600">
                        <p className="font-mono text-xs text-blue-700 dark:text-blue-300 break-all">
                          {diagnosisResult.spider_backup}
                        </p>
                      </div>
                      <div className="mt-2 flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>TVBox 通过此代理下载 JAR，服务器自动从 GitHub 获取并缓存</span>
                      </div>
                    </div>
                  )}

                  {/* 服务器端备选源 */}
                  {diagnosisResult.spider_candidates && diagnosisResult.spider_candidates.length > 0 && (
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">服务器端备选源</h3>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                        这些是服务器自动选择的候选源，TVBox 无需直接访问，所有请求通过本地代理处理
                      </p>
                      <div className="space-y-1">
                        {diagnosisResult.spider_candidates.map((candidate, idx) => (
                          <div key={idx} className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all pl-4 border-l-2 border-gray-300 dark:border-gray-600">
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
            )}

            {/* 智能健康检查标签页 */}
            {activeTab === 'smart-health' && (
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    全面检测网络环境、JAR可达性和智能优化建议
                  </p>
                  <button
                    onClick={handleSmartHealthCheck}
                    disabled={smartHealthLoading}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex-shrink-0"
                  >
                    {smartHealthLoading ? '检查中...' : '开始检查'}
                  </button>
                </div>

                {smartHealthResult && (
                  <div className="space-y-4">
                    {smartHealthResult.error ? (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                        <p className="text-red-700 dark:text-red-300">{smartHealthResult.error}</p>
                      </div>
                    ) : (
                      <>
                        {/* 网络环境卡片 */}
                        <div className="p-4 bg-linear-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                          <div className="flex items-center gap-2 mb-3">
                            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <h3 className="font-semibold text-blue-900 dark:text-blue-300">网络环境</h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">环境类型</div>
                              <div className="text-gray-900 dark:text-gray-100 font-medium">
                                {smartHealthResult.network.environment === 'domestic' ? '🏠 国内网络' : '🌍 国际网络'}
                              </div>
                            </div>
                            <div>
                              <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">地区</div>
                              <div className="text-gray-900 dark:text-gray-100 font-medium">
                                {smartHealthResult.network.region}
                              </div>
                            </div>
                            <div>
                              <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">检测方式</div>
                              <div className="text-gray-900 dark:text-gray-100 font-mono text-xs">
                                {smartHealthResult.network.detectionMethod}
                              </div>
                            </div>
                            <div>
                              <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">优化状态</div>
                              <div className="text-green-600 dark:text-green-400 font-medium">
                                {smartHealthResult.network.optimized ? '✓ 已优化' : '○ 未优化'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 健康分数卡片 */}
                        <div className="p-4 bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
                                <h3 className="font-semibold text-green-900 dark:text-green-300">健康分数</h3>
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {smartHealthResult.reachability.successful}/{smartHealthResult.reachability.total_tested} 源可用
                              </div>
                            </div>
                            <div className="text-center">
                              <div className={`text-5xl font-bold ${
                                smartHealthResult.reachability.health_score >= 75
                                  ? 'text-green-600 dark:text-green-400'
                                  : smartHealthResult.reachability.health_score >= 50
                                  ? 'text-yellow-600 dark:text-yellow-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {smartHealthResult.reachability.health_score}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {smartHealthResult.status.overall === 'excellent'
                                  ? '优秀'
                                  : smartHealthResult.status.overall === 'good'
                                  ? '良好'
                                  : '需关注'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* JAR可达性测试 */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">JAR 源可达性测试</h3>
                          <div className="space-y-2">
                            {smartHealthResult.reachability.tests.map((test, idx) => (
                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  {test.success ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-mono text-gray-600 dark:text-gray-300 break-words [overflow-wrap:anywhere]">
                                      {test.url.split('/').slice(-3).join('/')}
                                    </div>
                                    {test.error && (
                                      <div className="text-xs text-red-500 dark:text-red-400 break-words [overflow-wrap:anywhere]">{test.error}</div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-3 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                  {test.success && (
                                    <>
                                      <div className="flex items-center gap-1 whitespace-nowrap">
                                        <Clock className="w-3 h-3" />
                                        {test.responseTime}ms
                                      </div>
                                      {test.size && (
                                        <div className="whitespace-nowrap">{Math.round(test.size / 1024)}KB</div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 智能建议 */}
                        <div className="p-4 bg-linear-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                          <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-3">💡 智能建议</h3>
                          <ul className="space-y-2">
                            {smartHealthResult.recommendations.map((rec, idx) => (
                              <li key={idx} className="text-sm text-purple-700 dark:text-purple-300 flex items-start gap-2">
                                <span className="shrink-0 mt-1">•</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Spider状态概览 */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">当前 Spider JAR</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            <div className="text-gray-600 dark:text-gray-400">来源:</div>
                            <div className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">
                              {smartHealthResult.spider.current.source}
                            </div>
                            <div className="text-gray-600 dark:text-gray-400">状态:</div>
                            <div className={smartHealthResult.spider.current.success ? 'text-green-600 dark:text-green-400 font-medium' : 'text-yellow-600 dark:text-yellow-400 font-medium'}>
                              {smartHealthResult.spider.current.success ? '✓ 成功' : '⚡ 备用'}
                            </div>
                            <div className="text-gray-600 dark:text-gray-400">大小:</div>
                            <div className="text-gray-900 dark:text-gray-100 font-medium">
                              {Math.round(smartHealthResult.spider.current.size / 1024)}KB
                            </div>
                            <div className="text-gray-600 dark:text-gray-400">尝试次数:</div>
                            <div className="text-gray-900 dark:text-gray-100 font-medium">
                              {smartHealthResult.spider.current.tried_sources}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {!smartHealthResult && !smartHealthLoading && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    点击"开始检查"进行智能健康诊断
                  </p>
                )}
              </div>
            )}

            {/* JAR源修复标签页 */}
            {activeTab === 'jar-fix' && (
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    测试所有 JAR 源并提供修复建议
                  </p>
                  <button
                    onClick={handleJarFix}
                    disabled={jarFixLoading}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex-shrink-0"
                  >
                    {jarFixLoading ? '诊断中...' : '开始诊断'}
                  </button>
                </div>

                {jarFixResult && (
                  <div className="space-y-4">
                    {jarFixResult.error ? (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                        <p className="text-red-700 dark:text-red-300">{jarFixResult.error}</p>
                        {jarFixResult.emergency_recommendations && (
                          <ul className="mt-3 space-y-1 text-sm">
                            {jarFixResult.emergency_recommendations.map((rec, idx) => (
                              <li key={idx} className="text-red-600 dark:text-red-400">• {rec}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* 测试概览 */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 text-center">
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                              {jarFixResult.summary.total_tested}
                            </div>
                            <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">测试总数</div>
                          </div>
                          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700 text-center">
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {jarFixResult.summary.successful}
                            </div>
                            <div className="text-xs text-green-700 dark:text-green-300 mt-1">成功</div>
                          </div>
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700 text-center">
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                              {jarFixResult.summary.failed}
                            </div>
                            <div className="text-xs text-red-700 dark:text-red-300 mt-1">失败</div>
                          </div>
                        </div>

                        {/* 网络质量评估 */}
                        <div className={`p-4 rounded-lg border ${
                          jarFixResult.status.network_quality === 'good'
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                            : jarFixResult.status.network_quality === 'fair'
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                        }`}>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-white">网络质量</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                平均响应: {Math.round(jarFixResult.summary.avg_response_time)}ms
                              </div>
                            </div>
                            <div className={`text-2xl font-bold ${
                              jarFixResult.status.network_quality === 'good'
                                ? 'text-green-600 dark:text-green-400'
                                : jarFixResult.status.network_quality === 'fair'
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                              {jarFixResult.status.network_quality === 'good'
                                ? '优秀'
                                : jarFixResult.status.network_quality === 'fair'
                                ? '良好'
                                : '较差'}
                            </div>
                          </div>
                        </div>

                        {/* 推荐源 */}
                        {jarFixResult.recommended_sources.length > 0 && (
                          <div className="p-4 bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700">
                            <h3 className="font-semibold text-green-900 dark:text-green-300 mb-3">✅ 推荐源 (Top 3)</h3>
                            <div className="space-y-2">
                              {jarFixResult.recommended_sources.map((source, idx) => (
                                <div key={idx} className="p-3 bg-white dark:bg-gray-800 rounded border border-green-200 dark:border-green-700">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
                                    <div className="font-medium text-green-700 dark:text-green-300">#{idx + 1} {source.name}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                                      <Clock className="w-3 h-3" />
                                      {source.responseTime}ms
                                    </div>
                                  </div>
                                  <div className="text-xs font-mono text-gray-600 dark:text-gray-400 break-words [overflow-wrap:anywhere]">
                                    {source.url}
                                  </div>
                                  {source.size && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      大小: {Math.round(source.size / 1024)}KB
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 详细测试结果 */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">详细测试结果</h3>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {jarFixResult.test_results.map((test, idx) => (
                              <div key={idx} className={`p-2 rounded border ${
                                test.success
                                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                              }`}>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {test.success ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                                        {test.name}
                                      </div>
                                      <div className="text-xs font-mono text-gray-600 dark:text-gray-400 break-words [overflow-wrap:anywhere]">
                                        {test.url}
                                      </div>
                                      {test.error && (
                                        <div className="text-xs text-red-600 dark:text-red-400 mt-1 break-words [overflow-wrap:anywhere]">{test.error}</div>
                                      )}
                                    </div>
                                  </div>
                                  {test.success && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                                      <Clock className="w-3 h-3" />
                                      {test.responseTime}ms
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 三层建议系统 */}
                        <div className="space-y-3">
                          {/* 立即建议 */}
                          {jarFixResult.recommendations.immediate.length > 0 && (
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">🎯 立即建议</h3>
                              <ul className="space-y-1">
                                {jarFixResult.recommendations.immediate.map((rec, idx) => (
                                  <li key={idx} className="text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
                                    <span className="shrink-0 mt-1">•</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* 配置建议 */}
                          {jarFixResult.recommendations.configuration.length > 0 && (
                            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                              <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">⚙️ 配置建议</h3>
                              <ul className="space-y-1">
                                {jarFixResult.recommendations.configuration.map((rec, idx) => (
                                  <li key={idx} className="text-sm text-purple-700 dark:text-purple-300 flex items-start gap-2">
                                    <span className="shrink-0 mt-1">•</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* 故障排查 */}
                          {jarFixResult.recommendations.troubleshooting.length > 0 && (
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                              <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">🔧 故障排查</h3>
                              <ul className="space-y-1">
                                {jarFixResult.recommendations.troubleshooting.map((rec, idx) => (
                                  <li key={idx} className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                                    <span className="shrink-0 mt-1">•</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* 修复后的配置URL */}
                        {jarFixResult.fixed_config_urls.length > 0 && (
                          <div className="p-4 bg-linear-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700">
                            <h3 className="font-semibold text-green-900 dark:text-green-300 mb-2">🔗 优化配置链接</h3>
                            <div className="space-y-2">
                              {jarFixResult.fixed_config_urls.map((url, idx) => (
                                <div key={idx} className="p-2 bg-white dark:bg-gray-800 rounded border border-green-200 dark:border-green-700">
                                  <div className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
                                    {url}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {!jarFixResult && !jarFixLoading && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    点击"开始诊断"测试所有 JAR 源并获取修复建议
                  </p>
                )}
              </div>
            )}

            {/* 深度诊断标签页 */}
            {activeTab === 'deep-diagnostic' && (
              <div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    深度测试 JAR 文件源的可用性和性能，包含文件头验证和 MD5 校验
                  </p>
                  <button
                    onClick={handleDeepDiagnostic}
                    disabled={deepDiagnosticLoading}
                    className="w-full sm:w-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex-shrink-0"
                  >
                    {deepDiagnosticLoading ? '诊断中...' : '开始诊断'}
                  </button>
                </div>

                {/* 自定义 JAR URL 测试 */}
                <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h3 className="font-semibold text-purple-900 dark:text-purple-300">🔧 自定义 JAR 代理测试</h3>
                  </div>

                  {hasCustomJarConfig ? (
                    <>
                      <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded">
                        <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                          ✅ 管理员已配置自定义 JAR URL
                        </p>
                        <div className="p-2 bg-white dark:bg-gray-800 rounded border border-blue-300 dark:border-blue-600">
                          <p className="font-mono text-xs text-gray-900 dark:text-white break-all">
                            {customJarUrl}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                        测试此自定义 JAR 通过本地代理的可用性
                      </p>
                      <div className="flex justify-end">
                        <button
                          onClick={handleTestCustomJar}
                          disabled={customJarTestLoading}
                          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                        >
                          {customJarTestLoading ? '测试中...' : '测试代理'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded">
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        ⚠️ 未配置自定义 JAR URL，使用默认源。如需配置，请前往管理后台 → TVBox 安全配置
                      </p>
                    </div>
                  )}

                  {/* 自定义 JAR 测试结果 */}
                  {customJarTestResult && (
                    <div className={`mt-3 p-3 rounded-lg border ${
                      customJarTestResult.success
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                    }`}>
                      <div className="flex items-start gap-2 mb-2">
                        {customJarTestResult.success ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className={`font-semibold ${
                            customJarTestResult.success
                              ? 'text-green-900 dark:text-green-300'
                              : 'text-red-900 dark:text-red-300'
                          }`}>
                            {customJarTestResult.success ? '✅ 代理测试成功' : '❌ 代理测试失败'}
                          </p>
                          <div className="mt-2 space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">原始 URL:</span>
                              <span className="font-mono text-xs text-gray-900 dark:text-white break-all ml-2">{customJarTestResult.url}</span>
                            </div>
                            {customJarTestResult.success && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">响应时间:</span>
                                  <span className="font-semibold text-gray-900 dark:text-white">{customJarTestResult.responseTime}ms</span>
                                </div>
                                {customJarTestResult.size && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">文件大小:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">{Math.round(parseInt(customJarTestResult.size) / 1024)}KB</span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">代理状态:</span>
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {customJarTestResult.spiderSuccess === 'true' ? '✅ 成功' : '⚠️ 降级'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">缓存状态:</span>
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {customJarTestResult.cached === 'true' ? '已缓存' : '新获取'}
                                  </span>
                                </div>
                              </>
                            )}
                            {customJarTestResult.error && (
                              <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded">
                                <span className="text-red-700 dark:text-red-300 text-xs">{customJarTestResult.error}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {deepDiagnosticResult && (
                  <div className="space-y-4">
                    {deepDiagnosticResult.error ? (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                        <p className="text-red-700 dark:text-red-300">{deepDiagnosticResult.error}</p>
                      </div>
                    ) : (
                      <>
                        {/* 环境信息 */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                            <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">网络环境</div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {deepDiagnosticResult.environment.isDomestic ? '🇨🇳 国内' : '🌐 国际'}
                            </div>
                          </div>
                          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                            <div className="text-xs text-green-600 dark:text-green-400 mb-1">时区</div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {deepDiagnosticResult.environment.timezone}
                            </div>
                          </div>
                          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                            <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">测试时间</div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {new Date(deepDiagnosticResult.timestamp).toLocaleTimeString('zh-CN')}
                            </div>
                          </div>
                        </div>

                        {/* 测试统计 */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3 bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg text-center">
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 break-words">
                              {deepDiagnosticResult.summary.totalTested}
                            </div>
                            <div className="text-xs text-blue-700 dark:text-blue-300 mt-1 break-words">总测试源</div>
                          </div>
                          <div className="p-3 bg-linear-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg text-center">
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400 break-words">
                              {deepDiagnosticResult.summary.successCount}
                            </div>
                            <div className="text-xs text-green-700 dark:text-green-300 mt-1 break-words">可用源</div>
                          </div>
                          <div className="p-3 bg-linear-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg text-center">
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400 break-words">
                              {deepDiagnosticResult.summary.failedCount}
                            </div>
                            <div className="text-xs text-red-700 dark:text-red-300 mt-1 break-words">失败源</div>
                          </div>
                          <div className="p-3 bg-linear-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg text-center">
                            <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400 break-words">
                              {Math.round(deepDiagnosticResult.summary.averageResponseTime)}ms
                            </div>
                            <div className="text-xs text-purple-700 dark:text-purple-300 mt-1 break-words">平均响应</div>
                          </div>
                        </div>

                        {/* 诊断建议 */}
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                          <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">💡 诊断建议</h3>
                          <ul className="space-y-1">
                            {deepDiagnosticResult.recommendations.map((rec: string, idx: number) => (
                              <li key={idx} className="text-sm text-yellow-700 dark:text-yellow-300 break-words [overflow-wrap:anywhere]">
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* 详细测试结果 */}
                        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">详细测试结果</h3>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {deepDiagnosticResult.jarTests.map((test: any, idx: number) => (
                              <div
                                key={idx}
                                className={`p-3 rounded border ${
                                  test.status === 'success'
                                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                                    : test.status === 'timeout'
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {test.status === 'success' ? (
                                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                                    )}
                                    <span className="text-sm font-medium text-gray-900 dark:text-white break-words">
                                      {test.name}
                                    </span>
                                  </div>
                                  <span
                                    className={`text-xs px-2 py-1 rounded whitespace-nowrap flex-shrink-0 ${
                                      test.status === 'success'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                        : test.status === 'timeout'
                                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                    }`}
                                  >
                                    {test.status === 'success'
                                      ? '✅ 可用'
                                      : test.status === 'timeout'
                                      ? '⏱️ 超时'
                                      : test.status === 'invalid'
                                      ? '⚠️ 无效'
                                      : '❌ 失败'}
                                  </span>
                                </div>

                                <div className="text-xs font-mono text-gray-600 dark:text-gray-400 mb-2 break-words [overflow-wrap:anywhere]">
                                  {test.url}
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">响应:</span>
                                    <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                      {test.responseTime}ms
                                    </span>
                                  </div>
                                  {test.httpStatus && (
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">状态:</span>
                                      <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                        {test.httpStatus}
                                      </span>
                                    </div>
                                  )}
                                  {test.fileSize && (
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">大小:</span>
                                      <span className="ml-1 font-medium text-gray-900 dark:text-white">
                                        {Math.round(test.fileSize / 1024)}KB
                                      </span>
                                    </div>
                                  )}
                                  {test.isValidJar !== undefined && (
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">验证:</span>
                                      <span
                                        className={`ml-1 font-medium ${
                                          test.isValidJar
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400'
                                        }`}
                                      >
                                        {test.isValidJar ? '✓ 有效JAR' : '✗ 无效'}
                                      </span>
                                    </div>
                                  )}
                                  {test.md5 && (
                                    <div className="col-span-2 sm:col-span-4">
                                      <span className="text-gray-500 dark:text-gray-400">MD5:</span>
                                      <span className="ml-1 font-mono text-gray-900 dark:text-white break-words [overflow-wrap:anywhere]">
                                        {test.md5}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {test.error && (
                                  <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-700 dark:text-red-300 break-words [overflow-wrap:anywhere]">
                                    <strong>错误:</strong> {test.error}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {!deepDiagnosticResult && !deepDiagnosticLoading && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    点击"开始诊断"进行深度 JAR 源测试（包含文件头验证和 MD5 校验）
                  </p>
                )}
              </div>
            )}
          </div>
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
        <div className="bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 mb-6 border border-blue-200 dark:border-blue-700">
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
                <li>• 自动探测多源（国内CDN + GitHub）</li>
                <li>• 智能重试 + 失败源记录</li>
                <li>• 动态缓存（成功 4h / 失败 10min）</li>
                <li>• JAR 文件验证 + 真实 MD5</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Heart className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                智能诊断系统
              </h3>
              <ul className="text-gray-600 dark:text-gray-400 space-y-1 ml-6">
                <li>• 网络环境智能检测</li>
                <li>• JAR 源健康评分</li>
                <li>• 文件头验证 + MD5 校验</li>
                <li>• 个性化优化建议</li>
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
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: Spider JAR 加载失败怎么办？</h3>
              <p className="text-gray-600 dark:text-gray-400">A: 依次使用"智能健康"→"源修复"→"深度诊断"，系统会自动检测问题并给出解决方案</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: 各个诊断功能有什么区别？</h3>
              <p className="text-gray-600 dark:text-gray-400">A: 基础诊断看配置信息、智能健康看整体状态、源修复给优化建议、深度诊断含文件验证和MD5校验</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: 源切换卡顿怎么办？</h3>
              <p className="text-gray-600 dark:text-gray-400">A: 使用快速模式（移除超时配置，优化切换速度）</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Q: TVBox 报错或不兼容？</h3>
              <p className="text-gray-600 dark:text-gray-400">A: 切换到精简模式（仅核心配置，提高兼容性）</p>
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