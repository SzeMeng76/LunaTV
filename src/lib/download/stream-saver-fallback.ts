/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
/**
 * StreamSaver 降级方案
 * 在不支持 Service Worker 的环境中使用
 * 优先使用 File System Access API，其次使用 Blob 降级
 */

/**
 * 检查是否支持 File System Access API
 */
export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showSaveFilePicker' in window &&
    typeof (window as any).showSaveFilePicker === 'function'
  );
}

/**
 * 使用 File System Access API 创建写入流
 */
export async function createFileSystemWriteStream(
  filename: string,
  _fileSize?: number
): Promise<WritableStream<Uint8Array> | null> {
  if (!supportsFileSystemAccess()) {
    return null;
  }

  try {
    // 根据文件名后缀动态设置 accept 类型，避免移动端总是 .m3u8
    let acceptExt = '.ts';
    if (filename.toLowerCase().endsWith('.mp4')) acceptExt = '.mp4';
    else if (filename.toLowerCase().endsWith('.ts')) acceptExt = '.ts';
    const options: any = {
      suggestedName: filename,
      types: [
        {
          description: 'Video files',
          accept: {
            'video/*': [acceptExt],
          },
        },
      ],
    };

    // 请求用户选择保存位置
    const fileHandle = await (window as any).showSaveFilePicker(options);
    const writable = await fileHandle.createWritable();

    return new WritableStream({
      async write(chunk: Uint8Array) {
        await writable.write(chunk);
      },
      async close() {
        await writable.close();
      },
      async abort(reason: any) {
        await writable.abort(reason);
      },
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.log('用户取消了文件保存');
      return null;
    }
    console.error('File System Access API 错误:', err);
    return null;
  }
}

/**
 * Blob 降级方案 - 将数据收集到内存后一次性下载
 * 注意：大文件可能导致内存溢出
 */
export function createBlobWriteStream(
  filename: string,
  maxSize: number = 500 * 1024 * 1024 // 默认最大 500MB
): WritableStream<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  return new WritableStream({
    write(chunk: Uint8Array) {
      totalSize += chunk.length;
      
      if (totalSize > maxSize) {
        throw new Error(
          `文件大小超过限制 (${Math.round(maxSize / 1024 / 1024)}MB)，` +
          '请使用支持 Service Worker 或 File System Access API 的浏览器'
        );
      }
      
      chunks.push(chunk);
    },
    close() {
      // 创建 Blob 并触发下载
      const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // 清理
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      // 清空内存
      chunks.length = 0;
    },
    abort(reason: any) {
      console.error('下载被中止:', reason);
      chunks.length = 0;
    },
  });
}

/**
 * 智能选择最佳的写入流方案
 */
export async function createAdaptiveWriteStream(
  filename: string,
  estimatedSize?: number
): Promise<WritableStream<Uint8Array>> {
  // 1. 优先尝试 File System Access API（Chrome/Edge）
  if (supportsFileSystemAccess()) {
    console.log('使用 File System Access API');
    const stream = await createFileSystemWriteStream(filename, estimatedSize);
    if (stream) return stream;
  }

  // 2. 检查 Service Worker 是否可用
  if (
    'serviceWorker' in navigator &&
    navigator.serviceWorker.controller &&
    window.isSecureContext
  ) {
    console.log('Service Worker 可用，尝试使用流式下载');
    // 这里返回 null，让调用方使用原始的 stream-saver 实现
    throw new Error('USE_SERVICE_WORKER');
  }

  // 3. 降级到 Blob 方案（有大小限制）
  console.warn(
    '当前环境不支持流式下载，使用 Blob 降级方案（可能有内存限制）'
  );
  
  // 如果文件太大，警告用户
  if (estimatedSize && estimatedSize > 500 * 1024 * 1024) {
    const confirmDownload = confirm(
      '文件较大，可能导致内存不足。建议使用 Chrome/Edge 浏览器或本地部署版本。\n\n是否继续下载？'
    );
    
    if (!confirmDownload) {
      throw new Error('用户取消下载');
    }
  }
  
  return createBlobWriteStream(filename);
}

/**
 * 检测当前平台是否支持边下边存
 */
export function detectStreamingCapability(): {
  supported: boolean;
  method: 'service-worker' | 'file-system-access' | 'blob' | 'none';
  limitation?: string;
} {
  // 检测是否在云平台
  const isCloudPlatform =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('pages.dev') ||
      window.location.hostname.includes('.workers.dev') ||
      window.location.hostname.includes('.vercel.app') ||
      window.location.hostname.includes('.netlify.app'));

  // 1. File System Access API
  if (supportsFileSystemAccess()) {
    return {
      supported: true,
      method: 'file-system-access',
    };
  }

  // 2. Service Worker
  if (
    'serviceWorker' in navigator &&
    window.isSecureContext &&
    !isCloudPlatform
  ) {
    return {
      supported: true,
      method: 'service-worker',
    };
  }

  // 3. Blob 降级
  return {
    supported: true,
    method: 'blob',
    limitation: '文件大小限制约 500MB，不支持超大文件',
  };
}
