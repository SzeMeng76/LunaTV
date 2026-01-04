/**
 * 下载器类型兼容层
 * 将 MoonTV 的新类型映射到 LunaTV 原有的类型名称
 */

// 从新的下载器导出类型
export type {
  M3U8Task as M3U8TaskBase,
  DownloadProgress,
  StreamSaverMode,
} from './m3u8-downloader';

export {
  parseM3U8,
  downloadM3U8Video,
  PauseResumeController,
  aesDecrypt,
  applyURL,
} from './m3u8-downloader';

// 从检测器导出
export type { StreamModeSupport } from './stream-mode-detector';
export {
  getBestStreamMode,
  detectStreamModeSupport,
  getStreamModeName,
  getStreamModeIcon,
  getStreamModeDescription,
} from './stream-mode-detector';

// 从新的下载器导入基础类型
import type { M3U8Task as M3U8TaskBase } from './m3u8-downloader';

/**
 * 扩展的 M3U8 任务类型（包含 UI 需要的字段）
 */
export interface M3U8DownloadTask extends M3U8TaskBase {
  id: string;
  status: 'ready' | 'downloading' | 'pause' | 'done' | 'error';
}

/**
 * @deprecated 新版本不再使用类的方式，请使用函数式 API
 *
 * 迁移指南：
 * - createTask() → parseM3U8()
 * - startTask() → downloadM3U8Video()
 * - pauseTask() → pauseController.pause()
 * - resumeTask() → pauseController.resume()
 */
export class M3U8Downloader {
  // 空的兼容类，防止编译错误
  // 实际使用时应该迁移到新的函数式 API
}
