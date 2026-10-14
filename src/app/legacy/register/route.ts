import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import {
  buildLegacyNav,
  escapeHtml,
  renderLegacyPageWithConfig,
} from '@/lib/legacy-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * iOS 9.3 轻量版注册页（对应主站 /register）：
 * - localStorage 模式不支持注册 / 管理员关闭注册 → 显示禁用卡片
 * - 表单字段 username/password/confirmPassword（+邀请码，按配置）与主站一致
 * - 提交 POST /api/register，成功后自动登录并跳 /legacy
 * 样式对齐主站登录/注册卡片（白卡片 + 绿主按钮 + 底部"去登录"链接）。
 * 纯 ES5 + XHR，兼容约束见 src/lib/legacy-html.ts。
 */
export async function GET(_request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  let siteName = process.env.NEXT_PUBLIC_SITE_NAME || '聚合TV';
  let allowRegister = true;
  let requireInviteCode = false;
  let disabledReason = '';
  if (storageType === 'localstorage') {
    allowRegister = false;
    disabledReason = '当前站点模式不支持用户注册';
  } else {
    try {
      const config = await getConfig();
      siteName = config.SiteConfig.SiteName || siteName;
      allowRegister = config.UserConfig?.AllowRegister ?? true;
      requireInviteCode = config.UserConfig?.RequireInviteCode ?? false;
      if (!allowRegister) disabledReason = '管理员已关闭用户注册功能';
    } catch {
      // 配置读取失败时按默认配置展示表单
    }
  }

  if (!allowRegister) {
    return new NextResponse(
      await renderLegacyPageWithConfig({
        title: '注册',
        siteName,
        body:
          buildLegacyNav('') +
          '<div class="card"><h2 class="pt">无法注册</h2>' +
          '<p class="hint">' +
          disabledReason +
          '</p>' +
          '<a class="btn" style="margin-top:12px" href="/legacy">去登录</a></div>',
      }),
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const inviteField = requireInviteCode
    ? '<input type="text" id="inviteCode" placeholder="邀请码" autocapitalize="off">'
    : '';

  const body = `
${buildLegacyNav('')}
<div class="card" style="max-width:360px;margin:0 auto">
  <h2 class="pt" style="text-align:center">注册${escapeHtml(siteName)}账户</h2>
  <p class="hint" style="text-align:center;margin-top:-4px">创建您的新账户</p>
  <div id="msg" class="msg"></div>
  <input type="text" id="username" placeholder="用户名（3-20位字母数字下划线）" autocapitalize="off">
  <input type="password" id="password" placeholder="密码（至少6位）">
  <input type="password" id="password2" placeholder="确认密码">
  ${inviteField}
  <button class="btn" id="regBtn" type="button">立即注册</button>
  <p class="hint" style="text-align:center;margin-top:14px">已有账户？
    <a href="/legacy" style="color:#16a34a;font-weight:bold">去登录</a></p>
</div>`;

  return new NextResponse(
    await renderLegacyPageWithConfig({
      title: '注册',
      siteName,
      body,
      script: registerScript(requireInviteCode),
    }),
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}

function registerScript(requireInviteCode: boolean): string {
  return `
(function () {
  var NEED_INVITE = ${requireInviteCode ? 'true' : 'false'};
  var btn = document.getElementById('regBtn');

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  btn.onclick = function () {
    var username = val('username').replace(/^\\s+|\\s+$/g, '');
    var password = val('password');
    var password2 = val('password2');
    var inviteCode = val('inviteCode').replace(/^\\s+|\\s+$/g, '');

    if (!username || !password || !password2) {
      lunaShow('msg', '请填写完整信息', 'err');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      lunaShow('msg', '用户名只能包含字母、数字和下划线，长度3-20位', 'err');
      return;
    }
    if (NEED_INVITE && !inviteCode) {
      lunaShow('msg', '请输入邀请码', 'err');
      return;
    }
    if (password !== password2) {
      lunaShow('msg', '两次输入的密码不一致', 'err');
      return;
    }
    if (password.length < 6) {
      lunaShow('msg', '密码长度至少6位', 'err');
      return;
    }

    btn.disabled = true;
    var payload = { username: username, password: password, confirmPassword: password2 };
    if (NEED_INVITE) payload.inviteCode = inviteCode;
    lunaXhr('POST', '/api/register', payload, function (status, data) {
      if (status === 200) {
        lunaShow('msg', '注册成功！正在跳转…', 'ok');
        var delay = (data && data.needDelay) ? 2500 : 1500;
        setTimeout(function () { location.href = '/legacy'; }, delay);
      } else {
        btn.disabled = false;
        lunaShow('msg', (data && data.error) || '注册失败，请重试', 'err');
      }
    });
  };
})();`;
}
