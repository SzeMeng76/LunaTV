import { NextRequest, NextResponse } from 'next/server';

/**
 * 根路径 API 端点
 * 提供服务器状态信息和成人内容过滤模式检测
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // 检测成人内容模式的多种方式
  // 1. URL 参数: ?adult=1 或 ?adult=true
  const adultParam = searchParams.get('adult');
  // 2. 过滤参数: ?filter=off (关闭过滤即显示成人内容)
  const filterParam = searchParams.get('filter');
  // 3. 请求头: X-Content-Mode (由 middleware 设置)
  const contentMode = request.headers.get('X-Content-Mode');

  // 判断是否启用成人内容过滤
  // 默认启用过滤（家庭安全模式）
  const adultFilterEnabled = !(
    adultParam === '1' ||
    adultParam === 'true' ||
    filterParam === 'off' ||
    contentMode === 'adult'
  );

  const response = NextResponse.json({
    status: 'ok',
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    authenticated: true,
    adultFilterEnabled,
    message: adultFilterEnabled
      ? '家庭安全模式 - 成人内容已过滤'
      : '完整内容模式 - 显示所有内容',
  });

  // 设置 CORS 头
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Content-Mode');

  // 设置内容模式响应头
  response.headers.set('X-Adult-Filter', adultFilterEnabled ? 'enabled' : 'disabled');

  return response;
}

/**
 * 处理 CORS 预检请求
 */
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });

  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Content-Mode');

  return response;
}
