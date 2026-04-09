/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare 必須：靜態導出
  output: "export",

  reactStrictMode: false,

  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

  turbopack: {
    root: __dirname,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@heroicons/react',
      'framer-motion',
      'react-icons',
    ],
  },

  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },

  // Cloudflare 路由兼容
  trailingSlash: true,
};

module.exports = nextConfig;
