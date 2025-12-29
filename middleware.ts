import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 定义禁止的关键词列表（不区分大小写）
const BANNED_KEYWORDS = [
  '罪恶之渊',     // 示例关键词
  'badword',      // 添加更多关键词
  '敏感词',
  // ...
];

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname.toLowerCase();
  const search = url.search.toLowerCase(); // 查询参数，如 ?q=xxx

  // 检查路径或查询参数是否包含禁止关键词
  const hasBannedKeyword = BANNED_KEYWORDS.some(keyword =>
    pathname.includes(keyword.toLowerCase()) ||
    search.includes(keyword.toLowerCase())
  );

  if (hasBannedKeyword) {
    // 方式1：直接rewrite到根目录的not-found页面（推荐，保持原URL，HTTP状态码为404）
    // 先确保您有 app/not-found.tsx （全局404页面）
    return NextResponse.rewrite(new URL('/not-found', request.url));

    // 方式2：如果没有自定义not-found页面，可rewrite到内置404
    // return NextResponse.rewrite(new URL('/_not-found', request.url));

    // 方式3：如果想重定向（URL会变），并使用自定义404页面
    // return NextResponse.redirect(new URL('/404', request.url));
  }

  // 正常请求继续
  return NextResponse.next();
}

// 可选：指定middleware应用的路径（默认全站）
export const config = {
  matcher: '/:path*', // 匹配所有路径
};