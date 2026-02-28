/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { embyManager } from '@/lib/emby-manager';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getCachedMediaIndex, setCachedMediaIndex } from '@/lib/emby-cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword');
    const embyKey = searchParams.get('embyKey');
    const parentId = searchParams.get('parentId') || undefined;

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
    const embyKeyStr = embyKey || undefined;

    // 获取用户的 Emby 客户端
    const client = await embyManager.getClientForUser(username, embyKeyStr);

    // 尝试从本地索引搜索（缓存 key 区分 parentId）
    const cacheKey = parentId ? `${embyKeyStr}:${parentId}` : embyKeyStr;
    let index = getCachedMediaIndex(cacheKey);

    if (!index) {
      // 索引不存在，分页拉取全量数据建立索引
      const PAGE_SIZE = 500;
      const allItems: any[] = [];

      // 第一批：拿数据同时获得 TotalRecordCount
      const firstPage = await client.getItems({
        ParentId: parentId,
        IncludeItemTypes: 'Movie,Series',
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio,PremiereDate,ProductionYear,Overview,CommunityRating',
        StartIndex: 0,
        Limit: PAGE_SIZE,
      });

      allItems.push(...firstPage.Items);
      const total = firstPage.TotalRecordCount;

      // 并发拉取剩余分页
      if (total > PAGE_SIZE) {
        const remainingRequests = [];
        for (let startIndex = PAGE_SIZE; startIndex < total; startIndex += PAGE_SIZE) {
          remainingRequests.push(
            client.getItems({
              ParentId: parentId,
              IncludeItemTypes: 'Movie,Series',
              Recursive: true,
              Fields: 'PrimaryImageAspectRatio,PremiereDate,ProductionYear,Overview,CommunityRating',
              StartIndex: startIndex,
              Limit: PAGE_SIZE,
            })
          );
        }
        const pages = await Promise.all(remainingRequests);
        for (const page of pages) {
          allItems.push(...page.Items);
        }
      }

      index = allItems.map((item: any) => ({
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

      setCachedMediaIndex(index, cacheKey);
    }

    // 本地模糊搜索（包含匹配，不区分大小写）
    const lowerKeyword = keyword.trim().toLowerCase();
    const videos = index.filter(item =>
      item.title.toLowerCase().includes(lowerKeyword)
    );

    return NextResponse.json({ videos });
  } catch (error: any) {
    console.error('Emby 搜索失败:', error);
    return NextResponse.json(
      { error: error.message || '搜索失败' },
      { status: 500 }
    );
  }
}
