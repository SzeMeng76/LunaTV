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

