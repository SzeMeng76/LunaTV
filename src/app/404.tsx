import Link from 'next/link';

export default function Custom404() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-100 to-gray-200 dark:from-gray-900 dark:to-black">
      <h1 className="text-9xl font-bold text-red-500 mb-4">404</h1>
      <p className="text-3xl mb-8 text-gray-800 dark:text-gray-200">
        抱歉，您访问的内容不存在或已被限制
      </p>
      <Link href="/" className="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white text-xl rounded-full transition-shadow hover:shadow-xl">
        返回首页
      </Link>
    </div>
  );
}