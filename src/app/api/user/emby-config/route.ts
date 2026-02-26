/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { dbManager } from '@/lib/db';
import { embyManager } from '@/lib/emby-manager';

// GET - 获取用户 Emby 配置
export async function GET(request: NextRequest) {
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
    const config = await dbManager.getUserEmbyConfig(username);

    return NextResponse.json({
      success: true,
      config: config || { sources: [] }
    });
  } catch (error: any) {
    console.error('获取用户 Emby 配置失败:', error);
    return NextResponse.json(
      { error: error.message || '获取配置失败' },
      { status: 500 }
    );
  }
}

// POST - 保存用户 Emby 配置
export async function POST(request: NextRequest) {
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
    const body = await request.json();
    const { config } = body;

    console.log('📝 保存 Emby 配置 - 用户:', username);
    console.log('📝 接收到的配置:', JSON.stringify(config, null, 2));

    if (!config || !config.sources || !Array.isArray(config.sources)) {
      return NextResponse.json(
        { error: '配置格式错误' },
        { status: 400 }
      );
    }

    // 验证配置格式
    for (const source of config.sources) {
      if (!source.key || !source.name || !source.ServerURL) {
        return NextResponse.json(
          { error: '源配置缺少必填字段 (key, name, ServerURL)' },
          { status: 400 }
        );
      }
    }

    await dbManager.saveUserEmbyConfig(username, config);

    // 清除用户的 EmbyClient 缓存，使新配置立即生效
    embyManager.clearUserCache(username);
    console.log('🔄 已清除用户 Emby 客户端缓存');

    // 验证保存结果
    const savedConfig = await dbManager.getUserEmbyConfig(username);
    console.log('✅ 保存后读取的配置:', JSON.stringify(savedConfig, null, 2));

    return NextResponse.json({
      success: true,
      message: '配置保存成功'
    });
  } catch (error: any) {
    console.error('保存用户 Emby 配置失败:', error);
    return NextResponse.json(
      { error: error.message || '保存配置失败' },
      { status: 500 }
    );
  }
}

// DELETE - 删除用户 Emby 配置
export async function DELETE(request: NextRequest) {
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
    await dbManager.deleteUserEmbyConfig(username);

    // 清除用户的 EmbyClient 缓存
    embyManager.clearUserCache(username);
    console.log('🔄 已清除用户 Emby 客户端缓存');

    return NextResponse.json({
      success: true,
      message: '配置删除成功'
    });
  } catch (error: any) {
    console.error('删除用户 Emby 配置失败:', error);
    return NextResponse.json(
      { error: error.message || '删除配置失败' },
      { status: 500 }
    );
  }
}
