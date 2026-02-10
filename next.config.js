/** @type {import('next').NextConfig} */

const SUB_PATH = '/moontv'; // 请将 /myapp 替换为你实际的子目录名称，例如 /lunatv

const nextConfig = {
  
  // 配置基础路径：所有链接都会自动加上此前缀
  basePath: SUB_PATH,

  // 配置资源前缀：静态资源会从此路径加载
  // 如果静态资源也在同一子目录下，通常与 basePath 保持一致
  assetPrefix: SUB_PATH,

  // 生产环境始终使用 standalone 模式（Vercel/Docker/Zeabur）
  // 本地开发时（NODE_ENV !== 'production'）不使用 standalone
  ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' } : {}),

  reactStrictMode: false,

  // Puppeteer/Chromium 相关包不进行 bundle（用于 Vercel serverless）
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

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

module.exports = nextConfig;
