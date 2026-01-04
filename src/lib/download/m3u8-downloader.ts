/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M3U8 视频下载工具
 * 基于 get-m3u8 项目的核心功能改编
 */

import CryptoJS from 'crypto-js';

import { StreamingTransmuxer, transmuxTSToMP4 } from './mp4-transmuxer';

export type StreamSaverMode = 'disabled' | 'service-worker' | 'file-system';

/**
 * 暂停/恢复控制器
 * 用于控制下载任务的暂停和恢复，而不是直接销毁下载线程
 */
export class PauseResumeController {
  private isPaused = false;
  private resumeResolve: (() => void) | null = null;
  private pausePromise: Promise<void> | null = null;

  pause() {
    if (!this.isPaused) {
      this.isPaused = true;
      this.pausePromise = new Promise<void>((resolve) => {
        this.resumeResolve = resolve;
      });
    }
  }

  resume() {
    if (this.isPaused && this.resumeResolve) {
      this.isPaused = false;
      this.resumeResolve();
      this.resumeResolve = null;
      this.pausePromise = null;
    }
  }

  async waitIfPaused(): Promise<void> {
    if (this.isPaused && this.pausePromise) {
      await this.pausePromise;
    }
  }

  getPaused(): boolean {
    return this.isPaused;
  }

  destroy() {
    this.isPaused = false;
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
    }
    this.pausePromise = null;
  }
}

export interface M3U8Task {
  url: string;
  title: string;
  type: 'TS' | 'MP4';
  tsUrlList: string[];
  finishList: Array<{ title: string; status: '' | 'downloading' | 'success' | 'error'; retryCount?: number }>;
  downloadIndex: number;
  finishNum: number;
  errorNum: number;
  aesConf: {
    method: string;
    uri: string;
    iv: string;
    key: string;
  };
  durationSecond: number;
  rangeDownload: {
    startSegment: number;
    endSegment: number;
    targetSegment: number;
  };
  totalSize?: number;
  downloadedSegments?: Map<number, ArrayBuffer>;
}

/**
 * 应用URL - 处理相对路径和绝对路径
 */
export function applyURL(targetURL: string, baseURL: string): string {
  if (/^http/.test(targetURL)) {
    return targetURL;
  }
  const urlObj = new URL(baseURL);
  const protocol = urlObj.protocol;
  const host = urlObj.host;
  
  if (targetURL.startsWith('/')) {
    return `${protocol}//${host}${targetURL}`;
  }
  
  const pathArr = baseURL.split('/');
  pathArr.pop();
  return `${pathArr.join('/')}/${targetURL}`;
}

/**
 * 检查是否为主播放列表（Master Playlist）
 */
function isMasterPlaylist(m3u8Content: string): boolean {
  // 主播放列表包含 #EXT-X-STREAM-INF 标签
  return m3u8Content.includes('#EXT-X-STREAM-INF');
}

/**
 * 从主播放列表中提取子播放列表URL
 */
function extractSubPlaylistUrl(m3u8Content: string, baseUrl: string): string | null {
  const lines = m3u8Content.split('\n');
  
  // 查找所有子播放列表
  const playlists: Array<{ url: string; bandwidth?: number; resolution?: string }> = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      // 提取带宽信息
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      const resolutionMatch = line.match(/RESOLUTION=([\dx]+)/);
      
      // 下一行应该是播放列表URL
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          playlists.push({
            url: applyURL(nextLine, baseUrl),
            bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1]) : undefined,
            resolution: resolutionMatch ? resolutionMatch[1] : undefined,
          });
        }
      }
    }
  }
  
  if (playlists.length === 0) {
    return null;
  }
  
  // 优先选择最高带宽的播放列表
  playlists.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
  
  return playlists[0].url;
}

/**
 * 解析M3U8文件（支持主播放列表自动解析）
 */
export async function parseM3U8(url: string, depth = 0): Promise<M3U8Task> {
  // 防止无限递归
  if (depth > 5) {
    throw new Error('M3U8 解析层级过深，可能存在循环引用');
  }

  const response = await fetch(url);
  const m3u8Str = await response.text();

  if (m3u8Str.substring(0, 7).toUpperCase() !== '#EXTM3U') {
    throw new Error('无效的 m3u8 链接');
  }

  // 检查是否为主播放列表
  if (isMasterPlaylist(m3u8Str)) {
    const subPlaylistUrl = extractSubPlaylistUrl(m3u8Str, url);
    
    if (!subPlaylistUrl) {
      throw new Error('无法从主播放列表中提取子播放列表');
    }
    
    // 递归解析子播放列表
    return parseM3U8(subPlaylistUrl, depth + 1);
  }

  const task: M3U8Task = {
    url,
    title: extractTitleFromUrl(url),
    type: 'TS',
    tsUrlList: [],
    finishList: [],
    downloadIndex: 0,
    finishNum: 0,
    errorNum: 0,
    aesConf: {
      method: '',
      uri: '',
      iv: '',
      key: '',
    },
    durationSecond: 0,
    rangeDownload: {
      startSegment: 1,
      endSegment: 0,
      targetSegment: 0,
    },
    totalSize: 0,
  };

  // 提取 ts 视频片段地址
  const lines = m3u8Str.split('\n');
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      task.durationSecond += parseFloat(line.split('#EXTINF:')[1]);
    } else if (/^[^#]/.test(line) && line.trim()) {
      const tsUrl = applyURL(line.trim(), url);
      task.tsUrlList.push(tsUrl);
      task.finishList.push({ title: line.trim(), status: '' });
    }
  }

  task.rangeDownload.endSegment = task.tsUrlList.length;
  task.rangeDownload.targetSegment = task.tsUrlList.length;

  // 估算总文件大小（基于时长和比特率）
  // 假设平均比特率为 2Mbps (TS 流媒体的常见值)
  const estimatedBitrate = 2 * 1024 * 1024 / 8; // 2Mbps 转为字节/秒
  task.totalSize = Math.round(task.durationSecond * estimatedBitrate);

  // 检测 AES 加密
  if (m3u8Str.includes('#EXT-X-KEY')) {
    const methodMatch = m3u8Str.match(/METHOD=([^,\s]+)/);
    const uriMatch = m3u8Str.match(/URI="([^"]+)"/);
    const ivMatch = m3u8Str.match(/IV=([^,\s]+)/);

    task.aesConf.method = methodMatch ? methodMatch[1] : '';
    task.aesConf.uri = uriMatch ? applyURL(uriMatch[1], url) : '';
    task.aesConf.iv = ivMatch ? ivMatch[1] : '';

    // 获取 AES key
    if (task.aesConf.uri) {
      const keyResponse = await fetch(task.aesConf.uri);
      const keyArrayBuffer = await keyResponse.arrayBuffer();
      task.aesConf.key = arrayBufferToWordArray(keyArrayBuffer);
    }
  }

  return task;
}

/**
 * 从URL中提取标题
 */
function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const title = urlObj.searchParams.get('title');
    if (title) return title;
  } catch (e) {
    // ignore
  }
  
  const now = new Date();
  return `video_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
}

/**
 * ArrayBuffer 转 WordArray (CryptoJS格式)
 */
function arrayBufferToWordArray(arrayBuffer: ArrayBuffer): any {
  const u8 = new Uint8Array(arrayBuffer);
  const len = u8.length;
  const words: number[] = [];
  for (let i = 0; i < len; i += 1) {
    words[i >>> 2] |= (u8[i] & 0xff) << (24 - (i % 4) * 8);
  }
  return CryptoJS.lib.WordArray.create(words, len);
}

/**
 * AES 解密
 */
export function aesDecrypt(data: ArrayBuffer, key: any, iv: string): ArrayBuffer {
  if (!key) return data;

  const wordArray = arrayBufferToWordArray(data);
  const ivWordArray = iv ? CryptoJS.enc.Hex.parse(iv.replace('0x', '')) : CryptoJS.lib.WordArray.create();

  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: wordArray } as any,
    key,
    {
      iv: ivWordArray,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  // 将 WordArray 转回 ArrayBuffer
  const typedArray = new Uint8Array(decrypted.sigBytes);
  const words = decrypted.words;
  for (let i = 0; i < decrypted.sigBytes; i++) {
    typedArray[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return typedArray.buffer;
}

/**
 * 下载单个 TS 片段
 */
export async function downloadTsSegment(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status}`);
  }
  return response.arrayBuffer();
}

/**
 * 合并所有片段为 Blob
 */
export function mergeSegments(segments: ArrayBuffer[], type: 'TS' | 'MP4'): Blob {
  const mimeType = type === 'MP4' ? 'video/mp4' : 'video/MP2T';
  return new Blob(segments, { type: mimeType });
}

/**
 * 触发浏览器下载
 */
export function triggerDownload(blob: Blob, filename: string, type: 'TS' | 'MP4'): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // 移除文件名中已有的视频扩展名，避免重复
  const cleanFilename = filename.replace(/\.(mp4|ts|m3u8)$/i, '');
  a.download = `${cleanFilename}.${type.toLowerCase()}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  // 延迟清理，确保下载已开始
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * 下载进度回调类型
 */
export interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  status: 'downloading' | 'processing' | 'done' | 'error';
  message?: string;
}

/**
 * 下载M3U8视频（支持多线程并发）
 */
export async function downloadM3U8Video(
  task: M3U8Task,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
  pauseResumeController?: PauseResumeController, // 暂停/恢复控制器
  concurrency = 6, // 默认6个并发
  streamMode: StreamSaverMode = 'disabled', // 边下边存模式
  maxRetries = 3, // 最大重试次数
  completeStreamRef?: { current: (() => Promise<void>) | null } // 完成流函数引用（用于边下边存模式立即保存）
): Promise<void> {
  const { startSegment, endSegment } = task.rangeDownload;
  const totalSegments = endSegment - startSegment + 1;
  
  // 计算范围下载的实际时长
  const segmentDuration = task.durationSecond / task.tsUrlList.length;
  const rangeDuration = totalSegments * segmentDuration;
  
  // 流式写入器（边下边存模式）
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  // MP4 流式转码器
  let streamingTransmuxer: StreamingTransmuxer | null = null;
  // 边下边存模式：待写入队列（按顺序写入）
  const pendingWrites = new Map<number, ArrayBuffer | 'failed'>();
  let nextWriteIndex = startSegment - 1; // 下一个要写入的片段索引
  
  if (streamMode !== 'disabled') {
    try {
      // 移除标题中已有的视频扩展名，避免重复
      const cleanTitle = task.title.replace(/\.(mp4|ts|m3u8)$/i, '');
      const ext = task.type === 'MP4' ? '.mp4' : '.ts';
      // 强制加正确后缀
      let filename = cleanTitle + ext;
      if (!filename.toLowerCase().endsWith(ext)) filename += ext;

      // 估算文件大小（如果可能）
      const estimatedSize = task.totalSize || undefined;

      let stream: WritableStream<Uint8Array> | null = null;

      // 根据用户选择的模式创建写入流
      if (streamMode === 'service-worker') {
        // 使用 Service Worker 模式
        const { createWriteStream } = await import('./stream-saver');
        stream = createWriteStream(filename);
        // eslint-disable-next-line no-console
        console.log('✅ 使用 Service Worker 流式下载');
      } else if (streamMode === 'file-system') {
        // 使用 File System Access API
        const { createFileSystemWriteStream } = await import('./stream-saver-fallback');
        stream = await createFileSystemWriteStream(filename, estimatedSize);
        if (stream) {
          // eslint-disable-next-line no-console
          console.log('✅ 使用文件系统直写');
        } else {
          throw new Error('用户取消了文件选择');
        }
      }

      if (stream) {
        writer = stream.getWriter();

        // 如果是 MP4 格式，初始化流式转码器
        if (task.type === 'MP4') {
          streamingTransmuxer = new StreamingTransmuxer(writer, rangeDuration);
          // eslint-disable-next-line no-console
          console.log('✅ 启用 MP4 流式转码');
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('创建流式写入器失败，降级为普通下载:', error);
      writer = null;
    }
  }
  
  let completedCount = 0;

  // 如果提供了完成流函数引用，设置完成流的函数（需要在 completedCount 和 writer 初始化后设置）
  if (completeStreamRef && streamMode !== 'disabled' && writer) {
    completeStreamRef.current = async () => {
      if (!writer) return;
      
      try {
        // 如果使用了流式转码器，需要先完成转码
        if (streamingTransmuxer) {
          await streamingTransmuxer.finish();
        } else {
          await writer.close();
        }
        
        onProgress?.({
          current: completedCount,
          total: totalSegments,
          percentage: 100,
          status: 'done',
          message: '下载完成！',
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('提前完成时关闭流失败:', error);
        throw error;
      }
    };
  }

  // 创建下载队列
  const downloadQueue: number[] = [];
  for (let i = startSegment - 1; i < endSegment; i++) {
    downloadQueue.push(i);
  }

  // 并发下载函数（带重试机制）
  const downloadSegment = async (index: number, retryCount = 0): Promise<void> => {
    const retryDelay = 1000; // 重试延迟（毫秒）
    
    if (signal?.aborted) {
      throw new Error('下载已取消');
    }

    // 检查是否暂停，如果暂停则等待恢复
    if (pauseResumeController) {
      await pauseResumeController.waitIfPaused();
    }

    // 标记为下载中
    task.finishList[index].status = 'downloading';
    task.finishList[index].retryCount = retryCount;

    try {
      // 在下载前再次检查暂停状态
      if (pauseResumeController) {
        await pauseResumeController.waitIfPaused();
      }
      if (signal?.aborted) {
        throw new Error('下载已取消');
      }

      let segmentData = await downloadTsSegment(task.tsUrlList[index], signal);

      // 下载完成后检查暂停状态，如果暂停则等待恢复
      if (pauseResumeController) {
        await pauseResumeController.waitIfPaused();
      }
      if (signal?.aborted) {
        throw new Error('下载已取消');
      }

      // AES 解密
      if (task.aesConf.key) {
        segmentData = aesDecrypt(segmentData, task.aesConf.key, task.aesConf.iv);
      }

      // 解密后再次检查暂停状态
      if (pauseResumeController) {
        await pauseResumeController.waitIfPaused();
      }
      if (signal?.aborted) {
        throw new Error('下载已取消');
      }

      // 如果使用边下边存，加入待写入队列
      if (writer) {
        // 将片段数据加入队列
        pendingWrites.set(index, segmentData);
        
        // 尝试按顺序写入
        while (pendingWrites.has(nextWriteIndex)) {
          // 在写入循环中检查暂停状态
          if (pauseResumeController) {
            await pauseResumeController.waitIfPaused();
          }
          if (signal?.aborted) {
            throw new Error('下载已取消');
          }

          const data = pendingWrites.get(nextWriteIndex);
          
          if (data === 'failed') {
            // 失败的片段，跳过
            // eslint-disable-next-line no-console
            console.warn(`⚠️ 跳过失败片段 ${nextWriteIndex + 1}`);
            pendingWrites.delete(nextWriteIndex);
            nextWriteIndex++;
            continue;
          }
          
          if (!data) {
            // 数据不存在，等待下载
            break;
          }
          
          // 写入成功下载的片段
          try {
            if (streamingTransmuxer) {
              await streamingTransmuxer.pushAndTransmux(new Uint8Array(data));
            } else {
              await writer.write(new Uint8Array(data));
            }
            pendingWrites.delete(nextWriteIndex);
            nextWriteIndex++;
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`片段 ${nextWriteIndex + 1} 写入流失败:`, error);
            // 写入失败意味着用户可能取消了下载，应该停止整个下载任务
            throw new Error(`写入失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } else {
        // 普通模式：保存到内存
        if (!task.downloadedSegments) {
          task.downloadedSegments = new Map();
        }
        task.downloadedSegments.set(index, segmentData);
      }
      
      // 在处理完数据后、更新状态前再次检查暂停状态
      if (pauseResumeController) {
        await pauseResumeController.waitIfPaused();
      }
      if (signal?.aborted) {
        throw new Error('下载已取消');
      }
      
      // 更新片段状态为成功
      task.finishList[index].status = 'success';
      
      completedCount++;
      task.finishNum++;

      // 更新进度
      onProgress?.({
        current: completedCount,
        total: totalSegments,
        percentage: Math.round((completedCount / totalSegments) * 100),
        status: 'downloading',
        message: `正在下载 ${completedCount}/${totalSegments} 个片段 (${concurrency} 线程)${retryCount > 0 ? ` [重试成功]` : ''}`,
      });
    } catch (error) {
      // 检查是否是写入失败（用户取消下载）
      const isWriteError = error instanceof Error && error.message.includes('写入失败');
      if (isWriteError) {
        // 写入失败意味着用户可能取消了下载，不应该重试，直接抛出错误停止下载
        // eslint-disable-next-line no-console
        console.error('写入流失败，用户可能取消了下载，停止下载任务');
        throw error;
      }

      // 如果还有重试机会，进行重试
      if (retryCount < maxRetries) {
        // eslint-disable-next-line no-console
        console.warn(`片段 ${index + 1} 下载失败，${retryDelay}ms 后进行第 ${retryCount + 1} 次重试...`);
        
        onProgress?.({
          current: completedCount,
          total: totalSegments,
          percentage: Math.round((completedCount / totalSegments) * 100),
          status: 'downloading',
          message: `片段 ${index + 1} 重试中 (${retryCount + 1}/${maxRetries})`,
        });
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return downloadSegment(index, retryCount + 1);
      }
      
      // 所有重试都失败
      task.errorNum++;
      // 标记片段为失败状态
      task.finishList[index].status = 'error';
      task.finishList[index].retryCount = retryCount;
      
      // eslint-disable-next-line no-console
      console.error(`片段 ${index + 1} 下载失败（已重试 ${maxRetries} 次）:`, error);
      
      // 边下边存模式下，失败的片段标记为 'failed' 并加入队列
      if (streamMode !== 'disabled' && writer) {
        // 标记为失败，以便按顺序跳过
        pendingWrites.set(index, 'failed');
        
        // 尝试继续写入后续片段
        while (pendingWrites.has(nextWriteIndex)) {
          // 在写入循环中检查暂停状态
          if (pauseResumeController) {
            await pauseResumeController.waitIfPaused();
          }
          if (signal?.aborted) {
            throw new Error('下载已取消');
          }

          const data = pendingWrites.get(nextWriteIndex);
          
          if (data === 'failed') {
            // 失败的片段，跳过
            // eslint-disable-next-line no-console
            console.warn(`⚠️ 跳过失败片段 ${nextWriteIndex + 1}`);
            pendingWrites.delete(nextWriteIndex);
            nextWriteIndex++;
            continue;
          }
          
          if (!data) {
            // 数据不存在，等待下载
            break;
          }
          
          // 写入成功下载的片段
          try {
            if (streamingTransmuxer) {
              await streamingTransmuxer.pushAndTransmux(new Uint8Array(data));
            } else {
              await writer.write(new Uint8Array(data));
            }
            pendingWrites.delete(nextWriteIndex);
            nextWriteIndex++;
          } catch (writeError) {
            // eslint-disable-next-line no-console
            console.error(`片段 ${nextWriteIndex + 1} 写入流失败:`, writeError);
            // 写入失败意味着用户可能取消了下载，应该停止整个下载任务
            throw new Error(`写入失败: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
          }
        }
        
        // eslint-disable-next-line no-console
        console.warn(`边下边存模式：已跳过失败片段 ${index + 1}，继续下载...`);
        onProgress?.({
          current: completedCount,
          total: totalSegments,
          percentage: Math.round((completedCount / totalSegments) * 100),
          status: 'downloading',
          message: `片段 ${index + 1} 失败已跳过 (已完成 ${completedCount}/${totalSegments})`,
        });
      } else {
        // 普通模式下，片段失败不影响任务状态，保持 downloading 等待手动重试
        onProgress?.({
          current: completedCount,
          total: totalSegments,
          percentage: Math.round((completedCount / totalSegments) * 100),
          status: 'downloading',
          message: `片段 ${index + 1} 下载失败，等待重试 (已完成 ${completedCount}/${totalSegments})`,
        });
      }
    }
  };

  // 并发控制：同时最多 concurrency 个下载任务
  const workers: Promise<void>[] = [];
  
  const processQueue = async () => {
    while (downloadQueue.length > 0) {
      if (signal?.aborted) {
        throw new Error('下载已取消');
      }

      // 检查是否暂停，如果暂停则等待恢复
      if (pauseResumeController) {
        await pauseResumeController.waitIfPaused();
      }
      
      const index = downloadQueue.shift();
      if (index !== undefined) {
        await downloadSegment(index);
      }
    }
  };

  // 启动多个并发worker
  for (let i = 0; i < Math.min(concurrency, totalSegments); i++) {
    workers.push(processQueue());
  }

  try {
    // 等待所有worker完成
    await Promise.all(workers);

    // 边下边存模式：关闭流
    if (writer) {
      try {
        // 如果使用了流式转码器，需要先完成转码
        if (streamingTransmuxer) {
          await streamingTransmuxer.finish();
        } else {
          await writer.close();
        }
        
        onProgress?.({
          current: completedCount,
          total: totalSegments,
          percentage: 100,
          status: 'done',
          message: '下载完成！',
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('关闭流失败:', error);
        throw error;
      }
      return;
    }
  } catch (error) {
    // 如果是中止下载，需要关闭流以显示浏览器取消状态
    if (writer) {
      try {
        await writer.abort();
      } catch (abortError) {
        // eslint-disable-next-line no-console
        console.error('中止流失败:', abortError);
      }
    }
    throw error;
  }

  // 普通模式：合并并下载
  if (!task.downloadedSegments || task.downloadedSegments.size === 0) {
    throw new Error('没有成功下载的片段');
  }

  // 检查是否有失败的片段（在下载范围内）
  const hasFailedSegments = task.finishList
    .slice(startSegment - 1, endSegment)
    .some(item => item.status === 'error');

  if (hasFailedSegments) {
    // 有失败片段，不执行保存，保持下载状态等待手动重试
    const failedCount = task.finishList
      .slice(startSegment - 1, endSegment)
      .filter(item => item.status === 'error').length;
    
    // eslint-disable-next-line no-console
    console.warn(`⚠️ 有 ${failedCount} 个片段下载失败，等待手动重试...`);
    
    onProgress?.({
      current: completedCount,
      total: totalSegments,
      percentage: Math.round((completedCount / totalSegments) * 100),
      status: 'downloading',
      message: `${failedCount} 个片段失败，等待重试...`,
    });
    
    // 不继续执行合并，保持下载状态
    return;
  }

  // 按顺序合并片段
  const segments: ArrayBuffer[] = [];
  for (let i = startSegment - 1; i < endSegment; i++) {
    const segment = task.downloadedSegments.get(i);
    if (segment) {
      segments.push(segment);
    }
  }

  onProgress?.({
    current: segments.length,
    total: endSegment - startSegment + 1,
    percentage: 100,
    status: 'processing',
    message: task.type === 'MP4' ? '正在转码为 MP4 格式...' : '正在合并视频文件...',
  });

  // 如果是 MP4 格式，进行转码
  let blob: Blob;
  if (task.type === 'MP4') {
    blob = transmuxTSToMP4(segments, rangeDuration);
  } else {
    blob = mergeSegments(segments, task.type);
  }
  
  triggerDownload(blob, task.title, task.type);

  onProgress?.({
    current: segments.length,
    total: endSegment - startSegment + 1,
    percentage: 100,
    status: 'done',
    message: '下载完成！',
  });
}

/**
 * 获取视频片段列表信息
 */
export interface SegmentInfo {
  index: number;
  url: string;
  duration: number;
  status: '' | 'downloading' | 'success' | 'error';
}

export function getSegmentList(task: M3U8Task): SegmentInfo[] {
  return task.tsUrlList.map((url, index) => ({
    index: index + 1,
    url,
    duration: 0,
    status: task.finishList[index]?.status || '',
  }));
}
