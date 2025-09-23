import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { searchTMDBActorWorks, isTMDBEnabled, TMDBFilterOptions } from '@/lib/tmdb.client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 获取参数
  const actorName = searchParams.get('actor');
  const type = searchParams.get('type') || 'movie';

  // 筛选参数
  const filterOptions: TMDBFilterOptions = {};

  // 时间筛选
  const startYear = searchParams.get('startYear');
  const endYear = searchParams.get('endYear');
  if (startYear) filterOptions.startYear = parseInt(startYear);
  if (endYear) filterOptions.endYear = parseInt(endYear);

  // 评分筛选
  const minRating = searchParams.get('minRating');
  const maxRating = searchParams.get('maxRating');
  if (minRating) filterOptions.minRating = parseFloat(minRating);
  if (maxRating) filterOptions.maxRating = parseFloat(maxRating);

  // 人气筛选
  const minPopularity = searchParams.get('minPopularity');
  const maxPopularity = searchParams.get('maxPopularity');
  if (minPopularity) filterOptions.minPopularity = parseFloat(minPopularity);
  if (maxPopularity) filterOptions.maxPopularity = parseFloat(maxPopularity);

  // 投票数筛选
  const minVoteCount = searchParams.get('minVoteCount');
  if (minVoteCount) filterOptions.minVoteCount = parseInt(minVoteCount);

  // 集数筛选（TV剧）
  const minEpisodeCount = searchParams.get('minEpisodeCount');
  if (minEpisodeCount) filterOptions.minEpisodeCount = parseInt(minEpisodeCount);

  // 类型筛选
  const genreIds = searchParams.get('genreIds');
  if (genreIds) {
    filterOptions.genreIds = genreIds.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
  }

  // 语言筛选
  const languages = searchParams.get('languages');
  if (languages) {
    filterOptions.languages = languages.split(',');
  }

  // 只显示有评分的
  const onlyRated = searchParams.get('onlyRated');
  if (onlyRated === 'true') filterOptions.onlyRated = true;

  // 排序
  const sortBy = searchParams.get('sortBy');
  const sortOrder = searchParams.get('sortOrder');
  if (sortBy && ['rating', 'date', 'popularity', 'vote_count', 'title', 'episode_count'].includes(sortBy)) {
    filterOptions.sortBy = sortBy as any;
  }
  if (sortOrder && ['asc', 'desc'].includes(sortOrder)) {
    filterOptions.sortOrder = sortOrder as any;
  }

  // 结果限制
  const limit = searchParams.get('limit');
  if (limit) filterOptions.limit = parseInt(limit);

  // 验证参数
  if (!actorName?.trim()) {
    return NextResponse.json(
      { error: '缺少必要参数: actor（演员名字）' },
      { status: 400 }
    );
  }

  if (!['tv', 'movie'].includes(type)) {
    return NextResponse.json(
      { error: 'type 参数必须是 tv 或 movie' },
      { status: 400 }
    );
  }

  try {
    // 检查TMDB是否启用
    const enabled = await isTMDBEnabled();
    if (!enabled) {
      return NextResponse.json(
        {
          error: 'TMDB演员搜索功能未启用',
          message: '请在管理后台配置TMDB API Key并启用此功能'
        },
        { status: 503 }
      );
    }

    console.log(`[TMDB演员搜索API] 搜索演员: ${actorName}, 类型: ${type}`);

    // 调用TMDB演员搜索函数
    const result = await searchTMDBActorWorks(
      actorName.trim(),
      type as 'movie' | 'tv',
      filterOptions
    );

    console.log(`[TMDB演员搜索API] 搜索结果: ${result.list?.length || 0} 项`);

    // 设置合理的缓存时间
    const cacheTime = await getCacheTime();
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    console.error(`[TMDB演员搜索API] 搜索失败: ${actorName}`, (error as Error).message);
    return NextResponse.json(
      {
        error: 'TMDB演员搜索失败',
        details: (error as Error).message,
        params: { actorName, type, filterOptions }
      },
      { status: 500 }
    );
  }
}