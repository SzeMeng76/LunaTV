# TVBox安全配置指南

## 🔒 安全问题
TVBox的JSON接口默认无鉴权，可能被他人滥用。现已添加多种可选的安全机制。

## 🛠️ 后台配置界面

所有安全配置都可以在 **管理后台 > TVBox安全配置** 页面中进行设置，无需修改环境变量或配置文件。

### 1. Token鉴权（推荐）

#### 🌐 全局 Token
所有用户共享同一个 token：

**配置步骤：**
1. 管理后台 > TVBox安全配置
2. 启用 "Token验证"
3. 系统自动生成token（可手动修改）
4. 保存配置

**使用：**
```
https://your-domain.com/api/tvbox?token=你的token
```

#### 👤 用户专属 Token（v5.5.7 新增）

**特性：**
- 🎯 每个用户独立 token + 源权限
- 🔒 token 泄露只影响单个用户
- 📊 可追踪用户访问
- 🔄 灵活调整权限

**配置：**
1. 管理后台 > 用户管理
2. 点击用户的 "TVBox Token" 管理
3. 生成 Token 并选择可访问的源
4. 保存（留空=访问所有源）

**优先级：**
用户专属 Token > 全局 Token > 无验证

### 2. IP白名单
限制只允许特定IP访问：

**后台配置步骤：**
1. 在管理后台的 "TVBox安全配置" 中启用 "IP白名单"
2. 添加允许访问的IP地址
3. 保存配置

**支持的格式：**
- 单个 IPv4 地址：`192.168.1.100`
- IPv4 CIDR：`192.168.1.0/24`、`10.0.0.0/8`
- 单个 IPv6 地址：`2001:db8::1`
- IPv6 CIDR：`2001:db8::/32`
- 通配符：`*`（允许所有，不推荐）

### 3. 访问频率限制
防止频繁访问滥用：

**后台配置步骤：**
1. 在管理后台启用 "频率限制"
2. 设置每分钟允许的最大请求次数（默认60次）
3. 保存配置

## 📱 TVBox配置示例

### 无安全限制（默认）
```
https://your-domain.com/api/tvbox
```

### 启用Token验证
```
https://your-domain.com/api/tvbox?token=你的token
```

### Base64格式配置
```
https://your-domain.com/api/tvbox?format=base64&token=你的token
```

## 💡 使用建议

### 家庭使用
- 在后台启用 "Token验证" 即可
- 建议定期更换token以提高安全性

### 公网部署
- 建议启用所有三种安全机制：
  1. Token验证（必选）
  2. 频率限制（推荐设置为30次/分钟）
  3. IP白名单（如果IP相对固定）

### 内网使用
- 可以仅使用IP白名单限制内网访问
- 或使用Token验证提供额外安全性

## ⚠️ 注意事项

1. **TVBox兼容性**：所有安全机制都是可选的，默认保持无鉴权兼容TVBox
2. **后台配置**：所有设置都在管理后台中完成，实时生效无需重启
3. **Token安全**：token一旦启用，需要在TVBox中配置完整URL才能访问
4. **IP白名单**：适合固定网络环境，移动设备可能IP变化
5. **频率限制**：防止暴力访问，正常使用不会触发
6. **组合使用**：可以同时启用多种安全机制

## 🔧 故障排除

### TVBox无法加载配置
1. 检查URL是否包含正确的token参数
2. 确认IP是否在白名单中
3. 检查是否触发频率限制（等待1分钟后重试）
4. 在管理后台查看TVBox安全配置是否正确保存

### 错误信息说明
- `Invalid token`：token不正确或缺失
- `Access denied for IP`：IP不在白名单中
- `Rate limit exceeded`：访问频率过高

## 📊 配置管理

### 在管理后台中：
1. **实时预览**：可以看到生成的TVBox配置URL
2. **安全状态**：显示当前启用的安全机制
3. **Token管理**：支持自动生成或手动设置token
4. **IP管理**：可视化添加/删除IP白名单
5. **频率设置**：滑块调整请求限制次数

这些功能让TVBox安全配置变得简单直观，无需编辑配置文件。

## 🛡️ 成人内容过滤（纵深防御）

LunaTV 实现了双层防御机制来保护用户免受不当内容影响。

### 第一层：配置接口过滤

在 TVBox 配置接口 (`/api/tvbox`) 中，通过 `filter` 参数控制是否过滤成人内容：

**默认行为（启用过滤）：**
```
https://your-domain.com/api/tvbox?token=xxx
```
- 自动过滤标记为 `is_adult=true` 的视频源
- 保护用户不会看到成人内容源

**显式关闭过滤（仅管理员）：**
```
https://your-domain.com/api/tvbox?token=xxx&filter=off
```
- 需要显式传递 `filter=off` 参数
- 适用于管理员调试或特殊需求

**权限判断逻辑：**
- 优先级：用户配置 > 用户组配置 > 全局配置
- `filter` 参数和用户权限必须同时满足才显示成人源

### 第二层：CMS 代理接口拦截

即使客户端绕过第一层防御，第二层依然会拦截成人源的 API 请求。

**工作原理：**
1. 客户端通过 `/api/proxy/cms` 请求外部 CMS API
2. 代理检测请求 URL 是否属于成人源（通过 origin 匹配）
3. 如果是成人源且未传 `filter=off`，返回空数据：
   ```json
   {
     "code": 200,
     "list": [],
     "total": 0
   }
   ```
4. 静默拦截，避免客户端报错

**配置要求：**
- 在管理后台的"视频源管理"中，将成人源标记为 `is_adult: true`
- 系统会自动识别并拦截这些源的 API 请求

### 配置示例

**标记成人源：**
```typescript
// 在视频源配置中
{
  "key": "adult_source",
  "name": "成人视频源",
  "api": "http://adult-api.com/api.php",
  "is_adult": true  // ← 关键标记
}
```

**用户权限配置：**
```typescript
// 方式1：用户级别（优先级最高）
{
  "username": "user1",
  "showAdultContent": false  // 禁止该用户访问
}

// 方式2：用户组级别
{
  "tagName": "vip",
  "showAdultContent": true   // VIP 用户允许访问
}

// 方式3：全局级别（默认）
{
  "ShowAdultContent": false  // 全局默认禁止
}
```

### 防御流程图

```
客户端请求 TVBox 配置
        ↓
第一层：检查 filter 参数和用户权限
        ↓ (启用过滤)
过滤掉 is_adult=true 的源
        ↓
客户端获得干净的配置
        ↓
客户端请求某个源的 API
        ↓
第二层：CMS 代理检查源是否为成人源
        ↓ (是成人源且无 filter=off)
返回空数据，阻止内容加载
```

### 日志监控

系统会输出详细的过滤日志：

```bash
# 第一层过滤
[TVBox] 🛡️ 成人内容过滤已启用（filter=default, showAdultContent=false），剩余源数量: 15

# 第二层拦截
[CMS Proxy] 🛡️ Blocked adult source: http://adult-api.com
```

## 🌐 CMS 代理接口

LunaTV 提供 CMS 代理接口来解决以下问题：
- HTTPS 页面无法请求 HTTP 采集源（Mixed Content）
- 第三方 API 的 CORS 跨域限制
- 老旧 CMS 接口的兼容性问题

### 接口地址

```
/api/proxy/cms?url=<目标URL>
```

### 安全白名单

只允许代理以下合法的 CMS API 请求：
- `?ac=class` - 获取分类
- `?ac=list` - 获取列表
- `?ac=videolist` - 获取视频列表
- `?ac=detail` - 获取详情
- `/api/vod` - API 路由
- `/index.php` - PHP 入口
- `/provide/vod` - 提供接口

### 使用示例

```typescript
// 原始请求（可能被 CORS 阻止）
const apiUrl = 'http://example.com/api.php?ac=list';

// 通过代理请求
const proxiedUrl = `/api/proxy/cms?url=${encodeURIComponent(apiUrl)}`;
const response = await fetch(proxiedUrl);
```

### 高级特性

**1. 成人内容拦截**
```
/api/proxy/cms?url=http://adult-api.com/api.php?ac=list
```
- 自动检测成人源并返回空数据
- 配合 `filter=off` 参数可关闭拦截

**2. 完整浏览器头伪装**
- User-Agent、Accept、Referer 等完整模拟
- 提高老旧 CMS 接口兼容性

**3. 超时和重试**
- 20 秒超时控制
- 详细的错误类型分类（DNS、连接、SSL 等）

**4. 响应优化**
- 自动清理 BOM 和空白符
- 支持 JSON 和非 JSON 响应
- 5 分钟缓存减少重复请求

### 错误处理

| 错误类型 | 说明 | 状态码 |
|---------|------|--------|
| `Missing required parameter: url` | 缺少 url 参数 | 400 |
| `Invalid URL format` | URL 格式错误 | 400 |
| `URL not in whitelist` | URL 不在白名单中 | 403 |
| `TIMEOUT` | 请求超时（20秒） | 502 |
| `DNS_ERROR` | DNS 解析失败 | 502 |
| `CONNECTION_REFUSED` | 连接被拒绝 | 502 |
| `SSL_ERROR` | SSL/TLS 证书错误 | 502 |

### 配置建议

**公网部署：**
- 白名单机制已内置，无需额外配置
- 建议配合 Token 验证使用
- 监控代理日志防止滥用

**内网使用：**
- 可直接使用，无安全风险
- 主要用于解决 Mixed Content 问题

---

## 🙏 致谢

本文档中的 **CMS 代理接口** 和 **纵深防御策略** 参考了 [DecoTV](https://github.com/Decohererk/DecoTV) 项目的优秀实现，特此感谢！