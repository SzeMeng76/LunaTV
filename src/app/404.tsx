export default function Custom404() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-black">
      <h1 className="text-9xl font-bold text-red-500 mb-4">404</h1>
      <p className="text-3xl mb-8 text-gray-700 dark:text-gray-300">
        抱歉，您访问的内容不存在或已被移除
      </p>
      <a href="/" className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-xl rounded-full transition">
        返回首页
      </a>
    </div>
  );
}