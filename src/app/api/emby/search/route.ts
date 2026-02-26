/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { embyManager } from '@/lib/emby-manager';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword');
    const embyKey = searchParams.get('embyKey');

    if (!keyword || !keyword.trim()) {
      return NextResponse.json({ error: '搜索关键词不能为空' }, { status: 400 });
    }

    // 从 cookie 获取用户信息
    const authCookie = getAuthInfoFromCookie(request);

    if (!authCookie?.username) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    const username = authCookie.username;

    // 获取用户的 Emby 客户端
    const client = await embyManager.getClientForUser(username, embyKey || undefined);

    // 调用 Emby 搜索 API
    const response = await client.getItems({
      IncludeItemTypes: 'Movie,Series',
      Recursive: true,
      searchTerm: keyword.trim(),
      Fields: 'PrimaryImageAspectRatio,PremiereDate,ProductionYear,Overview,CommunityRating',
      Limit: 50,
    });

    // 转换为统一格式
    const videos = response.Items.map((item: any) => ({
      id: item.Id,
      title: item.Name,
      poster: client.getImageUrl(item.Id, 'Primary'),
      year: item.ProductionYear?.toString() || '',
      releaseDate: item.PremiereDate,
      overview: item.Overview,
      voteAverage: item.CommunityRating,
      rating: item.CommunityRating,
      mediaType: item.Type === 'Movie' ? 'movie' : 'tv',
    }));

    return NextResponse.json({ videos });
  } catch (error: any) {
    console.error('Emby 搜索失败:', error);
    return NextResponse.json(
      { error: error.message || '搜索失败' },
      { status: 500 }
    );
  }
}
