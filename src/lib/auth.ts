import { NextRequest } from 'next/server';

// 生成 HMAC-SHA256 签名（十六进制字符串）
export async function generateSignature(
  data: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 签名新鲜度：签名覆盖时间戳，超过即失效（与 cookie 有效期一致），防重放
export const SIGNATURE_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

// 生成认证 Cookie（带签名）。
// 安全约束：
// 1. password 不做明文存储——存 HMAC 哈希，服务端校验时哈希比对（防 XSS/嗅探直接读取明文密码）
// 2. 签名覆盖 `${username}:${timestamp}`，服务端校验新鲜度（防窃取后无限期重放）
// 3. httpOnly 需保持 false：客户端大量依赖从 cookie 读取 username/role（PWA）
export async function generateAuthCookie(
  username?: string,
  role: 'owner' | 'admin' | 'user' = 'user',
  password?: string,
  includePassword = false,
): Promise<string> {
  const authData: Record<string, unknown> = { role };

  // 只在需要时包含 password 的哈希（绝不存明文）
  if (includePassword && password && process.env.PASSWORD) {
    authData.password = await generateSignature(password, process.env.PASSWORD);
  }

  if (username && process.env.PASSWORD) {
    const timestamp = Date.now();
    authData.username = username;
    authData.signature = await generateSignature(
      `${username}:${timestamp}`,
      process.env.PASSWORD,
    );
    authData.timestamp = timestamp;
    authData.loginTime = timestamp;
  }

  return encodeURIComponent(JSON.stringify(authData));
}

// localstorage 模式密码哈希（模块级缓存：同 PASSWORD 只算一次）
let localPasswordHashCache: string | null = null;
let localPasswordHashCacheEnv: string | undefined;

// 计算 localstorage 模式的密码哈希基准值：HMAC(PASSWORD, PASSWORD)
export async function getLocalPasswordHash(): Promise<string | null> {
  const envPassword = process.env.PASSWORD;
  if (!envPassword) return null;

  if (localPasswordHashCacheEnv === envPassword && localPasswordHashCache) {
    return localPasswordHashCache;
  }

  localPasswordHashCache = await generateSignature(envPassword, envPassword);
  localPasswordHashCacheEnv = envPassword;
  return localPasswordHashCache;
}

// 校验 localstorage 模式 cookie 中的密码哈希
export async function verifyLocalPasswordHash(
  storedHash?: string,
): Promise<boolean> {
  if (!storedHash) return false;
  const expected = await getLocalPasswordHash();
  return !!expected && storedHash === expected;
}

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(request: NextRequest): {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  loginTime?: number;
  trustedNetwork?: boolean;
  role?: 'owner' | 'admin' | 'user';
} | null {
  // 尝试新的 cookie 名称 user_auth，如果没有则尝试旧的 auth
  const authCookie =
    request.cookies.get('user_auth') || request.cookies.get('auth');

  if (!authCookie) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(authCookie.value);
    const authData = JSON.parse(decoded);
    return authData;
  } catch {
    return null;
  }
}

// 从cookie获取认证信息 (客户端使用)
export function getAuthInfoFromBrowserCookie(): {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
  loginTime?: number;
  trustedNetwork?: boolean;
  role?: 'owner' | 'admin' | 'user';
} | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // 解析 document.cookie
    const cookies = document.cookie.split(';').reduce(
      (acc, cookie) => {
        const trimmed = cookie.trim();
        const firstEqualIndex = trimmed.indexOf('=');

        if (firstEqualIndex > 0) {
          const key = trimmed.substring(0, firstEqualIndex);
          const value = trimmed.substring(firstEqualIndex + 1);
          if (key && value) {
            acc[key] = value;
          }
        }

        return acc;
      },
      {} as Record<string, string>,
    );

    // 尝试新的 cookie 名称 user_auth，如果没有则尝试旧的 auth
    const authCookie = cookies['user_auth'] || cookies['auth'];
    if (!authCookie) {
      return null;
    }

    // 处理可能的双重编码
    let decoded = decodeURIComponent(authCookie);

    // 如果解码后仍然包含 %，说明是双重编码，需要再次解码
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }

    const authData = JSON.parse(decoded);
    return authData;
  } catch {
    return null;
  }
}
