// app/404.tsx
import Link from 'next/link';

export default function Custom404() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 text-center px-4">
      <h1 className="text-8xl font-bold text-red-600 mb-4">404</h1>
      <p className="text-2xl mb-8 text-gray-700 dark:text-gray-300">
        页面未找到或已被禁止访问
      </p>
      <Link
        href="/"
        className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg rounded-xl transition"
      >
        返回首页
      </Link>
    </div>
  );
}