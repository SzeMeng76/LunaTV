import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { DEFAULT_USER_AGENT } from '@/lib/user-agent';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const config = await getConfig();

    if (!config) {
      return NextResponse.json({ error: '配置未找到' }, { status: 404 });
    }

    // 获取所有启用的直播源
    const enabledLives = (config.LiveConfig || []).filter(live => !live.disabled);

    if (enabledLives.length === 0) {
      return new NextResponse('#EXTM3U\n', {
        headers: {
          'Content-Type': 'application/x-mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // 合并所有M3U内容
    let mergedM3U = '#EXTM3U\n';
    
    for (const live of enabledLives) {
      try {
        // 获取M3U内容
        const response = await fetch(live.url, {
          headers: {
            'User-Agent': live.ua || DEFAULT_USER_AGENT
          }
        });
        
        if (response.ok) {
          const m3uContent = await response.text();
          
          // 解析并处理M3U内容
          const lines = m3uContent.split('\n');
          const currentGroup = live.name; // 使用直播源名称作为分组
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('#EXTINF:')) {
              // 修改频道信息，添加源名称前缀
              const channelInfo = line.replace('#EXTINF:', '');
              const parts = channelInfo.split(',');
              if (parts.length >= 2) {
                const channelName = parts[parts.length - 1];
                const prefix = parts.slice(0, -1).join(',');
                
                // 检查是否已经包含group-title
                if (!line.includes('group-title=')) {
                  mergedM3U += `#EXTINF:${prefix},group-title="${currentGroup}" ${channelName}\n`;
                } else {
                  mergedM3U += line + '\n';
                }
              } else {
                mergedM3U += line + '\n';
              }
            } else if (line && !line.startsWith('#EXTM3U')) {
              // 频道URL或其他有效内容
              mergedM3U += line + '\n';
            }
          }
          
          // 添加分隔符
          mergedM3U += '\n';
        }
      } catch (error) {
        console.error(`获取直播源 ${live.name} 失败:`, error);
        // 继续处理其他源
        continue;
      }
    }

    return new NextResponse(mergedM3U, {
      headers: {
        'Content-Type': 'application/x-mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('合并直播源失败:', error);
    return NextResponse.json(
      { error: '合并直播源失败' },
      { status: 500 }
    );
  }
}

// 支持CORS预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}