import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  
  // 检查用户权限
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const username = authInfo.username;

  try {
    const aiRecommendConfig = await request.json();
    
    // 验证配置数据
    if (typeof aiRecommendConfig.enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid enabled value' }, { status: 400 });
    }

    // 如果启用AI推荐，验证必需字段
    if (aiRecommendConfig.enabled) {
      if (!aiRecommendConfig.apiUrl || typeof aiRecommendConfig.apiUrl !== 'string') {
        return NextResponse.json({ error: 'API地址不能为空' }, { status: 400 });
      }

      if (!aiRecommendConfig.apiKey || typeof aiRecommendConfig.apiKey !== 'string') {
        return NextResponse.json({ error: 'API密钥不能为空' }, { status: 400 });
      }

      if (!aiRecommendConfig.model || typeof aiRecommendConfig.model !== 'string') {
        return NextResponse.json({ error: '模型名称不能为空' }, { status: 400 });
      }

      if (typeof aiRecommendConfig.temperature !== 'number' || aiRecommendConfig.temperature < 0 || aiRecommendConfig.temperature > 2) {
        return NextResponse.json({ error: '温度参数应在0-2之间' }, { status: 400 });
      }

      if (!Number.isInteger(aiRecommendConfig.maxTokens) || aiRecommendConfig.maxTokens < 1 || aiRecommendConfig.maxTokens > 150000) {
        return NextResponse.json({ error: '最大Token数应在1-150000之间（GPT-5支持128k，推理模型建议2000+）' }, { status: 400 });
      }

      // 验证和优化API地址格式
      try {
        const apiUrl = aiRecommendConfig.apiUrl.trim();
        
        // 验证URL格式
        new URL(apiUrl);
        
        // 智能提示：检查是否可能缺少/v1后缀
        if (!apiUrl.endsWith('/v1') && 
            !apiUrl.includes('/chat/completions') && 
            !apiUrl.includes('/api/paas/v4') && // 智谱AI例外
            !apiUrl.includes('/compatible-mode/v1') && // 通义千问例外
            !apiUrl.includes('/rpc/2.0/ai_custom/v1')) { // 百度文心例外
          
          // 记录可能的配置问题，但不阻止保存
          if (process.env.NODE_ENV === 'development') {
            console.warn(`API地址可能缺少/v1后缀: ${apiUrl}`);
          }
        }
        
      } catch (error) {
        return NextResponse.json({ 
          error: 'API地址格式不正确',
          hint: '请输入完整的API地址，如 https://api.openai.com/v1'
        }, { status: 400 });
      }
    }

    // 获取当前配置
    const adminConfig = await getConfig();
    
    // 权限校验
    if (username !== process.env.USERNAME) {
      // 管理员
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }
    
    // 更新AI推荐配置
    adminConfig.AIRecommendConfig = {
      enabled: aiRecommendConfig.enabled,
      apiUrl: aiRecommendConfig.apiUrl?.trim() || 'https://api.openai.com/v1',
      apiKey: aiRecommendConfig.apiKey?.trim() || '',
      model: aiRecommendConfig.model?.trim() || 'gpt-3.5-turbo',
      temperature: aiRecommendConfig.temperature ?? 0.7,
      maxTokens: aiRecommendConfig.maxTokens ?? 2000
    };

    // 保存配置到数据库
    await db.saveAdminConfig(adminConfig);
    
    // 清除配置缓存，强制下次重新从数据库读取
    clearConfigCache();

    return NextResponse.json({ success: true }, {
      headers: {
        'Cache-Control': 'no-store', // 不缓存结果
      },
    });

  } catch (error) {
    console.error('Save AI recommend config error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}