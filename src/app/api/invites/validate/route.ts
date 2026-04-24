/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { validateInviteCode } from '@/lib/invite-code';

export const runtime = 'nodejs';

/**
 * POST /api/invites/validate
 * 验证邀请码是否有效
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '邀请码不能为空' }, { status: 400 });
    }

    const result = await validateInviteCode(code.trim().toUpperCase());

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      remainingUses: result.remainingUses,
    });
  } catch (error) {
    console.error('[Invites] 验证邀请码失败:', error);
    return NextResponse.json({ error: '验证邀请码失败' }, { status: 500 });
  }
}
