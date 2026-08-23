import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { applyCorsProxy } from '@/lib/tmdb.client';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const CACHE_TTL = 86400; // 24小时

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title')?.trim();
  const originalTitle = searchParams.get('original_title')?.trim();
  const year = searchParams.get('year')?.trim();
  const stype = searchParams.get('stype')?.trim(); // 'movie' | 'tv'

  if (!title && !originalTitle) return NextResponse.json({ data: null }, { status: 400 });

  const config = await getConfig();
  const apiKey = config.SiteConfig?.TMDBApiKey;
  if (!apiKey) return NextResponse.json({ data: null });

  const cacheKey = `tmdb-backdrop-${originalTitle || title}-${year || ''}`;

  // 服务端缓存
  const cached = await db.getCache(cacheKey);
  if (cached) {
    return NextResponse.json({ data: cached },
      { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' } });
  }

  const lang = config.SiteConfig?.TMDBLanguage || 'zh-CN';
  const base = 'https://api.themoviedb.org/3';

  const pickLogo = (logos: any[]) => {
    if (!logos?.length) return null;
    const sorted = logos.slice().sort(
      (a, b) => (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0)
    );
    const logo = sorted.find((l: any) => l.iso_639_1 === 'zh') ||
      sorted.find((l: any) => l.iso_639_1 === 'en') ||
      sorted[0];
    return logo?.file_path ? applyCorsProxy(`https://image.tmdb.org/t/p/w500${logo.file_path}`, config) : null;
  };

  const trySearch = async (query: string, type: 'movie' | 'tv') => {
    try {
      const res = await fetch(
        applyCorsProxy(`${base}/search/${type}?api_key=${apiKey}&language=${lang}&query=${encodeURIComponent(query)}`, config),
        { signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const hit = data.results?.[0];
      if (!hit) return null;

      const imagesRes = await fetch(
        applyCorsProxy(`${base}/${type}/${hit.id}/images?api_key=${apiKey}`, config),
        { signal: AbortSignal.timeout(6000) }
      );
      const images = imagesRes.ok ? await imagesRes.json() : null;
      const logoUrl = pickLogo(images?.logos || []);

      // TV 类型额外拿季数
      let numberOfSeasons: number | null = null;
      if (type === 'tv') {
        try {
          const detailRes = await fetch(
            applyCorsProxy(`${base}/tv/${hit.id}?api_key=${apiKey}&language=${lang}`, config),
            { signal: AbortSignal.timeout(6000) }
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            numberOfSeasons = detail.number_of_seasons || null;
          }
        } catch { /* ignore */ }
      }

      return {
        backdrop: hit.backdrop_path ? applyCorsProxy(`https://image.tmdb.org/t/p/w1280${hit.backdrop_path}`, config) : null,
        poster: hit.poster_path ? applyCorsProxy(`https://image.tmdb.org/t/p/w500${hit.poster_path}`, config) : null,
        logo: logoUrl,
        title: (type === 'movie' ? hit.title : hit.name) || null,
        overview: hit.overview || null,
        rating: hit.vote_average ? parseFloat(hit.vote_average.toFixed(1)) : null,
        year: (type === 'movie' ? hit.release_date : hit.first_air_date)?.slice(0, 4) || null,
        numberOfSeasons: numberOfSeasons,
      };
    } catch {
      return null;
    }
  };

  // 清理标题：去掉「第X季」「Season X」「S1」等后缀
  const cleanTitle = (t: string) => t
    .replace(/\s*第[一二三四五六七八九十\d]+季.*$/u, '')
    .replace(/\s*Season\s*\d+.*/i, '')
    .replace(/\s*S\d{1,2}$/i, '')
    .replace(/\s*(19|20)\d{2}$/, '')
    .trim();

  const searchQuery = cleanTitle(originalTitle || title!);
  const fallbackQuery = originalTitle && title ? cleanTitle(title) : null;

  // 根据 stype 决定搜索类型，没有 stype 则两种都搜
  const types: Array<'movie' | 'tv'> = stype === 'movie' ? ['movie'] : stype === 'tv' ? ['tv'] : ['movie', 'tv'];

  let data: any = null;
  for (const type of types) {
    data = await trySearch(searchQuery, type);
    if (data) break;
  }
  if (!data && fallbackQuery) {
    for (const type of types) {
      data = await trySearch(fallbackQuery, type);
      if (data) break;
    }
  }

  // 写入服务端缓存
  if (data) await db.setCache(cacheKey, data, CACHE_TTL);

  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' } }
  );
}
