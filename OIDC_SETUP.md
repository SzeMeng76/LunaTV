# OpenID Connect (OIDC) 认证配置指南

本文档详细介绍如何在 LunaTV 中配置 OIDC 单点登录（SSO），支持 Google、Microsoft、GitHub、Facebook、微信、Apple、LinuxDo 等主流身份提供商。

## 📋 目录

- [什么是 OIDC](#什么是-oidc)
- [配置前准备](#配置前准备)
- [Google OAuth 2.0 配置](#google-oauth-20-配置)
- [Microsoft Entra ID 配置](#microsoft-entra-id-配置)
- [GitHub OAuth 配置](#github-oauth-配置)
- [Facebook OAuth 配置](#facebook-oauth-配置)
- [微信开放平台配置](#微信开放平台配置)
- [Apple Sign In 配置](#apple-sign-in-配置)
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

### 技术实现说明

#### GitHub OAuth 的特殊性

| 特性 | 标准 OIDC | GitHub OAuth | LunaTV 处理 |
|------|-----------|--------------|-------------|
| **OAuth Scope** | `openid profile email` | `read:user user:email` | ✅ 自动使用 GitHub scope |
| **Token 响应格式** | JSON | URL编码（默认） | ✅ 添加 Accept header 获取 JSON |
| **id_token** | 返回 | ❌ 不返回 | ✅ 使用 access_token |
| **Email 可见性** | 公开 | 可能为 null（私有） | ✅ 自动从 `/user/emails` 获取 |
| **UserInfo Headers** | 标准 Authorization | 需要 GitHub API headers | ✅ 添加专用 headers |

#### LunaTV 的适配处理

1. **Scope 自动适配**：
   - 标准 OIDC 使用 `openid profile email`
   - GitHub 自动使用 `read:user user:email`

2. **Token 请求 Accept Header**：
   - 添加 `Accept: application/json` header
   - 确保 Token 端点返回 JSON 格式而非 URL 编码

3. **UserInfo API Headers**：
   - `Accept: application/vnd.github+json`
   - `X-GitHub-Api-Version: 2022-11-28`

4. **私有邮箱获取**：
   - 如果 `/user` 返回的 `email` 为 null
   - 自动调用 `/user/emails` 端点
   - 优先使用 primary verified email

5. **用户唯一标识**：
   - 使用 `id` 字段（而非标准 OIDC 的 `sub`）

#### 获取的用户信息

LunaTV 从 GitHub API 获取：
- `id`：用户唯一标识符（用于关联账号）
- `login`：GitHub 用户名
- `name`：用户显示名称
- `email`：邮箱地址（自动获取私有邮箱）
- `avatar_url`：用户头像

> 📝 **隐私说明**：如果用户未公开邮箱，LunaTV 会自动从 `/user/emails` 端点获取 primary verified email（需要 `user:email` scope）。

### 参考资料
- [Creating an OAuth app - GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- [Authorizing OAuth apps - GitHub Docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Setting up Github OAuth 2.0](https://apidog.com/blog/set-up-github-oauth2/)

---

## Facebook OAuth 配置

Facebook 提供 OAuth 2.0 认证服务，拥有全球最大的用户基数。LunaTV 已针对 Facebook 的特殊实现进行了适配。

### 步骤 1：创建 Facebook 应用

#### 1.1 注册为开发者

1. 访问 [Facebook for Developers](https://developers.facebook.com/)
2. 使用您的 Facebook 账号登录
3. 如果是首次使用，需要注册成为开发者（同意条款并验证账号）

#### 1.2 创建新应用

1. 登录后，点击右上角的 **"My Apps"**（我的应用）
2. 点击 **"Create App"**（创建应用）按钮
3. 选择应用类型：
   - 推荐选择 **"Consumer"**（消费者）或 **"None"**（无）
4. 填写应用信息：
   - **App Name**（应用名称）：输入您的应用名称（例如：LunaTV）
   - **App Contact Email**（联系邮箱）：输入有效的邮箱地址
   - **App Purpose**（应用用途）：选择 **"Yourself or your own business"**
5. 点击 **"Create App"**（创建应用）

### 步骤 2：获取应用凭据

#### 2.1 查看 App ID 和 App Secret

1. 创建完成后，进入应用面板
2. 在左侧菜单中点击 **"Settings"** → **"Basic"**（设置 → 基本）
3. 您将看到：
   - **App ID**（应用编号）- 这就是您的 **Client ID**
   - **App Secret**（应用密钥）- 点击 **"Show"**（显示）按钮查看，这就是您的 **Client Secret**

> ⚠️ **重要提示**：
> - App Secret 类似于密码，切勿公开或提交到代码仓库
> - 创建后请立即复制并妥善保管
> - 如果泄露，请立即在 Facebook 后台重新生成新密钥

### 步骤 3：添加 Facebook Login 产品

1. 在应用面板左侧菜单中，点击 **"Add Product"**（添加产品）
2. 找到 **"Facebook Login"**（Facebook 登录）
3. 点击 **"Set Up"**（设置）按钮

### 步骤 4：配置 OAuth 重定向 URI

1. 在左侧菜单中点击 **"Facebook Login"** → **"Settings"**（设置）
2. 找到 **"Valid OAuth Redirect URIs"**（有效的 OAuth 重定向 URI）
3. 添加您的回调地址：
   ```
   https://your-domain.com/api/auth/oidc/callback
   ```

   **示例**：
   - 生产环境：`https://lunatv.example.com/api/auth/oidc/callback`
   - 本地测试（使用 ngrok）：`https://abc123.ngrok.io/api/auth/oidc/callback`

4. 点击 **"Save Changes"**（保存更改）

> ⚠️ **注意**：Facebook 要求重定向 URI 必须使用 **HTTPS** 协议（本地开发需要使用 ngrok 等工具）

### 步骤 5：上线应用

Facebook 应用默认处于 **"开发模式"**（Development），只有应用管理员和测试用户可以登录。

#### 切换到生产模式

1. 在 Facebook 应用面板顶部，找到模式切换开关
2. 当前应该显示 **"In development"**（开发中）
3. 点击切换开关，选择 **"Live"**（上线）
4. 确认上线操作

> 💡 **提示**：上线前建议配置应用图标和隐私政策 URL，虽然不是强制要求，但能提升用户信任度。

### Facebook OAuth 端点信息

Facebook 使用 OAuth 2.0 协议，端点配置如下：

```
Authorization Endpoint: https://www.facebook.com/v24.0/dialog/oauth
Token Endpoint:         https://graph.facebook.com/v24.0/oauth/access_token
UserInfo Endpoint:      https://graph.facebook.com/v24.0/me
```

**版本说明**：
- 当前示例使用 `v24.0`（2025 年最新版本）
- Facebook 会定期发布新版本，可访问 [Graph API 版本文档](https://developers.facebook.com/docs/graph-api/changelog) 查看最新版本
- 旧版本会在发布后至少 2 年内保持可用

### LunaTV 后台配置（Facebook）

在 LunaTV 管理后台 → **系统设置** → **OIDC 认证配置** 中：

#### 点击 **"添加 Provider"**，填写以下信息：

| 字段 | 值 | 说明 |
|------|-----|------|
| **Provider ID** | `facebook` | ⚠️ **必须**填写 `facebook`（全部小写）才能显示 Facebook logo |
| **启用** | ✅ 勾选 | 启用此 Provider |
| **按钮文字** | `使用 Facebook 登录` | 可选，留空则使用默认文字 |
| **允许注册** | ✅ 勾选（可选） | 是否允许新用户通过 Facebook 注册 |
| **Issuer URL** | `https://www.facebook.com` | Facebook 的 Issuer |
| **Authorization Endpoint** | `https://www.facebook.com/v24.0/dialog/oauth` | 授权端点 |
| **Token Endpoint** | `https://graph.facebook.com/v24.0/oauth/access_token` | Token 端点 |
| **UserInfo Endpoint** | `https://graph.facebook.com/v24.0/me` | 用户信息端点 |
| **Client ID** | `您的 App ID` | 从 Facebook 应用设置中获取 |
| **Client Secret** | `您的 App Secret` | 从 Facebook 应用设置中获取 |

#### 完整配置示例

```json
{
  "id": "facebook",
  "enabled": true,
  "buttonText": "使用 Facebook 登录",
  "enableRegistration": true,
  "issuer": "https://www.facebook.com",
  "authorizationEndpoint": "https://www.facebook.com/v24.0/dialog/oauth",
  "tokenEndpoint": "https://graph.facebook.com/v24.0/oauth/access_token",
  "userInfoEndpoint": "https://graph.facebook.com/v24.0/me",
  "clientId": "1234567890123456",
  "clientSecret": "abcdef1234567890abcdef1234567890"
}
```

保存配置后，登录页面将显示蓝色的 **"使用 Facebook 登录"** 按钮（带 Facebook logo）。

### 技术实现说明

#### Facebook OAuth 与标准 OIDC 的差异

Facebook 使用 OAuth 2.0 协议，与标准 OIDC 有以下差异（LunaTV 已自动处理）：

| 差异项 | 标准 OIDC | Facebook OAuth | LunaTV 处理 |
|--------|-----------|----------------|-------------|
| **用户唯一标识** | `sub` 字段 | `id` 字段 | ✅ 自动兼容 |
| **ID Token** | 返回 `id_token` | 不一定返回 | ✅ 已适配 |
| **UserInfo 字段** | 自动返回基础字段 | 需要 `fields` 参数指定 | ✅ 自动添加 |

#### 获取的用户信息

LunaTV 从 Facebook 获取以下字段：
- `id`：用户唯一标识符（用于关联账号）
- `name`：用户姓名
- `email`：邮箱地址（如果用户授权分享）
- `picture`：头像图片（640×640 像素）

> 📝 **说明**：Facebook 用户可以选择不分享邮箱，LunaTV 使用 `id` 字段作为唯一标识，不强制要求邮箱。

### 常见问题（Facebook）

#### Q1: 点击登录后提示 "redirect_uri_mismatch" 错误

**原因**：重定向 URI 配置不匹配

**解决方法**：
1. 检查 Facebook 应用中配置的 **"Valid OAuth Redirect URIs"** 是否与您的实际域名一致
2. 确保使用 `https://` 协议
3. 确保路径为 `/api/auth/oidc/callback`（无额外斜杠）
4. 域名大小写必须完全匹配

#### Q2: 提示 "App Not Set Up" 错误

**原因**：Facebook 应用未正确配置 Facebook Login 产品

**解决方法**：
1. 确保已在 Facebook 应用中添加 **"Facebook Login"** 产品
2. 检查 OAuth 重定向 URI 是否已保存
3. 确认应用已切换到 **"Live"** 模式（如果要给其他用户使用）

#### Q3: 登录按钮显示 "使用 OIDC 登录" 而不是 Facebook logo

**原因**：Provider ID 配置错误

**解决方法**：
1. 检查 LunaTV 配置中的 **"Provider ID"** 字段
2. **必须**填写 `facebook`（全部小写，不能是 `Facebook` 或 `fb`）
3. 保存配置后刷新登录页面

#### Q4: 提示 "获取用户信息失败" 错误

**原因**：UserInfo Endpoint 配置错误或权限问题

**解决方法**：
1. 确认 **"UserInfo Endpoint"** 配置为 `https://graph.facebook.com/v19.0/me`
2. 查看服务器日志获取详细错误信息
3. 检查 App ID 和 App Secret 是否正确

#### Q5: 如何在本地开发环境测试？

**方法 1：使用 ngrok（推荐）**

```bash
ngrok http 3000
```

使用 ngrok 提供的 HTTPS 地址（如 `https://abc123.ngrok.io`）作为重定向 URI。

**方法 2：添加测试用户**

1. 在 Facebook 应用面板中，进入 **"Roles"** → **"Test Users"**
2. 创建测试用户
3. 应用保持在 **"Development"** 模式，使用测试账号登录

#### Q6: Facebook 登录后获取不到邮箱？

**说明**：
- Facebook 用户可以选择不分享邮箱
- LunaTV 使用 Facebook 的唯一 ID（`id` 字段）作为用户标识，不强制要求邮箱
- 如果需要邮箱，可以在首次注册时要求用户补充

#### Q7: 如何更新到新版本的 Facebook Graph API？

1. 访问 [Facebook Graph API Changelog](https://developers.facebook.com/docs/graph-api/changelog)
2. 查看最新版本号（例如 `v20.0`）
3. 在 LunaTV 配置中更新端点 URL 的版本号：
   ```
   https://www.facebook.com/v20.0/dialog/oauth
   https://graph.facebook.com/v20.0/oauth/access_token
   https://graph.facebook.com/v20.0/me
   ```

### 参考资料
- [Facebook for Developers 官方文档](https://developers.facebook.com/docs/)
- [Facebook Login 文档](https://developers.facebook.com/docs/facebook-login/)
- [Facebook Graph API 文档](https://developers.facebook.com/docs/graph-api/)
- [Set up Facebook login with OAuth 2](https://baserow.io/user-docs/configure-facebook-for-oauth-2-sso)
- [Facebook OAuth 2.0 Access for Website](https://apidog.com/blog/facebook-oauth-2-0-access-for-website/)

---

## 微信开放平台配置

微信开放平台提供网站应用微信登录功能，用户可通过扫描二维码使用微信账号登录你的网站。

### 步骤 1：注册微信开放平台账号

1. 访问 [微信开放平台](https://open.weixin.qq.com/)
2. 使用微信扫码登录
3. 完成开发者资质认证（需要企业资质或个人开发者认证）

> ⚠️ **注意**：微信开放平台需要认证才能创建网站应用，认证费用为 300 元人民币/年

### 步骤 2：创建网站应用

1. 登录微信开放平台后，进入 **管理中心**
2. 点击 **网站应用** → **创建网站应用**
3. 填写应用信息：
   - **应用名称**：`LunaTV`
   - **应用简介**：简要描述你的应用
   - **应用官网**：`https://your-domain.com`
   - **应用图标**：上传应用图标（108×108 像素）
4. 填写 **授权回调域**：
   ```
   your-domain.com
   ```
   ⚠️ **重要**：只填写域名，不要加 `https://` 或路径

5. 提交审核，等待微信团队审核（通常 1-7 个工作日）

### 步骤 3：获取 AppID 和 AppSecret

审核通过后：

1. 进入 **管理中心** → **网站应用**
2. 点击你创建的应用
3. 查看应用详情，获取：
   - **AppID**（应用唯一标识）
   - **AppSecret**（应用密钥，点击查看）

> ⚠️ **安全提示**：AppSecret 非常重要，请妥善保管，不要泄露！

### 微信 OAuth 2.0 端点信息

微信网站应用使用以下端点：

```
Authorization Endpoint: https://open.weixin.qq.com/connect/qrconnect
Token Endpoint:         https://api.weixin.qq.com/sns/oauth2/access_token
UserInfo Endpoint:      https://api.weixin.qq.com/sns/userinfo
```

**特殊说明**：
- 微信使用 `appid` 和 `secret` 参数，而不是标准的 `client_id` 和 `client_secret`
- Scope 使用 `snsapi_login`（网站应用扫码登录）
- LunaTV 已自动处理这些差异

### LunaTV 后台配置（微信）

在 LunaTV 管理后台 → **系统设置** → **OIDC 认证配置** 中：

#### 点击 **"添加 Provider"**，填写以下信息：

| 字段 | 值 | 说明 |
|------|-----|------|
| **Provider ID** | `wechat` | ⚠️ **必须**填写 `wechat`（全部小写）才能显示微信 logo |
| **启用** | ✅ 勾选 | 启用此 Provider |
| **按钮文字** | `使用微信登录` | 可选，留空则使用默认文字 |
| **允许注册** | ✅ 勾选（可选） | 是否允许新用户通过微信注册 |
| **Issuer URL** | `https://open.weixin.qq.com` | 微信开放平台地址 |
| **Authorization Endpoint** | `https://open.weixin.qq.com/connect/qrconnect` | 扫码授权端点 |
| **Token Endpoint** | `https://api.weixin.qq.com/sns/oauth2/access_token` | Token 端点 |
| **UserInfo Endpoint** | `https://api.weixin.qq.com/sns/userinfo` | 用户信息端点 |
| **Client ID** | `您的 AppID` | 从微信开放平台获取 |
| **Client Secret** | `您的 AppSecret` | 从微信开放平台获取 |

#### 完整配置示例

```json
{
  "id": "wechat",
  "enabled": true,
  "buttonText": "使用微信登录",
  "enableRegistration": true,
  "issuer": "https://open.weixin.qq.com",
  "authorizationEndpoint": "https://open.weixin.qq.com/connect/qrconnect",
  "tokenEndpoint": "https://api.weixin.qq.com/sns/oauth2/access_token",
  "userInfoEndpoint": "https://api.weixin.qq.com/sns/userinfo",
  "clientId": "wx1234567890abcdef",
  "clientSecret": "abcdef1234567890abcdef1234567890"
}
```

保存配置后，登录页面将显示绿色的 **"使用微信登录"** 按钮（带微信 logo）。

### 技术实现说明

#### 微信 OAuth 2.0 与标准 OIDC 的差异

微信使用 OAuth 2.0 协议，与标准 OIDC 有以下差异（LunaTV 已自动处理）：

| 差异项 | 标准 OIDC | 微信 OAuth | LunaTV 处理 |
|--------|-----------|------------|-------------|
| **Client ID 参数名** | `client_id` | `appid` | ✅ 自动转换 |
| **Client Secret 参数名** | `client_secret` | `secret` | ✅ 自动转换 |
| **Scope** | `openid profile email` | `snsapi_login` | ✅ 自动设置 |
| **用户唯一标识** | `sub` 字段 | `openid` 字段 | ✅ 自动兼容 |
| **UserInfo 参数** | Bearer Token | URL 参数 `access_token` + `openid` | ✅ 自动添加 |

#### 获取的用户信息

LunaTV 从微信获取以下字段：
- `openid`：用户唯一标识符（用于关联账号）
- `nickname`：用户昵称
- `headimgurl`：用户头像 URL
- `sex`：用户性别（1=男性，2=女性，0=未知）
- `province`、`city`、`country`：用户地区信息

> 📝 **说明**：微信不一定返回邮箱，LunaTV 使用 `openid` 作为唯一标识。

### 常见问题（微信）

#### Q1: 提示 "redirect_uri 参数错误"

**原因**：授权回调域配置不正确

**解决方法**：
1. 检查微信开放平台应用设置中的 **授权回调域**
2. 只填写域名（如 `lunatv.example.com`），不要加协议或路径
3. 确保域名与实际访问域名完全一致

#### Q2: 扫码后提示 "应用未上线"

**原因**：应用处于开发模式

**解决方法**：
1. 进入微信开放平台 → 管理中心 → 网站应用
2. 找到你的应用，确认审核状态为 **"审核通过"**
3. 开发阶段可以使用微信开放平台的测试账号功能

#### Q3: 登录按钮显示 "使用OIDC登录" 而不是微信 logo

**原因**：Provider ID 配置错误

**解决方法**：
1. 检查 LunaTV 配置中的 **"Provider ID"** 字段
2. **必须**填写 `wechat`（全部小写，不能是 `WeChat` 或 `weixin`）
3. 保存配置后刷新登录页面

#### Q4: 如何在本地开发环境测试？

**问题**：微信要求回调域名，不支持 `localhost`

**推荐方案：使用 ngrok（简单易用）**

1. 安装 ngrok：访问 [ngrok.com](https://ngrok.com/) 下载
2. 启动 ngrok：
   ```bash
   ngrok http 3000
   ```
3. ngrok 会生成一个临时 HTTPS 域名，例如：
   ```
   https://abc123.ngrok.io -> http://localhost:3000
   ```
4. 使用这个 ngrok 域名配置到微信开放平台：
   - **授权回调域**：`abc123.ngrok.io`（不要加 https://）
5. 用浏览器访问 `https://abc123.ngrok.io` 即可测试

> 💡 **注意**：免费版 ngrok 每次重启域名会变化，需要重新配置到微信开放平台

#### Q5: 微信认证费用是否必须？

**回答**：
- 个人开发者：可以申请个人开发者认证（免费），但功能受限
- 企业应用：需要企业认证（300元/年），功能完整
- 测试阶段：可以使用微信提供的测试号进行开发调试

#### Q6: 用户取消授权后如何重新授权？

用户可以在微信中进入 **"我"** → **"设置"** → **"隐私"** → **"授权管理"**，找到你的应用并重新授权。

### 参考资料

- [微信开放平台官方文档](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login)
- [微信网页授权说明](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html)
- [微信开放平台扫码登录](https://www.cnblogs.com/0201zcr/p/5133062.html)

---

## Apple Sign In 配置

Apple Sign In 提供安全、隐私友好的登录方式，支持所有苹果设备用户。Apple 使用标准的 OpenID Connect (OIDC) 协议。

### 步骤 1：注册 Apple Developer 账号

1. 访问 [Apple Developer](https://developer.apple.com/)
2. 使用 Apple ID 登录
3. 注册成为开发者（个人：$99/年，企业：$299/年）

> 💡 **提示**：Apple Developer Program 需要付费订阅才能使用 Sign in with Apple

### 步骤 2：创建 App ID

1. 登录 [Apple Developer Portal](https://developer.apple.com/account/)
2. 进入 **Certificates, Identifiers & Profiles**
3. 选择 **Identifiers** → 点击 **+** 创建新 ID
4. 选择 **App IDs** → **Continue**
5. 选择类型：**App**
6. 填写信息：
   - **Description**：`LunaTV App`
   - **Bundle ID**：`com.yourcompany.lunatv`
7. 在 **Capabilities** 中勾选 **Sign in with Apple**
8. 点击 **Continue** → **Register**

### 步骤 3：创建 Services ID

1. 返回 **Identifiers**，点击 **+** 创建
2. 选择 **Services IDs** → **Continue**
3. 填写信息：
   - **Description**：`LunaTV Web Login`
   - **Identifier**：`com.yourcompany.lunatv.web`（不同于 App ID）
4. 勾选 **Sign in with Apple**
5. 点击 **Configure** 配置：
   - **Primary App ID**：选择刚才创建的 App ID
   - **Web Domain**：`your-domain.com`（不要加 https://）
   - **Return URLs**：`https://your-domain.com/api/auth/oidc/callback`
6. 点击 **Save** → **Continue** → **Register**

> 📝 **记录**：Services ID 的 Identifier 就是你的 **Client ID**

### 步骤 4：创建私钥（用于生成 Client Secret）

1. 进入 **Keys** → 点击 **+** 创建
2. **Key Name**：`LunaTV Sign in with Apple Key`
3. 勾选 **Sign in with Apple**
4. 点击 **Configure**，选择刚才创建的 **Primary App ID**
5. 点击 **Save** → **Continue** → **Register**
6. **下载 .p8 私钥文件**（⚠️ 只能下载一次！）
7. 记录 **Key ID**（10 位字符）

> ⚠️ **重要**：
> - .p8 私钥文件只能下载一次，请妥善保管
> - 记录你的 **Team ID**（在账号页面右上角）

### 步骤 5：生成 Client Secret（JWT）

Apple 的 Client Secret 是动态生成的 JWT，有效期最长 6 个月。你需要使用私钥生成 JWT。

#### 使用在线工具生成（推荐）

1. 访问 [Apple Client Secret Generator](https://github.com/LoginRadius/apple-client-secret-generator)
2. 或使用其他 JWT 生成工具
3. 填写参数：
   - **Team ID**：你的 Team ID（10 位字符）
   - **Client ID**：Services ID 的 Identifier
   - **Key ID**：私钥的 Key ID
   - **Private Key**：上传或粘贴 .p8 文件内容
   - **Expiration**：最长 15777000 秒（6 个月）

#### 使用 Node.js 生成（开发者）

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('AuthKey_XXXXXXXXXX.p8', 'utf8');

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d', // 6 个月
  audience: 'https://appleid.apple.com',
  issuer: 'YOUR_TEAM_ID', // 你的 Team ID
  subject: 'com.yourcompany.lunatv.web', // 你的 Services ID
  keyid: 'YOUR_KEY_ID' // 你的 Key ID
});

console.log(token);
```

> ⏰ **提醒**：Client Secret 有效期最长 6 个月，到期前需要重新生成并更新配置。

### Apple Sign In 端点信息

Apple 支持 OIDC 自动发现：

```
OIDC Discovery: https://appleid.apple.com/.well-known/openid-configuration
```

或手动配置各端点：

```
Authorization Endpoint: https://appleid.apple.com/auth/authorize
Token Endpoint:         https://appleid.apple.com/auth/token
JWKS Endpoint:          https://appleid.apple.com/auth/keys
```

**特殊说明**：
- Apple **没有 UserInfo Endpoint**
- 用户信息在 `id_token`（JWT）中返回
- 用户信息（姓名、邮箱）**只在首次授权时**返回
- LunaTV 会自动解析 id_token 获取用户信息

### LunaTV 后台配置（Apple）

在 LunaTV 管理后台 → **系统设置** → **OIDC 认证配置** 中：

#### 点击 **"添加 Provider"**，填写以下信息：

| 字段 | 值 | 说明 |
|------|-----|------|
| **Provider ID** | `apple` | ⚠️ **必须**填写 `apple`（全部小写）才能显示 Apple logo |
| **启用** | ✅ 勾选 | 启用此 Provider |
| **按钮文字** | `使用 Apple 登录` | 可选，留空则使用默认文字 |
| **允许注册** | ✅ 勾选（可选） | 是否允许新用户通过 Apple 注册 |
| **Issuer URL** | `https://appleid.apple.com` | Apple 的 Issuer（支持自动发现） |
| **Authorization Endpoint** | `https://appleid.apple.com/auth/authorize` | 授权端点（自动发现会填充） |
| **Token Endpoint** | `https://appleid.apple.com/auth/token` | Token 端点（自动发现会填充） |
| **JWKS URI** | `https://appleid.apple.com/auth/keys` | 用于验证 id_token 签名（自动发现会填充） |
| **Client ID** | `com.yourcompany.lunatv.web` | 你的 Services ID |
| **Client Secret** | `eyJhbGc...` | 生成的 JWT（很长的字符串） |

#### 完整配置示例

```json
{
  "id": "apple",
  "enabled": true,
  "buttonText": "使用 Apple 登录",
  "enableRegistration": true,
  "issuer": "https://appleid.apple.com",
  "authorizationEndpoint": "https://appleid.apple.com/auth/authorize",
  "tokenEndpoint": "https://appleid.apple.com/auth/token",
  "userInfoEndpoint": "",
  "jwksUri": "https://appleid.apple.com/auth/keys",
  "clientId": "com.yourcompany.lunatv.web",
  "clientSecret": "eyJhbGciOiJFUzI1NiIsImtpZCI6IkFCQ0RFRjEyMzQifQ.eyJpc3MiOiJBQkMxMjM0NTY3IiwiaWF0IjoxNjQwOTk1MjAwLCJleHAiOjE2NTY1NDcyMDAsImF1ZCI6Imh0dHBzOi8vYXBwbGVpZC5hcHBsZS5jb20iLCJzdWIiOiJjb20ueW91cmNvbXBhbnkubHVuYXR2LndlYiJ9.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
}
```

保存配置后，登录页面将显示黑色的 **"使用 Apple 登录"** 按钮（带 Apple logo）。

### 技术实现说明

#### Apple Sign In 的特殊性

| 特性 | 标准 OIDC | Apple Sign In | LunaTV 处理 |
|------|-----------|---------------|-------------|
| **Client Secret** | 静态字符串 | 动态生成的 JWT（6个月有效期） | ✅ 支持 JWT |
| **UserInfo Endpoint** | 提供 | ❌ 不提供 | ✅ 从 id_token 解析 |
| **JWKS URI** | 可选 | ✅ 提供（验证签名） | ✅ 支持配置 |
| **响应模式** | Query params（GET） | form_post（POST） | ✅ 支持 POST handler |
| **用户信息返回** | 每次都返回 | 只在首次授权时返回 | ✅ 自动处理 |
| **Email 隐藏** | 真实邮箱 | 可选择隐藏（relay邮箱） | ✅ 支持 |

#### LunaTV 的适配处理

1. **response_mode=form_post**：
   - Apple 要求使用 `response_mode=form_post`
   - 授权响应通过 POST 请求发送（而非 GET）
   - 参数在 form data 中（而非 URL query params）
   - LunaTV 添加了 POST handler 专门处理 Apple 回调

2. **id_token 解析**：
   - Apple 不提供 UserInfo Endpoint
   - 用户信息在 id_token（JWT）中
   - LunaTV 自动解析 JWT payload 获取用户信息

3. **首次授权数据**：
   - 用户姓名和邮箱只在首次授权时返回
   - 后续登录仅返回 `sub`（用户 ID）
   - LunaTV 在首次注册时保存用户信息

4. **JWKS 签名验证**：
   - 使用 Apple 的 JWKS URI 验证 id_token 签名
   - 确保 token 真实性和完整性

#### 获取的用户信息

LunaTV 从 Apple id_token 中获取：
- `sub`：用户唯一标识符（用于关联账号）
- `email`：邮箱地址（可能是中继邮箱）
- `email_verified`：邮箱是否已验证（通常为 true）

> 📝 **隐私中继邮箱**：用户可选择隐藏真实邮箱，Apple 会生成形如 `abc123@privaterelay.appleid.com` 的中继邮箱，转发邮件到用户真实邮箱。

### 常见问题（Apple）

#### Q1: Client Secret 过期怎么办？

**回答**：
- Client Secret（JWT）最长有效期 6 个月
- 到期前，使用相同的私钥重新生成 JWT
- 在 LunaTV 管理后台更新 Client Secret
- 建议设置日历提醒，提前 1-2 周更新

#### Q2: 本地开发如何测试？

**问题**：Apple 要求 HTTPS 和真实域名，不支持 `localhost`

**推荐方案：使用 ngrok（简单易用）**

1. 安装 ngrok：访问 [ngrok.com](https://ngrok.com/) 下载
2. 启动 ngrok：
   ```bash
   ngrok http 3000
   ```
3. ngrok 会生成一个临时 HTTPS 域名，例如：
   ```
   https://abc123.ngrok.io -> http://localhost:3000
   ```
4. 在 Apple Developer Portal 中配置：
   - **Web Domain**: `abc123.ngrok.io`（不要加 https://）
   - **Return URLs**: `https://abc123.ngrok.io/api/auth/oidc/callback`
5. 用浏览器访问 `https://abc123.ngrok.io` 即可测试

> 💡 **注意**：免费版 ngrok 每次重启域名会变化，需要重新配置到 Apple Developer Portal

#### Q3: 提示 "invalid_client" 错误

**原因**：Client Secret（JWT）无效或过期

**解决方法**：
1. 检查 JWT 是否正确生成（Team ID、Client ID、Key ID 是否正确）
2. 检查 JWT 是否过期
3. 重新生成 Client Secret 并更新配置

#### Q4: 登录后获取不到邮箱？

**原因**：
- 用户首次登录时选择了隐藏邮箱
- 或者用户使用的是中继邮箱

**说明**：
- Apple 允许用户隐藏真实邮箱
- LunaTV 使用 `sub` 字段作为唯一标识，不强制要求邮箱
- 如果需要邮箱，可以在首次注册时要求用户补充

#### Q5: 如何测试首次登录流程？

**方法**：
1. 在 Apple ID 账户页面 [appleid.apple.com](https://appleid.apple.com/)
2. 进入 **"安全"** → **"使用您 Apple ID 登录的 App"**
3. 找到你的应用，点击 **"停止使用 Apple ID"**
4. 再次登录将被视为首次登录

#### Q6: 私钥文件丢失怎么办？

**解决方案**：
- 私钥只能下载一次，丢失后无法恢复
- 需要在 Apple Developer Portal 创建新的私钥
- 使用新私钥重新生成 Client Secret
- 更新 LunaTV 配置

### 参考资料

- [Apple Sign In 官方文档](https://developer.apple.com/sign-in-with-apple/)
- [Configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web)
- [Creating a Client Secret](https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret)
- [Apple OAuth & OIDC endpoints](https://logto.io/oauth-providers-explorer/apple)

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

#### Facebook 配置示例

```
Provider ID: facebook
启用: ✅
允许注册: ✅
按钮文字: 使用 Facebook 登录

Issuer URL: https://www.facebook.com
Client ID: 1234567890123456
Client Secret: abcdef1234567890abcdef1234567890

Authorization Endpoint: https://www.facebook.com/v19.0/dialog/oauth
Token Endpoint: https://graph.facebook.com/v19.0/oauth/access_token
UserInfo Endpoint: https://graph.facebook.com/v19.0/me
```

> ⚠️ **重要**：Provider ID 必须填写 `facebook`（全部小写）才能正确显示 Facebook logo 和品牌色按钮。

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

**✅ 已支持**！LunaTV 的多 Provider 模式允许同时配置多个 OIDC 提供商。

**配置方式**：
1. 进入管理后台 → **系统设置** → **OIDC 认证配置**
2. 切换到 **"多 Provider 模式（推荐）"**
3. 点击 **"添加 Provider"** 可添加多个提供商
4. 支持同时配置：Google、Microsoft、GitHub、Facebook、微信、Apple、LinuxDo 等

**用户体验**：
- 登录页面将显示所有已启用 Provider 的登录按钮
- 用户可选择任一方式登录
- 每个 Provider 可单独设置是否允许注册

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
