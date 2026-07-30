# 升级记录 — 同步上游 SzeMeng76/LunaTV

## 概述

本次升级将上游仓库 [SzeMeng76/LunaTV](https://github.com/SzeMeng76/LunaTV) 的多个 commit 同步应用到本地 fork，涵盖功能增强、Bug 修复、依赖升级和部署优化等方面。

## 应用的上游 Commit 列表

### 第一批（8 个 commit）

| Commit | 说明 |
|--------|------|
| `45117ce` | PanSou 认证支持：新增盘搜身份认证模块（`src/lib/pansou-auth.ts`），支持需要登录的私有搜索接口 |
| `7724011` | 视频分辨率推断与筛选：新建 `src/lib/video-quality.ts`，自动推断视频流分辨率并支持按分辨率筛选源 |
| `802d880` | 装饰逻辑下沉：将 `decorateSearchResultQuality` 移至 `downstream.ts` 解析层，统一在 searchWithCache 和 getDetailFromApi 中调用 |
| `70728e0` | Next.js 构建阶段环境标志：`next.config.js` 改用 `process.env` 直接设置 `IS_BUILD_PHASE` |
| `b74e15b` | TVBox/Video 代理配置：`config.ts` 新增 `TVBoxProxyConfig`、`VideoProxyConfig`，支持 `NEXT_PUBLIC_SUB_URL` 环境变量回退 |
| `56dda60` | 快进/快退图标方向修复：重构 `artplayer-plugin-seek-buttons.js`，使用共享 `generateSeekIcon`/`generateDualSeekIcon` |
| `f1a4e4d` | 合并 commit（含 70728e0 + b74e15b），已包含在上述提交中 |
| `ae3fc44` | 56dda60 的镜像提交，已包含 |

### 第二批（9 个 commit）

| Commit | 说明 |
|--------|------|
| `b5085d8` | Bangumi CN 区崩溃修复：HomeClient 添加 `Array.isArray` 守卫，`bangumi.client.ts` 添加 `response.ok` 检查，默认 API 类型改为 `cmliussss` |
| `345e418` | 补全 cmliussss 默认值：SettingsPanel useState 初始值、resetToDefaults、admin/page.tsx 默认值与配置回退统一为 `cmliussss` |
| `ee9b8eb` | @mui/material 升级至 9.1.2（本地已是 9.2.0，跳过） |
| `4336700` | DOM removeChild 错误自动恢复：`error.tsx` 新增 `isDOMError` 检测 + reset + return null；`live/page.tsx` 用 `appendChild` 替换 `innerHTML` |
| `f13b547` | EdgeOne 部署支持：新增 `edgeone-deploy.yml` 工作流、`edgeone.json` 配置、`scripts/edgeone-build.mjs` 构建脚本 |
| `01b270b` | Nyaa 搜索与下载导出：新增 `/api/acg/nyaa` 端点（RSS 解析 + 30 分钟缓存），DownloadPanel 新增下载导出按钮 |
| `d02c456` | 自定义 X-Emby-Authorization 请求头：EmbyConfig/admin.types/emby-manager 新增 `embyAuthorizationHeader` 字段，EmbyClient 使用自定义头并保留默认回退 |
| `cbdd20c` | @tanstack/react-virtual 升级至 3.14.4（本地已是 3.14.8，跳过） |
| `b91adee` | 版本号升级至 6.6.3：更新 CHANGELOG、README、VERSION.txt、changelog.ts、version.ts 等 |

### 第三批（26 个 commit）

| Commit | 说明 |
|--------|------|
| `84ce804` | useRemindersMutations 优化 |
| `d0f33a5` | .nvmrc 版本更新、sqlite.db.ts 延迟加载优化 |
| `8e60e36` | edgeone-build.mjs 修复 |
| `1d0567f` | 依赖版本更新 |
| `77cecbf` | TVBox route 和 downstream 优化 |
| `600fb81` | EdgeOne 构建脚本增强 |
| `08a0a3d` | 依赖版本更新 |
| `7739757` | 依赖版本更新 |
| `022c5d2` | admin/page.tsx Bangumi API 选项扩展（corsapi、sakura） |
| `f45f76c` | admin/page.tsx 和 SettingsPanel 配置项补充 |
| `4aed063` | 下载功能增强：DownloadContext、m3u8-downloader、stream-mode-detector |
| `f2deff9` | generate-manifest.js 和 layout.tsx 优化 |
| `5cd6096` | 依赖版本更新 |
| `b781cc6` | README 文档更新 |
| `36265ef` | downstream.ts 优化 |
| `0b0e5b3` | admin/page.tsx 和 layout.tsx 配置增强 |
| `ea5f289` | admin/page.tsx 配置项扩展 |
| `4609106` | Bangumi 代理路由优化 |
| `2aad97f` | spider.jar 代理、TVBox route、spiderJar 库优化 |
| `3b3b296` | 依赖版本更新 |
| `5b9eaaa` | play/page.tsx 播放进度优化 |
| `9670319` | play/page.tsx 剧集切换优化 |
| `c227c34` | 依赖版本更新 |
| `1c5b624` | 登录限流：新增 `isLoginRateLimited`/`recordLoginFailure` 函数，`cf-connecting-ip` 支持 |
| `0d95bf5` | 代理路由统一优化（bangumi/cms/key/m3u8/youtube） |
| `18b1505` | admin/page.tsx Bangumi API 选项补充 |

## 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/lib/pansou-auth.ts` | PanSou 认证模块（Bearer token 管理 + 自动续期） |
| `src/lib/video-quality.ts` | 视频分辨率推断与筛选工具 |
| `src/lib/sqlite.db.ts` | SQLite 数据库管理（构建阶段使用内存数据库） |
| `src/components/DOMErrorBoundary.tsx` | DOM 错误边界组件 |
| `src/components/GlobalDOMErrorHandler.tsx` | 全局 DOM 错误处理器 |
| `src/components/TranslationWarningToast.tsx` | 翻译插件检测警告 Toast |
| `src/components/play/PlayInfoPanel.tsx` | 播放信息面板组件 |
| `src/hooks/useTMDBLogo.ts` | TMDB Logo 数据 Hook |
| `src/app/api/acg/nyaa/` | Nyaa 搜索 API 端点 |
| `src/app/api/douban/quick-info/` | 豆瓣快速信息查询 API |
| `src/app/api/douban/suggest/` | 豆瓣建议 API |
| `src/app/api/tmdb/backdrop/` | TMDB 背景 API |
| `.github/workflows/edgeone-deploy.yml` | EdgeOne 部署 GitHub Actions 工作流 |
| `scripts/edgeone-build.mjs` | EdgeOne 构建脚本 |

## Docker 配置变更

### docker-compose.yml

1. **构建网络配置**：添加 `network: host` 到 build 配置，解决 Docker 构建时无法访问 Google Fonts（`fonts.googleapis.com`）的问题。构建容器使用宿主机网络栈，保留原有 `next/font/google` Inter 字体加载方式，无需更换字体。

   ```yaml
   build:
     context: .
     network: host
   ```

2. **密码更新**：`PASSWORD` 环境变量从 `admin123` 修改为 `admin1234`。

## 关键修复

### Google Fonts 构建问题
Docker 构建环境无法访问 `fonts.googleapis.com` 导致 `next/font/google` Inter 字体加载失败。通过在 `docker-compose.yml` 中设置 `build.network: host`，让构建容器使用宿主机网络，成功解决此问题而无需更换字体方案。

### Bangumi CN 区崩溃
中国区 Bangumi API 被拦截导致首页崩溃。通过多层降级策略修复：默认 API 类型改为 `cmliussss` 反代，添加 `Array.isArray` 守卫和 `response.ok` 检查。

### 翻译插件 DOM 崩溃
浏览器翻译插件修改 DOM 导致 React 崩溃。新增 `DOMErrorBoundary` 组件包裹内容，`GlobalDOMErrorHandler` 捕获全局错误，`TranslationWarningToast` 检测并提醒用户。

### 登录限流
新增登录失败限流机制，防止暴力破解。支持 `cf-connecting-ip` 头获取真实客户端 IP。
