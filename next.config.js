/** @type {import('next').NextConfig} */
const { PHASE_PRODUCTION_BUILD } = require('next/constants');

module.exports = (phase) => {
  // 构建阶段标记：直接设置 process.env（非 env 配置字段），
  // 这样子进程/worker 能继承，但 Turbopack 不会将其内联到编译产物中
  if (phase === PHASE_PRODUCTION_BUILD) {
    process.env.IS_BUILD_PHASE = 'true';
  }

  const nextConfig = {
    // 生产环境始终使用 standalone 模式（Vercel/Docker/Render）
    // 本地开发时（NODE_ENV !== 'production'）不使用 standalone
    ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' } : {}),

    reactStrictMode: false,

    // Puppeteer/Chromium 相关包不进行 bundle（用于 Vercel serverless）
    // 已移除 Puppeteer 依赖以减少包体积（78MB），如需恢复请取消注释并安装依赖
    // serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

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

    // 性能优化：包体积优化和模块化导入
    experimental: {
      // 自动优化大型库的导入，只打包实际使用的部分
      optimizePackageImports: [
        'lucide-react',
        '@heroicons/react',
        'framer-motion',
        'react-icons',
      ],
    },

    // 图片优化配置
    images: {
      // 禁用 Next.js 图片优化（代理图片不兼容）
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

  return nextConfig;
};
