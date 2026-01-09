/** @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

const nextConfig = {
  // 生产环境始终使用 standalone 模式（Vercel/Docker/Zeabur）
  // 本地开发时（NODE_ENV !== 'production'）不使用 standalone
  ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' } : {}),

  reactStrictMode: false,

  // Next.js 16 使用 Turbopack，配置 SVG 加载
  turbopack: {
    root: __dirname,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // Uncoment to add domain whitelist
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
};

module.exports = nextConfig;
