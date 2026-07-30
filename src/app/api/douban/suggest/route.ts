import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();

  if (!q) return NextResponse.json([]);

  try {
    const res = await fetch(
      `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': 'https://movie.douban.com/',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    const results = (Array.isArray(data) ? data : [])
      .filter((item: any) => item.type === 'movie' || !item.type)
      .slice(0, 5)
      .map((item: any) => ({ id: item.id, title: item.title, year: item.year }));
    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  } catch {
    return NextResponse.json([]);
  }
}
