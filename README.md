<div align="center">

[![English Doc](https://img.shields.io/badge/Doc-English-blue)](README_EN.md)
[![中文文档](https://img.shields.io/badge/文档-中文-blue)](README.md)

</div>

---

# LunaTV Enhanced Edition

<div align="center">
  <img src="public/logo.png" alt="LunaTV Logo" width="120">
</div>

> 🎬 **LunaTV Enhanced Edition** 是基于 MoonTV 深度二次开发的全功能影视聚合播放平台。在原版基础上新增了 **YouTube 集成**、**网盘搜索**、**AI 推荐**、**短剧功能**、**IPTV 直播**、**Bangumi 动漫**、**播放统计**、**弹幕系统**等 60+ 重大功能增强，打造极致的在线观影体验。

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-16.1.0-000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19.0.0-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-3178c6?logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.1.18-38bdf8?logo=tailwindcss)
![ArtPlayer](https://img.shields.io/badge/ArtPlayer-5.4.0-ff6b6b)
![HLS.js](https://img.shields.io/badge/HLS.js-1.6.16-ec407a)
![License](https://img.shields.io/badge/License-MIT-green)
![Docker Ready](https://img.shields.io/badge/Docker-ready-blue?logo=docker)
![Version](https://img.shields.io/badge/Version-6.5.0-orange)

</div>

---

## 📢 项目说明

本项目是在 **MoonTV** 基础上进行的深度二次开发版本，从 **v4.3.1** 版本开始，持续迭代至当前 **v6.5.0**，累计新增 60+ 重大功能模块，400+ 细节优化。所有新增功能详见 [CHANGELOG](CHANGELOG)。

## ⚠️ 重要声明

本项目仅供学习交流使用，请勿用于商业用途。所有视频内容均来自第三方平台，本项目不存储任何视频文件。使用本项目产生的任何法律责任由使用者自行承担。

## 💡 核心增强亮点

### 🎥 内容生态扩展
- **多人观影房**：支持同步播放、屏幕共享、实时聊天、语音通话，WebRTC 实时传输，画质预设可调 → [详细文档](docs/deployment/WATCH_ROOM_DEPLOYMENT.md)
- **Emby 私有库**：完整的 Emby 媒体服务器集成，支持免密登录、认证模式切换和多音轨播放 → [详细文档](docs/integration/EMBY_GUIDE.md)
- **YouTube 集成**：完整的 YouTube 搜索、播放、直播功能，支持热门视频和地区选择器
- **Bilibili 集成**：Bilibili 搜索和播放功能，支持 UP主视频、热门视频、QR码登录、Cookie管理
- **网盘搜索**：集成高级筛选和缓存管理的网盘资源搜索
- **ACG 种子搜索**：Mikan Project 双源系统，丰富的动漫资源
- **IPTV 直播**：m3u/m3u8 订阅、FLV 直播流、EPG 节目单、M3U 导入导出
- **Bangumi 动漫**：动漫信息智能检测、API 集成
- **繁体中文搜索**：智能繁简转换、多策略搜索
- **搜索列表视图**：支持列表/网格双视图模式切换，列表模式带图片预览和快捷播放

### 🎬 播放器增强
- **控制栏透明度控制**：可自定义控制栏遮挡度（10-80%），实时调整透明度和模糊效果，改善字幕可见性
- **快进快退按钮**：可自定义时间间隔的快进快退按钮，Netflix 风格设计，响应式布局
- **超宽显示器适配**：视频显示模式控制，完美支持超宽显示器
- **片头片尾跳过预设**：灵活的片头片尾模板系统，支持导入导出和验证
- **播放速率持久化**：记住播放速率设置，跨会话保持
- **多音轨支持**：Emby 播放自动选择浏览器兼容音轨，支持音轨切换

### 🔔 内容追踪系统
- **即将上映提醒**：完整的即将上映内容关注列表和提醒系统
- **自动发布通知**：收藏内容发布时自动推送通知
- **邀请码系统**：支持邀请码注册、历史记录和管理功能


### ⚡ 一键部署到 Zeabur（最简单）

点击下方按钮即可一键部署，自动配置 LunaTV + Kvrocks 数据库：

[![Deploy on Zeabur](https://zeabur.com/button.svg)](https://zeabur.com/templates/2425O0/deploy)

**优势**：
- ✅ 无需配置，一键启动（自动部署完整环境）
- ✅ 自动 HTTPS 和全球 CDN 加速
- ✅ 持久化存储，数据永不丢失
- ✅ 免费额度足够个人使用

**⚠️ 重要提示**：部署完成后，需要在 Zeabur 中为 LunaTV 服务设置访问域名（Domain）才能在浏览器中访问。详见下方 [设置访问域名](#5-设置访问域名必须) 步骤。

点击按钮后填写环境变量即可完成部署！详细说明见下方 [Zeabur 部署指南](#️-zeabur-部署推荐)。

---

### 🐳 Docker 自托管部署

本项目**仅支持 Docker 或其他基于 Docker 的平台**部署（如 Dockge、Portainer、Komodo 等）。

### 📦 推荐部署方案：Kvrocks 存储

Kvrocks 是基于 RocksDB 的持久化 Redis 协议兼容存储，推荐用于生产环境。

```yml
services:
  moontv-core:
    image: ghcr.io/iwyang/lunatv:latest
    container_name: moontv-core
    restart: on-failure
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - PASSWORD=your_secure_password
      - NEXT_PUBLIC_STORAGE_TYPE=kvrocks
      - KVROCKS_URL=redis://moontv-kvrocks:6666
      - VIDEO_CACHE_DIR=/app/video-cache  # 视频缓存目录
      # 可选：站点配置
      - SITE_BASE=https://your-domain.com
      - NEXT_PUBLIC_SITE_NAME=LunaTV Enhanced
    volumes:
      - video-cache:/app/video-cache  # 视频缓存持久化
    networks:
      - moontv-network
    depends_on:
      - moontv-kvrocks

  moontv-kvrocks:
    image: apache/kvrocks
    container_name: moontv-kvrocks
    restart: unless-stopped
    volumes:
      - kvrocks-data:/var/lib/kvrocks
    networks:
      - moontv-network

networks:
  moontv-network:
    driver: bridge

volumes:
  kvrocks-data:
  video-cache:  # 视频缓存 volume
```

### 🔴 Redis 存储（有数据丢失风险）

Redis 默认配置可能导致数据丢失，需要开启持久化。

```yml
services:
  moontv-core:
    image: ghcr.io/iwyang/lunatv:latest
    container_name: moontv-core
    restart: on-failure
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - PASSWORD=your_secure_password
      - NEXT_PUBLIC_STORAGE_TYPE=redis
      - REDIS_URL=redis://moontv-redis:6379
    networks:
      - moontv-network
    depends_on:
      - moontv-redis

  moontv-redis:
    image: redis:alpine
    container_name: moontv-redis
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    volumes:
      - ./data:/data
    networks:
      - moontv-network

networks:
  moontv-network:
    driver: bridge
```

### ☁️ Upstash 云端存储（Docker）

适合无法自托管数据库的场景，完全托管的 Redis 服务。

1. 在 [upstash.com](https://upstash.com/) 注册账号并新建 Redis 实例
2. 复制 **HTTPS ENDPOINT** 和 **TOKEN**
3. 使用以下配置：

```yml
services:
  moontv-core:
    image: ghcr.io/iwyang/lunatv:latest
    container_name: moontv-core
    restart: on-failure
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - PASSWORD=your_secure_password
      - NEXT_PUBLIC_STORAGE_TYPE=upstash
      - UPSTASH_URL=https://your-instance.upstash.io
      - UPSTASH_TOKEN=your_upstash_token
```

### 🚀 飞牛OS（fnOS）部署

飞牛OS 是一款国产免费 NAS 系统，原生支持 Docker Compose，适合家庭 NAS 用户部署。

#### 部署方式一：Web 界面部署（推荐）

1. **登录飞牛OS管理界面**
   - 访问飞牛OS的 Web 管理界面
   - 进入 "Docker" 或 "容器管理" 页面

2. **创建 Compose 项目**
   - 点击 "新建 Compose 项目" 或 "添加服务"
   - 项目名称：`lunatv`
   - 将上方的 [Kvrocks 存储配置](#-推荐部署方案kvrocks-存储) 粘贴到配置框中
=======
### 🤖 智能推荐系统
- **AI 智能助手**：支持 GPT-5/o 系列模型，流式传输 → [详细文档](docs/features/AI_FEATURES.md)
- **Tavily 搜索模式**：无需 AI API 的搜索模式
- **TMDB 演员搜索**：完整的演员搜索、过滤和缓存
- **发布日历**：即将上映内容预览和跟踪

### 💬 弹幕生态系统
- **第三方弹幕 API**：集成腾讯、爱奇艺、优酷、B站等主流平台
- **智能性能优化**：分级渲染、Web Worker 加速
- **手动弹幕匹配**：精准获取对应弹幕
- **综合设置面板**：完整的弹幕配置

### 📊 性能与监控
- **性能监控仪表板**：完整的 API 性能监控系统
- **流量监控系统**：真实流量监控、域名分解
- **Kvrocks 持久化**：高性能缓存系统

## 🚀 快速开始

### Docker 部署（推荐）

```bash
# 克隆项目
git clone https://github.com/SzeMeng76/LunaTV.git
cd LunaTV

# 复制环境变量配置
cp .env.example .env

# 编辑 .env 文件，配置必要的环境变量
nano .env

# 启动服务
docker-compose up -d


#### 📝 飞牛OS 部署注意事项

- **镜像加速**：建议在飞牛OS中配置 Docker 镜像加速（设置 → Docker → 镜像仓库），推荐使用轩辕镜像
- **端口冲突**：确保 3000 端口未被占用，如有冲突可修改为其他端口（如 `3001:3000`）
- **数据持久化**：Volume `kvrocks-data` 会自动创建在飞牛OS的 Docker 数据目录
- **反向代理**：可配合飞牛OS的反向代理功能，实现域名访问和 HTTPS
- **更新镜像**：在 Docker 管理界面选择容器 → 更新镜像 → 重启

#### ✨ 飞牛OS 部署优势

- ✅ **图形化管理**：Web 界面操作简单直观
- ✅ **一键更新**：内置容器镜像更新功能
- ✅ **数据安全**：NAS 级别的数据保护和备份
- ✅ **网络加速**：支持配置镜像加速源
- ✅ **资源监控**：实时查看容器资源占用

---

### ☁️ Zeabur 部署（推荐）

Zeabur 是一站式云端部署平台，使用预构建的 Docker 镜像可以快速部署，无需等待构建。

**部署步骤：**

1. **添加 KVRocks 服务**（先添加数据库）
   - 点击 "Add Service" > "Docker Images"
   - 输入镜像名称：`apache/kvrocks`
   - 配置端口：`6666` (TCP)
   - **记住服务名称**（通常是 `apachekvrocks`）
   - **配置持久化卷（重要）**：
     * 在服务设置中找到 "Volumes" 部分
     * 点击 "Add Volume" 添加新卷
     * Volume ID: `kvrocks-data`（可自定义，仅支持字母、数字、连字符）
     * Path: `/var/lib/kvrocks/db`
     * 保存配置

   > 💡 **重要提示**：持久化卷路径必须设置为 `/var/lib/kvrocks/db`（KVRocks 数据目录），这样配置文件保留在容器内，数据库文件持久化，重启后数据不会丢失！

2. **添加 LunaTV 服务**
   - 点击 "Add Service" > "Docker Images"
   - 输入镜像名称：`ghcr.io/iwyang/lunatv:latest`
   - 配置端口：`3000` (HTTP)

3. **配置环境变量**

   在 LunaTV 服务的环境变量中添加：

   ```env
   # 必填：管理员账号
   USERNAME=admin
   PASSWORD=your_secure_password

   # 必填：存储配置
   NEXT_PUBLIC_STORAGE_TYPE=kvrocks
   KVROCKS_URL=redis://apachekvrocks:6666
   VIDEO_CACHE_DIR=/app/video-cache

   # 可选：站点配置
   SITE_BASE=https://your-domain.zeabur.app
   NEXT_PUBLIC_SITE_NAME=LunaTV Enhanced
   ANNOUNCEMENT=欢迎使用 LunaTV Enhanced Edition

   # 可选：豆瓣代理配置（推荐）
   NEXT_PUBLIC_DOUBAN_PROXY_TYPE=cmliussss-cdn-tencent
   NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE=cmliussss-cdn-tencent
   ```

   **注意**：
   - 使用服务名称作为主机名：`redis://apachekvrocks:6666`
   - 如果服务名称不同，请替换为实际名称
   - 两个服务必须在同一个 Project 中

4. **部署完成**
   - Zeabur 会自动拉取镜像并启动服务
   - 等待服务就绪后，需要手动设置访问域名（见下一步）

#### 5. 设置访问域名（必须）

   - 在 LunaTV 服务页面，点击 "Networking" 或 "网络" 标签
   - 点击 "Generate Domain" 生成 Zeabur 提供的免费域名（如 `xxx.zeabur.app`）
   - 或者绑定自定义域名：
     * 点击 "Add Domain" 添加你的域名
     * 按照提示配置 DNS CNAME 记录指向 Zeabur 提供的目标地址
   - 设置完域名后即可通过域名访问 LunaTV

6. **绑定自定义域名（可选）**
   - 在服务设置中点击 "Domains"
   - 添加你的自定义域名
   - 配置 DNS CNAME 记录指向 Zeabur 提供的域名

#### 🔄 更新 Docker 镜像

当 Docker 镜像有新版本发布时，Zeabur 不会自动更新。需要手动触发更新。

**更新步骤：**

1. **进入服务页面**
   - 点击需要更新的服务（LunaTV 或 KVRocks）

2. **重启服务**
   - 点击 **"服务状态"** 页面，再点击 **"重启当前版本"** 按钮
   - Zeabur 会自动拉取最新的 `latest` 镜像并重新部署

> 💡 **提示**：
> - 使用 `latest` 标签时，Restart 会自动拉取最新镜像
> - 生产环境推荐使用固定版本标签（如 `v5.5.6`）避免意外更新

#### ✨ Zeabur 部署优势

- ✅ **自动 HTTPS**：免费 SSL 证书自动配置
- ✅ **全球 CDN**：自带全球加速
- ✅ **零配置部署**：自动检测 Dockerfile
- ✅ **服务发现**：容器间通过服务名称自动互联
- ✅ **持久化存储**：支持数据卷挂载
- ✅ **CI/CD 集成**：Git 推送自动部署
- ✅ **实时日志**：Web 界面查看运行日志

#### ⚠️ Zeabur 注意事项

- **计费模式**：按实际使用的资源计费，免费额度足够小型项目使用
- **区域选择**：建议选择离用户最近的区域部署
- **服务网络**：同一 Project 中的服务通过服务名称互相访问（如 `apachekvrocks:6666`）
- **持久化存储**：KVRocks 必须配置持久化卷到 `/var/lib/kvrocks/db` 目录，否则重启后数据丢失

---

### 🤗 Hugging Face Space 部署（免费）

[Hugging Face Spaces](https://huggingface.co/spaces) 提供免费的 Docker 容器托管服务，配置为 **2 核 CPU、16GB 内存、50GB 存储**，非常适合个人使用。

#### 部署步骤

1. **创建 Hugging Face 账号**
   - 访问 [huggingface.co](https://huggingface.co/) 注册账号

2. **创建新 Space**
   - 访问 [huggingface.co/new-space](https://huggingface.co/new-space)
   - 填写 Space 名称（如 `lunatv`）
   - **Space SDK** 选择 `Docker`
   - **Space hardware** 选择 `CPU basic`（免费）
   - 点击 `Create Space`

3. **配置 README.md**

   在 Space 仓库根目录创建或编辑 `README.md`，添加以下 YAML 元数据：

   ```yaml
   ---
   title: LunaTV
   emoji: 🎬
   colorFrom: green
   colorTo: blue
   sdk: docker
   app_port: 3000
   pinned: false
   ---
   ```

   > 💡 **关键配置**：`app_port: 3000` 告诉 HF 应用运行在 3000 端口

4. **创建 Dockerfile**

   在 Space 仓库根目录创建 `Dockerfile`，仅需一行：

   ```dockerfile
   FROM ghcr.io/szemeng76/lunatv:latest
   ```

   > 💡 这会直接使用 LunaTV 官方 Docker 镜像，无需构建

5. **配置环境变量（Secrets）**

   在 Space 页面点击 `Settings` > `Variables and secrets`，添加以下 Secrets：

   | 变量名 | 说明 | 示例值 |
   |--------|------|--------|
   | `USERNAME` | 管理员账号 | `admin` |
   | `PASSWORD` | 管理员密码 | `your_secure_password` |
   | `NEXT_PUBLIC_STORAGE_TYPE` | 存储类型 | `upstash` |
   | `UPSTASH_URL` | Upstash REST URL | `https://xxx.upstash.io` |
   | `UPSTASH_TOKEN` | Upstash Token | `AxxxQ==` |
   | `DISABLE_HERO_TRAILER` | 禁用首页预告片 | `true` |

   > ⚠️ **注意**：HF Space 无持久化存储，必须使用 Upstash 等外部数据库
   >
   > 💡 **建议**：设置 `DISABLE_HERO_TRAILER=true` 禁用首页预告片，因为预告片 URL 带时间戳会定时过期，无持久化存储的平台无法缓存视频，每次刷新都要重新下载

6. **等待部署完成**
   - 提交文件后，HF 会自动拉取镜像并启动容器
   - 部署完成后，访问 `https://huggingface.co/spaces/你的用户名/lunatv`

#### 📁 完整文件结构

```

访问 `http://localhost:3000` 即可使用。

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

**详细部署指南**：[查看完整部署文档](docs/deployment/DEPLOYMENT.md)

## 📚 文档导航

### 核心文档
- 📖 [完整文档中心](docs/README.md) - 所有文档的导航页
- 🚀 [部署指南](docs/deployment/DEPLOYMENT.md) - Docker、Vercel 等部署方式
- ⚙️ [配置说明](docs/deployment/CONFIGURATION.md) - 环境变量和功能配置
- 📱 [移动端使用](docs/mobile/MOBILE.md) - 移动端 APP 和 AndroidTV 使用

### 功能文档
- 🤖 [AI 功能详解](docs/features/AI_FEATURES.md)
- 📥 [下载功能](docs/features/DOWNLOAD_FEATURES.md)
- 📺 [虚拟滚动指南](docs/features/VIRTUAL_SCROLL_GUIDE.md)
- 🎥 [观影房部署](docs/deployment/WATCH_ROOM_DEPLOYMENT.md)

### 集成指南
- 🎬 [Emby 集成](docs/integration/EMBY_GUIDE.md)
- 📺 [TVBox 集成](docs/integration/TVBOX.md)
- 🔒 [TVBox 安全](docs/integration/TVBOX_SECURITY.md)

### 认证配置
- 🔐 [OIDC 认证](docs/authentication/OIDC_SETUP.md)
- 💬 [Telegram 认证](docs/authentication/TELEGRAM_AUTH.md)
- 🌐 [可信网络](docs/authentication/TRUSTED_NETWORK.md)

### 高级配置
- 🔧 [代理配置](docs/advanced/PROXY_CONFIG.md)
- 🚫 [广告过滤](docs/advanced/CUSTOM_AD_FILTER.md)
- ⏭️ [跳过控制器](docs/advanced/SKIP_CONTROLLER_GUIDE.md)

## 🔧 技术栈

- **前端框架**：Next.js 16.1.0 + React 19.0.0
- **开发语言**：TypeScript 5.8.3
- **样式方案**：TailwindCSS 4.1.18
- **视频播放**：ArtPlayer 5.4.0 + HLS.js 1.6.16
- **状态管理**：TanStack Query 5.91.0
- **数据库**：Upstash Redis + Kvrocks
- **部署方案**：Docker / Vercel / Render

## 📜 更新日志

查看 [CHANGELOG](CHANGELOG) 了解所有版本更新内容。

## 🔐 安全与隐私

详细的安全配置和隐私保护说明请查看 [安全文档](docs/security/SECURITY.md)。

## 📄 License

[![CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

本项目采用 [CC BY-NC-SA 4.0 协议](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 开源。

**这意味着**：
- ✅ 您可以自由地分享、复制和修改本项目
- ✅ 您必须给予适当的署名，提供指向本许可协议的链接
- ❌ 您不得将本项目用于商业目的
- ⚠️ 若您修改、转换或以本项目为基础进行创作，您必须以相同的许可协议分发您的作品

© 2025-2026 LunaTV Enhanced Edition & Contributors

基于 [MoonTV](https://github.com/MoonTechLab/LunaTV) 进行二次开发。

## 🙏 致谢

### 原始项目
- [MoonTV](https://github.com/MoonTechLab/LunaTV) — 项目原始版本
- [Selene](https://github.com/MoonTechLab/Selene) — 官方移动端 APP
- [LibreTV](https://github.com/LibreSpark/LibreTV) — 灵感来源

### 核心依赖
- [Next.js](https://nextjs.org/) — React 框架
- [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) — 强大的网页视频播放器
- [HLS.js](https://github.com/video-dev/hls.js) — HLS 流媒体支持
- [TanStack Virtual](https://github.com/TanStack/virtual) — 虚拟滚动组件
- [Tailwind CSS](https://tailwindcss.com/) — CSS 框架

### 数据源与服务
- [豆瓣](https://movie.douban.com/) — 影视信息数据
- [TMDB](https://www.themoviedb.org/) — 电影数据库
- [Bangumi](https://bangumi.tv/) — 动漫信息

### 设计与实现参考
本项目在开发过程中参考了以下优秀开源项目的设计思路和实现方案：
- **[MoonTVPlus](https://github.com/mtvpls/MoonTVPlus)** — 观影室同步播放、移动端优化等功能实现参考
- **[DecoTV](https://github.com/Decohererk/DecoTV)** — TVBox 安全策略、性能优化、UI 设计等实现参考

感谢这些项目及其作者的开源贡献和优秀实现！

### 特别感谢
- 所有提供免费影视接口的站点
- 开源社区的贡献者们
- 使用并反馈问题的用户们

---

## 📊 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=SzeMeng76/LunaTV&type=Date)](https://www.star-history.com/#SzeMeng76/LunaTV&Date)

---

<div align="center">

**如果这个项目对你有帮助，请给个 ⭐ Star 支持一下！**

Made with ❤️ by LunaTV Enhanced Edition Team

</div>


