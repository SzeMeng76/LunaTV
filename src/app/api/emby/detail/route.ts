/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { embyManager } from '@/lib/emby-manager';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('id');
  const embyKey = searchParams.get('embyKey') || undefined;

  console.log('========== EMBY DETAIL API CALLED ==========', { itemId, embyKey });

  if (!itemId) {
    return NextResponse.json({ error: '缺少媒体ID' }, { status: 400 });
  }

  try {
    // 从 cookie 获取用户信息
    const authCookie = getAuthInfoFromCookie(request);

    if (!authCookie?.username) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    const username = authCookie.username;

    // 获取用户的Emby客户端
    const client = await embyManager.getClientForUser(username, embyKey);

    // 获取媒体详情
    const item = await client.getItem(itemId);

    // 获取音轨信息（不影响主流程）
    let audioStreams: any[] = [];
    console.log('========== BEFORE getAudioStreams ==========');
    try {
      console.log('🎵 [API] 开始获取音轨，itemId:', itemId);
      audioStreams = await client.getAudioStreams(itemId);
      console.log('🎵 [API] 获取到音轨数据:', audioStreams);
      console.log('========== AFTER getAudioStreams, length:', audioStreams.length);
    } catch (error) {
      console.error('🎵 [API] 获取音轨失败（不影响播放）:', error);
      console.error('========== getAudioStreams ERROR ==========', error);
    }

    // 构建 episodes 数组（电影返回单个playUrl，电视剧返回所有剧集的playUrl）
    let episodesUrls: string[] = [];

    if (item.Type === 'Movie') {
      // 电影：episodes数组包含一个播放URL
      episodesUrls = [await client.getStreamUrl(item.Id)];
    } else if (item.Type === 'Series') {
      // 电视剧：获取所有剧集的播放URL
      const allEpisodes = await client.getEpisodes(itemId);

      const sortedEpisodes = allEpisodes.sort((a, b) => {
        if (a.ParentIndexNumber !== b.ParentIndexNumber) {
          return (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0);
        }
        return (a.IndexNumber || 0) - (b.IndexNumber || 0);
      });

      episodesUrls = await Promise.all(
        sortedEpisodes.map(ep => client.getStreamUrl(ep.Id))
      );
    }

    // 返回 SearchResult 格式
    const sourceKey = embyKey ? `emby_${embyKey}` : 'emby';

    return NextResponse.json([{
      id: item.Id,
      title: item.Name,
      source: sourceKey,
      source_name: 'Emby',
      poster: client.getImageUrl(item.Id, 'Primary'),
      year: item.ProductionYear?.toString() || '',
      rating: item.CommunityRating || 0,
      overview: item.Overview || '',
      episodes: episodesUrls,
      // 添加音轨信息
      private_audio_streams: audioStreams.map(stream => ({
        index: stream.index,
        display_title: stream.displayTitle,
        language: stream.language,
        codec: stream.codec,
        is_default: stream.isDefault,
      })),
    }]);
  } catch (error) {
    console.error('获取 Emby 详情失败:', error);
    return NextResponse.json(
      { error: '获取 Emby 详情失败: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
