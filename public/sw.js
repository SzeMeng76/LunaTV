// Service Worker for streaming download
// Based on https://github.com/jimmywarting/StreamSaver.js

const urlDataMap = new Map()

function createStream(port) {
  return new ReadableStream({
    start(controller) {
      port.onmessage = ({ data }) => {
        if (data === 'end') {
          return controller.close()
        }
        if (data === 'abort') {
          controller.error('Aborted the download')
          return
        }
        controller.enqueue(data)
      }
    },
    cancel(reason) {
      console.log('user aborted', reason)
      port.postMessage({ abort: true })
    }
  })
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.onmessage = (event) => {
  const data = event.data
  const port = event.ports[0]

  if (data === 'ping') {
    return
  }

  const downloadUrl = data.url || self.registration.scope + Math.random() + '/' + (typeof data === 'string' ? data : data.filename)
  const metadata = new Array(3)
  
  metadata[1] = data
  metadata[2] = port

  if (data.readableStream) {
    metadata[0] = data.readableStream
  } else if (data.transferringReadable) {
    port.onmessage = (evt) => {
      port.onmessage = null
      metadata[0] = evt.data.readableStream
    }
  } else {
    metadata[0] = createStream(port)
  }

  urlDataMap.set(downloadUrl, metadata)
  port.postMessage({ download: downloadUrl })
}

self.onfetch = (event) => {
  const url = event.request.url
  const hijacke = urlDataMap.get(url)

  if (!hijacke) return null

  const [stream, data, port] = hijacke

  urlDataMap.delete(url)

  const responseHeaders = new Headers({
    'Content-Type': 'application/octet-stream; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'",
    'X-Content-Security-Policy': "default-src 'none'",
    'X-WebKit-CSP': "default-src 'none'",
    'X-XSS-Protection': '1; mode=block'
  })

  if (data.headers) {
    for (const [key, value] of Object.entries(data.headers)) {
      responseHeaders.set(key, value)
    }
  }

  event.respondWith(new Response(stream, { headers: responseHeaders }))
  port.postMessage({ debug: 'Download started' })
}
