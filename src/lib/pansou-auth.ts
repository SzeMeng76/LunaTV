function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n]/g, '').trim().replace(/^Bearer\s+/i, '').trim();
}

function normalizeStr(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n]/g, '').trim();
}

function resolveLoginUrl(serverUrl: string): string {
  const base = normalizeUrl(serverUrl);
  if (/\/api\/search$/i.test(base)) return base.replace(/\/api\/search$/i, '/api/auth/login');
  if (/\/api$/i.test(base)) return `${base}/auth/login`;
  return `${base}/api/auth/login`;
}

function parseTokenExpiry(payload: unknown, token: string): number {
  const now = Date.now();
  const fallback = now + 10 * 60 * 1000;
  const candidates: number[] = [];

  if (payload && typeof payload === 'object') {
    const raw = (payload as { expires_at?: unknown }).expires_at;
    const ts = Number(raw);
    if (Number.isFinite(ts) && ts > 0) {
      candidates.push(ts > 10_000_000_000 ? ts : ts * 1000);
    }
  }

  const [, encodedPayload] = token.split('.');
  if (encodedPayload) {
    try {
      const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as { exp?: unknown };
      const exp = Number(decoded.exp);
      if (Number.isFinite(exp) && exp > 0) candidates.push(exp * 1000);
    } catch {
      // non-JWT token, ignore
    }
  }

  const valid = candidates.filter((v) => v > now);
  return valid.length > 0 ? Math.min(...valid) : fallback;
}

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();

async function fetchLoginToken(args: {
  serverUrl: string;
  username: string;
  password: string;
  timeoutMs?: number;
}): Promise<string> {
  const serverUrl = normalizeUrl(args.serverUrl);
  const username = normalizeStr(args.username);
  const password = normalizeStr(args.password);
  if (!serverUrl || !username || !password) return '';

  const cacheKey = `${serverUrl}\n${username}\n${password}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - Date.now() > 60 * 1000) return cached.token;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? 12000);

  try {
    const response = await fetch(resolveLoginUrl(serverUrl), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      cache: 'no-store',
      signal: controller.signal,
    });

    const rawBody = await response.text();
    if (!response.ok) {
      let msg = response.statusText;
      try {
        const parsed = JSON.parse(rawBody) as { error?: unknown; message?: unknown };
        const m = parsed.error || parsed.message;
        if (typeof m === 'string' && m.trim()) msg = m.trim();
      } catch { /* ignore */ }
      throw new Error(`PanSou 登录失败: ${msg}`);
    }

    const payload = JSON.parse(rawBody) as { token?: unknown };
    const token = normalizeToken(payload.token);
    if (!token) throw new Error('PanSou 登录响应中未包含 token');

    tokenCache.set(cacheKey, { token, expiresAt: parseTokenExpiry(payload, token) });
    return token;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function resolvePanSouAuthHeader(args: {
  serverUrl: string;
  token?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
}): Promise<string> {
  const username = normalizeStr(args.username);
  const password = normalizeStr(args.password);

  if (username && password) {
    const loginToken = await fetchLoginToken({
      serverUrl: args.serverUrl,
      username,
      password,
      timeoutMs: args.timeoutMs,
    });
    return loginToken ? `Bearer ${loginToken}` : '';
  }

  const token = normalizeToken(args.token);
  return token ? `Bearer ${token}` : '';
}
