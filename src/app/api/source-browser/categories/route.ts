import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { API_CONFIG, getAvailableApiSites } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sourceKey = searchParams.get('source');

  if (!sourceKey) {
    return NextResponse.json({ error: '缺少 source 参数' }, { status: 400 });
  }

  try {
    const availableSites = await getAvailableApiSites(authInfo.username);
    const source = availableSites.find((s) => s.key === sourceKey);
    if (!source) {
      return NextResponse.json(
        { error: '你没有权限访问该资源源' },
        { status: 403 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const url = `${source.api}?ac=list`;
    const res = await fetch(url, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return NextResponse.json(
        { error: `上游返回错误: ${res.status}` },
        { status: res.status }
      );
    }
    type AppleCMSClass = {
      type_id?: string | number;
      typeid?: string | number;
      id?: string | number;
      type_name?: string;
      typename?: string;
      name?: string;
    };
    const data = (await res.json()) as { class?: AppleCMSClass[] };
    const classes: AppleCMSClass[] = Array.isArray(data.class) ? data.class : [];
    const categories = classes
      .map((c) => ({
        type_id: c.type_id ?? c.typeid ?? c.id,
        type_name: c.type_name ?? c.typename ?? c.name,
      }))
      .filter(
        (c): c is { type_id: string | number; type_name: string } =>
          Boolean(c.type_id && c.type_name)
      );

    return NextResponse.json({ categories });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '请求超时' }, { status: 408 });
    }
    return NextResponse.json({ error: '获取分类失败' }, { status: 500 });
  }
}
