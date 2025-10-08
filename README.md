<div align="center">

[![English Doc](https://img.shields.io/badge/Doc-English-blue)](README_EN.md)
[![中文文档](https://img.shields.io/badge/文档-中文-blue)](README.md)

</div>

---

# LunaTV Enhanced Edition

<div align="center">
  <img src="public/logo.png" alt="LunaTV Logo" width="120">
</div>

> 🎬 **LunaTV Enhanced Edition** 是基于 MoonTV 深度二次开发的全功能影视聚合播放平台。在原版基础上新增了 **YouTube 集成**、**网盘搜索**、**AI 推荐**、**短剧功能**、**IPTV 直播**、**Bangumi 动漫**、**播放统计**、**弹幕系统**等 50+ 重大功能增强，打造极致的在线观影体验。

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14.2.23-000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18.2.0-61dafb?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9.5-3178c6?logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.17-38bdf8?logo=tailwindcss)
![ArtPlayer](https://img.shields.io/badge/ArtPlayer-5.3.0-ff6b6b)
![HLS.js](https://img.shields.io/badge/HLS.js-1.6.13-ec407a)
![License](https://img.shields.io/badge/License-MIT-green)
![Docker Ready](https://img.shields.io/badge/Docker-ready-blue?logo=docker)
![Version](https://img.shields.io/badge/Version-5.5.6-orange)

</div>

---

## 📢 项目说明

本项目是在 **MoonTV** 基础上进行的深度二次开发版本，从 **v4.3.1** 版本开始，持续迭代至当前 **v5.5.6**，累计新增 50+ 重大功能模块，300+ 细节优化。所有新增功能详见 [CHANGELOG](CHANGELOG)。

### 💡 核心增强亮点

#### 🎥 内容生态扩展
- **YouTube 集成**：完整的 YouTube 搜索、播放、直播功能，支持无 Cookie 域名减少验证
- **网盘搜索 (PanSou)**：集成高级筛选和缓存管理的网盘资源搜索
- **短剧完整功能**：短剧搜索、播放、详情展示，专用移动端 API 代理
- **IPTV 直播**：m3u/m3u8 订阅、EPG 节目单（支持多源和 url-tvg）、直播源聚合、台标代理、频道当前源内搜索
- **Bangumi 动漫**：动漫信息智能检测、API 集成、缓存机制

#### 🤖 智能推荐系统
- **AI 内容推荐**：支持 GPT-5/o 系列模型，动态提示词管理
- **多卡片类型**：影视推荐、YouTube 视频、视频链接解析
- **TMDB 演员搜索**：完整的演员搜索、过滤和缓存
- **发布日历**：即将上线内容预览和跟踪

#### 💬 弹幕生态系统
- **第三方弹幕 API**：集成腾讯视频、爱奇艺、优酷、B站等主流平台，智能内容匹配防预告
- **智能性能优化**：基于设备性能的分级渲染、Web Worker 加速、硬件加速
- **完整配置系统**：字号、速度、透明度、显示区域、防重叠等全方位调节
- **智能缓存机制**：localStorage 持久化，30 分钟缓存，自动清理过期数据
- **Web端专用输入**：简洁"弹字"按钮，一键快速发送弹幕（移动端自动隐藏）

#### 📊 用户管理增强
- **用户等级系统**：取代大数字登录次数，提供友好的等级显示
- **播放统计系统**：完整的观看数据统计、分析、可视化，支持全局统计和个人统计选项卡切换
- **双重提醒系统**：新剧集（红色主题）和继续观看（蓝色主题）独立分类，渐变徽章和光环效果
- **用户组权限**：精细化权限控制，支持 AI 助手、YouTube 等功能权限
- **非活跃用户清理**：智能自动清理机制，详细配置和日志

#### 🎮 播放器功能强化
- **Chromecast 投屏**：智能浏览器检测，自动排除OPPO、小米、华为、三星等厂商浏览器
- **iPad/iOS 优化**：HLS.js 官方源码优化，智能设备检测，多重自动播放策略
- **跳过片头片尾**：实时标记按钮、可拖拽悬浮窗配置、剩余时间模式、位置持久化存储
- **移动端优化**：音量控制悬停优化、响应式控制器、弹幕配置桌面端显示
- **选集分组滚动翻页**：播放页选集支持滚动翻页，大量集数流畅浏览

#### 📱 界面体验优化
- **虚拟滚动**：react-window 2.2.0，支持大量内容流畅加载，智能容器尺寸检测（ResizeObserver）
- **虚拟滚动美化开关**：渐变样式、图标、动画效果，用户可自由切换显示模式
- **响应式网格**：2-8 列自适应，自动计算最优布局
- **豆瓣详情增强**：评分、演职人员、首播日期、时长、制作信息完整展示
- **用户菜单增强**：更新提醒、继续观看（含新剧集徽章）、我的收藏快捷入口、TVBox设置集成
- **登录界面现代化**：动态随机壁纸、渐变卡片、响应式设计
- **返回顶部按钮**：发布日历等长页面快捷返回

#### 🔐 安全与存储
- **TVBox 安全集成**：IP 白名单、Token 认证、完整 API 兼容
- **日历缓存迁移**：从 localStorage 迁移至数据库，支持跨设备同步
- **缓存优化**：统一缓存管理（YouTube、网盘、豆瓣、弹幕）
- **存储模式增强**：Kvrocks/Redis/Upstash 完整支持，内存缓存防 QuotaExceededError

---

## ⚠️ 重要声明

### 📦 项目状态

- **注意**：部署后项目为**空壳项目**，**无内置播放源和直播源**，需要自行收集配置
- **演示站**：
  - Zeabur 部署：[https://smonetv.zeabur.app](https://smonetv.zeabur.app)
  - Vercel 部署：[https://lunatv.smone.us](https://lunatv.smone.us)
  - 供短期体验，数据库定时清理

### 🚫 传播限制

**请不要在 B站、小红书、微信公众号、抖音、今日头条或其他中国大陆社交平台发布视频或文章宣传本项目，不授权任何"科技周刊/月刊"类项目或站点收录本项目。**

### 📜 开源协议

本项目采用 **CC BY-NC-SA 4.0 协议**，具体条款：
- ❌ **禁止任何商业化行为**
- ✅ **允许个人学习和使用**
- ✅ **允许二次开发和分发**
- ⚠️ **任何衍生项目必须保留本项目地址并以相同协议开源**

---

## ✨ 完整功能列表

### 🎬 内容聚合
- ✅ 多源影视聚合搜索（流式输出、智能变体、语言感知过滤）
- ✅ YouTube 集成（搜索、直播、iframe 播放、时间筛选和排序）
- ✅ 网盘搜索（PanSou 集成、高级筛选、缓存管理）
- ✅ 短剧完整功能（搜索、播放、专用详情页、移动端API代理）
- ✅ IPTV 直播（m3u 订阅、EPG 节目单、多源支持、url-tvg、源聚合、频道搜索）
- ✅ Bangumi 动漫（信息检测、API 集成、3-6位ID支持）
- ✅ TMDB 演员搜索（过滤、缓存）

### 🤖 智能推荐
- ✅ AI 推荐系统（GPT-5/o 支持、动态提示词）
- ✅ 发布日历（即将上线内容预览）
- ✅ 豆瓣详情增强（完整演职人员信息）
- ✅ 智能搜索优化（语言感知、模糊匹配）

### 💬 弹幕系统
- ✅ 第三方弹幕 API（腾讯、爱奇艺、优酷、B站、caiji.cyou多平台聚合）
- ✅ 智能内容匹配（自动过滤解说、预告等不相关内容）
- ✅ 智能性能优化（设备分级、Web Worker、硬件加速、分段加载）
- ✅ 完整配置（字号、速度、透明度、显示区域、防重叠、按类型蒙蔽）
- ✅ 智能缓存（localStorage、30分钟过期、页面刷新保持）
- ✅ 弹幕输入（Web 端专用"弹字"按钮，移动端自动隐藏）
- ✅ EXT-X-MEDIA URI处理（防止HLS音轨加载错误）

### 📊 用户管理
- ✅ 用户等级系统（取代大数字登录次数）
- ✅ 播放统计（观看时长、影片数量、最近记录、全局/个人选项卡切换）
- ✅ 双重提醒系统（新剧集红色主题、继续观看蓝色主题、渐变徽章）
- ✅ VideoCard观看更新显示（替代弹窗式更新）
- ✅ 用户组权限（AI、YouTube 等功能控制）
- ✅ 非活跃用户自动清理（智能配置、日志记录）
- ✅ 登录时间追踪（增强管理员分析能力）

### 🎮 播放器增强
- ✅ Chromecast 投屏
- ✅ iPad/iOS 优化（HLS.js 配置、自动播放）
- ✅ 弹幕面板（移动端精确定位）
- ✅ 音量控制优化
- ✅ 跳过片头片尾
- ✅ 剧集切换优化（防抖、状态管理）

### 🎨 界面体验
- ✅ 虚拟滚动（react-window 2.2.0、ResizeObserver智能检测、渐进式加载）
- ✅ 虚拟滚动美化开关（渐变样式、图标、动画、用户可切换）
- ✅ 响应式网格（2-8 列自适应、实际容器宽度动态计算）
- ✅ 豆瓣详情增强（评分、演职人员、首播日期、时长、制作信息）
- ✅ 用户菜单增强（更新提醒、继续观看含新剧集徽章、收藏快捷入口、TVBox设置）
- ✅ 登录注册现代化（动态随机壁纸、渐变卡片、响应式设计）
- ✅ 返回顶部按钮（发布日历等长页面）
- ✅ 完结系列徽章（基于vod_remarks、搜索API优先）
- ✅ 搜索结果筛选（播放源、标题、年份筛选，年份排序）
- ✅ 视频卡片右键/长按菜单（新标签页播放、收藏等操作）

### 🔐 安全与存储
- ✅ TVBox 完整 API（IP 白名单、Token 认证）
- ✅ 日历缓存数据库迁移
- ✅ 统一缓存管理系统
- ✅ Kvrocks/Redis/Upstash 存储
- ✅ 内存缓存防 QuotaExceededError
- ✅ 用户注册系统（可配置开关）

### 🛠️ 技术优化
- ✅ ArtPlayer 5.3.0 + HLS.js 1.6.13
- ✅ 弹幕插件 5.2.0（Web Worker 加速）
- ✅ Next.js SSR 兼容性
- ✅ Docker 构建优化
- ✅ TypeScript 类型安全
- ✅ 语义化版本管理

---

## 🗺 目录

- [技术栈](#-技术栈)
- [部署](#-部署)
  - [Docker 部署（推荐）](#-推荐部署方案kvrocks-存储)
  - [Zeabur 部署（推荐）](#️-zeabur-部署推荐)
  - [Vercel 部署（无服务器）](#-vercel-部署无服务器)
- [配置文件](#-配置文件)
- [环境变量](#-环境变量)
- [功能配置](#-功能配置)
- [自动更新](#-自动更新)
- [移动端 APP 使用](#-移动端-app-使用)
- [AndroidTV / 平板使用](#-androidtv--平板使用)
- [更新日志](#-更新日志)
- [安全与隐私提醒](#-安全与隐私提醒)
- [License](#-license)
- [致谢](#-致谢)

---

## 🔧 技术栈

| 分类      | 主要依赖                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| 前端框架  | [Next.js 14.2.23](https://nextjs.org/) · App Router                                                        |
| UI & 样式 | [Tailwind CSS 3.4.17](https://tailwindcss.com/) · [Framer Motion 12](https://www.framer.com/motion/)                                                       |
| 语言      | TypeScript 4.9.5                                                                                          |
| 播放器    | [ArtPlayer 5.3.0](https://github.com/zhw2590582/ArtPlayer) · [HLS.js 1.6.13](https://github.com/video-dev/hls.js/)  · [artplayer-plugin-danmuku 5.2.0](https://github.com/zhw2590582/ArtPlayer) |
| 状态管理  | React Context API · React Hooks                                                                              |
| 数据存储  | Kvrocks · Redis · Upstash · localStorage                                                                              |
| 虚拟化  | [react-window 2.2.0](https://github.com/bvaughn/react-window) · ResizeObserver                                                                              |
| UI 组件  | [@headlessui/react 2](https://headlessui.com/) · [Lucide Icons](https://lucide.dev/) · [React Icons 5](https://react-icons.github.io/react-icons/)                                                                              |
| 代码质量  | ESLint · Prettier · Jest · Husky                                                                              |
| 部署      | Docker · Docker Compose                                                                    |

---

## 🚀 部署

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
    image: ghcr.io/szemeng76/lunatv:latest
    container_name: moontv-core
    restart: on-failure
    ports:
      - '3000:3000'
    environment:
      - USERNAME=admin
      - PASSWORD=your_secure_password
      - NEXT_PUBLIC_STORAGE_TYPE=kvrocks
      - KVROCKS_URL=redis://moontv-kvrocks:6666
      # 可选：站点配置
      - SITE_BASE=https://your-domain.com
      - NEXT_PUBLIC_SITE_NAME=LunaTV Enhanced
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
```

### 🔴 Redis 存储（有数据丢失风险）

Redis 默认配置可能导致数据丢失，需要开启持久化。

```yml
services:
  moontv-core:
    image: ghcr.io/szemeng76/lunatv:latest
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
    image: ghcr.io/szemeng76/lunatv:latest
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
   - 输入镜像名称：`ghcr.io/szemeng76/lunatv:latest`
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
   - 点击右上角的 **"Restart"** 按钮
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

## 🌐 Vercel 部署（无服务器）

### Vercel + Upstash 方案

适合没有服务器的用户，完全免费部署（Vercel 免费版 + Upstash 免费版）。

#### 准备工作

1. **创建 Upstash Redis 实例**
   - 访问 [upstash.com](https://upstash.com/)
   - 注册账号并创建新的 Redis 数据库
   - 选择区域（建议选择离你最近的区域）
   - 复制 **REST URL** 和 **REST TOKEN**

2. **Fork 本项目**
   - Fork 本仓库到你的 GitHub 账号

#### 部署步骤

1. **导入到 Vercel**
   - 访问 [vercel.com](https://vercel.com/)
   - 登录并点击 "Add New" > "Project"
   - 导入你 Fork 的仓库
   - 点击 "Import"

2. **配置环境变量**

   在 Vercel 项目设置中添加以下环境变量：

   ```env
   # 必填：管理员账号
   USERNAME=admin
   PASSWORD=your_secure_password

   # 必填：存储配置
   NEXT_PUBLIC_STORAGE_TYPE=upstash
   UPSTASH_URL=https://your-redis-instance.upstash.io
   UPSTASH_TOKEN=AxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==

   # 可选：站点配置
   SITE_BASE=https://your-domain.vercel.app
   NEXT_PUBLIC_SITE_NAME=LunaTV Enhanced
   ANNOUNCEMENT=欢迎使用 LunaTV Enhanced Edition

   # 可选：豆瓣代理配置（推荐）
   NEXT_PUBLIC_DOUBAN_PROXY_TYPE=cmliussss-cdn-tencent
   NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE=cmliussss-cdn-tencent

   # 可选：搜索配置
   NEXT_PUBLIC_SEARCH_MAX_PAGE=5
   NEXT_PUBLIC_FLUID_SEARCH=true
   ```

3. **部署项目**
   - 点击 "Deploy" 按钮
   - 等待构建完成（约 2-5 分钟）
   - 部署成功后访问 Vercel 提供的域名

4. **绑定自定义域名（可选）**
   - 在 Vercel 项目设置中点击 "Domains"
   - 添加你的自定义域名
   - 按照提示配置 DNS 解析

#### ⚠️ Vercel 部署注意事项

- **无服务器限制**：Vercel 免费版有 10 秒函数执行时间限制，某些耗时操作可能超时
- **流量限制**：Vercel 免费版每月 100GB 流量，个人使用足够
- **冷启动**：长时间无访问后首次访问会较慢（约 1-3 秒）
- **不支持功能**：由于无服务器架构限制，以下功能可能受限：
  - 大量并发搜索请求
  - 超长视频的弹幕加载
  - 复杂的数据统计分析

#### 💡 Vercel 部署优势

- ✅ **完全免费**：Vercel 和 Upstash 免费版足够个人使用
- ✅ **零运维**：无需管理服务器，自动扩容
- ✅ **全球 CDN**：访问速度快
- ✅ **自动部署**：推送代码自动触发部署
- ✅ **HTTPS 支持**：自动配置 SSL 证书

---

## ⚙️ 配置文件

部署后为空壳应用，需要在**管理后台 > 配置文件**中填写配置。

### 📝 配置文件格式

```json
{
  "cache_time": 7200,
  "api_site": {
    "example_source": {
      "api": "http://example.com/api.php/provide/vod",
      "name": "示例资源站",
      "detail": "http://example.com"
    }
  },
  "custom_category": [
    {
      "name": "华语电影",
      "type": "movie",
      "query": "华语"
    },
    {
      "name": "美剧",
      "type": "tv",
      "query": "美剧"
    }
  ]
}
```

### 📖 字段说明

- **cache_time**：接口缓存时间（秒），建议 3600-7200
- **api_site**：影视资源站点配置
  - `key`：唯一标识（小写字母/数字）
  - `api`：资源站 vod JSON API 地址（支持苹果 CMS V10 格式）
  - `name`：人机界面显示名称
  - `detail`：（可选）网页详情根 URL，用于爬取剧集详情
- **custom_category**：自定义分类（基于豆瓣搜索）
  - `name`：分类显示名称
  - `type`：`movie`（电影）或 `tv`（电视剧）
  - `query`：豆瓣搜索关键词

### 🎯 推荐自定义分类

**电影分类**：热门、最新、经典、豆瓣高分、冷门佳片、华语、欧美、韩国、日本、动作、喜剧、爱情、科幻、悬疑、恐怖、治愈

**电视剧分类**：热门、美剧、英剧、韩剧、日剧、国产剧、港剧、日本动画、综艺、纪录片

也可输入具体内容如"哈利波特"，效果等同于豆瓣搜索。

---

## 🌐 环境变量

### 必填变量

| 变量                     | 说明           | 示例值                |
| ------------------------ | -------------- | --------------------- |
| `USERNAME`               | 站长账号       | `admin`               |
| `PASSWORD`               | 站长密码       | `your_secure_password`|
| `NEXT_PUBLIC_STORAGE_TYPE` | 存储类型     | `kvrocks` / `redis` / `upstash` |

### 存储配置

| 变量              | 说明                 | 示例值                          |
| ----------------- | -------------------- | ------------------------------- |
| `KVROCKS_URL`     | Kvrocks 连接 URL      | `redis://moontv-kvrocks:6666`   |
| `REDIS_URL`       | Redis 连接 URL        | `redis://moontv-redis:6379`     |
| `UPSTASH_URL`     | Upstash 端点          | `https://xxx.upstash.io`        |
| `UPSTASH_TOKEN`   | Upstash Token         | `AxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==`|

### 可选配置

| 变量                                | 说明                 | 默认值      | 可选值                    |
| ----------------------------------- | -------------------- | ----------- | ------------------------- |
| `SITE_BASE`                         | 站点 URL             | 空          | `https://example.com`     |
| `NEXT_PUBLIC_SITE_NAME`             | 站点名称             | `MoonTV`    | 任意字符串                |
| `ANNOUNCEMENT`                      | 站点公告             | 默认公告     | 任意字符串                |
| `NEXT_PUBLIC_SEARCH_MAX_PAGE`       | 搜索最大页数         | `5`         | `1-50`                    |
| `NEXT_PUBLIC_DOUBAN_PROXY_TYPE`     | 豆瓣数据代理类型     | `direct`    | `direct` / `cors-proxy-zwei` / `cmliussss-cdn-tencent` / `cmliussss-cdn-ali` / `custom` |
| `NEXT_PUBLIC_DOUBAN_PROXY`          | 自定义豆瓣代理       | 空          | URL prefix                |
| `NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE`| 豆瓣图片代理类型    | `direct`    | `direct` / `server` / `img3` / `cmliussss-cdn-tencent` / `cmliussss-cdn-ali` / `custom` |
| `NEXT_PUBLIC_DOUBAN_IMAGE_PROXY`    | 自定义图片代理       | 空          | URL prefix                |
| `NEXT_PUBLIC_DISABLE_YELLOW_FILTER` | 关闭色情内容过滤     | `false`     | `true` / `false`          |
| `NEXT_PUBLIC_FLUID_SEARCH`          | 流式搜索输出         | `true`      | `true` / `false`          |

### 豆瓣代理说明

**DOUBAN_PROXY_TYPE 选项**：
- `direct`：服务器直接请求豆瓣（可能被墙）
- `cors-proxy-zwei`：通过 [Zwei](https://github.com/bestzwei) 提供的 CORS 代理
- `cmliussss-cdn-tencent`：[CMLiussss](https://github.com/cmliu) 提供的腾讯云 CDN
- `cmliussss-cdn-ali`：[CMLiussss](https://github.com/cmliu) 提供的阿里云 CDN
- `custom`：自定义代理（需设置 `DOUBAN_PROXY`）

**DOUBAN_IMAGE_PROXY_TYPE 选项**：
- `direct`：浏览器直接请求豆瓣图片域名
- `server`：服务器代理请求
- `img3`：豆瓣官方阿里云 CDN
- `cmliussss-cdn-tencent`：CMLiussss 腾讯云 CDN
- `cmliussss-cdn-ali`：CMLiussss 阿里云 CDN
- `custom`：自定义代理（需设置 `DOUBAN_IMAGE_PROXY`）

---

## 🎛️ 功能配置

所有功能均可在**管理后台**进行配置，无需修改代码或重启服务。

### 管理后台入口

访问 `http://your-domain:3000/admin` 并使用站长账号登录。

### 管理面板功能模块

管理后台提供以下功能模块（部分功能仅站长可见）：

#### 📁 配置文件（仅站长）
- **配置订阅**：
  - 订阅 URL 设置
  - 自动拉取远程配置
  - 支持 Base58 编码的 JSON 格式
- **配置文件编辑**：
  - JSON 格式配置编辑器
  - 在线保存配置

#### ⚙️ 站点配置
- **基础设置**：
  - 站点名称
  - 站点公告
- **豆瓣数据代理**：
  - 直连/Cors Proxy/豆瓣 CDN/自定义代理
  - 自定义代理 URL
- **豆瓣图片代理**：
  - 直连/服务器代理/官方 CDN/自定义代理
  - 自定义图片代理 URL
- **搜索接口设置**：
  - 搜索最大页数（1-50）
  - 接口缓存时间（秒）
  - 流式搜索开关
- **内容过滤**：
  - 黄色内容过滤开关
- **TMDB 演员搜索**：
  - TMDB API Key
  - 语言设置（中文/英语/日语/韩语）
  - 功能启用开关

#### 👥 用户配置
- **用户注册设置**（仅站长）：
  - 用户注册开关
  - 非活跃用户自动清理
  - 保留天数设置
- **用户组管理**：
  - 添加/编辑/删除用户组
  - 可用视频源权限配置
- **用户列表**：
  - 批量设置用户组
  - 添加/编辑用户
  - 修改密码
  - 封禁/解封用户
  - 设置管理员权限
  - 删除用户

#### 🎬 视频源配置
- **视频源管理**：
  - 添加视频源（名称、API 地址）
  - 批量启用/禁用/删除
  - 视频源有效性检测
  - 拖拽排序
  - 编辑/删除单个视频源

#### 📺 直播源配置
- **直播源管理**：
  - 添加直播源（名称、m3u/m3u8 地址）
  - 刷新直播源数据
  - 拖拽排序
  - 编辑/删除直播源

#### 🏷️ 分类配置
- **自定义分类**：
  - 添加/编辑自定义分类
  - 拖拽排序
  - 基于豆瓣搜索的分类

#### 🔍 网盘搜索配置
- **基础设置**：
  - 网盘搜索功能开关
  - PanSou 服务地址
  - 请求超时时间
- **支持网盘类型**：
  - 百度网盘、阿里云盘、夸克、天翼云盘
  - UC 网盘、移动云盘、115 网盘、PikPak
  - 迅雷网盘、123 网盘
  - 磁力链接、电驴链接

#### 🤖 AI 推荐配置
- OpenAI API 配置
- 模型选择和参数设置
- 推荐提示词管理

#### 🎥 YouTube 配置
- YouTube Data API v3 密钥
- 搜索和缓存配置
- 功能启用开关

#### 🔐 TVBox 安全配置
- IP 白名单管理
- Token 认证配置
- TVBox API 设置

#### 🗄️ 缓存管理（仅站长）
- 各类缓存查看和清理
- YouTube、网盘、豆瓣、弹幕缓存统计

#### 📦 数据迁移（仅站长）
- 导入/导出整站数据
- 数据库迁移工具

---

## 🔄 自动更新

### 使用 Watchtower

[Watchtower](https://github.com/containrrr/watchtower) 可自动检测并更新 Docker 容器到最新镜像。

```yml
services:
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 86400 --cleanup
    restart: unless-stopped
```

### UI 工具自动更新

- **Dockge**：内置自动更新功能
- **Portainer**：支持容器镜像自动更新
- **Komodo**：提供自动更新配置选项

---

## 📱 移动端 APP 使用

### Selene - 官方移动客户端

[Selene](https://github.com/MoonTechLab/Selene) 是由 MoonTV 原作者开发的官方移动端应用，基于 Flutter 构建，专为手机端优化。

#### 支持平台
- **Android**：5.0+ (API 21)，仅支持 ARM64 架构
- **iOS**：12.0+

#### 主要特性
- 🎨 Modern Material Design 3 界面
- 🌗 深色/浅色主题支持
- 🔍 多源聚合搜索（支持 SSE 实时搜索）
- ▶️ 高性能 FVP 视频播放器
- 📊 智能播放记录追踪
- ❤️ 个人收藏管理
- 🎬 支持电影、电视剧、动漫、综艺等内容

#### 使用方法

1. 从 [Selene Releases](https://github.com/MoonTechLab/Selene/releases) 下载最新版本
   - Android：下载 `.apk` 文件
   - iOS：下载 `.ipa` 文件（需自签）
2. 安装应用到手机
3. 打开应用，在设置中填入您的服务器域名：`https://your-domain.com`
4. 使用站长账号或普通用户账号登录
5. 所有播放记录和收藏将与网页端自动同步

#### 注意事项
- ⚠️ Selene 专为手机端优化，**不兼容平板、电视、模拟器**等设备
- ⚠️ 如需在 Android TV 或平板上使用，请使用下方的 OrionTV

---

## 📺 AndroidTV / 平板使用

### OrionTV - 大屏客户端

本项目可配合 [OrionTV](https://github.com/zimplexing/OrionTV) 在 Android TV 和平板上使用。

#### 适用场景
- Android TV / 智能电视
- Android 平板
- 大屏设备

#### 配置步骤

1. 在设备上安装 OrionTV
2. 在 OrionTV 中配置后端地址：`http://your-domain:3000`
3. 使用站长账号或普通用户账号登录
4. 播放记录将与网页端、Selene 自动同步

---

## 📜 更新日志

完整的功能更新和 Bug 修复记录请查看 [CHANGELOG](CHANGELOG)。

### 最新版本：v5.5.6 (2025-10-08)

#### 新增功能
- 🎯 片头片尾跳过实时标记按钮：实时标记片头片尾时间点的交互按钮
- 🎮 可拖拽跳过配置悬浮窗：支持触摸操作和位置持久化存储
- 🎬 片尾剩余时间模式跨集数支持：剩余时间模式切换集数正确处理
- 📊 继续观看卡片完结徽章：为所有继续观看部分添加完结徽章
- 🔍 TVBox深度JAR诊断系统：JAR文件头验证和智能健康检查

#### 优化改进
- 📐 可拖拽跳过配置悬浮窗边界限制优化
- 🎨 Zeabur部署指南简化：仅Docker镜像方式
- 📝 Zeabur部署指南KVRocks配置更正：`/var/lib/kvrocks/db`
- 🌐 Zeabur一键部署模板链接更新

#### Bug 修复
- 🔧 original_episodes损坏和无限API请求防护
- 🛡️ 剧集检测时自动original_episodes更新防护
- 🎬 片尾跳过剩余时间模式跨集数修复
- 📊 跳过配置架构重构

### 重大里程碑版本

- **v5.5.0**：用户等级系统、发布日历、非活跃用户清理
- **v5.4.0**：短剧完整功能、播放统计系统
- **v5.3.0**：YouTube 集成、AI 推荐系统、TVBox 安全配置
- **v5.2.0**：ArtPlayer 5.3.0 升级、网盘搜索集成
- **v5.1.0**：Bangumi API、IPTV 功能、虚拟滚动支持
- **v5.0.0**：豆瓣详情引擎重构
- **v4.3.1**：用户注册功能、弹幕系统基础

查看 [完整更新日志](CHANGELOG) 了解所有版本变更。

---

## 🔐 安全与隐私提醒

### ⚠️ 重要安全建议

1. **设置强密码**：使用复杂的 `PASSWORD` 环境变量
2. **关闭公网注册**：在管理后台关闭用户注册功能
3. **仅供个人使用**：请勿公开分享或传播您的实例链接
4. **遵守当地法律**：确保使用行为符合当地法律法规

### 📋 免责声明

- 本项目仅供学习和个人使用
- 请勿用于商业用途或公开服务
- 所有内容来自第三方网站，本站不存储任何视频资源
- 公开分享导致的法律问题，用户需自行承担责任
- 项目开发者不对用户使用行为承担任何法律责任
- **本项目不在中国大陆地区提供服务**，在该地区使用所产生的法律风险及责任属于用户个人行为，与本项目无关

---

## 📄 License

[![CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

本项目采用 [CC BY-NC-SA 4.0 协议](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans) 开源。

**这意味着**：
- ✅ 您可以自由地分享、复制和修改本项目
- ✅ 您必须给予适当的署名，提供指向本许可协议的链接
- ❌ 您不得将本项目用于商业目的
- ⚠️ 若您修改、转换或以本项目为基础进行创作，您必须以相同的许可协议分发您的作品

© 2025 LunaTV Enhanced Edition & Contributors

基于 [MoonTV](https://github.com/MoonTechLab/LunaTV) 进行二次开发。

---

## 🙏 致谢

### 原始项目
- [MoonTV](https://github.com/MoonTechLab/LunaTV) — 项目原始版本
- [Selene](https://github.com/MoonTechLab/Selene) — 官方移动端 APP
- [LibreTV](https://github.com/LibreSpark/LibreTV) — 灵感来源

### 核心依赖
- [Next.js](https://nextjs.org/) — React 框架
- [ArtPlayer](https://github.com/zhw2590582/ArtPlayer) — 强大的网页视频播放器
- [HLS.js](https://github.com/video-dev/hls.js) — HLS 流媒体支持
- [react-window](https://github.com/bvaughn/react-window) — 虚拟滚动组件
- [Tailwind CSS](https://tailwindcss.com/) — CSS 框架

### 数据源与服务
- [豆瓣](https://movie.douban.com/) — 影视信息数据
- [TMDB](https://www.themoviedb.org/) — 电影数据库
- [Bangumi](https://bangumi.tv/) — 动漫信息
- [Zwei](https://github.com/bestzwei) — 豆瓣 CORS 代理
- [CMLiussss](https://github.com/cmliu) — 豆瓣 CDN 服务

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
