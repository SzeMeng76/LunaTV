# 🚀 Cloudflare Worker 代理加速配置指南

LunaTV 提供多个独立的 Cloudflare Worker 代理配置，分别用于 TVBox 订阅、网页播放（含 m3u8/视频流）、Bangumi 数据/图片、TMDB 数据/图片的加速。

## 📋 目录

- [功能概述](#-功能概述)
- [配置方法](#️-配置方法)
- [工作原理](#-工作原理)
- [自定义部署](#-自定义部署)
- [常见问题](#-常见问题)

---

## 🎯 功能概述

### 多个独立的代理配置

LunaTV 提供多个**完全独立**的代理开关，互不影响：

| 配置类型         | 位置                | 影响范围                                | 用途                                                      |
| ---------------- | ------------------- | --------------------------------------- | --------------------------------------------------------- |
| **TVBox 代理**   | TVBox 安全配置      | 仅 TVBox 配置接口                       | 为 TVBox 应用提供加速                                     |
| **视频源代理**   | 视频源配置          | 网页播放元数据 + m3u8/视频播放流        | 为 LunaTV 网页播放提供加速（Emby 源跳过，需自定义鉴权头） |
| **Bangumi 代理** | 用户设置/管理员面板 | Bangumi 数据与封面图片                  | 复用视频源代理地址，作为 CMLiussss 反代之外的备选         |
| **TMDB 代理**    | 复用视频源代理开关  | TMDB API 与图片（poster/backdrop/logo） | 启用视频源代理时自动生效，未启用则直连                    |

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

**适用场景**：加速 LunaTV 网页播放的视频源访问（元数据 + 播放流）

**配置步骤**：

1. 登录 LunaTV 管理后台
2. 进入 **视频源配置** 页面
3. 找到页面顶部的 **Cloudflare Worker 代理加速** 区域
4. 开启代理开关
5. 配置 Worker 地址（默认：`https://corsapi.smone.workers.dev`）
6. 点击 **保存代理配置**

**效果**：

- 采集源元数据：所有通过 `/api/proxy/cms` 的请求自动使用 Worker 代理，提升搜索、详情等功能的访问速度
- 播放流加速：普通源和短剧源的 m3u8/视频播放流同样会走 Worker 代理（m3u8 走 `/m3u8` 端点并自动重写 `.ts` 子链接，其他格式走通用 `/?url=` 端点）
- **Emby 源会自动跳过**：因为需要携带自定义 `X-Emby-Authorization` 请求头，Worker 无法转发，且 Emby 通常为自建服务器，直连一般更快
- 播放流失败时自动降级为原始地址直连重试一次，不会因为 Worker 故障导致播放中断

---

### 3. Bangumi 代理配置

**适用场景**：加速 Bangumi 动漫数据和封面图片的访问（`api.bgm.tv` / `lain.bgm.tv` 在部分地区可能被墙）

**配置步骤**：

1. 登录 LunaTV，进入 **用户设置** 或管理员的 **系统设置** 面板
2. 找到 **Bangumi 数据源** / **Bangumi 图片代理** 配置项
3. 选择代理方式：
   - `server`：服务器直连
   - `cmliussss`：CMLiussss 反代/CDN（国内优先推荐）
   - `worker`：复用视频源代理配置的 Cloudflare Worker 地址（需先在视频源配置中启用并保存代理地址）
4. 保存配置

**效果**：

- Bangumi 番剧信息、日历、封面图等请求按所选方式转发
- `worker` 选项作为 CMLiussss 之外的备选，命中 Cloudflare 边缘缓存后响应更快

---

### 4. TMDB 代理配置

**适用场景**：加速 TMDB 剧集详情、评分、poster/backdrop/logo 图片的访问

**配置步骤**：

TMDB 代理**复用视频源代理开关**，不需要单独配置：

1. 按照上方 **视频源代理配置** 步骤开启并保存 Worker 地址
2. 开启后，TMDB API 调用和图片地址会自动统一走 Worker 转发
3. 未开启视频源代理时，TMDB 请求保持直连，不受影响

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

### VOD 播放流三级 fallback

播放流（m3u8/分片）走的是独立于上面 CMS 元数据代理的另一条链路，失败时按顺序降级，不会因单点故障中断播放：

```
① 直连源站
  ↓ 失败
② Worker 代理直连（/m3u8、/?url= 端点）
  ↓ 失败
③ 第一方 HLS 代理（LunaTV 服务器本地代理）
```

- hls.js 的致命 `NETWORK_ERROR` 和 ArtPlayer 的 `error` 事件都接入了这个降级链
- Emby 源因鉴权头限制不参与该链路，始终直连

### 核心特性

- ✅ **自动去重**：检测并替换源中已有的旧代理
- ✅ **唯一路径**：每个源生成独立的 `/p/{sourceId}` 路径，避免冲突
- ✅ **参数转发**：完整转发 TVBox 和网页的所有 API 参数
- ✅ **降级机制**：CMS 元数据代理失败时自动使用本地代理；播放流则走上述三级 fallback
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

### Q1: 多个代理配置有什么区别？

**A:**

- **TVBox 代理**：只影响 TVBox 订阅接口，修改 TVBox 配置文件中的源地址
- **视频源代理**：影响网页播放的采集源元数据（搜索/详情）+ m3u8/视频播放流；Emby 源自动跳过
- **Bangumi 代理**：用户可在设置中选择 server/cmliussss/worker 三种方式，影响番剧数据与封面图片
- **TMDB 代理**：复用视频源代理开关，启用后自动加速 TMDB API 与图片
- 各配置完全独立，互不影响

### Q2: 必须全部启用吗？

**A:** 不是！可以根据需求选择：

- 只用 TVBox → 只启用 TVBox 代理
- 只用网页播放 → 只启用视频源代理
- Bangumi 被墙 → 在用户设置中选择 `worker` 或 `cmliussss`
- TMDB 慢 → 启用视频源代理后 TMDB 自动加速
- 灵活组合，按需启用

### Q3: 为什么我的源已经有代理了？

**A:** LunaTV 会自动检测并替换旧代理：

- 系统检测源地址中的 `?url=` 参数
- 自动提取真实 API 地址
- 替换为你配置的新代理
- 这样可以统一管理所有源的代理

### Q4: Worker 代理失败会怎样？

**A:** 有自动降级机制：

- **CMS 元数据代理**：失败时自动使用 LunaTV 服务器本地代理
- **播放流代理**：走三级 fallback（直连 → Worker → 本地代理），不会因单点故障中断播放
- **TVBox 代理**：TVBox 直接访问真实源站
- **Bangumi/TMDB**：按配置选项处理，worker 失败时保持直连或使用其他备选方式
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

**视频源代理（CMS 元数据）**：

1. 启用代理后保存配置
2. 打开浏览器开发者工具（F12）→ Network 标签
3. 搜索内容或打开详情页
4. 查看 `/api/proxy/cms` 请求是否经过 Worker（URL 中包含 `/p/{sourceId}`）

**视频源代理（播放流）**：

1. 启用代理后保存配置
2. 打开浏览器开发者工具（F12）→ Network 标签
3. 播放视频
4. 查看 m3u8 请求是否走 `/m3u8` 端点、.ts 分片请求是否被重写；其他格式查看是否走 `/?url=` 端点
5. Emby 源应该看到直连请求（不经过 Worker）

**Bangumi/TMDB 代理**：

1. 打开浏览器开发者工具（F12）→ Network 标签
2. 访问番剧日历或剧集详情页
3. 查看 `/api/proxy/bangumi` 或 `/api/tmdb/*` 请求的响应头，判断是否经过 Worker 转发

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

| 特性         | TVBox 代理             | 视频源代理                                                            | Bangumi 代理                                      | TMDB 代理              |
| ------------ | ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------- | ---------------------- |
| **配置位置** | TVBox 安全配置         | 视频源配置                                                            | 用户设置/管理员面板                               | 复用视频源代理开关     |
| **影响接口** | `/api/tvbox`           | `/api/proxy/cms` + m3u8/视频流                                        | `/api/proxy/bangumi` + 图片                       | `/api/tmdb/*` + 图片   |
| **使用场景** | TVBox 应用订阅         | LunaTV 网页播放（元数据+播放流）                                      | Bangumi 番剧信息与封面                            | TMDB 剧集详情与图片    |
| **代理方式** | 修改配置文件中的源地址 | 拦截 CMS 请求并代理；m3u8 走 `/m3u8` 端点，其他格式走 `/?url=`        | 选择 `worker` 时走通用 `/?url=` 端点              | 统一走 `/?url=` 端点   |
| **失败降级** | 返回原始源地址         | CMS 元数据失败→本地代理；播放流失败→直连→Worker→本地代理三级 fallback | 可选 server/cmliussss/worker 三种方式，无自动降级 | Worker 失败保持直连    |
| **参数转发** | ✅ 支持                | ✅ 支持                                                               | ✅ 支持                                           | ✅ 支持                |
| **自动去重** | ✅ 支持                | ✅ 支持                                                               | N/A                                               | N/A                    |
| **唯一路径** | ✅ `/p/{sourceId}`     | ✅ `/p/{sourceId}`                                                    | N/A                                               | N/A                    |
| **特殊说明** | -                      | Emby 源自动跳过代理                                                   | 作为 CMLiussss 之外的备选                         | 自动跟随视频源代理开关 |

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

### v1.1 - 2026-08-23

- ✨ **视频源代理扩展**：现在同时加速 m3u8/视频播放流（m3u8 走 `/m3u8` 端点并自动重写 `.ts` 子链接，其他格式走通用 `/?url=` 端点）
- ✨ **三级 fallback**：播放流失败时自动降级为 直连 → Worker 直连 → 第一方代理，避免单点故障中断播放
- ✨ **Emby 源智能跳过**：因需携带自定义 `X-Emby-Authorization` 鉴权头，Emby 源自动跳过 Worker 代理，直连更快
- ✨ **Bangumi 代理选项**：新增 Cloudflare Worker (CORSAPI) 作为 Bangumi 数据/图片代理选项，作为 CMLiussss 反代之外的备选
- ✨ **TMDB 代理加速**：TMDB API 与图片（poster/backdrop/logo）复用视频源代理开关，启用后自动走 Worker 转发
- 📝 更新配置文档，补充播放流加速、Bangumi/TMDB 代理配置说明

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
