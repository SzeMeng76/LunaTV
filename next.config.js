/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Cloudflare 必须：静态导出模式（替换原有 standalone，兼容 Workers）
  output: "export",

  reactStrictMode: false,

  // Puppeteer/Chromium 相关包不进行 bundle
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

  // Next.js 16 Turbopack SVG 加载
  turbopack: {
    root: __dirname,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // 性能优化：包体积优化
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@heroicons/react',
      'framer-motion',
      'react-icons',
    ],
  },

  // ✅ Cloudflare 必须：关闭图片优化
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },

  // ✅ Cloudflare 必须：路由后缀兼容（防止404）
  trailingSlash: true,
};

module.exports = nextConfig;
