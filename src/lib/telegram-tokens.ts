import { db } from './db';

export interface TelegramTokenData {
  telegramUsername: string;
  expiresAt: number;
  baseUrl?: string;
}

// 存储 token 到数据库
export async function setTelegramToken(token: string, data: TelegramTokenData): Promise<void> {
  const key = `telegram_token:${token}`;
  const now = Date.now();
  const ttlMs = data.expiresAt - now;
  const ttl = Math.floor(ttlMs / 1000); // 转换为秒

  console.log('[TelegramToken] setTelegramToken called');
  console.log('[TelegramToken] Key:', key);
  console.log('[TelegramToken] Current time:', now);
  console.log('[TelegramToken] Expires at:', data.expiresAt);
  console.log('[TelegramToken] TTL (ms):', ttlMs);
  console.log('[TelegramToken] TTL (seconds):', ttl);
  console.log('[TelegramToken] Data:', JSON.stringify(data));
  console.log('[TelegramToken] Storage type:', process.env.NEXT_PUBLIC_STORAGE_TYPE);

  // 验证 TTL 是否有效
  if (ttl <= 0) {
    const error = new Error(`Invalid TTL: ${ttl} seconds (expiresAt: ${data.expiresAt}, now: ${now})`);
    console.error('[TelegramToken] TTL validation failed:', error.message);
    throw error;
  }

  // Kvrocks 特殊处理：确保 TTL 至少为 1 秒，避免立即过期的边缘情况
  const finalTtl = Math.max(ttl, 1);

  if (finalTtl !== ttl) {
    console.warn('[TelegramToken] TTL adjusted from', ttl, 'to', finalTtl, 'seconds for compatibility');
  }

  try {
    // 使用通用缓存接口，自动兼容所有存储类型
    await db.setCache(key, data, finalTtl);
    console.log('[TelegramToken] Token stored successfully with TTL:', finalTtl, 'seconds');
  } catch (error) {
    console.error('[TelegramToken] Failed to store token:', error);
    throw error;
  }
}

// 从数据库获取 token（用于 webhook，仅读取不删除）
export async function getTelegramToken(token: string): Promise<TelegramTokenData | null> {
  const key = `telegram_token:${token}`;

  console.log('[TelegramToken] getTelegramToken called');
  console.log('[TelegramToken] Token:', token);
  console.log('[TelegramToken] Key:', key);
  console.log('[TelegramToken] Storage type:', process.env.NEXT_PUBLIC_STORAGE_TYPE);

  try {
    console.log('[TelegramToken] Calling db.getCache...');
    const data = await db.getCache(key);
    console.log('[TelegramToken] Raw data from cache:', JSON.stringify(data));
    console.log('[TelegramToken] Data type:', typeof data);

    if (!data) {
      console.log('[TelegramToken] No data found in cache (data is', data, ')');
      return null;
    }

    console.log('[TelegramToken] Data found');
    console.log('[TelegramToken] Current time:', Date.now());
    console.log('[TelegramToken] Expires at:', data.expiresAt);
    console.log('[TelegramToken] Time difference (ms):', data.expiresAt - Date.now());

    // 仅检查过期但不删除（让 Redis TTL 自动处理过期）
    // 这样 webhook 可以多次读取同一个 token
    if (data.expiresAt < Date.now()) {
      console.log('[TelegramToken] Token expired (TTL should have handled this)');
      return null;
    }

    console.log('[TelegramToken] Token valid, returning data');
    return data as TelegramTokenData;
  } catch (error) {
    console.error('[TelegramToken] Failed to get token:', error);
    console.error('[TelegramToken] Error stack:', error instanceof Error ? error.stack : 'N/A');
    return null;
  }
}

// 验证并消费 token（用于 verify，验证后立即删除）
export async function verifyAndConsumeTelegramToken(token: string): Promise<TelegramTokenData | null> {
  const key = `telegram_token:${token}`;

  console.log('[TelegramToken] verifyAndConsumeTelegramToken called');
  console.log('[TelegramToken] Key:', key);

  try {
    const data = await db.getCache(key);
    console.log('[TelegramToken] Raw data from cache:', data);

    if (!data) {
      console.log('[TelegramToken] No data found in cache');
      return null;
    }

    console.log('[TelegramToken] Data found, checking expiration');
    console.log('[TelegramToken] Current time:', Date.now());
    console.log('[TelegramToken] Expires at:', data.expiresAt);

    // 检查是否过期
    if (data.expiresAt < Date.now()) {
      console.log('[TelegramToken] Token expired, deleting');
      await deleteTelegramToken(token);
      return null;
    }

    // 立即删除 token（一次性使用）
    console.log('[TelegramToken] Token valid, deleting for one-time use');
    await deleteTelegramToken(token);

    console.log('[TelegramToken] Returning token data');
    return data as TelegramTokenData;
  } catch (error) {
    console.error('[TelegramToken] Failed to verify and consume token:', error);
    return null;
  }
}

// 删除 token
export async function deleteTelegramToken(token: string): Promise<void> {
  const key = `telegram_token:${token}`;

  console.log('[TelegramToken] deleteTelegramToken called');
  console.log('[TelegramToken] Key:', key);

  try {
    await db.deleteCache(key);
    console.log('[TelegramToken] Token deleted successfully');
  } catch (error) {
    console.error('[TelegramToken] Failed to delete token:', error);
  }
}

// 为了兼容性，保留 Map（但不再使用）
export const magicLinkTokens = new Map<string, TelegramTokenData>();

export function cleanExpiredTokens() {
  // 不再需要手动清理，Redis TTL 会自动处理
}
