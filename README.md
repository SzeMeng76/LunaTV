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
![HLS.js](https://img.shields.io/badge/HLS.js-1.6.15-ec407a)
![License](https://img.shields.io/badge/License-MIT-green)
![Docker Ready](https://img.shields.io/badge/Docker-ready-blue?logo=docker)
![Version](https://img.shields.io/badge/Version-6.3.0-orange)

</div>

---

## 📢 项目说明

本项目是在 **MoonTV** 基础上进行的深度二次开发版本，从 **v4.3.1** 版本开始，持续迭代至当前 **v6.3.0**，累计新增 60+ 重大功能模块，400+ 细节优化。所有新增功能详见 [CHANGELOG](CHANGELOG)。

## ⚠️ 重要声明

本项目仅供学习交流使用，请勿用于商业用途。所有视频内容均来自第三方平台，本项目不存储任何视频文件。使用本项目产生的任何法律责任由使用者自行承担。

## 💡 核心增强亮点

### 🎥 内容生态扩展
- **Emby 私有库**：完整的 Emby 媒体服务器集成，支持免密登录、认证模式切换和多音轨播放 → [详细文档](docs/integration/EMBY_GUIDE.md)
- **YouTube 集成**：完整的 YouTube 搜索、播放、直播功能
- **网盘搜索**：集成高级筛选和缓存管理的网盘资源搜索
- **ACG 种子搜索**：Mikan Project 双源系统，丰富的动漫资源
- **IPTV 直播**：m3u/m3u8 订阅、FLV 直播流、EPG 节目单
- **Bangumi 动漫**：动漫信息智能检测、API 集成
- **繁体中文搜索**：智能繁简转换、多策略搜索
- **搜索列表视图**：支持列表/网格双视图模式切换，列表模式带图片预览和快捷播放

### 🎬 播放器增强
- **超宽显示器适配**：视频显示模式控制，完美支持超宽显示器
- **片头片尾跳过预设**：灵活的片头片尾模板系统，支持导入导出和验证
- **播放速率持久化**：记住播放速率设置，跨会话保持
- **多音轨支持**：Emby 播放自动选择浏览器兼容音轨，支持音轨切换

### 🔔 内容追踪系统
- **即将上映提醒**：完整的即将上映内容关注列表和提醒系统
- **自动发布通知**：收藏内容发布时自动推送通知
- **邀请码系统**：支持邀请码注册、历史记录和管理功能

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
- **视频播放**：ArtPlayer 5.4.0 + HLS.js 1.6.15
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


