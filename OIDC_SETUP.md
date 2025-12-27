# OpenID Connect (OIDC) 认证配置指南

本文档详细介绍如何在 LunaTV 中配置 OIDC 单点登录（SSO），支持 Google、Microsoft、GitHub 和 LinuxDo 等主流身份提供商。

## 📋 目录

- [什么是 OIDC](#什么是-oidc)
- [配置前准备](#配置前准备)
- [Google OAuth 2.0 配置](#google-oauth-20-配置)
- [Microsoft Entra ID 配置](#microsoft-entra-id-配置)
- [GitHub OAuth 配置](#github-oauth-配置)
- [LinuxDo 配置](#linuxdo-配置)
- [LunaTV 管理后台配置](#lunatv-管理后台配置)
- [常见问题](#常见问题)

---

## 什么是 OIDC

OpenID Connect (OIDC) 是基于 OAuth 2.0 协议的身份认证层，允许用户使用第三方账号（如 Google、Microsoft、GitHub）登录你的应用，无需单独注册账号。

### 优势

- ✅ **用户体验优化**：用户可用熟悉的账号一键登录
- ✅ **安全性提升**：由专业的身份提供商管理密码安全
- ✅ **减少管理成本**：无需维护用户密码数据库
- ✅ **支持多平台**：同一账号可在多个设备登录

---

## 配置前准备

### 1. 确认回调 URL

所有 OIDC 提供商都需要配置回调 URL（Redirect URI / Callback URL）。

**LunaTV 的标准回调 URL 格式**：
```
https://your-domain.com/api/auth/oidc/callback
```

示例：
- 生产环境：`https://lunatv.example.com/api/auth/oidc/callback`
- 本地开发：`http://localhost:3000/api/auth/oidc/callback`

### 2. 所需信息清单

配置任何 OIDC 提供商时，你需要准备以下信息：

- ✅ **Issuer URL**：OIDC 提供商的基础 URL
- ✅ **Client ID**：应用的唯一标识符
- ✅ **Client Secret**：应用的密钥（**务必保密**）
- ✅ **Authorization Endpoint**：授权端点 URL
- ✅ **Token Endpoint**：令牌端点 URL
- ✅ **UserInfo Endpoint**：用户信息端点 URL

---

## Google OAuth 2.0 配置

### 步骤 1：创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 点击顶部项目选择器 → **新建项目**
3. 输入项目名称（如 "LunaTV"）→ **创建**

### 步骤 2：启用 API

1. 在左侧菜单选择 **API 和服务** → **库**
2. 搜索并启用 **Google+ API**（用于获取用户信息）

### 步骤 3：创建 OAuth 2.0 凭据

1. 进入 **API 和服务** → **凭据**
2. 点击 **创建凭据** → **OAuth 客户端 ID**
3. 如果首次配置，需要先配置 **OAuth 同意屏幕**：
   - 用户类型选择：**外部**（允许任何 Google 账号登录）
   - 应用名称：`LunaTV`
   - 支持电子邮件：你的邮箱
   - 授权域：你的域名（如 `example.com`）
   - 开发者联系信息：你的邮箱
   - 保存并继续

4. 返回凭据页面，再次点击 **创建凭据** → **OAuth 客户端 ID**
5. 应用类型选择：**Web 应用**
6. 名称：`LunaTV Web Client`
7. **已获授权的 JavaScript 来源**（可选）：
   ```
   https://your-domain.com
   ```
8. **已获授权的重定向 URI**（**必填**）：
   ```
   https://your-domain.com/api/auth/oidc/callback
   ```
9. 点击 **创建**

### 步骤 4：获取凭据

创建成功后，会弹出窗口显示：
- **客户端 ID**：`xxxxxx.apps.googleusercontent.com`
- **客户端密钥**：`GOCSPX-xxxxxxxxxx`

⚠️ **重要提示（2025 年更新）**：
- 从 2025 年 6 月起，新创建的客户端密钥只在创建时可见
- 务必立即复制并妥善保存客户端密钥
- 如果遗失，需要重新生成新的密钥

### Google OIDC 端点信息

Google 支持自动发现，你只需要配置 **Issuer URL**：

```
Issuer URL: https://accounts.google.com
```

**自动发现端点**：
```
https://accounts.google.com/.well-known/openid-configuration
```

或者手动配置各端点：

```
Authorization Endpoint: https://accounts.google.com/o/oauth2/v2/auth
Token Endpoint:         https://oauth2.googleapis.com/token
UserInfo Endpoint:      https://openidconnect.googleapis.com/v1/userinfo
```

### 参考资料
- [Setting up OAuth 2.0 - Google Cloud Console Help](https://support.google.com/cloud/answer/6158849?hl=en)
- [OpenID Connect | Sign in with Google](https://developers.google.com/identity/openid-connect/openid-connect)
- [Get your Google API client ID](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)

---

## Microsoft Entra ID 配置

Microsoft Entra ID（前身为 Azure Active Directory）提供企业级身份认证服务。

### 步骤 1：注册应用

1. 登录 [Microsoft Entra 管理中心](https://entra.microsoft.com/)
2. 导航到 **应用** → **应用注册** → **新注册**
3. 填写应用信息：
   - **名称**：`LunaTV`
   - **支持的账户类型**：
     - **仅此目录中的账户**（单租户，仅你组织内用户）
     - **任何组织目录中的账户**（多租户，任何企业账户）
     - **任何组织目录中的账户和个人 Microsoft 账户**（推荐，支持个人 Outlook/Xbox 等账号）
   - **重定向 URI**：
     - 平台：**Web**
     - URI：`https://your-domain.com/api/auth/oidc/callback`
4. 点击 **注册**

### 步骤 2：配置身份验证

1. 在应用页面，点击左侧 **身份验证**
2. 在 **隐式授权和混合流** 部分，勾选：
   - ✅ **ID 令牌（用于隐式和混合流）**
3. 点击 **保存**

### 步骤 3：创建客户端密钥

1. 点击左侧 **证书和密码**
2. 选择 **客户端密码** 标签页
3. 点击 **新客户端密码**
4. 输入描述（如 "LunaTV Production"）
5. 选择过期时间：
   - 6 个月
   - 12 个月
   - 24 个月
   - **自定义**（最长可设为 2 年）
6. 点击 **添加**
7. **立即复制并保存客户端密钥值**（仅此一次显示）

### 步骤 4：获取端点信息

1. 在应用概述页面，点击 **端点**
2. 复制以下端点 URL：

**对于单租户应用**：
```
Issuer URL: https://login.microsoftonline.com/{tenant-id}/v2.0
```

**对于多租户应用**（推荐）：
```
Issuer URL: https://login.microsoftonline.com/common/v2.0
```

其中 `{tenant-id}` 可在应用概述页面的 **目录(租户) ID** 中找到。

**自动发现端点**：
```
https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration
```

或者手动配置各端点：

```
Authorization Endpoint: https://login.microsoftonline.com/common/oauth2/v2.0/authorize
Token Endpoint:         https://login.microsoftonline.com/common/oauth2/v2.0/token
UserInfo Endpoint:      https://graph.microsoft.com/oidc/userinfo
```

### 参考资料
- [OpenID Connect (OIDC) on the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc)
- [How to register an app in Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Microsoft identity platform UserInfo endpoint](https://learn.microsoft.com/en-us/entra/identity-platform/userinfo)

---

## GitHub OAuth 配置

GitHub 提供 OAuth 2.0 认证（虽然不是完整的 OIDC，但兼容大部分 OIDC 流程）。

### 步骤 1：创建 OAuth App

1. 登录 GitHub，点击右上角头像 → **Settings**
2. 左侧菜单滚动到底部，点击 **Developer settings**
3. 点击 **OAuth Apps** → **New OAuth App**

### 步骤 2：填写应用信息

- **Application name**：`LunaTV`
- **Homepage URL**：`https://your-domain.com`
- **Application description**（可选）：`LunaTV 影视平台`
- **Authorization callback URL**：`https://your-domain.com/api/auth/oidc/callback`
- 点击 **Register application**

### 步骤 3：获取凭据

1. 创建成功后，你会看到 **Client ID**（直接显示）
2. 点击 **Generate a new client secret** 生成客户端密钥
3. **立即复制并保存 Client Secret**（仅显示一次）

⚠️ **安全提示**：
- Client Secret 不要公开或提交到代码仓库
- 如果泄露，请立即在 GitHub 重新生成新密钥

### GitHub OAuth 端点信息

GitHub 使用标准的 OAuth 2.0 端点：

```
Authorization Endpoint: https://github.com/login/oauth/authorize
Token Endpoint:         https://github.com/login/oauth/access_token
UserInfo Endpoint:      https://api.github.com/user
```

**特殊说明**：
- GitHub OAuth 不完全符合 OIDC 标准，没有 Issuer URL
- 需要在 LunaTV 后台**手动配置**各端点 URL
- UserInfo 端点返回的是 GitHub API 用户信息格式

### 参考资料
- [Creating an OAuth app - GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- [Authorizing OAuth apps - GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Setting up Github OAuth 2.0](https://apidog.com/blog/set-up-github-oauth2/)

---

## LinuxDo 配置

LinuxDo 是基于 Discourse 论坛系统的中文技术社区，提供了独立的 OAuth2 认证服务 **LinuxDo Connect**，可直接用于第三方应用登录。

### 步骤 1：注册 OAuth2 应用

1. 访问 LinuxDo Connect 应用注册页面：
   ```
   https://connect.linux.do/dash/sso/new
   ```

2. 登录你的 LinuxDo 账号（如果尚未登录）

3. 填写应用注册表单：

   | 字段 | 说明 | 示例值 |
   |------|------|--------|
   | **Client Name** | 应用显示名称 | `LunaTV 影视平台` |
   | **Client URI** | 应用官网地址 | `https://your-domain.com` |
   | **Redirect URI** | 授权回调地址（必须精确匹配） | `https://your-domain.com/api/auth/oidc/callback` |
   | **Logo URI** | 应用Logo图标地址（可选） | `https://your-domain.com/logo.png` |
   | **TOS URI** | 服务条款页面地址（可选） | `https://your-domain.com/terms` |
   | **Policy URI** | 隐私政策页面地址（可选） | `https://your-domain.com/privacy` |
   | **Software ID** | 软件包标识符（可选） | `com.yourcompany.lunatv` |
   | **Software Version** | 软件版本号（可选） | `1.0.0` |

4. 提交表单，等待审核通过

### 步骤 2：获取认证凭据

应用审核通过后，你会收到以下凭据：

- **Client ID**：应用的唯一标识符
- **Client Secret**：应用的密钥（请妥善保管，不要公开）

⚠️ **安全提示**：
- Client Secret 类似于密码，切勿公开或提交到代码仓库
- 如果泄露，请立即删除应用并重新注册

### LinuxDo Connect OAuth2 端点信息

LinuxDo Connect 提供以下 OAuth2 端点：

#### 主域名端点（推荐）

```
Authorization Endpoint: https://connect.linux.do/oauth2/authorize
Token Endpoint:         https://connect.linux.do/oauth2/token
UserInfo Endpoint:      https://connect.linux.do/api/user
```

#### 备用域名端点

如果主域名无法访问，可以使用备用域名：

```
Authorization Endpoint: https://connect.linuxdo.org/oauth2/authorize
Token Endpoint:         https://connect.linuxdo.org/oauth2/token
UserInfo Endpoint:      https://connect.linuxdo.org/api/user
```

### 技术实现要点

#### 1. Token 请求认证方式

LinuxDo Connect 使用 **HTTP Basic Authentication** 方式验证 Token 请求：

```http
POST /oauth2/token HTTP/1.1
Host: connect.linux.do
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <Base64(ClientId:ClientSecret)>

grant_type=authorization_code&code=xxx&redirect_uri=https://your-domain.com/api/auth/oidc/callback
```

**计算 Authorization Header**：
```javascript
const credentials = `${clientId}:${clientSecret}`;
const base64Credentials = Buffer.from(credentials).toString('base64');
const authHeader = `Basic ${base64Credentials}`;
```

#### 2. UserInfo 响应格式

调用 UserInfo 端点后，返回的 JSON 数据包含以下字段：

```json
{
  "id": 12345,
  "username": "johndoe",
  "name": "John Doe",
  "active": true,
  "trust_level": 2,
  "silenced": false
}
```

**字段说明**：
- `id`：用户在 LinuxDo 的唯一 ID
- `username`：用户名
- `name`：用户显示名称
- `active`：账号是否激活
- `trust_level`：信任等级（0-4）
- `silenced`：是否被禁言

### Trust Level（信任等级）说明

LinuxDo 使用 Discourse 的信任等级系统（Trust Level 0-4）来管理用户权限：

| 等级 | 名称 | 获得条件 | 特点 |
|------|------|----------|------|
| **TL0** | 新用户 | 刚注册 | 功能受限，防止垃圾账号 |
| **TL1** | 基础用户 | 阅读主题、花费一定时间 | 可以发帖回复 |
| **TL2** | 成员 | 持续活跃、收到点赞 | 更多权限，如上传图片 |
| **TL3** | 资深成员 | 长期活跃、高质量内容 | 可以重新分类主题 |
| **TL4** | 领袖 | 由管理员手动授予 | 接近版主权限 |

**在 LunaTV 中配置最低信任等级**（`minTrustLevel` 字段）：

- 设置为 `0`：允许所有 LinuxDo 注册用户登录
- 设置为 `1`：只允许 TL1 及以上用户登录（有基础活跃度）
- 设置为 `2`：只允许 TL2 及以上用户登录（**推荐**，过滤不活跃账号）
- 设置为 `3` 或 `4`：仅限资深用户（适用于内测/邀请制）

⚠️ **注意**：如果设置为 `0`，则不进行信任等级检查。

### 配置示例（LunaTV 后台）

在 LunaTV 管理后台 → OIDC 登录配置 中填写：

```
✅ 启用 OIDC 登录
✅ 启用 OIDC 注册

Issuer URL:              留空（LinuxDo 不支持自动发现）
Authorization Endpoint:  https://connect.linux.do/oauth2/authorize
Token Endpoint:          https://connect.linux.do/oauth2/token
UserInfo Endpoint:       https://connect.linux.do/api/user
Client ID:               你的 Client ID
Client Secret:           你的 Client Secret
登录按钮文字:             使用 LinuxDo 账号登录
最低信任等级:             2
```

### 常见问题

**Q1：为什么我的应用一直显示"待审核"？**

A：LinuxDo Connect 应用需要人工审核，通常 1-3 个工作日内会处理。可以在论坛私信管理员催促审核。

**Q2：Token 请求返回 401 Unauthorized？**

A：检查以下几点：
- Client ID 和 Client Secret 是否正确
- Authorization Header 是否正确计算 Base64 编码
- Redirect URI 是否与注册时填写的**完全一致**（包括协议、域名、路径）

**Q3：用户登录后提示"信任等级不满足要求"？**

A：该用户的 `trust_level` 低于你在后台配置的 `minTrustLevel`。解决方案：
- 降低 `minTrustLevel` 设置
- 或者让用户在 LinuxDo 论坛多活跃，提升信任等级

**Q4：如何测试 OAuth2 流程？**

A：可以使用 LinuxDo 提供的测试工具：
1. 使用 Postman 或 curl 测试各端点
2. 检查浏览器开发者工具的网络请求
3. 查看 LunaTV 服务器日志中的 OIDC 相关输出

### 参考资料
- [LinuxDo Connect 官方文档](https://connect.linux.do/docs)（如有）
- [小白也能懂的 LinuxDo OAuth2 快速上手](https://linux.do/t/topic/30578)
- [Discourse Trust Levels 官方说明](https://blog.discourse.org/2018/06/understanding-discourse-trust-levels/)

---

## LunaTV 管理后台配置

### 访问 OIDC 配置页面

1. 登录 LunaTV 管理后台：`https://your-domain.com/admin`
2. 滚动到 **OIDC 登录配置** 部分
3. 点击配置卡片展开设置

### 配置选项说明

#### 1. 基础设置

| 选项 | 说明 | 示例 |
|------|------|------|
| **启用 OIDC 登录** | 总开关，控制是否启用 OIDC 功能 | `开启` |
| **启用 OIDC 注册** | 允许新用户通过 OIDC 自动注册 | `开启`（推荐） |
| **登录按钮文字** | 登录页面显示的按钮文本 | `使用 Google 登录` |

#### 2. OIDC 提供商信息

| 选项 | 说明 | 获取方式 |
|------|------|----------|
| **Issuer URL** | OIDC 提供商的基础 URL | 见上文各提供商配置 |
| **Client ID** | 应用的唯一标识符 | 在提供商后台获取 |
| **Client Secret** | 应用密钥（**保密**） | 在提供商后台获取 |

#### 3. 端点配置

**选项 A：自动发现（推荐）**

只需填写 **Issuer URL**，系统会自动从 `{issuer}/.well-known/openid-configuration` 获取端点信息。

- ✅ 支持：Google、Microsoft
- ❌ 不支持：GitHub（需手动配置）

**选项 B：手动配置**

如果自动发现失败，或提供商不支持，需手动填写：

| 端点 | 说明 |
|------|------|
| **Authorization Endpoint** | 授权端点 URL |
| **Token Endpoint** | 令牌端点 URL |
| **UserInfo Endpoint** | 用户信息端点 URL |

#### 4. LinuxDo 专属配置

| 选项 | 说明 | 推荐值 |
|------|------|--------|
| **最低信任等级** | 限制用户最低 Trust Level | `0`（允许所有用户）或 `2`（防垃圾账号） |

**设为 0**：允许所有 LinuxDo 用户登录
**设为 2**：只允许活跃用户（TL2+）登录

### 配置示例

#### Google 配置示例

```
启用 OIDC 登录: ✅
启用 OIDC 注册: ✅
登录按钮文字: 使用 Google 账号登录

Issuer URL: https://accounts.google.com
Client ID: 123456789-abcdefg.apps.googleusercontent.com
Client Secret: GOCSPX-xxxxxxxxxxxxxx

Authorization Endpoint: （留空，自动发现）
Token Endpoint: （留空，自动发现）
UserInfo Endpoint: （留空，自动发现）
```

#### Microsoft 配置示例

```
启用 OIDC 登录: ✅
启用 OIDC 注册: ✅
登录按钮文字: 使用 Microsoft 账号登录

Issuer URL: https://login.microsoftonline.com/common/v2.0
Client ID: 12345678-1234-1234-1234-123456789abc
Client Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxx

Authorization Endpoint: （留空，自动发现）
Token Endpoint: （留空，自动发现）
UserInfo Endpoint: （留空，自动发现）
```

#### GitHub 配置示例

```
启用 OIDC 登录: ✅
启用 OIDC 注册: ✅
登录按钮文字: 使用 GitHub 账号登录

Issuer URL: （留空，GitHub 不支持）
Client ID: Iv1.1234567890abcdef
Client Secret: 1234567890abcdef1234567890abcdef12345678

Authorization Endpoint: https://github.com/login/oauth/authorize
Token Endpoint: https://github.com/login/oauth/access_token
UserInfo Endpoint: https://api.github.com/user
```

#### LinuxDo 配置示例

```
启用 OIDC 登录: ✅
启用 OIDC 注册: ✅
登录按钮文字: 使用 LinuxDo 账号登录

Issuer URL: 留空（不支持自动发现）
Client ID: xxxxxxxxxx
Client Secret: xxxxxxxxxx

Authorization Endpoint: https://connect.linux.do/oauth2/authorize
Token Endpoint: https://connect.linux.do/oauth2/token
UserInfo Endpoint: https://connect.linux.do/api/user

最低信任等级: 2
```

---

## 常见问题

### Q1: 为什么 OIDC 登录失败，提示 "redirect_uri_mismatch"？

**原因**：回调 URL 配置不匹配。

**解决方案**：
1. 检查 LunaTV 实际访问地址（包括协议、域名、端口）
2. 确保提供商后台配置的回调 URL **完全一致**
3. 注意：
   - `http://localhost:3000` ≠ `http://127.0.0.1:3000`
   - `https://example.com` ≠ `https://www.example.com`
   - 末尾不要有斜杠：`/api/auth/oidc/callback` ✅  `/api/auth/oidc/callback/` ❌

### Q2: 登录后提示 "用户信息获取失败"

**原因**：UserInfo Endpoint 配置错误或提供商返回格式不兼容。

**解决方案**：
1. 检查 UserInfo Endpoint URL 是否正确
2. 查看 LunaTV 后台日志（浏览器控制台 Network 标签）
3. 确认提供商是否支持 `openid`、`profile`、`email` 范围

### Q3: GitHub 登录无法自动发现端点

**原因**：GitHub OAuth 不完全遵循 OIDC 标准，不支持自动发现。

**解决方案**：必须**手动配置**所有三个端点 URL（见上文 GitHub 配置部分）。

### Q4: Client Secret 泄露了怎么办？

**紧急处理**：
1. **立即**前往提供商后台重新生成新的 Client Secret
2. 删除或撤销旧的 Secret
3. 更新 LunaTV 后台配置为新 Secret
4. 检查日志，确认是否有异常登录

### Q5: 如何测试 OIDC 配置是否正确？

**测试步骤**：
1. 保存 OIDC 配置后，退出 LunaTV 登录
2. 访问登录页面，应该看到 OIDC 登录按钮
3. 点击按钮，应跳转到提供商登录页面
4. 输入账号密码，授权后应自动跳回 LunaTV
5. 检查是否成功登录，用户名显示正确

### Q6: 本地开发如何配置 OIDC？

**本地开发配置**：

大多数提供商允许使用 `http://localhost` 作为回调 URL：

```
Google:     http://localhost:3000/api/auth/oidc/callback ✅
Microsoft:  http://localhost:3000/api/auth/oidc/callback ✅
GitHub:     http://localhost:3000/api/auth/oidc/callback ✅
```

**注意**：
- 本地开发可使用 `http://`（无需 HTTPS）
- 生产环境**必须**使用 `https://`

### Q7: 如何禁止某些用户通过 OIDC 登录？

**方案 1**：在 LunaTV 后台封禁用户
1. 进入 **用户管理**
2. 找到该用户，点击 **封禁**

**方案 2**：提高 LinuxDo 最低信任等级
- 设置为 `2` 或 `3`，限制低活跃度用户

### Q8: 能否同时配置多个 OIDC 提供商？

**当前版本**：LunaTV 仅支持配置**一个** OIDC 提供商。

**未来计划**：后续版本可能支持同时配置 Google、Microsoft、GitHub 等多个提供商，用户可选择任一方式登录。

### Q9: OIDC 用户的密码是什么？

**说明**：
- OIDC 用户没有传统密码
- 用户通过 OIDC 提供商（如 Google）登录，LunaTV 不存储密码
- 管理员可在后台为 OIDC 用户设置密码，允许其使用密码登录

### Q10: 自动注册的 OIDC 用户有哪些权限？

**默认权限**：
- 角色：普通用户（`user`）
- 用户组：按 **站点配置 → 默认用户组** 设置
- 采集源权限：继承所在用户组的权限

**修改权限**：
管理员可在 **用户管理** 中调整 OIDC 用户的角色、用户组和权限。

---

## 技术支持

如遇到其他问题，请：

1. 检查 LunaTV 后台日志
2. 查看浏览器控制台错误信息
3. 提交 Issue 到 [LunaTV GitHub 仓库](https://github.com/your-repo/LunaTV)

---

**文档版本**：v1.0
**最后更新**：2025-12-27
**适用版本**：LunaTV v2.0+
