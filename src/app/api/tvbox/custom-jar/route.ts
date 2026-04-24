import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * 保存自定义 JAR URL 配置
 * POST /api/tvbox/custom-jar
 */
export async function POST(request: NextRequest) {
  try {
    const { jarUrl } = await request.json();

    if (!jarUrl || typeof jarUrl !== 'string') {
      return NextResponse.json(
        { error: 'Invalid JAR URL' },
        { status: 400 }
      );
    }

    // 验证 URL 格式
    try {
      new URL(jarUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // 获取当前配置
    const config = await getConfig();

    // 更新配置：添加或更新 CustomSpiderJar 字段
    config.CustomSpiderJar = jarUrl;

    // 保存配置
    await db.saveAdminConfig(config);

    console.log(`[Custom JAR] Saved custom JAR URL: ${jarUrl}`);

    return NextResponse.json({
      success: true,
      jarUrl: jarUrl,
      message: '自定义 JAR 配置已保存',
    });
  } catch (error) {
    console.error('[Custom JAR] Save failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to save custom JAR configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * 获取自定义 JAR URL 配置
 * GET /api/tvbox/custom-jar
 */
export async function GET() {
  try {
    const config = await getConfig();
    const customJarUrl = config.CustomSpiderJar || null;

    return NextResponse.json({
      jarUrl: customJarUrl,
      enabled: !!customJarUrl,
    });
  } catch (error) {
    console.error('[Custom JAR] Get failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to get custom JAR configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除自定义 JAR URL 配置
 * DELETE /api/tvbox/custom-jar
 */
export async function DELETE() {
  try {
    const config = await getConfig();
    delete config.CustomSpiderJar;
    await db.saveAdminConfig(config);

    console.log('[Custom JAR] Deleted custom JAR configuration');

    return NextResponse.json({
      success: true,
      message: '自定义 JAR 配置已删除',
    });
  } catch (error) {
    console.error('[Custom JAR] Delete failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete custom JAR configuration',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
