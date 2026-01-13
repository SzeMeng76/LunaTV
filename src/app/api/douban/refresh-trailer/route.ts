import { NextResponse } from 'next/server';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

/**
 * 刷新过期的 Douban trailer URL
 * 不使用任何缓存，直接调用豆瓣移动端API获取最新URL
 */

// 带重试的获取函数
async function fetchTrailerWithRetry(id: string, retryCount = 0): Promise<string | null> {
  const MAX_RETRIES = 2;
  const TIMEOUT = 20000; // 20秒超时
  const RETRY_DELAY = 2000; // 2秒后重试

  const startTime = Date.now();

  try {
    // 先尝试 movie 端点
    let mobileApiUrl = `https://m.douban.com/rexxar/api/v2/movie/${id}`;

    console.log(`[refresh-trailer] 开始请求影片 ${id}${retryCount > 0 ? ` (重试 ${retryCount}/${MAX_RETRIES})` : ''}`);

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    let response = await fetch(mobileApiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Referer': 'https://movie.douban.com/explore',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://movie.douban.com',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      },
      redirect: 'manual', // 手动处理重定向
    });

    clearTimeout(timeoutId);

    // 如果是 3xx 重定向，说明可能是电视剧，尝试 tv 端点
    if (response.status >= 300 && response.status < 400) {
      console.log(`[refresh-trailer] 检测到重定向，尝试 TV 端点`);
      mobileApiUrl = `https://m.douban.com/rexxar/api/v2/tv/${id}`;

      const tvController = new AbortController();
      const tvTimeoutId = setTimeout(() => tvController.abort(), TIMEOUT);

      response = await fetch(mobileApiUrl, {
        signal: tvController.signal,
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Referer': 'https://movie.douban.com/explore',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Origin': 'https://movie.douban.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
        },
      });

      clearTimeout(tvTimeoutId);
    }

    const fetchTime = Date.now() - startTime;
    console.log(`[refresh-trailer] 影片 ${id} 请求完成，耗时: ${fetchTime}ms, 状态: ${response.status}`);

    if (!response.ok) {
      throw new Error(`豆瓣API返回错误: ${response.status}`);
    }

    const data = await response.json();
    const trailerUrl = data.trailers?.[0]?.video_url;

    if (!trailerUrl) {
      console.warn(`[refresh-trailer] 影片 ${id} 没有预告片数据`);
      throw new Error('该影片没有预告片');
    }

    const totalTime = Date.now() - startTime;
    console.log(`[refresh-trailer] 影片 ${id} 成功获取trailer URL，总耗时: ${totalTime}ms`);

    return trailerUrl;
  } catch (error) {
    const failTime = Date.now() - startTime;

    // 超时或网络错误，尝试重试
    if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('fetch'))) {
      console.error(`[refresh-trailer] 影片 ${id} 请求失败 (耗时: ${failTime}ms): ${error.name === 'AbortError' ? '超时' : error.message}`);

      if (retryCount < MAX_RETRIES) {
        console.warn(`[refresh-trailer] ${RETRY_DELAY}ms后重试 (${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchTrailerWithRetry(id, retryCount + 1);
      } else {
        console.error(`[refresh-trailer] 影片 ${id} 重试次数已达上限，放弃请求`);
      }
    } else {
      console.error(`[refresh-trailer] 影片 ${id} 发生错误 (耗时: ${failTime}ms):`, error);
    }

    throw error;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      {
        code: 400,
        message: '缺少必要参数: id',
        error: 'MISSING_PARAMETER',
      },
      { status: 400 }
    );
  }

  try {
    const trailerUrl = await fetchTrailerWithRetry(id);

    return NextResponse.json(
      {
        code: 200,
        message: '获取成功',
        data: {
          trailerUrl,
        },
      },
      {
        headers: {
          // 不缓存这个 API 的响应
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      // 超时错误
      if (error.name === 'AbortError') {
        return NextResponse.json(
          {
            code: 504,
            message: '请求超时，豆瓣响应过慢',
            error: 'TIMEOUT',
          },
          { status: 504 }
        );
      }

      // 没有预告片
      if (error.message.includes('没有预告片')) {
        return NextResponse.json(
          {
            code: 404,
            message: error.message,
            error: 'NO_TRAILER',
          },
          { status: 404 }
        );
      }

      // 其他错误
      return NextResponse.json(
        {
          code: 500,
          message: '刷新 trailer URL 失败',
          error: 'FETCH_ERROR',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        code: 500,
        message: '刷新 trailer URL 失败',
        error: 'UNKNOWN_ERROR',
      },
      { status: 500 }
    );
  }
}
