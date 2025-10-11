# 📺 TVBox 兼容功能使用指南

## 🎯 功能介绍

LunaTV 提供完整的 TVBox 配置接口，将您的视频源无缝导入到 TVBox 应用中。支持多种配置模式、智能 spider jar 管理、安全访问控制等高级功能。

## 🚀 快速开始

### 1. 访问配置页面

在 LunaTV 网站中，点击左侧导航栏的"TVBox 配置"菜单，或直接访问：

```
https://your-domain.com/tvbox
```

### 2. 选择配置模式

LunaTV 提供 4 种配置模式，适应不同使用场景：

#### 📊 **标准模式**（推荐）
```
https://your-domain.com/api/tvbox?format=json
```
- 包含完整配置（IJK 优化、广告过滤、DoH DNS）
- 支持硬解码和软解码配置
- 适合大多数用户使用

#### 🔒 **精简模式**
```
https://your-domain.com/api/tvbox?format=json&mode=safe
```
- 仅包含核心配置字段
- 提高 TVBox 兼容性
- 遇到兼容性问题时使用

#### ⚡ **快速模式**（新增）
```
https://your-domain.com/api/tvbox?format=json&mode=fast
```
- **优化源切换速度**，减少卡顿
- 移除 timeout/retry 配置避免等待
- 解决 SSL handshake 错误
- **适合频繁切换源的用户**

#### 🎬 **影视仓模式**
```
https://your-domain.com/api/tvbox?format=json&mode=yingshicang
```
- 专为影视仓优化
- 包含播放规则和兼容性修复
- 支持量子、非凡等资源站

### 3. 选择返回格式

支持两种格式：

**JSON 格式（推荐）：**
```
?format=json
```
- 标准 JSON 配置，便于调试
- TVBox 主流分支支持
- 适合大多数场景

**Base64 格式：**
```
?format=base64
```
- Base64 编码的配置
- 适合某些特殊环境
- 部分 TVBox 分支需要

### 4. 导入到 TVBox

1. 复制配置链接
2. 打开 TVBox 应用
3. 进入设置 → 配置地址
4. 粘贴链接并确认导入

## 🔐 安全配置

### Token 认证

LunaTV 支持两种 Token 认证模式：**全局 Token** 和 **用户专属 Token**。

#### 全局 Token（传统模式）

管理员在 TVBox 安全配置中设置统一的 token，所有用户共享：

```
https://your-domain.com/api/tvbox?format=json&token=GLOBAL_TOKEN
```

#### 用户专属 Token（推荐）

**新功能**：管理员可以为每个用户生成独立的 TVBox token，并配置该用户可访问的视频源。

**优势：**
- 🎯 **细粒度权限控制**：不同用户可访问不同的视频源
- 🔒 **安全性更高**：每个用户拥有独立 token，泄露影响范围更小
- 📊 **使用追踪**：通过 token 可以识别访问来源
- 🔄 **灵活管理**：可随时为单个用户重新生成 token 或调整源权限

**配置步骤：**
1. 管理员登录后台，进入 **用户管理** 页面
2. 找到目标用户，点击 **TVBox Token** 管理按钮
3. 点击 **生成 Token** 为用户创建专属 token
4. 选择该用户可以访问的视频源（留空表示可访问所有源）
5. 保存配置

**用户使用：**
```
https://your-domain.com/api/tvbox?format=json&token=USER_SPECIFIC_TOKEN
```

**降级机制：**
- 如果用户有专属 token，则使用用户配置的源权限
- 如果用户没有专属 token，则回退使用全局 token（访问所有源）

### IP 白名单

限制特定 IP 访问，支持 CIDR 格式：

```
192.168.1.0/24
10.0.0.1
```

### 访问频率限制

防止滥用，默认每分钟 60 次请求。

## 🎛️ 高级功能

### 🔄 Spider Jar 智能管理

LunaTV 自动管理 spider jar 文件，确保最佳可用性：

**工作原理：**
1. 后端自动探测多个 jar 源（gitcode、gitee、GitHub 等）
2. 成功时返回远程公网 URL（减轻服务器负载）
3. 失败时随机选择备用公网地址（避免单点失败）
4. 6 小时缓存，真实 MD5 验证

**优势：**
- ✅ 自动选择最快的 jar 源
- ✅ SSL 错误自动降级
- ✅ 100% 避免 404 错误
- ✅ 零服务器带宽消耗（直连 CDN）

**诊断信息：**
配置中包含 `spider_*` 字段供调试：
```json
{
  "spider_url": "实际下载的源地址",
  "spider_md5": "真实的 MD5 hash",
  "spider_cached": true,
  "spider_real_size": 283672,
  "spider_tried": 1,
  "spider_success": true,
  "spider_backup": "备用地址",
  "spider_candidates": ["候选列表"]
}
```

### 📋 配置模式对比

| 功能 | 标准模式 | 精简模式 | 快速模式 | 影视仓模式 |
|------|---------|---------|---------|-----------|
| **IJK 配置** | ✅ 完整 | ❌ 无 | ❌ 无 | ✅ 完整 |
| **DoH DNS** | ✅ 有 | ❌ 无 | ❌ 无 | ❌ 无 |
| **广告过滤** | ✅ 有 | ❌ 无 | ❌ 无 | ✅ 有 |
| **超时配置** | ✅ 10s/15s | ❌ 无 | ❌ **移除** | ❌ 无 |
| **重试配置** | ✅ 1-2次 | ❌ 无 | ❌ **移除** | ❌ 无 |
| **播放规则** | ❌ 无 | ❌ 无 | ❌ 无 | ✅ 完整 |
| **首页内容** | 默认 | 默认 | **15条** | 20条 |
| **解析接口** | 4个 | 1个 | 2个（极速） | 4个 |
| **适用场景** | 日常使用 | 兼容性问题 | **频繁切换源** | 影视仓专用 |

### 🎯 Sites 配置优化

根据 API 类型自动配置最佳参数：

**MacCMS 源（type 0/1）：**
```json
{
  "timeout": 10000,
  "retry": 2,
  "header": {
    "User-Agent": "Mozilla/5.0 (Linux; Android 11; SM-G973F)...",
    "Accept": "application/json, text/plain, */*",
    "Connection": "close",
    "Cache-Control": "no-cache"
  }
}
```

**CSP 源（type 3）：**
```json
{
  "timeout": 15000,
  "retry": 1,
  "header": {
    "User-Agent": "okhttp/3.15",
    "Accept": "*/*",
    "Connection": "close"
  }
}
```

### 🌐 DoH (DNS over HTTPS)

解决 DNS 污染问题，标准模式包含：

```json
{
  "doh": [
    {
      "name": "阿里DNS",
      "url": "https://dns.alidns.com/dns-query",
      "ips": ["223.5.5.5", "223.6.6.6"]
    },
    {
      "name": "腾讯DNS",
      "url": "https://doh.pub/dns-query",
      "ips": ["119.29.29.29", "119.28.28.28"]
    },
    {
      "name": "Google DNS",
      "url": "https://dns.google/dns-query",
      "ips": ["8.8.8.8", "8.8.4.4"]
    }
  ]
}
```

### 🎬 IJK 播放器配置

支持硬解码和软解码两种模式：

**硬解码（推荐）：**
- `mediacodec: 1` - 启用硬件加速
- `mediacodec-auto-rotate: 1` - 自动旋转
- `mediacodec-handle-resolution-change: 1` - 处理分辨率变化

**软解码：**
- `mediacodec: 0` - 禁用硬件加速
- 适合兼容性问题场景

## 📝 API 参数详解

### 完整 URL 示例

```bash
# 标准模式 + JSON 格式
https://your-domain.com/api/tvbox?format=json

# 快速模式 + Base64 格式 + Token
https://your-domain.com/api/tvbox?format=base64&mode=fast&token=YOUR_TOKEN

# 影视仓模式 + 强制刷新 spider
https://your-domain.com/api/tvbox?format=json&mode=yingshicang&forceSpiderRefresh=1
```

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|-------|------|
| `format` | string | `json` | 返回格式：`json` 或 `base64` |
| `mode` | string | `standard` | 配置模式：`standard`/`safe`/`fast`/`yingshicang` |
| `token` | string | - | 访问 token（启用认证时必需） |
| `forceSpiderRefresh` | string | `0` | 强制刷新 spider 缓存：`1` 启用 |

## 🔄 配置更新机制

### 实时同步

- ✅ 源站变更即时生效
- ✅ 无缓存延迟（Cache-Control: no-store）
- ✅ Spider jar 6 小时缓存
- ✅ 分类信息动态获取

### 手动刷新

在 TVBox 中：设置 → 配置地址 → 刷新

强制刷新 spider jar：
```
?forceSpiderRefresh=1
```

## 🛠️ 故障排除

### ⚡ 快速模式相关

**问题：源切换仍然卡顿**
- 确认使用了 `?mode=fast` 参数
- 检查网络连接稳定性
- 尝试重新导入配置

**问题：SSL handshake 错误**
- 快速模式已优化请求头（Connection: close）
- Spider jar 使用国内稳定源优先
- 15 秒超时避免 SSL 问题

### 🔐 安全相关

**问题：401 Unauthorized**
- 检查 token 是否正确
- 确认 token 已包含在 URL 中
- 联系管理员获取有效 token

**问题：403 Forbidden**
- IP 不在白名单中
- 联系管理员添加 IP 到白名单
- 支持 CIDR 格式（如 192.168.1.0/24）

**问题：429 Too Many Requests**
- 访问频率超限
- 等待 1 分钟后重试
- 降低刷新频率

### 🕷️ Spider Jar 相关

**问题：Spider 不可用**
- 系统会自动切换备用地址
- 检查 `spider_success` 字段
- 使用 `?forceSpiderRefresh=1` 强制刷新

**问题：诊断显示 "降级（使用 fallback jar）"**
- 所有远程源暂时不可用
- 系统已提供最小有效 jar 保底
- 稍后自动恢复正常

### 📺 TVBox 相关

**问题：配置导入失败**
- 检查网络连接
- 尝试不同 format（json/base64）
- 确认 LunaTV 服务器可访问

**问题：源站不显示**
- 检查源站是否被禁用
- 确认 API 地址格式正确
- 刷新 TVBox 配置

**问题：视频无法播放**
- 检查原始源站可用性
- 尝试其他解析接口
- 使用快速模式减少超时

## 📊 诊断工具

### 配置体检端点

```bash
GET /api/tvbox/diagnose?token=YOUR_TOKEN
```

**返回信息：**
```json
{
  "ok": true,
  "status": 200,
  "sitesCount": 10,
  "livesCount": 1,
  "parsesCount": 4,
  "spider": "https://gitcode.net/.../XC.jar;md5;xxx",
  "spiderReachable": true,
  "spiderSizeKB": 277,
  "spider_url": "实际源地址",
  "spider_md5": "真实 MD5",
  "spider_cached": true,
  "spider_tried": 1,
  "spider_success": true,
  "issues": []
}
```

### Health Check

```bash
GET /api/tvbox/health?url=JAR_URL
```

检查 spider jar 可访问性。

## 🎯 最佳实践

### 模式选择建议

1. **日常观看** → 标准模式
2. **TVBox 报错** → 精简模式
3. **频繁换源** → ⚡ 快速模式
4. **使用影视仓** → 影视仓模式

### 性能优化

- ✅ 使用快速模式提升切换体验
- ✅ 启用 DoH 解决 DNS 问题
- ✅ 硬解码优先（硬件性能允许）
- ✅ 定期刷新配置获取最新源

### 安全建议

- ✅ 启用 Token 认证
- ✅ 配置 IP 白名单
- ✅ 使用 HTTPS 协议
- ✅ 不要分享包含 token 的链接

## 🔗 相关链接

- [安全配置详解](./TVBOX_SECURITY.md)
- [LunaTV 主项目](https://github.com/SzeMeng76/LunaTV)
- [TVBox 开源版本](https://github.com/o0HalfLife0o/TVBoxOSC)

## 🙏 致谢

- Spider jar 管理优化参考 [DecoTV](https://github.com/Decohererk/DecoTV) 项目
- 配置功能设计参考 [KatelyaTV](https://github.com/katelya77/KatelyaTV) 项目
- 感谢开源社区的贡献

---

## 📄 许可证

本功能遵循项目主许可证，仅供学习和个人使用。请遵守相关法律法规，不要用于商业用途。

## 🆕 更新日志

### v2.0 - 2025-01-04

- ✨ 新增快速模式（mode=fast）优化源切换速度
- ✨ Spider jar 智能管理（6h 缓存 + 真实 MD5）
- ✨ 多备用 jar 随机选择避免单点失败
- ✨ Sites 超时和重试配置优化
- ✨ SSL 错误修复（移除 HEAD、增强请求头）
- 🔧 DoH DNS 支持
- 🔧 IJK 硬解码/软解码配置
- 🔐 安全访问控制（Token、IP 白名单、频率限制）

### v1.0 - 初始版本

- 基础 TVBox 配置生成
- JSON/Base64 格式支持
- 源站自动同步
