/**
 * EPG 诊断 API
 * 用于在浏览器中查看 EPG 匹配情况
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { parseEpgWithDebug, parseM3U } from '@/lib/live';

export const runtime = 'nodejs';

const defaultUA = 'AptvPlayer/1.4.10';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceKey = searchParams.get('source');

    if (!sourceKey) {
      return NextResponse.json({ error: '缺少 source 参数，用法: /api/live/epg-debug?source=你的直播源key' }, { status: 400 });
    }

    const config = await getConfig();
    const liveInfo = config.LiveConfig?.find(live => live.key === sourceKey);

    if (!liveInfo) {
      return NextResponse.json({
        error: '未找到直播源配置',
        solution: '请先在后台管理页面添加直播源'
      }, { status: 404 });
    }

    // 获取 M3U 数据
    const ua = liveInfo.ua || defaultUA;
    const m3uResponse = await fetch(liveInfo.url, {
      headers: {
        'User-Agent': ua,
      },
    });
    const m3uData = await m3uResponse.text();
    const m3uResult = parseM3U(sourceKey, m3uData);

    // 获取 EPG URL
    const epgUrl = liveInfo.epg || m3uResult.tvgUrl;

    if (!epgUrl) {
      return NextResponse.json({
        error: 'EPG URL 未配置',
        solution: '在后台管理页面的直播源配置中填写 EPG URL，或确保 M3U 文件中包含 x-tvg-url 或 url-tvg 参数'
      }, { status: 400 });
    }

    // 使用调试版本的 parseEpg
    const { epgs, debug } = await parseEpgWithDebug(
      epgUrl,
      ua,
      m3uResult.channels.map(channel => channel.tvgId).filter(tvgId => tvgId),
      m3uResult.channels
    );

    // 统计信息
    const totalChannels = m3uResult.channels.length;
    const channelsWithTvgId = m3uResult.channels.filter(c => c.tvgId).length;
    const channelsWithoutTvgId = totalChannels - channelsWithTvgId;
    const epgChannelIds = Object.keys(epgs);
    const channelsWithEpg = epgChannelIds.length;

    // 前10个频道的详细信息
    const sampleChannels = m3uResult.channels.slice(0, 10).map(c => {
      const hasEpg = !!epgs[c.tvgId || c.name];
      const epgKey = c.tvgId || c.name;
      return {
        name: c.name,
        tvgId: c.tvgId || '(无 tvg-id)',
        epgKey: epgKey,
        hasEpg: hasEpg,
        programCount: hasEpg ? epgs[epgKey].length : 0,
        firstProgram: hasEpg ? epgs[epgKey][0] : null
      };
    });

    // EPG 前5个频道
    const epgSample = epgChannelIds.slice(0, 5).map(key => ({
      key,
      programCount: epgs[key].length,
      firstProgram: epgs[key][0]
    }));

    // 诊断问题
    const issues = [];

    if (channelsWithoutTvgId > 0) {
      issues.push({
        level: 'warning',
        message: `有 ${channelsWithoutTvgId} 个频道缺少 tvg-id`,
        solution: '系统会自动使用频道名称进行模糊匹配'
      });
    }

    if (debug.totalEpgChannels === 0) {
      issues.push({
        level: 'error',
        message: 'EPG XML 中没有找到任何 channel 标签',
        solution: '检查 EPG URL 是否正确，或 EPG XML 格式是否正确'
      });
    }

    if (debug.totalM3uChannelMappings === 0) {
      issues.push({
        level: 'error',
        message: 'M3U 文件中没有解析到任何频道',
        solution: '检查 M3U URL 是否正确'
      });
    }

    if (channelsWithEpg === 0 && debug.totalEpgChannels > 0 && debug.totalM3uChannelMappings > 0) {
      issues.push({
        level: 'error',
        message: 'EPG 和 M3U 都有数据，但没有匹配到任何频道',
        solution: '频道名称可能差异太大，无法进行模糊匹配。查看下方的采样数据来对比 EPG 和 M3U 的频道名称。'
      });
    }

    const matchRate = totalChannels > 0 ? ((channelsWithEpg / totalChannels) * 100).toFixed(1) : '0';

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          epgUrl: epgUrl,
          totalChannels,
          channelsWithTvgId,
          channelsWithoutTvgId,
          channelsWithEpg,
          matchRate: `${matchRate}%`,
        },
        parsingDetails: {
          totalEpgChannels: debug.totalEpgChannels,
          totalM3uChannelMappings: debug.totalM3uChannelMappings,
          tvgIdMatchCount: debug.tvgIdMatchCount,
          nameMatchCount: debug.nameMatchCount,
          nameMatchDetails: debug.nameMatchDetails,
          unmatchedEpgSample: debug.unmatchedEpgSample,
          epgResultKeys: debug.epgResultKeys,
          programmeTagsFound: debug.programmeTagsFound,
          titleTagsFound: debug.titleTagsFound,
        },
        samples: {
          m3uChannelNames: debug.nameToTvgIdSample,
          epgChannelNames: debug.epgNameToChannelIdSample,
        },
        issues,
        sampleChannels,
        epgSample,
      }
    });
  } catch (error) {
    console.error('[EPG Debug] 错误:', error);
    return NextResponse.json(
      {
        error: 'EPG 诊断失败',
        message: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}
