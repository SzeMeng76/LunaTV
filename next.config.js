/** @type {import('next').NextConfig} */
const nextConfig = {
  // 👇 最重要：关掉静态导出，改用兼容模式
  output: "standalone",

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

  trailingSlash: true,
};

module.exports = nextConfig;
