import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BANNED_KEYWORDS = [
  '罪恶之渊',
  '赌博', '博彩', '赌场', '百家乐', '老虎机', '彩票', '六合彩',
  // ...其他词
];

export function middleware(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  for (const [key, value] of searchParams.entries()) {
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (BANNED_KEYWORDS.some(kw => lowerValue.includes(kw.toLowerCase()))) {
        return new Response('Not Found', { status: 404 });
      }
    }
  }

  // 检查路径（可选）
  const pathname = request.nextUrl.pathname.toLowerCase();
  if (BANNED_KEYWORDS.some(kw => pathname.includes(kw.toLowerCase()))) {
    return new Response('Not Found', { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};