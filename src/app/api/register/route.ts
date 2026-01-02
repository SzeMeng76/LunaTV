/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 读取存储类型环境变量，默认 localstorage
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

// 生成签名
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  // 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // 生成签名
  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  // 转换为十六进制字符串
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证Cookie（带签名）
async function generateAuthCookie(
  username?: string,
  password?: string,
  role?: 'owner' | 'admin' | 'user',
  includePassword = false
): Promise<string> {
  const authData: any = { role: role || 'user' };

  // 只在需要时包含 password
  if (includePassword && password) {
    authData.password = password;
  }

  if (username && process.env.PASSWORD) {
    authData.username = username;
    // 使用密码作为密钥对用户名进行签名
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now(); // 添加时间戳防重放攻击
  }

  return encodeURIComponent(JSON.stringify(authData));
}

export async function POST(req: NextRequest) {
  try {
    // localStorage 模式不支持注册
    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json(
        { error: 'localStorage 模式不支持用户注册' },
        { status: 400 }
      );
    }

    const { username, password, confirmPassword } = await req.json();

    // 先检查配置中是否允许注册（在验证输入之前）
    let config: any;
    try {
      config = await getConfig();
      const allowRegister = config.UserConfig?.AllowRegister !== false; // 默认允许注册

      if (!allowRegister) {
        return NextResponse.json(
          { error: '管理员已关闭用户注册功能' },
          { status: 403 }
        );
      }
    } catch (err) {
      console.error('检查注册配置失败', err);
      return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
    }

    // 验证输入
    if (!username || typeof username !== 'string' || username.trim() === '') {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }
    
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: '两次输入的密码不一致' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码长度至少6位' }, { status: 400 });
    }

    // 检查是否与管理员用户名冲突
    if (username === process.env.USERNAME) {
      return NextResponse.json({ error: '该用户名已被使用' }, { status: 400 });
    }

    // 检查用户名格式（只允许字母数字和下划线）
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return NextResponse.json(
        { error: '用户名只能包含字母、数字和下划线，长度3-20位' },
        { status: 400 }
      );
    }

    try {
      // 检查用户是否已存在
      const userExists = await db.checkUserExist(username);
      if (userExists) {
        return NextResponse.json({ error: '该用户名已被注册' }, { status: 400 });
      }

      // 清除缓存（在注册前清除，避免读到旧缓存）
      clearConfigCache();

      // 获取默认用户组
      const defaultTags = config.SiteConfig.DefaultUserTags && config.SiteConfig.DefaultUserTags.length > 0
        ? config.SiteConfig.DefaultUserTags
        : undefined;

      // 如果有默认用户组，使用 V2 注册；否则使用 V1 注册（保持兼容性）
      if (defaultTags) {
        // V2 注册（支持 tags）
        await db.createUserV2(
          username,
          password,
          'user',
          defaultTags,  // 默认分组
          undefined,    // oidcSub
          undefined     // enabledApis
        );
      } else {
        // V1 注册（无 tags，保持现有行为）
        await db.registerUser(username, password);
      }

      // 清除缓存，让 configSelfCheck 从数据库同步最新用户列表（包括 tags）
      clearConfigCache();

      // 验证用户是否成功创建并包含tags（调试用）
      try {
        console.log('=== 调试：验证用户创建 ===');
        const verifyUser = await db.getUserInfoV2(username);
        console.log('数据库中的用户信息:', verifyUser);
      } catch (debugErr) {
        console.error('调试日志失败:', debugErr);
      }

      // 注册成功后自动登录
      const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
      const response = NextResponse.json({
        ok: true,
        message: '注册成功，已自动登录',
        needDelay: storageType === 'upstash' // Upstash 需要延迟等待数据同步
      });
      
      const cookieValue = await generateAuthCookie(
        username,
        password,
        'user',
        false
      );
      const expires = new Date();
      expires.setDate(expires.getDate() + 7); // 7天过期

      response.cookies.set('user_auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax',
        httpOnly: false,
        secure: false,
      });

      return response;
    } catch (err) {
      console.error('注册用户失败', err);
      return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
    }
  } catch (error) {
    console.error('注册接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}