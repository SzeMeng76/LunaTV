/**
 * 边下边存模式检测工具
 * 自动检测浏览器支持的最佳下载模式
 */

import type { StreamSaverMode } from './m3u8-downloader';

export interface StreamModeSupport {
  fileSystem: boolean;
  serviceWorker: boolean;
  blob: boolean; // 总是支持
}

/**
 * 检测 File System Access API 支持
 */
export function supportsFileSystemAccess(): boolean {
  if (typeof window === 'undefined') return false;
  return 'showSaveFilePicker' in window;
}

/**
 * 检测 Service Worker 支持
 */
export function supportsServiceWorker(): boolean {
  if (typeof window === 'undefined') return false;

  // 需要 HTTPS 或 localhost
  const isSecureContext = window.isSecureContext;
  const hasServiceWorker = 'serviceWorker' in navigator;

  return isSecureContext && hasServiceWorker;
}

/**
 * 检测所有模式支持情况
 */
export function detectStreamModeSupport(): StreamModeSupport {
  return {
    fileSystem: supportsFileSystemAccess(),
    serviceWorker: supportsServiceWorker(),
    blob: true,
  };
}

/**
 * 获取最佳下载模式
 * 优先级：file-system > service-worker > disabled
 */
export function getBestStreamMode(): StreamSaverMode {
  if (supportsFileSystemAccess()) {
    return 'file-system';
  }

  if (supportsServiceWorker()) {
    return 'service-worker';
  }

  return 'disabled';
}

/**
 * 获取模式显示名称
 */
export function getStreamModeName(mode: StreamSaverMode): string {
  switch (mode) {
    case 'file-system':
      return '文件系统直写';
    case 'service-worker':
      return 'Service Worker';
    case 'disabled':
      return '普通模式';
    default:
      return '未知';
  }
}

/**
 * 获取模式图标
 */
export function getStreamModeIcon(mode: StreamSaverMode): string {
  switch (mode) {
    case 'file-system':
      return '🚀';
    case 'service-worker':
      return '⚡';
    case 'disabled':
      return '📦';
    default:
      return '❓';
  }
}

/**
 * 获取模式描述
 */
export function getStreamModeDescription(mode: StreamSaverMode): string {
  switch (mode) {
    case 'file-system':
      return '直接写入磁盘，无大小限制（推荐）';
    case 'service-worker':
      return '边下边存，无大小限制；⚠️ 浏览器会在约5分钟无活动后关闭 Service Worker，长视频或慢网络下可能导致下载不完整';
    case 'disabled':
      return '内存下载，适合小文件（< 500MB）';
    default:
      return '';
  }
}

/**
 * 估算 Service Worker 模式在给定时长/并发下是否有较高的“存活超时”风险
 * 浏览器通常在 Service Worker 空闲/运行约 5 分钟后将其终止，
 * 一旦终止，边下边存会静默丢失后续数据但不会报错
 * @param durationSecond 视频时长（秒）
 * @param concurrency 并发下载数
 */
export function estimateServiceWorkerRisk(
  durationSecond: number,
  concurrency: number
): boolean {
  // 粗略估算：按 2Mbps 码率、6 线程并发为基准，估算下载耗时
  const estimatedBitrateBps = 2 * 1024 * 1024; // 2Mbps
  const estimatedTotalBytes = (durationSecond * estimatedBitrateBps) / 8;
  const baselineConcurrency = 6;
  const effectiveConcurrency = Math.max(1, concurrency || baselineConcurrency);
  // 假设单线程下载速度约 1MB/s，随并发数线性提升（保守估计）
  const estimatedSpeedBps = 1 * 1024 * 1024 * effectiveConcurrency;
  const estimatedDownloadSeconds = estimatedTotalBytes / estimatedSpeedBps;

  // 预计下载耗时超过 4 分钟（留出安全余量），认为有较高的 SW 超时风险
  return estimatedDownloadSeconds > 240;
}
