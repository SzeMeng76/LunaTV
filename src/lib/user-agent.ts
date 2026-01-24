/**
 * 统一的User-Agent管理工具
 * 2026年1月最新版本
 */

// 2026年1月最新浏览器版本 (Updated: 2026-01-23)
export const LATEST_USER_AGENTS = {
  // Chrome 144 (2026-01-21发布)
  chrome: {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
  },
  // Firefox 147 (2026-01-16发布)
  firefox: {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0',
    linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
  },
  // Safari 26 (2025-09-15发布 - macOS版本冻结在10_15_7)
  safari: {
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  },
  // Edge 144 (2026-01-16发布)
  edge: {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
  },
};

// User-Agent池（用于轮换）
export const USER_AGENT_POOL = [
  // Chrome 144
  LATEST_USER_AGENTS.chrome.windows,
  LATEST_USER_AGENTS.chrome.macos,
  LATEST_USER_AGENTS.chrome.linux,
  // Firefox 147
  LATEST_USER_AGENTS.firefox.windows,
  LATEST_USER_AGENTS.firefox.macos,
  LATEST_USER_AGENTS.firefox.linux,
  // Safari 26
  LATEST_USER_AGENTS.safari.macos,
  // Edge 144
  LATEST_USER_AGENTS.edge.windows,
  LATEST_USER_AGENTS.edge.macos,
];

/**
 * 获取随机User-Agent
 */
export function getRandomUserAgent(): string {
  return USER_AGENT_POOL[Math.floor(Math.random() * USER_AGENT_POOL.length)];
}

/**
 * 获取随机User-Agent及浏览器信息
 */
export function getRandomUserAgentWithInfo(): {
  ua: string;
  browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  platform: string;
} {
  const ua = getRandomUserAgent();

  let browser: 'chrome' | 'firefox' | 'safari' | 'edge';
  let platform: string;

  if (ua.includes('Firefox')) {
    browser = 'firefox';
  } else if (ua.includes('Edg/')) {
    browser = 'edge';
  } else if (ua.includes('Safari') && ua.includes('Version/')) {
    browser = 'safari';
  } else {
    browser = 'chrome';
  }

  if (ua.includes('Windows')) {
    platform = 'Windows';
  } else if (ua.includes('Macintosh')) {
    platform = 'macOS';
  } else {
    platform = 'Linux';
  }

  return { ua, browser, platform };
}

/**
 * 生成Sec-CH-UA客户端提示头（Chrome/Edge专用）
 */
export function getSecChUaHeaders(browser: 'chrome' | 'firefox' | 'safari' | 'edge', platform: string): Record<string, string> {
  if (browser === 'chrome') {
    return {
      'Sec-CH-UA': '"Google Chrome";v="144", "Chromium";v="144", "Not(A:Brand";v="99"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': `"${platform}"`,
    };
  } else if (browser === 'edge') {
    return {
      'Sec-CH-UA': '"Microsoft Edge";v="144", "Chromium";v="144", "Not(A:Brand";v="99"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': `"${platform}"`,
    };
  }
  // Firefox和Safari不需要Sec-CH-UA
  return {};
}

/**
 * 获取完整的请求头（包括User-Agent和Sec-CH-UA）
 */
export function getFullUserAgentHeaders(): Record<string, string> {
  const { ua, browser, platform } = getRandomUserAgentWithInfo();
  const secChHeaders = getSecChUaHeaders(browser, platform);

  return {
    'User-Agent': ua,
    ...secChHeaders,
  };
}

/**
 * 默认User-Agent（Chrome Windows最新版）
 */
export const DEFAULT_USER_AGENT = LATEST_USER_AGENTS.chrome.windows;
