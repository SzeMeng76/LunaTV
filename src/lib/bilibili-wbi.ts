/**
 * Bilibili Wbi 签名模块
 * 用于 B站 API 反爬虫验证
 */

import md5 from 'md5';

// Wbi 签名映射表（固定）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];

// Wbi Keys 缓存
interface WbiKeysCache {
  img_key: string;
  sub_key: string;
  timestamp: number;
}

let cachedWbiKeys: WbiKeysCache | null = null;

/**
 * 获取 Wbi Keys（img_key 和 sub_key）
 * 每天更新一次，使用缓存机制
 */
export async function getWbiKeys(): Promise<{ img_key: string; sub_key: string }> {
  // 检查缓存（24小时内有效）
  const now = Date.now();
  if (cachedWbiKeys && now - cachedWbiKeys.timestamp < 24 * 60 * 60 * 1000) {
    console.log('✅ 使用缓存的 Wbi Keys');
    return { img_key: cachedWbiKeys.img_key, sub_key: cachedWbiKeys.sub_key };
  }

  console.log('🔄 获取新的 Wbi Keys...');

  try {
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`获取 Wbi Keys 失败: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 0 && data.code !== -101) {
      throw new Error(`B站 API 返回错误: ${data.message}`);
    }

    const img_url = data.data?.wbi_img?.img_url;
    const sub_url = data.data?.wbi_img?.sub_url;

    if (!img_url || !sub_url) {
      throw new Error('无法获取 wbi_img 数据');
    }

    // 提取文件名（去掉路径和扩展名）
    const img_key = img_url.split('/').pop()?.split('.')[0];
    const sub_key = sub_url.split('/').pop()?.split('.')[0];

    if (!img_key || !sub_key) {
      throw new Error('无法解析 img_key 或 sub_key');
    }

    // 更新缓存
    cachedWbiKeys = { img_key, sub_key, timestamp: now };
    console.log(`✅ Wbi Keys 已更新: ${img_key.slice(0, 8)}...`);

    return { img_key, sub_key };
  } catch (error) {
    console.error('❌ 获取 Wbi Keys 失败:', error);

    // 如果有旧缓存，继续使用（即使过期）
    if (cachedWbiKeys) {
      console.warn('⚠️ 使用过期的 Wbi Keys 缓存');
      return { img_key: cachedWbiKeys.img_key, sub_key: cachedWbiKeys.sub_key };
    }

    throw error;
  }
}

/**
 * 获取 mixin_key
 * 通过映射表打乱重排 img_key + sub_key
 */
function getMixinKey(img_key: string, sub_key: string): string {
  const raw = img_key + sub_key;
  return MIXIN_KEY_ENC_TAB.map(n => raw[n]).join('').slice(0, 32);
}

/**
 * Wbi 签名
 * 为请求参数添加 wts 和 w_rid
 */
export async function encWbi(params: Record<string, any>): Promise<string> {
  const { img_key, sub_key } = await getWbiKeys();
  const mixin_key = getMixinKey(img_key, sub_key);

  // 添加时间戳
  const wts = Math.round(Date.now() / 1000);
  params.wts = wts;

  // 按 key 排序
  const sortedKeys = Object.keys(params).sort();

  // 过滤特殊字符并 URL 编码
  const query = sortedKeys
    .map(key => {
      // 过滤 value 中的 "!'()*" 字符
      const value = String(params[key]).replace(/[!'()*]/g, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  // 计算签名
  const w_rid = md5(query + mixin_key);

  return `${query}&w_rid=${w_rid}`;
}

/**
 * 获取 buvid3（设备标识）
 * B站需要此 Cookie 来识别设备
 */
export async function getBuvid3(): Promise<string> {
  try {
    const response = await fetch('https://api.bilibili.com/x/frontend/finger/spi');
    const data = await response.json();

    if (data.code === 0 && data.data?.b_3) {
      return data.data.b_3;
    }

    throw new Error('无法获取 buvid3');
  } catch (error) {
    console.error('❌ 获取 buvid3 失败:', error);
    // 返回一个默认值（格式正确但随机）
    return `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 18).toUpperCase()}infoc`;
  }
}

/**
 * 获取标准的 B站请求 Headers
 */
export function getBilibiliHeaders(buvid3?: string): HeadersInit {
  const headers: HeadersInit = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };

  if (buvid3) {
    headers['Cookie'] = `buvid3=${buvid3}`;
  }

  return headers;
}
