/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MP4 转码工具
 * 使用 mux.js 将 TS 片段转换为 MP4 格式
 * 基于 https://github.com/videojs/mux.js
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore - mux.js 没有完整的 TypeScript 类型定义
import muxjs from 'mux.js';

/**
 * TS 转 MP4 转码器
 * 使用 mux.js 的 Transmuxer 进行转码
 */
export class TSToMP4Transmuxer {
  private transmuxer: any;
  private mp4Segments: Uint8Array[] = [];
  private isInitialized = false;
  private duration: number;

  constructor(duration?: number) {
    this.duration = duration || 0;
    this.transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: true,
      duration: this.duration,
    });

    // 监听数据事件
    this.transmuxer.on('data', (segment: any) => {
      const data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
      data.set(segment.initSegment, 0);
      data.set(segment.data, segment.initSegment.byteLength);
      this.mp4Segments.push(data);
    });

    // 监听完成事件
    this.transmuxer.on('done', () => {
      this.isInitialized = true;
    });
  }

  /**
   * 推送 TS 数据进行转码
   * @param tsData - TS 格式的数据
   */
  push(tsData: Uint8Array): void {
    this.transmuxer.push(tsData);
  }

  /**
   * 刷新转码器，完成转码
   */
  flush(): void {
    this.transmuxer.flush();
  }

  /**
   * 获取转码后的 MP4 数据
   * @returns MP4 格式的 Blob
   */
  getMP4Blob(): Blob {
    if (this.mp4Segments.length === 0) {
      throw new Error('没有可用的 MP4 数据');
    }

    // 合并所有 MP4 片段
    const totalLength = this.mp4Segments.reduce((acc, segment) => acc + segment.byteLength, 0);
    const mp4Data = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const segment of this.mp4Segments) {
      mp4Data.set(segment, offset);
      offset += segment.byteLength;
    }

    return new Blob([mp4Data], { type: 'video/mp4' });
  }

  /**
   * 重置转码器
   */
  reset(): void {
    this.mp4Segments = [];
    this.isInitialized = false;
    // 创建新的 transmuxer 实例
    this.transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: true,
      duration: this.duration,
    });

    // 重新绑定事件
    this.transmuxer.on('data', (segment: any) => {
      const data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
      data.set(segment.initSegment, 0);
      data.set(segment.data, segment.initSegment.byteLength);
      this.mp4Segments.push(data);
    });

    this.transmuxer.on('done', () => {
      this.isInitialized = true;
    });
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

/**
 * 批量转码 TS 片段为 MP4
 * @param tsSegments - TS 片段数组
 * @param duration - 视频时长（秒）
 * @returns MP4 格式的 Blob
 */
export function transmuxTSToMP4(tsSegments: ArrayBuffer[], duration?: number): Blob {
  const transmuxer = new TSToMP4Transmuxer(duration);

  // 推送所有 TS 片段
  for (const segment of tsSegments) {
    transmuxer.push(new Uint8Array(segment));
  }

  // 完成转码
  transmuxer.flush();

  // 返回 MP4 数据
  return transmuxer.getMP4Blob();
}

/**
 * 流式转码器（用于边下边存场景）
 * 支持增量转码，适合大文件下载
 */
export class StreamingTransmuxer {
  private transmuxer: any;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private segmentCount = 0;
  private isFirstSegment = true;
  private duration: number;
  private writeError: Error | null = null; // 跟踪写入错误
  private pendingWrites: Promise<void>[] = []; // 跟踪待完成的写入操作

  constructor(writer?: WritableStreamDefaultWriter<Uint8Array>, duration?: number) {
    this.writer = writer || null;
    this.duration = duration || 0;
    this.transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: true,
      duration: this.duration,
    });

    // 监听数据事件 - 直接写入流
    this.transmuxer.on('data', async (segment: any) => {
      // 如果已经有写入错误，不再处理新的数据
      if (this.writeError) {
        return;
      }

      try {
        // 对于第一个片段，需要写入初始化段
        if (this.isFirstSegment && segment.initSegment) {
          if (this.writer) {
            await this.writer.write(new Uint8Array(segment.initSegment));
          }
          this.isFirstSegment = false;
        }

        // 写入数据段
        if (segment.data && this.writer) {
          await this.writer.write(new Uint8Array(segment.data));
        }

        this.segmentCount++;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('写入 MP4 数据失败:', error);
        this.writeError = error instanceof Error ? error : new Error(String(error));
        throw error;
      }
    });
  }

  /**
   * 设置写入流
   */
  setWriter(writer: WritableStreamDefaultWriter<Uint8Array>): void {
    this.writer = writer;
  }

  /**
   * 推送 TS 数据并立即转码
   */
  async pushAndTransmux(tsData: Uint8Array): Promise<void> {
    // 如果已经有写入错误，立即抛出
    if (this.writeError) {
      throw this.writeError;
    }

    this.transmuxer.push(tsData);
    this.transmuxer.flush();
    
    // 等待一小段时间，让 data 事件有机会执行并捕获错误
    // 注意：这是一个折中方案，因为 muxjs 的 data 事件是异步的
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // 再次检查是否有写入错误
    if (this.writeError) {
      throw this.writeError;
    }
  }

  /**
   * 完成转码并关闭流
   */
  async finish(): Promise<void> {
    this.transmuxer.flush();
    
    if (this.writer) {
      try {
        await this.writer.close();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('关闭写入流失败:', error);
      }
    }
  }

  /**
   * 获取已转码的片段数量
   */
  getSegmentCount(): number {
    return this.segmentCount;
  }

  /**
   * 重置转码器
   */
  reset(): void {
    this.segmentCount = 0;
    this.isFirstSegment = true;
    this.transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: true,
      duration: this.duration,
    });

    // 重新绑定事件
    this.transmuxer.on('data', async (segment: any) => {
      try {
        if (this.isFirstSegment && segment.initSegment) {
          if (this.writer) {
            await this.writer.write(new Uint8Array(segment.initSegment));
          }
          this.isFirstSegment = false;
        }

        if (segment.data && this.writer) {
          await this.writer.write(new Uint8Array(segment.data));
        }

        this.segmentCount++;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('写入 MP4 数据失败:', error);
        throw error;
      }
    });
  }
}

/**
 * 检测数据是否为 TS 格式
 * @param data - 待检测的数据
 * @returns 是否为 TS 格式
 */
export function isTSFormat(data: Uint8Array): boolean {
  // TS 文件以 0x47 (sync byte) 开头
  // 通常每 188 字节有一个 sync byte
  if (data.length < 188) {
    return false;
  }

  // 检查前几个 sync byte
  return data[0] === 0x47 && (data.length < 188 || data[188] === 0x47);
}

/**
 * 估算转码后的 MP4 文件大小
 * @param tsSize - TS 文件大小（字节）
 * @returns 预估的 MP4 文件大小（字节）
 */
export function estimateMP4Size(tsSize: number): number {
  // MP4 容器通常比 TS 容器稍小（TS 有额外的包头开销）
  // 经验值：MP4 约为 TS 的 95-98%
  return Math.round(tsSize * 0.96);
}
