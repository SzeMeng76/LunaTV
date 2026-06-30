import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { apiKeys } = await request.json();

    if (!apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
      return NextResponse.json(
        { error: '请提供至少一个 Tavily API Key' },
        { status: 400 }
      );
    }

    const results = await Promise.all(
      apiKeys.map(async (key: string, index: number) => {
        try {
          const response = await fetch('https://api.tavily.com/usage', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json',
              'User-Agent': 'LunaTV/1.0'
            }
          });

          if (!response.ok) {
            // 特殊处理 202 状态码（WAF Challenge）
            if (response.status === 202) {
              return {
                index,
                key: key.substring(0, 12) + '...',
                error: 'WAF_BLOCKED',
                wafBlocked: true
              };
            }
            return {
              index,
              key: key.substring(0, 12) + '...',
              error: `HTTP ${response.status}`
            };
          }

          const text = await response.text();
          if (!text || text.trim().length === 0) {
            // WAF Challenge 拦截，返回特殊错误码
            return {
              index,
              key: key.substring(0, 12) + '...',
              error: 'WAF_BLOCKED',
              wafBlocked: true
            };
          }

          const data = JSON.parse(text);

          return {
            index,
            key: key.substring(0, 12) + '...',
            fullKey: key,
            keyUsage: data.key?.usage || 0,
            keyLimit: data.key?.limit || 1000,
            planUsage: data.account?.plan_usage || 0,
            planLimit: data.account?.plan_limit || 1000,
            currentPlan: data.account?.current_plan || 'Free'
          };
        } catch (err) {
          return {
            index,
            key: key.substring(0, 12) + '...',
            error: err instanceof Error ? err.message : 'Query failed'
          };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Tavily usage API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 }
    );
  }
}
