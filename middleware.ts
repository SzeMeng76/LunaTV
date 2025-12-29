// middleware.ts （放在项目根目录）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 禁止关键词列表（支持多个）
const BANNED_KEYWORDS = [
  '罪恶之渊',
  // '另一个禁止标题',
];

export function middleware(request: NextRequest) {
  // 直接获取 title 参数（Next.js 已自动解码汉字）
  const title = request.nextUrl.searchParams.get('title');

  // 检查 title 是否包含禁止关键词（不区分大小写）
  if (title) {
    const lowerTitle = title.toLowerCase();
    const isBanned = BANNED_KEYWORDS.some(keyword =>
      lowerTitle.includes(keyword.toLowerCase())
    );

    if (isBanned) {
      // 返回 404（推荐使用自定义页面）
      return NextResponse.rewrite(new URL('/404', request.url));
      // 或使用内置：return new Response('Not Found', { status: 404 });
    }
  }

  // 正常通过
  return NextResponse.next();
}

// 确保对所有路径生效（特别是 /play）
export const config = {
  matcher: '/:path*',
};