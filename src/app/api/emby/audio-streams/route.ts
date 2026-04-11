/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { embyManager } from '@/lib/emby-manager';
import { getAuthInfoFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  const embyKey = searchParams.get('embyKey') || undefined;

  console.log('========== [/api/emby/audio-streams] API CALLED ==========', { itemId, embyKey });

  if (!itemId) {
    return NextResponse.json({ error: '缺少 itemId 参数' }, { status: 400 });
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

    // 获取音轨信息
    console.log('========== [/api/emby/audio-streams] 开始获取音轨，itemId:', itemId);
    const audioStreams = await client.getAudioStreams(itemId);
    console.log('========== [/api/emby/audio-streams] 获取到音轨数据:', audioStreams);

    // 返回音轨数据
    return NextResponse.json({
      audioStreams: audioStreams.map(stream => ({
        index: stream.index,
        display_title: stream.displayTitle,
        language: stream.language,
        codec: stream.codec,
        is_default: stream.isDefault,
      })),
    });
  } catch (error) {
    console.error('========== [/api/emby/audio-streams] 获取音轨失败:', error);
    return NextResponse.json(
      { error: '获取音轨失败: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
