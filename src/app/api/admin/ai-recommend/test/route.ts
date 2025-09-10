import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  
  // 检查用户权限
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const username = authInfo.username;

  try {
    // 权限校验 - 只有站长和管理员可以测试
    const adminConfig = await getConfig();
    if (username !== process.env.USERNAME) {
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    const { apiUrl, apiKey, model } = await request.json();

    // 验证参数
    if (!apiUrl || !apiKey) {
      return NextResponse.json({ 
        error: '请提供API地址和密钥' 
      }, { status: 400 });
    }

    // 构建测试消息
    const testMessages = [
      { role: 'system', content: '你是一个AI助手，请简单回复确认你可以正常工作。' },
      { role: 'user', content: '你好，请回复"测试成功"来确认连接正常。' }
    ];

    // 调用AI API进行测试
    const testUrl = apiUrl.endsWith('/chat/completions') 
      ? apiUrl 
      : `${apiUrl.replace(/\/$/, '')}/chat/completions`;

    console.log('Testing AI API:', testUrl);
    
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: testMessages,
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'API连接失败';
      
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error) {
          errorMessage = errorData.error.message || errorData.error || errorMessage;
        }
      } catch (e) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      
      console.error('AI API Test Error:', errorText);
      return NextResponse.json({ 
        error: errorMessage 
      }, { status: 400 });
    }

    const result = await response.json();
    
    // 检查返回结果格式
    if (!result.choices || result.choices.length === 0) {
      return NextResponse.json({ 
        error: 'API返回无choices数据',
        rawResponse: JSON.stringify(result).substring(0, 500)
      }, { status: 400 });
    }

    if (!result.choices[0] || !result.choices[0].message) {
      return NextResponse.json({ 
        error: 'API返回choices格式异常',
        rawResponse: JSON.stringify(result).substring(0, 500)
      }, { status: 400 });
    }

    const testReply = result.choices[0].message.content;
    
    // 检查内容是否为空
    if (!testReply || testReply.trim() === '') {
      return NextResponse.json({ 
        error: '⚠️ API返回了空内容！这就是导致空回复的原因',
        details: '这表明AI模型返回了空回复，可能原因：\n1. 模型参数配置问题\n2. API密钥权限问题\n3. 模型服务异常',
        rawResponse: JSON.stringify(result).substring(0, 500),
        success: false
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: '✅ 测试成功 - AI配置正常',
      testReply: testReply,
      model: result.model || model,
      usage: result.usage,
      diagnosis: {
        responseStructure: '正常',
        contentLength: testReply.length,
        hasContent: testReply.trim().length > 0
      }
    });

  } catch (error) {
    console.error('AI API test error:', error);
    
    let errorMessage = '连接测试失败';
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        errorMessage = '无法连接到API服务器，请检查API地址';
      } else if (error.message.includes('timeout')) {
        errorMessage = '连接超时，请检查网络或API服务状态';
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json({ 
      error: errorMessage 
    }, { status: 500 });
  }
}