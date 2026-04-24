import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { refreshLiveChannels } from '@/lib/live';

export const runtime = 'nodejs';

// 导出直播源
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    const username = authInfo?.username;
    const config = await getConfig();

    if (username !== process.env.USERNAME) {
      const user = config.UserConfig.Users.find(u => u.username === username);
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    const format = request.nextUrl.searchParams.get('format') || 'json';
    const liveSources = config.LiveConfig || [];

    if (format === 'm3u') {
      const m3uContent = generateM3U(liveSources);
      return new NextResponse(m3uContent, {
        headers: {
          'Content-Type': 'audio/x-mpegurl',
          'Content-Disposition': 'attachment; filename="live-sources.m3u"',
        },
      });
    } else {
      const exportData = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        sources: liveSources.filter(s => s.from === 'custom').map(s => ({
          key: s.key,
          name: s.name,
          url: s.url,
          ua: s.ua,
          epg: s.epg,
          isTvBox: s.isTvBox,
        })),
      };

      return NextResponse.json(exportData, {
        headers: {
          'Content-Disposition': 'attachment; filename="live-sources.json"',
        },
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导出失败' },
      { status: 500 }
    );
  }
}

// 导入直播源
export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    const username = authInfo?.username;
    const config = await getConfig();

    if (username !== process.env.USERNAME) {
      const user = config.UserConfig.Users.find(u => u.username === username);
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { content, format, mode = 'merge' } = body;

    if (!config.LiveConfig) {
      config.LiveConfig = [];
    }

    let importedSources: any[] = [];

    if (format === 'm3u' || content.includes('#EXTM3U')) {
      importedSources = parseM3UForImport(content);
    } else if (format === 'json' || content.trim().startsWith('{')) {
      const data = JSON.parse(content);
      importedSources = data.sources || [];
    } else if (content.includes(',#genre#')) {
      return NextResponse.json({
        error: 'TVBox TXT 格式请直接添加为直播源 URL'
      }, { status: 400 });
    } else {
      return NextResponse.json({ error: '不支持的格式' }, { status: 400 });
    }

    if (mode === 'replace') {
      config.LiveConfig = config.LiveConfig.filter(s => s.from === 'config');
    }

    let addedCount = 0;
    let skippedCount = 0;

    for (const source of importedSources) {
      const exists = config.LiveConfig.some(s => s.key === source.key || s.url === source.url);
      if (exists && mode === 'merge') {
        skippedCount++;
        continue;
      }

      const liveInfo = {
        key: source.key || `imported_${Date.now()}_${addedCount}`,
        name: source.name || '未命名直播源',
        url: source.url,
        ua: source.ua || '',
        epg: source.epg || '',
        isTvBox: source.isTvBox || false,
        from: 'custom' as const,
        channelNumber: 0,
        disabled: false,
      };

      try {
        const nums = await refreshLiveChannels(liveInfo);
        liveInfo.channelNumber = nums;
        config.LiveConfig.push(liveInfo);
        addedCount++;
      } catch (error) {
        console.error('刷新直播源失败:', error);
        skippedCount++;
      }
    }

    await db.saveAdminConfig(config);
    clearConfigCache();

    return NextResponse.json({
      success: true,
      added: addedCount,
      skipped: skippedCount,
      total: importedSources.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 }
    );
  }
}

function generateM3U(sources: any[]): string {
  let m3u = '#EXTM3U\n';

  for (const source of sources) {
    if (source.from === 'custom') {
      m3u += `#EXTINF:-1 tvg-name="${source.name}" group-title="导入源",${source.name}\n`;
      m3u += `${source.url}\n`;
    }
  }

  return m3u;
}

function parseM3UForImport(content: string): any[] {
  const sources: any[] = [];
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF:')) {
      const name = line.match(/,([^,]*)$/)?.[1]?.trim() || '未命名';
      const url = lines[i + 1];

      if (url && !url.startsWith('#')) {
        sources.push({
          key: `imported_${Date.now()}_${sources.length}`,
          name,
          url,
          ua: '',
          epg: '',
          isTvBox: false,
        });
        i++;
      }
    }
  }

  return sources;
}

