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
  const typeId = searchParams.get('type_id');
  const page = parseInt(searchParams.get('page') || '1', 10) || 1;

  if (!sourceKey || !typeId) {
    return NextResponse.json(
      { error: '缺少 source 或 type_id 参数' },
      { status: 400 }
    );
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
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    // 苹果CMS常见列表参数：ac=videolist&t=<typeId>&pg=<page>
    const url = `${source.api}?ac=videolist&t=${encodeURIComponent(
      typeId
    )}&pg=${page}`;
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
    type AppleCMSItem = {
      vod_id?: string | number;
      id?: string | number;
      vod_name?: string;
      title?: string;
      vod_pic?: string;
      pic?: string;
      vod_year?: string;
      year?: string;
      type_name?: string;
      vod_remarks?: string;
      remarks?: string;
    };
    type AppleCMSVideoListResponse = {
      list?: AppleCMSItem[];
      data?: AppleCMSItem[];
      page?: number | string;
      pagecount?: number | string;
      pageCount?: number | string;
      total?: number | string;
      limit?: number | string;
      pageSize?: number | string;
    };
    const data = (await res.json()) as AppleCMSVideoListResponse;
    const list: AppleCMSItem[] = Array.isArray(data.list)
      ? data.list
      : Array.isArray(data.data)
      ? data.data
      : [];
    const items = list
      .map((r) => ({
        id: String(r.vod_id ?? r.id ?? ''),
        title: String(r.vod_name ?? r.title ?? ''),
        poster: String(r.vod_pic ?? r.pic ?? ''),
        year: String(r.vod_year ?? r.year ?? ''),
        type_name: String(r.type_name ?? ''),
        remarks: String(r.vod_remarks ?? r.remarks ?? ''),
      }))
      .filter((r) => r.id && r.title);

    const meta = {
      page: Number(data.page ?? page),
      pagecount: Number(data.pagecount ?? data.pageCount ?? 1),
      total: Number(data.total ?? items.length),
      limit: Number(data.limit ?? data.pageSize ?? 0),
    };

    return NextResponse.json({
      items,
      meta,
      source: { key: source.key, name: source.name },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '请求超时' }, { status: 408 });
    }
    return NextResponse.json({ error: '获取列表失败' }, { status: 500 });
  }
}
