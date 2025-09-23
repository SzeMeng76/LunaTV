// 用户代理池
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

// 请求限制器 - 进一步优化用户体验
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 减少到500ms，更快响应

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 智能延时：根据URL类型调整延时
function getSmartDelay(url: string): { min: number; max: number } {
  // 移动端API通常更宽松，可以减少延时
  if (url.includes('m.douban.com')) {
    return { min: 100, max: 400 }; // 移动端API：100-400ms
  }
  // 桌面端API需要更谨慎
  if (url.includes('movie.douban.com')) {
    return { min: 300, max: 800 }; // 桌面端API：300-800ms
  }
  return { min: 200, max: 500 }; // 默认：200-500ms
}

function smartRandomDelay(url: string): Promise<void> {
  const { min, max } = getSmartDelay(url);
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 通用的豆瓣数据获取函数
 * @param url 请求的URL
 * @returns Promise<T> 返回指定类型的数据
 */
export async function fetchDoubanData<T>(url: string): Promise<T> {
  // 请求限流：确保请求间隔
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => 
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();

  // 智能延时：根据API类型调整
  await smartRandomDelay(url);

  // 添加超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 优化到10秒

  // 设置请求选项
  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://movie.douban.com/',
      // 随机添加Origin，但概率更低以减少复杂性
      ...(Math.random() > 0.8 ? { 'Origin': 'https://movie.douban.com' } : {}),
    },
  };

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 获取豆瓣HTML页面数据的函数
 * @param url 请求的URL
 * @returns Promise<string> 返回HTML字符串
 */
export async function fetchDoubanHtml(url: string): Promise<string> {
  // 请求限流：确保请求间隔
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve =>
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();

  // 智能延时：根据API类型调整
  await smartRandomDelay(url);

  // 添加超时控制 - 增加到30秒用于多页获取
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  // 设置请求选项
  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Referer': 'https://www.douban.com/',
      // 添加更多真实浏览器请求头
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    }
  };

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
