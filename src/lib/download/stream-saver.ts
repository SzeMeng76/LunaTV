/**
 * StreamSaver - 流式下载工具
 * Based on https://github.com/jimmywarting/StreamSaver.js
 * 解决大文件下载时内存不足的问题
 */

// 扩展 Window 类型以包含 safari 属性
declare global {
  interface Window {
    safari?: unknown;
  }
}

// 检查是否为安全上下文（HTTPS）
const isSecureContext = window.isSecureContext || location.protocol === 'https:'
const isFirefox = 'MozAppearance' in document.documentElement.style

// 下载策略：iframe 或 navigate
const downloadStrategy = isSecureContext || isFirefox ? 'iframe' : 'navigate'

// 是否使用 Blob 降级方案
let useBlobFallback = /constructor/i.test(window.HTMLElement.toString()) || !!window.safari

try {
  new Response(new ReadableStream())
  if (isSecureContext && !('serviceWorker' in navigator)) {
    useBlobFallback = true
  }
} catch (err) {
  useBlobFallback = true
}

// 检查是否支持 TransformStream
let supportsTransformStream = false
try {
  const { readable } = new TransformStream()
  const mc = new MessageChannel()
  mc.port1.postMessage(readable, [readable])
  mc.port1.close()
  mc.port2.close()
  supportsTransformStream = true
} catch (err) {
  // TransformStream 不支持，使用降级方案
  supportsTransformStream = false
}

interface Transporter {
  frame: HTMLIFrameElement | Window | null;
  loaded: boolean;
  isIframe?: boolean;
  isPopup?: boolean;
  remove: () => void;
  postMessage: (data: unknown, targetOrigin: string, transfer?: Transferable[]) => void;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) => void;
}

let middleTransporter: Transporter | null = null

// 创建 iframe
function makeIframe(src: string): Transporter {
  const iframe = document.createElement('iframe')
  iframe.hidden = true
  iframe.src = src
  iframe.name = 'iframe'
  document.body.appendChild(iframe)
  
  const transporter: Transporter = {
    frame: iframe,
    loaded: false,
    isIframe: true,
    remove() {
      window.removeEventListener('message', onReady)
      document.body.removeChild(iframe)
    },
    postMessage(data: unknown, targetOrigin: string, transfer?: Transferable[]) {
      iframe.contentWindow?.postMessage(data, targetOrigin, transfer)
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) {
      iframe.addEventListener(type, listener, options)
    }
  }
  
  // 监听来自 iframe 的 ready 消息
  const onReady = (event: MessageEvent) => {
    if (event.data === 'stream-saver-ready' && event.source === iframe.contentWindow) {
      transporter.loaded = true
      window.removeEventListener('message', onReady)
      
      // 触发 load 事件
      const loadEvent = new Event('load')
      iframe.dispatchEvent(loadEvent)
    }
  }
  
  window.addEventListener('message', onReady)
  
  return transporter
}

// 创建 popup
function makePopup(src: string): Transporter {
  const delegate = document.createDocumentFragment()
  const popup: Transporter = {
    frame: window.open(src, 'popup', 'width=200,height=100'),
    loaded: false,
    isPopup: true,
    remove() {
      if (this.frame && 'close' in this.frame) {
        this.frame.close()
      }
    },
    postMessage(data: unknown, targetOrigin: string, transfer?: Transferable[]) {
      if (this.frame && 'postMessage' in this.frame) {
        this.frame.postMessage(data, targetOrigin, transfer)
      }
    },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) {
      delegate.addEventListener(type, listener, options)
    }
  }

  const onReady = (evt: MessageEvent) => {
    if (evt.source === popup.frame) {
      popup.loaded = true
      window.removeEventListener('message', onReady)
      const event = new Event('load')
      delegate.dispatchEvent(event)
    }
  }

  window.addEventListener('message', onReady)
  return popup
}

/**
 * 创建写入流
 */
export function createWriteStream(filename: string) {
  let bytesWritten = 0
  let downloadUrl: string | null = null
  let mc: MessageChannel | null = null
  let ts: TransformStream<Uint8Array, Uint8Array> | null = null

  if (!useBlobFallback) {
    
    // 创建中间传输器
    middleTransporter = middleTransporter || (
      isSecureContext 
        ? makeIframe('/mitm.html')
        : makePopup('/mitm.html')
    )

    mc = new MessageChannel()

    // 处理文件名
    filename = encodeURIComponent(filename.replace(/\//g, ':'))
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A')

    // 如果支持 TransformStream
    if (supportsTransformStream) {
      ts = new TransformStream(downloadStrategy === 'iframe' ? undefined : {
        transform(chunk, controller) {
          if (!(chunk instanceof Uint8Array)) {
            throw new TypeError('Can only write Uint8Arrays')
          }
          bytesWritten += chunk.length
          controller.enqueue(chunk)
          
          if (downloadUrl) {
            location.href = downloadUrl
            downloadUrl = null
          }
        },
        flush() {
          if (downloadUrl) {
            location.href = downloadUrl
          }
        }
      })

      mc.port1.postMessage({ readableStream: ts.readable }, [ts.readable])
    }

    mc.port1.onmessage = (evt) => {
      if (evt.data.download) {
        if (downloadStrategy === 'navigate') {
          middleTransporter?.remove()
          middleTransporter = null
          
          if (bytesWritten) {
            location.href = evt.data.download
          } else {
            downloadUrl = evt.data.download
          }
        } else {
          if (middleTransporter?.isPopup) {
            middleTransporter?.remove()
            middleTransporter = null
            if (downloadStrategy === 'iframe') {
              makeIframe('/mitm.html')
            }
          }
          makeIframe(evt.data.download)
        }
      } else if (evt.data.abort) {
        chunks = []
        if (mc) {
          mc.port1.postMessage('abort')
          const port = mc.port1
          port.onmessage = null
          port.close()
          mc.port2.close()
          mc = null
        }
      }
    }

    const response = {
      transferringReadable: supportsTransformStream,
      pathname: Math.random().toString().slice(-6) + '/' + filename,
      headers: {
        'Content-Type': 'application/octet-stream; charset=utf-8',
        'Content-Disposition': "attachment; filename*=UTF-8''" + filename
      }
    }

    if (middleTransporter.loaded) {
      middleTransporter.postMessage(response, '*', [mc.port2])
    } else {
      middleTransporter.addEventListener('load', () => {
        if (middleTransporter && mc) {
          middleTransporter.postMessage(response, '*', [mc.port2])
        }
      }, { once: true })
    }
  }

  let chunks: Uint8Array[] = []

  if (!useBlobFallback && ts && ts.writable) {
    return ts.writable
  }

  return new WritableStream({
    write(chunk: Uint8Array) {
      if (!(chunk instanceof Uint8Array)) {
        throw new TypeError('Can only write Uint8Arrays')
      }

      if (useBlobFallback) {
        chunks.push(chunk)
        return
      }

      mc?.port1.postMessage(chunk)
      bytesWritten += chunk.length

      if (downloadUrl) {
        location.href = downloadUrl
        downloadUrl = null
      }
    },

    close() {
      if (useBlobFallback) {
        const blob = new Blob(chunks as BlobPart[], { type: 'application/octet-stream; charset=utf-8' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = filename
        link.click()
      } else {
        mc?.port1.postMessage('end')
      }
    },

    abort() {
      chunks = []
      if (mc) {
        mc.port1.postMessage('abort')
        const port = mc.port1
        port.onmessage = null
        port.close()
        mc.port2.close()
        mc = null
      }
    }
  })
}

/**
 * 检查是否支持流式下载
 */
export function isStreamSaverSupported(): boolean {
  return !useBlobFallback
}
