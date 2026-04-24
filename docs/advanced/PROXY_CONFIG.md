# 🚀 Cloudflare Worker 代理加速配置指南

LunaTV 提供两个独立的 Cloudflare Worker 代理配置，分别用于 TVBox 和网页播放加速。

## 📋 目录

- [功能概述](#-功能概述)
- [配置方法](#️-配置方法)
- [工作原理](#-工作原理)
- [自定义部署](#-自定义部署)
- [常见问题](#-常见问题)

---

## 🎯 功能概述

### 两个独立的代理配置

LunaTV 提供两个**完全独立**的代理开关，互不影响：

| 配置类型 | 位置 | 影响范围 | 用途 |
|---------|------|---------|------|
| **TVBox 代理** | TVBox 安全配置 | 仅 TVBox 配置接口 | 为 TVBox 应用提供加速 |
| **视频源代理** | 视频源配置 | 仅网页播放 | 为 LunaTV 网页播放提供加速 |

**为什么要分开？**
- 🎯 **灵活控制**：可以只为 TVBox 启用代理，网页播放不使用
- 🔧 **独立调试**：出问题时可以分别排查
- 📊 **流量管理**：分别控制不同场景的流量

---

## ⚙️ 配置方法

### 1. TVBox 代理配置

**适用场景**：加速 TVBox 应用的视频源访问

**配置步骤**：

1. 登录 LunaTV 管理后台
2. 进入 **TVBox 安全配置** 页面
3. 找到 **Cloudflare Worker 代理（TVBox专用）** 区域
4. 开启代理开关
5. 配置 Worker 地址（默认：`https://corsapi.smone.workers.dev`）
6. 点击 **保存配置**

**效果**：
- TVBox 订阅链接 (`/api/tvbox`) 中的所有源自动使用代理
- 示例：`https://lovedan.net/api.php/provide/vod`
  → `https://corsapi.smone.workers.dev/p/lovedan?url=https://lovedan.net/api.php/provide/vod`

---

### 2. 视频源代理配置

**适用场景**：加速 LunaTV 网页播放的视频源访问

**配置步骤**：

1. 登录 LunaTV 管理后台
2. 进入 **视频源配置** 页面
3. 找到页面顶部的 **Cloudflare Worker 代理加速** 区域
4. 开启代理开关
5. 配置 Worker 地址（默认：`https://corsapi.smone.workers.dev`）
6. 点击 **保存代理配置**

**效果**：
- 网页播放时，所有通过 `/api/proxy/cms` 的请求自动使用 Worker 代理
- 提升搜索、详情、播放等功能的访问速度

---

## 🔧 工作原理

### 智能代理处理流程

```
原始源地址
  ↓
检测是否已有代理（?url= 参数）
  ↓
如果有 → 提取真实地址
  ↓
生成唯一路径 /p/{sourceId}
  ↓
构建 Worker 代理 URL
  ↓
转发所有 API 参数（ac, ids, pg 等）
  ↓
Worker 请求真实源站
  ↓
返回数据
```

### 示例转换

**场景 1：普通源**
```
原始：https://lovedan.net/api.php/provide/vod
代理：https://corsapi.smone.workers.dev/p/lovedan?url=https://lovedan.net/api.php/provide/vod
```

**场景 2：已有旧代理的源**
```
原始：https://old-proxy.com/?url=https://lovedan.net/api.php/provide/vod
提取：https://lovedan.net/api.php/provide/vod
新代理：https://corsapi.smone.workers.dev/p/lovedan?url=https://lovedan.net/api.php/provide/vod
```

**场景 3：带参数的 API 调用**
```
TVBox 调用：/p/lovedan?url=https://lovedan.net/api.php/provide/vod&ac=list&pg=1
Worker 转发：https://lovedan.net/api.php/provide/vod?ac=list&pg=1
```

### 核心特性

- ✅ **自动去重**：检测并替换源中已有的旧代理
- ✅ **唯一路径**：每个源生成独立的 `/p/{sourceId}` 路径，避免冲突
- ✅ **参数转发**：完整转发 TVBox 和网页的所有 API 参数
- ✅ **降级机制**：Worker 失败时自动使用本地代理
- ✅ **缓存优化**：5 分钟响应缓存，减少重复请求

---

## 🚀 自定义部署

如果想部署自己的 Cloudflare Worker 服务：

### 1. 准备工作

- Cloudflare 账号
- GitHub 账号（用于 fork 项目）

### 2. 部署步骤

**选项 A：使用默认配置（推荐）**

项目地址：[CORSAPI](https://github.com/SzeMeng76/CORSAPI)

1. Fork 项目到你的 GitHub
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
3. 进入 **Workers & Pages**
4. 点击 **Create Application** → **Create Worker**
5. 粘贴 `_worker.js` 代码
6. 点击 **Deploy**
7. 复制你的 Worker 地址（如 `https://your-worker.workers.dev`）

**选项 B：绑定自定义域名（可选）**

1. 在 Worker 设置中点击 **Triggers**
2. 点击 **Add Custom Domain**
3. 输入你的域名（如 `proxy.example.com`）
4. 等待 DNS 验证完成

### 3. 配置到 LunaTV

1. 进入对应的配置页面（TVBox 或视频源）
2. 开启代理开关
3. 将 Worker 地址填入 **Cloudflare Worker 地址** 输入框
4. 保存配置

---

## ❓ 常见问题

### Q1: 两个代理配置有什么区别？

**A:**
- **TVBox 代理**：只影响 TVBox 订阅接口，修改 TVBox 配置文件中的源地址
- **视频源代理**：只影响网页播放，加速浏览器访问视频源的速度
- 两者完全独立，互不影响

### Q2: 必须两个都启用吗？

**A:** 不是！可以根据需求选择：
- 只用 TVBox → 只启用 TVBox 代理
- 只用网页播放 → 只启用视频源代理
- 两者都用 → 两个都启用

### Q3: 为什么我的源已经有代理了？

**A:** LunaTV 会自动检测并替换旧代理：
- 系统检测源地址中的 `?url=` 参数
- 自动提取真实 API 地址
- 替换为你配置的新代理
- 这样可以统一管理所有源的代理

### Q4: Worker 代理失败会怎样？

**A:** 有自动降级机制：
- **视频源代理**：失败时自动使用 LunaTV 服务器本地代理
- **TVBox 代理**：TVBox 直接访问真实源站
- 不会影响正常使用

### Q5: 默认代理地址 `corsapi.smone.workers.dev` 可以一直用吗？

**A:** 可以，但建议自己部署：
- 默认地址是公共服务，可能有流量限制
- 自己部署可以完全控制，更稳定
- Cloudflare Worker 免费版每天 10 万次请求，个人使用足够

### Q6: 代理会影响速度吗？

**A:** 正常情况下会**加快**速度：
- Cloudflare 有全球 CDN 节点
- 自动选择最近的节点访问源站
- 但如果源站本身就很快，可能不明显

### Q7: 如何测试代理是否生效？

**TVBox 代理**：
1. 启用代理后保存配置
2. 访问 TVBox 诊断端点：`/api/tvbox/diagnose?token=YOUR_TOKEN`
3. 查看返回的源地址是否包含代理 URL

**视频源代理**：
1. 启用代理后保存配置
2. 打开浏览器开发者工具（F12）→ Network 标签
3. 播放视频或搜索内容
4. 查看请求是否经过 Worker（URL 中包含 `/p/{sourceId}`）

### Q8: Worker 超时时间是多少？

**A:**
- 默认超时：20 秒
- 如需修改，需要在 Worker 代码中调整 `setTimeout()` 参数

### Q9: 支持哪些 CMS API 格式？

**A:** 支持所有主流 MacCMS API：
- `?ac=list` - 获取列表
- `?ac=detail` - 获取详情
- `?ac=class` - 获取分类
- `?ac=videolist` - 获取视频列表
- 所有参数自动转发

### Q10: 代理配置保存后需要重启服务吗？

**A:** 不需要！
- 配置保存后立即生效
- 配置缓存会自动清除
- 下一次请求就会使用新配置

---

## 📊 配置对比表

| 特性 | TVBox 代理 | 视频源代理 |
|------|-----------|-----------|
| **配置位置** | TVBox 安全配置 | 视频源配置 |
| **影响接口** | `/api/tvbox` | `/api/proxy/cms` |
| **使用场景** | TVBox 应用订阅 | LunaTV 网页播放 |
| **代理方式** | 修改配置文件中的源地址 | 拦截 CMS 请求并代理 |
| **失败降级** | 返回原始源地址 | 使用本地代理 |
| **参数转发** | ✅ 支持 | ✅ 支持 |
| **自动去重** | ✅ 支持 | ✅ 支持 |
| **唯一路径** | ✅ `/p/{sourceId}` | ✅ `/p/{sourceId}` |

---

## 🔒 安全说明

### 白名单机制

视频源代理使用白名单保护：
- 只允许代理符合 CMS API 模式的 URL
- 防止被滥用为通用代理
- 支持的模式：`?ac=`, `/api/vod`, `/provide/vod` 等

### 隐私保护

- 代理请求不记录日志（Worker 层面）
- 不缓存敏感信息
- 支持自定义部署，完全掌控数据

---

## 📝 更新日志

### v1.0 - 2025-01-04

- ✨ 新增 TVBox 代理配置
- ✨ 新增视频源代理配置
- ✨ 支持自动检测和替换旧代理
- ✨ 支持为每个源生成唯一路径
- ✨ 支持完整参数转发
- ✨ 支持降级机制
- 📝 编写完整配置文档

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 改进此功能！

项目地址：
- [LunaTV](https://github.com/SzeMeng76/LunaTV)
- [CORSAPI](https://github.com/SzeMeng76/CORSAPI)

---

## 📄 许可证

本功能遵循项目主许可证，仅供学习和个人使用。

---

⭐ **如果这个功能对你有帮助，请给个 Star 支持一下！**
