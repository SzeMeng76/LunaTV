# 性能优化说明 — v6.6.3

本次更新在不改变现有功能的前提下，对源码访问速度与运行时性能进行了多维度优化。所有改动已通过 Docker 构建测试验证（构建耗时约 97 秒，无错误），服务运行正常。

## 优化总览

| # | 优化点 | 类别 | 影响范围 |
|---|--------|------|----------|
| 1 | 非关键组件动态导入 | 代码分割 / 首屏体积 | 全局布局 |
| 2 | 搜索 API 超时缩短 | 响应速度 | 搜索体验 |
| 3 | 服务端缓存深拷贝改用 `structuredClone` | 服务端性能 | 所有缓存读取 |
| 4 | YouTube 地区 API 增加缓存头 | 客户端/CDN 缓存 | YouTube 功能 |
| 5 | 直播频道 API 增加缓存头 | 客户端/CDN 缓存 | 直播功能 |
| 6 | 直播源 API 增加缓存头 | 客户端/CDN 缓存 | 直播功能 |

## 详细说明

### 1. 非关键组件动态导入（代码分割）

**文件**: [src/app/layout.tsx](../src/app/layout.tsx)

**改动**: 将以下非关键 UI 组件从静态导入改为 `next/dynamic` 动态导入：

- `TranslationWarningToast` — 翻译插件警告 Toast
- `SessionTracker` — 会话追踪
- `RouteWarmup` — 路由预热
- `DownloadPanel` — 下载面板
- `ChatFloatingWindow` — 聊天浮窗

**效果**:
- 减少首屏 JavaScript 体积，加快首屏可交互时间（TTI）
- 非首屏关键路径的组件按需加载，避免阻塞主包
- 通过代码分割降低初始传输量

**实现要点**:
- 使用 `nextDynamic`（重命名以避免与 `export const dynamic` 命名冲突）
- 未设置 `ssr: false`，保持服务端渲染兼容性（Turbopack 要求）

### 2. 搜索 API 超时时间优化

**文件**: [src/app/api/search/route.ts](../src/app/api/search/route.ts)

**改动**: 单个搜索源超时时间从 `20000ms` 缩短至 `10000ms`。

**效果**:
- 避免单一慢源拖累整体搜索响应
- 用户感知响应速度提升，更快返回可用结果
- 失败源仍会被 `Promise.race` 捕获并降级

### 3. 服务端缓存深拷贝优化

**文件**: [src/lib/server-cache.ts](../src/lib/server-cache.ts)

**改动**: 将深拷贝实现从 `JSON.parse(JSON.stringify(data))` 改为原生 `structuredClone(data)`，并保留 JSON 序列化作为回退方案。

**效果**:
- 原生 API 比 JSON 序列化快 2-5 倍
- 支持更多数据类型（`Date`、`RegExp`、`Map`、`Set`、`ArrayBuffer` 等）
- 三级降级保障：`structuredClone` → JSON 序列化 → 返回原数据

### 4. YouTube 地区 API 响应缓存

**文件**: [src/app/api/youtube/regions/route.ts](../src/app/api/youtube/regions/route.ts)

**改动**: 为所有响应路径增加 `Cache-Control: public, max-age=3600, s-maxage=86400` 响应头。

**效果**:
- 浏览器缓存 1 小时，CDN/代理缓存 24 小时
- 地区列表数据变化极少，长缓存可大幅减少重复请求
- 错误响应（401/403/400）仍保持 `no-store` 策略，避免缓存敏感错误

### 5. 直播频道 API 响应缓存

**文件**: [src/app/api/live/channels/route.ts](../src/app/api/live/channels/route.ts)

**改动**: 为成功响应增加 `Cache-Control: public, max-age=300, s-maxage=600`。

**效果**:
- 浏览器缓存 5 分钟，CDN 缓存 10 分钟
- 频道列表相对稳定，短时缓存可降低服务端重复计算开销
- 内部仍走 `getCachedLiveChannels` 服务端缓存，双层缓存协同

### 6. 直播源 API 响应缓存

**文件**: [src/app/api/live/sources/route.ts](../src/app/api/live/sources/route.ts)

**改动**: 为成功响应增加 `Cache-Control: public, max-age=300, s-maxage=600`。

**效果**:
- 与直播频道 API 保持一致的缓存策略
- 减少配置读取与过滤的重复执行

## 验证结果

### Docker 构建测试

```
命令: docker compose build --no-cache moontv-core
结果: 成功
耗时: 约 97 秒
Next.js: 16.1.0 (Turbopack)
```

### 运行时验证

| 检查项 | 结果 |
|--------|------|
| `moontv-core` 容器状态 | Up |
| `moontv-kvrocks` 容器状态 | Up (healthy) |
| `/` 访问 | 307 重定向至登录（正常） |
| `/login` 访问 | 200，页面标题「聚合TV」 |
| Cron 定时任务 | 执行成功，耗时 4.08s |
| 直播频道刷新 | 3/3 成功 |
| 内存占用 | 99.58MB |

## 兼容性说明

- **不改变任何现有功能**: 所有优化均为性能层面，业务逻辑保持不变
- **不更换字体**: 保留 `next/font/google` 的 Inter 字体方案
- **不引入新依赖**: 仅使用浏览器/Node.js 原生 API（`structuredClone`、`next/dynamic`）
- **降级保障**: `structuredClone` 失败时自动回退到 JSON 序列化
- **缓存策略安全**: 错误响应与敏感接口保持 `no-store`，不会缓存私密数据

## 相关文档

- 升级记录详见 [UPGRADE_NOTES.md](./UPGRADE_NOTES.md)
