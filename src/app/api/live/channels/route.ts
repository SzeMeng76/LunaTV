import { NextRequest, NextResponse } from 'next/server';

import { getCachedLiveChannels } from '@/lib/live';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceKey = searchParams.get('source');

    if (!sourceKey) {
      return NextResponse.json({ error: '缺少直播源参数' }, { status: 400 });
    }

    const channelData = await getCachedLiveChannels(sourceKey);

    if (!channelData) {
      return NextResponse.json({ error: '频道信息未找到' }, { status: 404 });
    }

    // 合并EPG logo到频道信息中
    const channelsWithEpgLogos = channelData.channels.map(channel => {
      const channelKey = channel.tvgId || channel.name;
      const epgLogo = channelData.epgLogos?.[channelKey];

      return {
        ...channel,
        // 优先使用EPG logo，如果没有则使用M3U logo
        logo: epgLogo || channel.logo
      };
    });

    return NextResponse.json({
      success: true,
      data: channelsWithEpgLogos
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取频道信息失败' },
      { status: 500 }
    );
  }
}
