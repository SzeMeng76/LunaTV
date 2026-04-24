# Telegram Magic Link Authentication

## 概述

LunaTV 支持通过 Telegram Bot 实现无密码登录（Magic Link），用户只需输入 Telegram 用户名，即可通过 Bot 发送的链接完成登录。

## 功能特性

- 🔐 **无密码登录** - 通过 Telegram Bot 发送一次性登录链接
- 🤖 **自动注册** - 首次登录的用户可自动创建账号
- ⏰ **安全过期** - 登录链接 5 分钟后自动过期
- 🌐 **多存储支持** - 支持 Kvrocks、Redis、Upstash 存储 token
- 🔄 **自动 Webhook 更新** - 自动将 webhook 设置到当前访问的域名

## 配置步骤

### 1. 创建 Telegram Bot

1. 在 Telegram 中与 [@BotFather](https://t.me/botfather) 对话
2. 发送 `/newbot` 命令创建新 Bot
3. 按提示设置 Bot 名称和用户名
4. 记录 BotFather 返回的 **Bot Token** 和 **Bot Username**

### 2. 配置环境变量

在 `.env.local` 或部署环境中设置存储类型：

```bash
# 存储类型：kvrocks、redis 或 upstash
NEXT_PUBLIC_STORAGE_TYPE=kvrocks

# Kvrocks 连接 URL（如果使用 Kvrocks）
KVROCKS_URL=redis://moontv-kvrocks:6666

# Redis 连接 URL（如果使用 Redis）
# REDIS_URL=redis://localhost:6379

# Upstash 配置（如果使用 Upstash）
# UPSTASH_URL=https://xxx.upstash.io
# UPSTASH_TOKEN=your_token_here
```

### 3. 在管理后台配置

1. 登录管理后台 `/admin`
2. 进入 **Telegram 登录配置** 页面
3. 填写以下信息：
   - **Bot Token**: 从 BotFather 获取的 token
   - **Bot Username**: Bot 的用户名（不含 @）
   - **启用自动注册**: 推荐开启，允许新用户自动创建账号
4. 点击 **保存配置**

### 4. 设置 Webhook（可选）

系统会在用户首次点击 Bot 链接时自动设置 webhook 到当前域名。

如需手动设置，在浏览器 Console 执行：

```javascript
fetch('/api/telegram/set-webhook', {
  method: 'POST'
}).then(r => r.json()).then(console.log)
```

## 工作原理

### 登录流程

```
用户 -> 输入 Telegram 用户名
     -> 系统生成一次性 token（5分钟有效期）
     -> 系统发送深度链接到用户的 Telegram
     -> 用户在 Telegram 点击 /start 链接
     -> Bot 发送登录 URL
     -> 用户点击 URL 完成登录
```

### Token 生成与存储

```typescript
// Token 数据结构
interface TelegramTokenData {
  telegramUsername: string;  // Telegram 用户名
  expiresAt: number;         // 过期时间戳
  baseUrl?: string;          // 创建 token 的域名
}

// 存储位置：Redis/Kvrocks
// Key: cache:telegram_token:{token_hash}
// TTL: 300 秒（5分钟）
```

### 自动 Webhook 更新

系统会在接收到 Telegram 消息时自动检查 webhook URL 是否匹配当前域名，如果不匹配则自动更新：

```typescript
// webhook.ts 自动更新逻辑
if (currentWebhookUrl !== expectedWebhookUrl) {
  await setWebhook(expectedWebhookUrl);
}
```

## 重要限制

### ⚠️ 一个 Bot 只能绑定一个域名

Telegram Bot 的 webhook 机制限制：**一个 Bot 只能绑定一个 webhook URL**。

**多部署场景解决方案：**

1. **方案 A：每个部署使用独立的 Bot**
   - Vercel 部署 → Bot A
   - 自建服务器 → Bot B
   - 优点：互不干扰
   - 缺点：需要管理多个 Bot

2. **方案 B：只在一个域名启用 Telegram 登录**
   - 主域名启用 Telegram 登录
   - 其他部署禁用或使用其他登录方式
   - 优点：管理简单
   - 缺点：功能受限

## API 端点

### POST `/api/telegram/send-magic-link`

生成并发送 Magic Link

**请求体：**
```json
{
  "telegramUsername": "username"
}
```

**响应：**
```json
{
  "success": true,
  "deepLink": "https://t.me/yourbot?start=token_hash",
  "botUsername": "yourbot"
}
```

### POST `/api/telegram/webhook`

接收 Telegram Bot 消息（由 Telegram 服务器调用）

### GET/POST `/api/telegram/set-webhook`

查询或设置 webhook URL

### GET `/api/telegram/verify`

验证并消费 token，完成登录

**查询参数：**
- `token`: 一次性登录 token

## 故障排查

### Token 立即过期

**症状：** 点击 Bot 发送的链接后显示"登录链接已过期或无效"

**可能原因：**
1. Webhook 指向了其他域名（多部署冲突）
2. Token 未正确存储到 Redis/Kvrocks
3. 服务器时间不同步

**解决方法：**
```bash
# 1. 检查当前 webhook 配置
curl https://your-domain.com/api/telegram/set-webhook

# 2. 手动设置 webhook 到当前域名
curl -X POST https://your-domain.com/api/telegram/set-webhook

# 3. 检查 Kvrocks/Redis 中的 token
redis-cli -h kvrocks-host -p 6666
KEYS cache:telegram_token:*
GET cache:telegram_token:{token_hash}
TTL cache:telegram_token:{token_hash}
```

### Webhook 401 错误

**症状：** `getWebhookInfo` 显示 `last_error_message: "401 Unauthorized"`

**原因：** Webhook URL 返回了 401 状态码（通常是域名或路径错误）

**解决方法：**
1. 确认域名可公开访问（不在防火墙后）
2. 检查 webhook 路径是否正确：`/api/telegram/webhook`
3. 检查中间件是否拦截了 webhook 请求

### Webhook 未自动更新

**症状：** 点击 Bot 链接后没有收到登录 URL

**解决方法：**
```javascript
// 在浏览器访问你的域名，然后在 Console 执行
fetch('/api/telegram/set-webhook', {
  method: 'POST'
}).then(r => r.json()).then(console.log)
```

## 安全考虑

1. **Token 一次性使用** - verify 接口验证后立即删除 token
2. **短期有效** - Token 仅 5 分钟有效
3. **随机生成** - 使用 crypto.randomBytes(32) 生成 64 字符 token
4. **域名绑定** - Token 记录创建时的域名，防止跨域使用
5. **自动清理** - Redis/Kvrocks TTL 自动清理过期 token

## 开发调试

### 启用调试日志

所有 Telegram 相关操作都有详细日志输出：

```bash
# 查看应用日志
docker logs <container-name> --tail 100 --follow | grep -E "\[TelegramToken\]|\[Webhook\]|\[Magic Link\]"
```

### 监控 Kvrocks 命令

```bash
# 实时查看 Kvrocks 执行的命令
docker exec -it moontv-kvrocks redis-cli -p 6666 MONITOR
```

### 测试 Token 存储

```bash
# 手动测试 token 存储和读取
docker exec -it moontv-kvrocks redis-cli -p 6666

# 设置测试 token
SETEX cache:test_token 300 '{"telegramUsername":"test","expiresAt":1761999999999}'

# 读取
GET cache:test_token

# 检查 TTL
TTL cache:test_token
```

## 相关代码文件

- `src/lib/telegram-tokens.ts` - Token 管理逻辑
- `src/app/api/telegram/send-magic-link/route.ts` - 发送 Magic Link
- `src/app/api/telegram/webhook/route.ts` - Webhook 处理和自动更新
- `src/app/api/telegram/verify/route.ts` - Token 验证和登录
- `src/app/api/telegram/set-webhook/route.ts` - Webhook 配置管理
- `src/components/TelegramAuthConfig.tsx` - 管理后台配置界面

## 更新日志

- **v1.0.0** - 初始实现 Telegram Magic Link 登录
- **v1.1.0** - 添加 webhook 自动更新功能
- **v1.2.0** - 添加多部署域名冲突警告
