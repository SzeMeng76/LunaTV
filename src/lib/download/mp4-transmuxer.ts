/**
 * MP4 转码工具
 * 优先使用 Mediabunny（标准 progressive MP4，moov 在前，全播放器兼容）
 * mux.js 仅保留给流式播放路径使用
 * Mediabunny: https://github.com/Vanilagy/mediabunny
 * mux.js: https://github.com/videojs/mux.js
 */

// @ts-ignore - mux.js 没有完整的 TypeScript 类型定义
import type { EncodedPacket, OutputFormat } from 'mediabunny';
import muxjs from 'mux.js';

/**
 * TS 分片 → 标准 MP4（Mediabunny 低级 API，逐分片时间戳归一化）
 *
 * 背景：多数采集源（如 yzzy）的 m3u8 分片是独立编码的，各分片 PTS 基线互不相同
 * （有的从 0 开始、有的从任意值开始）。若直接二进制拼接后整体转封装，
 * 时间戳会互相重叠，导致容器时长错误（如 40MB 只有 19.5 秒）、播放卡顿。
 *
 * 方案：逐分片用 MpegTsInputFormat 解出 EncodedPacket（不解码），
 * 以「片内音视频最早 PTS」为基准归一化，再按累计偏移写入标准 MP4：
 * - moov 在前（fastStart: 'in-memory'），全播放器兼容、可拖进度条
 * - 纯 remux 不重编码，秒级完成
 * - 总时长锚定 m3u8 EXTINF 声明值（借鉴 lzwme/m3u8-dl 的 ffmpeg concat
 *   「per-file rebaseline」思路：不信分片自带 PTS，按播放列表时长重建时间轴），
 *   从根源上避免源站离群 PTS 导致总时长虚增
 *
 * @param tsSegments - TS 分片数组（按播放顺序）
 * @param segmentDurations - 各分片的 EXTINF 声明时长（秒，与分片一一对应）
 * @param onProgress - 进度回调（0~1）
 * @returns 标准 MP4 格式的 Blob
 */
export async function remuxTSSegmentsToMP4(
  tsSegments: (ArrayBuffer | Uint8Array)[],
  segmentDurations?: number[],
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const { Mp4OutputFormat } = await import('mediabunny');
  return remuxTSSegments(
    tsSegments,
    new Mp4OutputFormat({ fastStart: 'in-memory' }),
    'video/mp4',
    segmentDurations,
    onProgress,
  );
}

/**
 * TS 分片 → 时间戳归一化的 TS 文件
 *
 * 与 MP4 出口共用同一套逐分片归一化逻辑，但输出 MPEG-TS 容器。
 * 解决裸拼接 TS 在播放器中「时长估算错误（如只显示 15 秒）」的问题。
 * 时间轴同样锚定 EXTINF（借鉴 lzwme/m3u8-dl 的 ffmpeg concat 思路）。
 *
 * @param tsSegments - TS 分片数组（按播放顺序）
 * @param segmentDurations - 各分片的 EXTINF 声明时长（秒，与分片一一对应）
 * @param onProgress - 进度回调（0~1）
 * @returns TS 格式的 Blob
 */
export async function normalizeTSSegmentsToTS(
  tsSegments: (ArrayBuffer | Uint8Array)[],
  segmentDurations?: number[],
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const { MpegTsOutputFormat } = await import('mediabunny');
  return remuxTSSegments(
    tsSegments,
    new MpegTsOutputFormat(),
    'video/MP2T',
    segmentDurations,
    onProgress,
  );
}

/**
 * 剔除时间戳离群包并修正异常 duration：按 PTS 分群，只保留包数最多的主群
 *
 * 部分采集源的分片内混有带独立时间基线的孤立包（内嵌广告/录制系统绝对时钟残留），
 * 其 PTS 与主内容相隔可达数小时。若不去除，片时长（max end - min）会被拉爆，
 * 导致归一化后的总时长虚增十几个小时。
 *
 * 另一个问题：demuxer 对主群末包的 duration 是按「下一包 PTS 差」推算的，
 * 若下一包是被剔除的离群包，末包 duration 会等于十几小时。TS 播放器只看
 * PES 的 PTS（不受影响），但 MP4 muxer 会把该 duration 写入 stts 样本表，
 * 导致 MP4 总时长显示十几个小时。因此按包 duration 的中位数做上限截断。
 *
 * 返回保持原顺序（解码顺序）的过滤结果。
 */
function keepMainCluster(
  list: EncodedPacket[],
  gapThreshold = 2,
): EncodedPacket[] {
  if (list.length === 0) return list;

  // 1. 按中位数 clamp 异常巨大的 duration（中位数对个别离群值稳健）
  if (list.length >= 4) {
    const durs = list
      .map((p) => p.duration)
      .filter((d) => d > 0 && isFinite(d))
      .sort((a, b) => a - b);
    if (durs.length > 0) {
      const median = durs[Math.floor(durs.length / 2)];
      const cap = median * 4;
      list = list.map((p) =>
        p.duration > cap ? p.clone({ duration: cap }) : p,
      );
    }
  }

  // 2. 按 PTS 相邻间隔 > gapThreshold 切分成时间群
  const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp);

  const clusters: { start: number; end: number; count: number }[] = [];
  let curStart = sorted[0].timestamp;
  let curEnd = sorted[0].timestamp + sorted[0].duration;
  let curCount = 1;
  for (let i = 1; i < sorted.length; i++) {
    const ts = sorted[i].timestamp;
    const end = ts + sorted[i].duration;
    if (ts - curEnd > gapThreshold) {
      clusters.push({ start: curStart, end: curEnd, count: curCount });
      curStart = ts;
      curCount = 0;
    }
    if (end > curEnd) curEnd = end;
    curCount++;
  }
  clusters.push({ start: curStart, end: curEnd, count: curCount });

  // 单一群无需处理
  if (clusters.length === 1) return list;

  // 保留包数最多的主群（离群群通常只有零星几个包）
  const main = clusters.reduce((a, b) => (b.count > a.count ? b : a));
  return list.filter(
    (p) => p.timestamp >= main.start && p.timestamp + p.duration <= main.end,
  );
}

/**
 * 修补 MP4 容器的时长字段
 *
 * 实测发现（解剖下载产物逐字节确认）：mediabunny 的 in-memory fastStart 模式
 * 输出的 moov 中 mvhd.duration = 0xFFFFFFFF（unknown 标记）、tkhd.duration = 0，
 * 未回填真实值。mediabunny 自身读取时跳过这些字段按样本表计算（显示正常），
 * 但 Windows「电影和电视」等播放器直接读 mvhd/tkhd：
 * 0xFFFFFFFF ÷ 90000 = 47721.9s ≈ 13.25 小时 —— 即用户看到的「十几个小时」。
 * 因此在 finalize 后按实际总时长修补 mvhd / tkhd / mdhd 三个 box 的 duration。
 */
function patchMp4Durations(buffer: ArrayBuffer, durationSec: number): void {
  const dv = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  const typeOf = (pos: number) =>
    String.fromCharCode(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7]);
  const find = (type: string, start: number, end: number) => {
    let p = start;
    while (p + 8 <= end) {
      const size = dv.getUint32(p);
      if (size < 8 || p + size > end) return null;
      if (typeOf(p) === type) return { pos: p, size };
      p += size;
    }
    return null;
  };
  const UNKNOWN32 = 0xffffffff;

  const ftyp = find('ftyp', 0, buffer.byteLength);
  if (!ftyp) return;
  const moov = find('moov', ftyp.pos + ftyp.size, buffer.byteLength);
  if (!moov) return;
  const mvhd = find('mvhd', moov.pos + 8, moov.pos + moov.size);
  if (!mvhd) return;

  // movie timescale（mvhd 内），tkhd.duration 均以它为基准
  // mvhd v0: ver4+ctime4+mtime4 → ts@+12, dur@+16；v1: ver4+ctime8+mtime8 → ts@+20, dur@+24
  const mvhdBody = mvhd.pos + 8;
  const mvhdVer = dv.getUint8(mvhdBody);
  const movieTs =
    mvhdVer === 1 ? dv.getUint32(mvhdBody + 20) : dv.getUint32(mvhdBody + 12);
  if (!movieTs) return;
  const total = Math.round(durationSec * movieTs);
  if (total <= 0 || total >= UNKNOWN32) return;

  const mvhdDurPos = mvhdVer === 1 ? mvhdBody + 24 : mvhdBody + 16; // v1: ver4+ctime8+mtime8 → dur@+24
  if (mvhdVer === 1) {
    if (Number(dv.getBigUint64(mvhdDurPos)) >= UNKNOWN32)
      dv.setBigUint64(mvhdDurPos, BigInt(total));
  } else if (dv.getUint32(mvhdDurPos) >= UNKNOWN32) {
    dv.setUint32(mvhdDurPos, total);
  }

  // 遍历所有 trak：修 tkhd（movie timescale 基准，值为 0 时修补）
  // 与 mdhd（track 自身 timescale 基准，unknown 标记时修补）
  let p = moov.pos + 8;
  const moovEnd = moov.pos + moov.size;
  while (p + 8 <= moovEnd) {
    const size = dv.getUint32(p);
    if (size < 8 || p + size > moovEnd) break;
    if (typeOf(p) === 'trak') {
      const trakEnd = p + size;
      const tkhd = find('tkhd', p + 8, trakEnd);
      if (tkhd) {
        const body = tkhd.pos + 8;
        const ver = dv.getUint8(body);
        // tkhd v0: ver4+ctime4+mtime4+trackid4+resv4 → dur@+20
        // tkhd v1: ver4+ctime8+mtime8+trackid4+resv4 → dur@+28
        // mediabunny 会写 unknown 标记 0xFFFFFFFF（实测），0 或 unknown 都修补
        if (ver === 1) {
          const durPos = body + 28;
          const cur = Number(dv.getBigUint64(durPos));
          if (cur === 0 || cur >= 0xffffffff)
            dv.setBigUint64(durPos, BigInt(total));
        } else {
          const durPos = body + 20;
          const cur = dv.getUint32(durPos);
          if (cur === 0 || cur >= 0xffffffff) dv.setUint32(durPos, total);
        }
      }
      const mdia = find('mdia', p + 8, trakEnd);
      if (mdia) {
        const mdhd = find('mdhd', mdia.pos + 8, mdia.pos + mdia.size);
        if (mdhd) {
          const body = mdhd.pos + 8;
          const ver = dv.getUint8(body);
          // mdhd v0: ver4+ctime4+mtime4 → ts@+12, dur@+16
          // mdhd v1: ver4+ctime8+mtime8 → ts@+20, dur@+24
          const ts =
            ver === 1 ? dv.getUint32(body + 20) : dv.getUint32(body + 12);
          const durPos = ver === 1 ? body + 24 : body + 16;
          if (ts) {
            const trackTotal = Math.round(durationSec * ts);
            if (
              trackTotal > 0 &&
              trackTotal < UNKNOWN32 &&
              (ver === 1
                ? Number(dv.getBigUint64(durPos)) >= UNKNOWN32
                : dv.getUint32(durPos) >= UNKNOWN32)
            ) {
              if (ver === 1) dv.setBigUint64(durPos, BigInt(trackTotal));
              else dv.setUint32(durPos, trackTotal);
            }
          }
        }
      }
    }
    p += size;
  }
}

/**
 * 通用核心：逐分片解包 → 时间戳归一化 → 写入 mediabunny 输出容器
 *
 * 借鉴 lzwme/m3u8-dl（https://github.com/lzwme/m3u8-dl）的合并思路：
 * 它用 ffmpeg concat demuxer（ffconcat 显式 duration + +genpts）对每个分片
 * 独立重打时间基线重建连续时间轴；本实现以 m3u8 EXTINF 声明时长锚定
 * globalOffset 累计，达到等效的 per-file rebaseline，但保持纯浏览器内
 * Mediabunny 标准 progressive MP4 输出（无 ffmpeg 依赖）。
 */
async function remuxTSSegments(
  tsSegments: (ArrayBuffer | Uint8Array)[],
  format: OutputFormat,
  mimeType: string,
  segmentDurations?: number[],
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const {
    BufferTarget,
    BlobSource,
    EncodedAudioPacketSource,
    EncodedPacketSink,
    EncodedVideoPacketSource,
    Input,
    MpegTsInputFormat,
    Output,
  } = await import('mediabunny');

  const output = new Output({
    format,
    target: new BufferTarget(),
  });

  let videoSource: InstanceType<typeof EncodedVideoPacketSource> | null = null;
  let audioSource: InstanceType<typeof EncodedAudioPacketSource> | null = null;
  let videoMeta: EncodedVideoChunkMetadata | undefined;
  let audioMeta: EncodedAudioChunkMetadata | undefined;

  let globalOffset = 0;
  let processed = 0;
  let outputStarted = false;

  for (const raw of tsSegments) {
    processed++;
    const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    // 跳过非 TS 数据（如 fMP4 init 段），但 EXTINF 偏移仍需累计以保持时间轴对齐
    if (!isTSFormat(data)) {
      const declared = segmentDurations?.[processed - 1];
      if (declared && isFinite(declared) && declared > 0) {
        globalOffset += declared;
      }
      continue;
    }

    const input = new Input({
      formats: [new MpegTsInputFormat()],
      source: new BlobSource(
        new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/MP2T' }),
      ),
    });

    try {
      let vList: EncodedPacket[] = [];
      let aList: EncodedPacket[] = [];
      let vMin = Infinity;
      let vEnd = 0;
      let aMin = Infinity;
      let aEnd = 0;

      const videoTrack = await input.getPrimaryVideoTrack();
      if (videoTrack) {
        const sink = new EncodedPacketSink(videoTrack);
        for await (const p of sink.packets()) {
          vList.push(p);
        }
        if (vList.length > 0 && !videoSource) {
          videoSource = new EncodedVideoPacketSource(videoTrack.codec);
          output.addVideoTrack(videoSource);
          const cfg = await videoTrack.getDecoderConfig();
          videoMeta = cfg ? { decoderConfig: cfg } : undefined;
        }
        // 剔除离群时间戳包（内嵌广告/绝对时钟残留），防止总时长虚增
        if (vList.length > 0) {
          vList = keepMainCluster(vList);
          for (const p of vList) {
            if (p.timestamp < vMin) vMin = p.timestamp;
            if (p.timestamp + p.duration > vEnd)
              vEnd = p.timestamp + p.duration;
          }
        }
      }

      const audioTrack = await input.getPrimaryAudioTrack();
      if (audioTrack) {
        const sink = new EncodedPacketSink(audioTrack);
        for await (const p of sink.packets()) {
          aList.push(p);
        }
        if (aList.length > 0 && !audioSource) {
          audioSource = new EncodedAudioPacketSource(audioTrack.codec);
          output.addAudioTrack(audioSource);
          const cfg = await audioTrack.getDecoderConfig();
          audioMeta = cfg ? { decoderConfig: cfg } : undefined;
        }
        if (aList.length > 0) {
          aList = keepMainCluster(aList);
          for (const p of aList) {
            if (p.timestamp < aMin) aMin = p.timestamp;
            if (p.timestamp + p.duration > aEnd)
              aEnd = p.timestamp + p.duration;
          }
        }
      }

      if (!videoSource && !audioSource) continue;

      // mediabunny 约束：addVideoTrack 必须在 start 前、add 必须在 start 后
      if (!outputStarted) {
        await output.start();
        outputStarted = true;
      }

      // 片内基准：音视频最早 PTS（保证音视频相对同步关系不变）
      const segBase = Math.min(
        vList.length ? vMin : Infinity,
        aList.length ? aMin : Infinity,
      );
      if (!isFinite(segBase)) continue;

      for (const p of vList) {
        if (!videoSource) break;
        await videoSource.add(
          p.clone({ timestamp: p.timestamp - segBase + globalOffset }),
          videoMeta,
        );
        videoMeta = undefined;
      }
      for (const p of aList) {
        if (!audioSource) break;
        await audioSource.add(
          p.clone({ timestamp: p.timestamp - segBase + globalOffset }),
          audioMeta,
        );
        audioMeta = undefined;
      }

      // 时间轴锚定（借鉴 lzwme/m3u8-dl 的 ffmpeg concat per-file rebaseline 思路）：
      // 优先用 m3u8 EXTINF 声明时长累计偏移（权威值，不受源站离群 PTS 污染）；
      // 缺失时回退片内实测时长（keepMainCluster 净化后）。取两者较大值，
      // 防止片尾超出声明时长的内容被下一片覆盖。
      const declared = segmentDurations?.[processed - 1];
      const measured = Math.max(
        vList.length ? vEnd - segBase : 0,
        aList.length ? aEnd - segBase : 0,
      );
      globalOffset +=
        declared && isFinite(declared) && declared > 0
          ? Math.max(declared, measured)
          : measured;
    } catch (err) {
      // 单片解析失败不阻塞整体（如 fMP4 分片混入）
      // eslint-disable-next-line no-console
      console.warn(`[remux] 第 ${processed} 个分片解析失败，已跳过:`, err);
    } finally {
      input.dispose();
    }

    onProgress?.(processed / tsSegments.length);
  }

  if (!videoSource && !audioSource) {
    throw new Error('没有可用的视频/音频数据');
  }

  await output.finalize();

  const target = output.target as InstanceType<typeof BufferTarget>;
  const buffer = target.buffer;
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('没有可用的媒体数据');
  }

  // MP4 出口：修补 mediabunny 未回填的 mvhd/tkhd/mdhd 时长字段
  // （否则 Windows 播放器把 mvhd 的 unknown 标记 0xFFFFFFFF 解读为 13.25 小时）
  if (mimeType === 'video/mp4' && globalOffset > 0) {
    patchMp4Durations(buffer, globalOffset);
  }

  return new Blob([buffer as ArrayBuffer], { type: mimeType });
}

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
      const data = new Uint8Array(
        segment.initSegment.byteLength + segment.data.byteLength,
      );
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
    const totalLength = this.mp4Segments.reduce(
      (acc, segment) => acc + segment.byteLength,
      0,
    );
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
      const data = new Uint8Array(
        segment.initSegment.byteLength + segment.data.byteLength,
      );
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
 * 批量转码 TS 片段为 MP4（异步分批版）
 * 每转码一批让出主线程，避免大任务冻结 UI
 * @param tsSegments - TS 片段数组
 * @param duration - 视频时长（秒，<=0 时忽略）
 * @param onProgress - 转码进度回调
 * @returns MP4 格式的 Blob
 */
export async function transmuxTSToMP4Async(
  tsSegments: (ArrayBuffer | Uint8Array)[],
  duration?: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const mp4Parts: Uint8Array[] = [];
  const transmuxer = new muxjs.mp4.Transmuxer({
    keepOriginalTimestamps: true,
    // duration<=0 时不要传 0，否则 mux.js 会输出空数据
    ...(duration && duration > 0 ? { duration } : {}),
  });

  let gotInit = false;
  transmuxer.on('data', (segment: any) => {
    // initSegment（moov）只保留第一次，后续 flush 的 data 直接追加
    if (!gotInit && segment.initSegment) {
      mp4Parts.push(new Uint8Array(segment.initSegment));
      gotInit = true;
    }
    if (segment.data) {
      mp4Parts.push(new Uint8Array(segment.data));
    }
  });

  const BATCH = 30;
  for (let i = 0; i < tsSegments.length; i++) {
    const seg = tsSegments[i];
    transmuxer.push(seg instanceof Uint8Array ? seg : new Uint8Array(seg));
    transmuxer.flush();
    onProgress?.(i + 1, tsSegments.length);
    if ((i + 1) % BATCH === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (mp4Parts.length === 0) {
    throw new Error('没有可用的 MP4 数据');
  }

  return new Blob(mp4Parts as BlobPart[], { type: 'video/mp4' });
}

/**
 * 批量转码 TS 片段为 MP4
 * @param tsSegments - TS 片段数组
 * @param duration - 视频时长（秒）
 * @returns MP4 格式的 Blob
 */
export function transmuxTSToMP4(
  tsSegments: ArrayBuffer[],
  duration?: number,
): Blob {
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

  constructor(
    writer?: WritableStreamDefaultWriter<Uint8Array>,
    duration?: number,
  ) {
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
        this.writeError =
          error instanceof Error ? error : new Error(String(error));
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
    await new Promise((resolve) => setTimeout(resolve, 0));

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
