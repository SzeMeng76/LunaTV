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
      return '边下边存，无大小限制，适合超大文件';
    case 'disabled':
      return '内存下载，适合小文件（< 500MB）';
    default:
      return '';
  }
}
