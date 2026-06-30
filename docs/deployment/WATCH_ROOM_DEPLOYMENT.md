# 观影室功能部署指南

观影室功能允许多个用户同步观看视频、实时聊天和语音通话。本指南将帮助你部署外部观影室服务器。

## 功能特性

✅ **多人同步观影**
- 播放/暂停/跳转实时同步
- 房主控制播放进度，成员自动跟随
- 切换视频/剧集时自动提示成员

✅ **屏幕共享观影**
- WebRTC 实时屏幕共享传输
- 支持三种画质预设（流畅 720p/15fps、高清 1080p/30fps、超清 1440p/30fps）
- 实时状态监控（共享时长、观看人数、连接状态）
- 自动成员连接处理，新成员加入自动接收画面
- 全屏沉浸式界面，支持明暗主题切换

✅ **实时聊天系统**
- 文字消息即时发送
- 表情符号支持
- 未读消息提示

✅ **WebRTC 语音通话**
- P2P 点对点语音连接
- 回声消除和噪音抑制
- 独立的麦克风/扬声器控制

✅ **房间管理**
- 公开/私密房间
- 密码保护
- 房主/成员权限管理
- 房间列表实时更新
- 支持视频同步和屏幕共享两种房间类型

✅ **连接状态监控**
- 实时连接状态显示
- 服务器统计信息
- 心跳检测机制

---

## 新增功能特性

本节记录了最近新增和优化的观影室功能。

### 🎥 屏幕共享观影室（v6.4.0）

**功能概述**
- 房主可以共享浏览器标签页或整个屏幕给房间成员观看
- 基于 WebRTC 技术实现低延迟实时传输
- 支持多种画质预设，适应不同网络环境
- 全屏沉浸式界面设计，支持明暗主题

**画质预设**
- **流畅模式**：720p / 15fps - 适合网络较差环境
- **高清模式**：1080p / 30fps - 平衡画质和性能
- **超清模式**：1440p / 30fps - 最佳画质体验

**实时状态监控**
- 共享时长计时器
- 观看人数实时显示
- 连接状态指示（已连接/未连接）
- 实际采集参数显示（分辨率、帧率）

**自动成员管理**
- 新成员加入时自动建立 WebRTC 连接
- 成员离开时自动清理连接资源
- 支持多人同时观看（理论无上限）

**使用场景**
- 共享视频网站内容（YouTube、Netflix 等）
- 演示教程和操作步骤
- 远程协作和会议
- 游戏直播和实况

**技术实现**
- 使用 `getDisplayMedia` API 捕获屏幕
- WebRTC PeerConnection 建立 P2P 连接
- Socket.IO 信令服务器协调连接建立
- 自动 ICE 候选交换和 SDP 协商

**浏览器要求**
- 房主：需要支持 `getDisplayMedia` 的现代浏览器（Chrome、Edge、Firefox）
- 成员：需要支持 WebRTC 的浏览器
- 必须在 HTTPS 或 localhost 环境下使用

### 🎯 智能播放同步

**同剧集切换优化**
- 房主切换同一部剧的不同集数时，成员无需刷新页面即可自动跟随
- 使用 `setCurrentEpisodeIndex` 直接切换集数，保持 WebSocket 连接
- 自动跳转到房主的播放时间点（1秒延迟确保集数加载完成）
- 保持房间状态，避免重复加入房间

**跨剧集智能跳转**
- 房主切换到不同影片时，使用客户端路由（`router.push`）
- 避免 `window.location.href` 导致的页面刷新和 WebSocket 断连
- 自动携带播放时间、集数等参数，实现无缝切换
- 成员收到弹窗提示，可选择"跟随房主"或"自由观看"

**技术实现**
```typescript
// 同一部剧：直接切换集数
if (isSameShow) {
  setCurrentEpisodeIndex(state.episode);
  setTimeout(() => artPlayer.currentTime = state.currentTime, 1000);
}
// 不同剧：客户端路由跳转
else {
  router.push(`/play?${params.toString()}`);
}
```

### 📺 正在观看显示

**房间信息面板增强**
- 创建/加入房间后可查看当前正在观看的影片
- 使用迷你视频卡片展示：
  - 海报缩略图（64x96px）
  - 影片标题
  - 年份信息
  - 集数信息（TV剧）
  - 播放图标覆层
- 点击视频卡片可直接跳转到播放页面并同步进度
- 自动携带房主的当前播放时间，实现时间同步

**房间列表增强**
- 房间列表中展示各房间正在观看的内容
- 完整的图片处理和占位符支持
- 图片加载失败时显示默认占位符（SVG）
- 点击视频卡片跳转到播放页面（不携带时间参数，因为用户尚未加入房间）

**MiniVideoCard 组件**
- 专门为观影室设计的紧凑型视频卡片
- 响应式设计，支持深色模式
- 悬停效果提升用户体验
- 使用 Next.js Image 组件优化图片加载
- `referrerPolicy="no-referrer"` 解决跨域图片问题

### 🎬 集数显示优化

**智能判断逻辑**
- 根据 `totalEpisodes` 字段自动判断是否显示集数信息
- **电影**（totalEpisodes = 1）：不显示"第1集"
- **电视剧**（totalEpisodes > 1）：显示"第X集"
- 避免电影显示不必要的集数信息，提升用户体验

**实现细节**
- 在整个状态链中传递 `totalEpisodes` 字段：
  - `PlayState` 接口
  - `OwnerPlayState` 接口
  - 所有 Socket.IO 事件广播
  - `MiniVideoCard` 组件
- 从影片详情中自动提取：`detail?.episodes?.length`

**显示逻辑**
```typescript
{totalEpisodes && totalEpisodes > 1 && episode !== undefined && (
  <span>第 {episode + 1} 集</span>
)}
```

### 👤 用户名识别改进

**问题背景**
- Cookie 在浏览器中异步加载，首次加载时可能未准备好
- 导致用户加入房间时显示为"游客"而非真实用户名
- 用户需要手动刷新页面才能显示正确用户名

**解决方案：持续轮询检测**
- 使用 `setInterval` 持续检查 Cookie 是否加载完成
- 最多检查 20 次，每次间隔 500ms（总计 10 秒）
- 成功获取用户名后立即停止检查
- 达到最大次数后停止，避免无限循环

**实现代码**
```typescript
const checkUsername = () => {
  const authInfo = getAuthInfoFromBrowserCookie();
  const username = authInfo?.username || '游客';

  if (username !== '游客') {
    setCurrentUserName(username);
    setUserNameLoaded(true);
    if (intervalId) clearInterval(intervalId);
  } else if (checkCount >= maxChecks) {
    setCurrentUserName('游客');
    setUserNameLoaded(true);
    if (intervalId) clearInterval(intervalId);
  }
};
```

**用户体验提升**
- 首次加载即可正确显示用户名（无需刷新）
- 成员列表中显示真实用户名
- 聊天消息显示正确的发送者名称

### 🔄 房主本地状态同步

**问题背景**
- WebSocket 服务器不会将事件回传给发送者（sender）
- 房主发送播放状态更新后，自己的房间信息面板不会更新
- 导致房主看不到自己正在播放的视频，但成员可以看到

**解决方案**
- 房主发送 Socket.IO 事件时，同时更新本地状态
- 在 `updatePlayState`、`changeVideo`、`clearState` 等方法中添加本地更新

**实现代码**
```typescript
const updatePlayState = useCallback((state: PlayState) => {
  if (socket && connected) {
    socket.emit('play:update', state);
    // ✅ 本地更新，因为服务器不会回传给发送者
    setCurrentRoom((prev) => prev ? { ...prev, currentState: state } : null);
  }
}, [socket, connected]);
```

**保持一致性**
- 房主和成员看到相同的房间状态
- 房间信息面板实时显示正在播放的内容
- 所有用户都能通过房间信息快速跳转到当前影片

### 🐛 关键 Bug 修复

**状态更新缺失（Critical）**
- **问题**：`useWatchRoom.ts` 中的事件监听器只记录日志，从未更新状态
- **影响**：房间信息面板、房间列表等所有依赖 `currentRoom.currentState` 的功能全部失效
- **修复**：在所有事件监听器中添加 `setCurrentRoom` 调用
```typescript
socket.on('play:update', (state: PlayState) => {
  console.log('[WatchRoom] Play state updated:', state);
  setCurrentRoom((prev) => prev ? { ...prev, currentState: state } : null);
});
```

**房间列表时间同步逻辑错误**
- **问题**：用户未加入房间时，点击房间列表的视频卡片也会携带时间参数同步播放进度
- **影响**：逻辑不合理，用户应该从头开始观看，而非跳转到房主的时间点
- **修复**：房间列表导航时不携带 `t`（时间）和 `prefer` 参数，仅房间信息面板内的跳转才携带

**类型字段名称错误**
- **问题**：使用了旧的字段名 `vod_name`、`vod_year` 而非 `SearchResult` 接口的 `title`、`year`
- **影响**：TypeScript 编译失败
- **修复**：统一使用正确的字段名称

### 📝 代码改进

**新增文件**
- `src/components/watch-room/MiniVideoCard.tsx` - 迷你视频卡片组件

**修改文件**
- `src/types/watch-room.types.ts` - 添加 `totalEpisodes` 字段
- `src/hooks/useWatchRoom.ts` - 修复事件监听器状态更新，添加房主本地更新
- `src/app/play/hooks/useWatchRoomSync.ts` - 实现智能导航逻辑，添加 `totalEpisodes` 传递
- `src/components/WatchRoomProvider.tsx` - 实现用户名持续检测机制
- `src/components/watch-room/ChatFloatingWindow.tsx` - 使用 MiniVideoCard，添加 `totalEpisodes`
- `src/app/watch-room/page.tsx` - 使用 MiniVideoCard，修复房间列表逻辑
- `src/app/play/page.tsx` - 修复字段名称，添加 `setCurrentEpisodeIndex` 参数

**关键技术决策**
- 使用 `router.push` 而非 `window.location.href` 保持 WebSocket 连接
- 使用 `setInterval` 而非 `setTimeout` 实现持续检测
- 在发送端添加本地状态更新以解决服务器不回传问题
- 根据 `totalEpisodes` 条件渲染集数信息

---

## 架构说明

观影室功能由两部分组成：

1. **LunaTV 前端**：已集成到本项目中，无需额外部署
2. **观影室服务器**：需要单独部署的 Socket.IO 服务器

**为什么要分离？**

- Vercel 等 Serverless 平台不支持 WebSocket 长连接
- 独立部署更灵活，可选择最佳的服务器平台
- 可选功能，不影响主应用部署

---

## 服务器源码

观影室服务器开源项目：[watch-room-server](https://github.com/tgs9915/watch-room-server)

**多平台 Docker 镜像**：`ghcr.io/szemeng76/watch-room-server:latest`
（支持 linux/amd64 和 linux/arm64 架构，可在 x86 和 ARM 设备上原生运行）

---

## 部署选项

### 选项 1：Fly.io 免费部署（推荐）

Fly.io 提供免费额度，适合小规模使用。

#### 准备工作

1. 注册 [Fly.io 账号](https://fly.io/app/sign-up)
2. 安装 Fly CLI：
   ```bash
   # macOS/Linux
   curl -L https://fly.io/install.sh | sh

   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

3. 登录 Fly.io：
   ```bash
   flyctl auth login
   ```

#### 部署步骤

1. 克隆观影室服务器代码：
   ```bash
   git clone https://github.com/tgs9915/watch-room-server.git
   cd watch-room-server
   ```

2. 创建 `fly.toml` 配置文件：
   ```toml
   app = "your-watch-room-server"  # 修改为你的应用名称（全局唯一）

   [build]
   dockerfile = "Dockerfile"

   [env]
   PORT = "8080"
   AUTH_KEY = "your-secure-random-key-here"  # 修改为强密码

   [[services]]
   internal_port = 8080
   protocol = "tcp"

   [[services.ports]]
   handlers = ["http"]
   port = 80

   [[services.ports]]
   handlers = ["tls", "http"]
   port = 443
   ```

3. 部署到 Fly.io：
   ```bash
   flyctl launch --no-deploy  # 创建应用
   flyctl deploy              # 部署应用
   ```

4. 获取应用 URL：
   ```bash
   flyctl info
   ```

   你的服务器地址将类似于：`https://your-watch-room-server.fly.dev`

#### Fly.io 管理命令

```bash
# 查看日志
flyctl logs

# 查看应用状态
flyctl status

# 重启应用
flyctl restart

# 销毁应用
flyctl destroy your-watch-room-server
```

---

### 选项 2：Railway 部署

Railway 提供简单的部署体验，有一定免费额度。

#### 部署步骤

1. 访问 [Railway](https://railway.app/) 并登录
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 授权访问你 fork 的 `watch-room-server` 仓库
4. 选择仓库后，Railway 会自动检测并开始部署
5. 在 "Variables" 标签页添加环境变量：
   - `AUTH_KEY`: 设置为强密码（必需）
   - `PORT`: 8080（可选，默认 8080）
6. 部署完成后，在 "Settings" → "Networking" 中生成公开域名
7. 复制域名地址（例如：`https://your-app.railway.app`）

---

### 选项 3：Docker 部署

适合自有服务器或 VPS。

#### 使用预构建镜像（推荐）

使用多平台镜像，无需编译：

```bash
# 拉取镜像
docker pull ghcr.io/szemeng76/watch-room-server:latest

# 运行容器
docker run -d \
  --name watch-room-server \
  --restart unless-stopped \
  -p 8080:8080 \
  -e AUTH_KEY=your-secure-random-key-here \
  -e PORT=8080 \
  ghcr.io/szemeng76/watch-room-server:latest

# 查看日志
docker logs -f watch-room-server
```

或使用 Docker Compose，创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  watch-room-server:
    image: ghcr.io/szemeng76/watch-room-server:latest
    container_name: watch-room-server
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - AUTH_KEY=your-secure-random-key-here
      - PORT=8080
```

然后运行：

```bash
docker-compose up -d
docker-compose logs -f
```

#### 从源码构建（可选）

如果需要自定义修改：

1. 克隆服务器代码：
   ```bash
   git clone https://github.com/tgs9915/watch-room-server.git
   cd watch-room-server
   ```

2. 创建 `.env` 文件：
   ```env
   AUTH_KEY=your-secure-random-key-here
   PORT=8080
   ```

3. 使用 Docker Compose 部署：
   ```bash
   docker-compose up -d
   ```

4. 查看运行状态：
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

5. 配置反向代理（可选，推荐）：

   **Nginx 配置示例：**
   ```nginx
   server {
       listen 443 ssl http2;
       server_name watch-room.yourdomain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

---

### 选项 4：直接在 VPS 上运行

适合有 Node.js 环境的 VPS。

#### 部署步骤

1. 确保服务器已安装 Node.js 18+：
   ```bash
   node --version
   ```

2. 克隆代码并安装依赖：
   ```bash
   git clone https://github.com/tgs9915/watch-room-server.git
   cd watch-room-server
   npm install
   ```

3. 创建 `.env` 文件：
   ```env
   AUTH_KEY=your-secure-random-key-here
   PORT=8080
   ```

4. 构建并运行：
   ```bash
   npm run build
   npm start
   ```

5. 使用 PM2 守护进程（推荐）：
   ```bash
   # 安装 PM2
   npm install -g pm2

   # 启动服务
   pm2 start npm --name "watch-room-server" -- start

   # 设置开机自启
   pm2 startup
   pm2 save

   # 查看日志
   pm2 logs watch-room-server

   # 重启服务
   pm2 restart watch-room-server
   ```

---

## LunaTV 配置

部署完观影室服务器后，需要在 LunaTV 管理后台配置：

1. 登录 LunaTV 管理后台（需要 owner 或 admin 权限）
2. 进入"观影室配置"标签页
3. 填写配置信息：
   - **启用观影室功能**：勾选此选项
   - **服务器地址**：填写你部署的服务器 URL（例如：`https://your-watch-room-server.fly.dev`）
   - **认证密钥**：填写与服务器 `AUTH_KEY` 相同的密钥
4. 点击"测试连接"验证配置
5. 点击"保存配置"
6. 查看"服务器统计信息"确认连接成功

### 配置说明

- **服务器地址**：必须是完整的 URL，包含协议（http:// 或 https://）
- **认证密钥**：用于验证 LunaTV 客户端身份，防止未授权访问
  - 必须与服务器的 `AUTH_KEY` 环境变量一致
  - 建议使用 32 位以上的随机字符串
  - 可使用在线工具生成：[Random.org](https://www.random.org/strings/)

### ⚠️ 多站点共享警告

**重要提示**：如果多个 LunaTV 站点使用同一个观影室服务器：

- ✅ 所有站点将共享同一个房间池
- ✅ 站点A创建的房间，站点B的用户也能看到和加入
- ⚠️ 可能导致用户困惑和体验问题
- 💡 **建议**：每个站点使用独立的观影室服务器
- 💡 如需跨站点观影，可有意共用服务器，但需在房间名称中注明站点

---

## 功能测试

配置完成后，测试观影室全部功能：

### 1. 房间管理测试

1. 在 LunaTV 导航栏找到"观影室"入口
2. 查看连接状态指示器（应显示"已连接"）
3. 创建一个测试房间：
   - 填写房间名称
   - 可选：设置房间密码
   - 选择公开/私密
4. 检查房间创建成功，显示房间号和成员列表
5. 使用另一个浏览器/设备加入该房间

### 2. 聊天功能测试

1. 在房间内点击聊天按钮（绿色气泡图标）
2. 发送文字消息，验证实时传送
3. 测试表情符号发送
4. 关闭聊天窗口，查看未读消息提示

### 3. 同步播放测试

1. 两个用户都进入播放页面（播放任意视频）
2. **房主操作**：
   - 点击播放 → 成员应自动播放
   - 点击暂停 → 成员应自动暂停
   - 拖动进度条 → 成员应跳转到相同时间
   - 切换集数 → 成员收到弹窗提示
3. **成员验证**：
   - 播放器自动响应房主操作
   - 打开浏览器控制台查看同步日志

### 4. 语音通话测试

1. 在聊天窗口中点击麦克风按钮
2. 浏览器请求麦克风权限，点击允许
3. 另一用户也打开麦克风
4. 验证双方能听到对方声音
5. 测试扬声器静音/开启功能

### 5. 房间管理测试

1. 点击房间信息按钮（蓝色 i 图标）
2. 查看房间详情和成员列表
3. 测试"退出房间"/"解散房间"功能
4. 验证房主解散后所有成员被踢出

---

## 常见问题

### 1. 连接失败怎么办？

**检查清单：**

- 服务器是否正常运行？（访问 `https://your-server-url/health` 应返回 `{"status":"ok"}`）
- LunaTV 配置的服务器地址是否正确？
- LunaTV 配置的 AUTH_KEY 是否与服务器一致？
- 服务器防火墙是否开放了相应端口？
- 浏览器控制台是否有 CORS 错误？

### 2. AUTH_KEY 是什么？

AUTH_KEY 是观影室服务器的认证密钥，用于验证客户端身份。这是**必需**的配置项，服务器没有此环境变量将无法启动。

**如何设置：**

- Fly.io：在 `fly.toml` 的 `[env]` 部分设置
- Railway：在项目的 Variables 标签页添加
- Docker：在 `.env` 文件中设置
- VPS：在 `.env` 文件中设置

### 3. 如何生成安全的 AUTH_KEY？

推荐方式：

```bash
# Linux/macOS
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4. Fly.io 免费额度够用吗？

Fly.io 免费额度包括：
- 3 个共享 CPU VM（256MB RAM）
- 3GB 持久化存储
- 160GB 出站流量/月

对于小规模使用（< 10 人同时在线）完全足够。

### 5. 播放同步不工作怎么办？

**调试步骤：**

1. 打开浏览器控制台（F12）
2. 查找 `[PlaySync]` 日志
3. 确认房主端看到：`Setting up player event listeners`
4. 确认成员端看到：`Received play:play/pause/seek event`
5. 如果没有日志：
   - 检查是否在播放页面
   - 检查播放器是否已加载（`playerReady=true`）
   - 刷新页面重试

### 6. 语音通话听不到声音？

**可能原因：**

- 麦克风权限未授予 → 在浏览器设置中允许
- 扬声器被静音 → 点击扬声器按钮开启
- 网络 NAT 穿透失败 → STUN 服务器可能被墙，考虑使用 VPN
- 浏览器不支持 WebRTC → 使用 Chrome/Edge/Firefox

### 7. 房间数据会丢失吗？

**是的**，房间数据存储在服务器内存中：

- 服务器重启 = 所有房间清空
- Vercel 重新部署 LunaTV = 不影响服务器（数据保留）
- 观影室服务器重新部署 = 所有房间清空

这是设计行为，观影室是临时会话功能。

### 8. 如何更新服务器？

**Fly.io：**
```bash
cd watch-room-server
git pull
flyctl deploy
```

**Railway：**
- 推送代码到 GitHub，Railway 会自动重新部署

**Docker：**
```bash
cd watch-room-server
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

**VPS (PM2)：**
```bash
cd watch-room-server
git pull
npm install
npm run build
pm2 restart watch-room-server
```

### 9. 服务器日志在哪里？

- **Fly.io**: `flyctl logs`
- **Railway**: 项目 Dashboard → Deployments → 点击部署 → Logs
- **Docker**: `docker-compose logs -f`
- **PM2**: `pm2 logs watch-room-server`

### 10. 可以在播放页面外使用观影室吗？

当前实现中，播放同步功能需要在播放页面使用。但聊天和语音功能理论上可以在任何页面使用（通过悬浮窗）。

---

## 安全建议

1. **使用 HTTPS**：确保服务器使用 HTTPS（Fly.io 和 Railway 默认提供）
2. **强密码 AUTH_KEY**：使用 32 位以上随机字符串
3. **定期更新**：关注 watch-room-server 仓库的更新
4. **监控资源**：定期检查服务器资源使用情况
5. **备份配置**：妥善保存 AUTH_KEY 等配置信息
6. **独立部署**：每个 LunaTV 站点使用独立的服务器（避免房间混淆）

---

## 技术架构

### 前端实现

- **框架**：React + Next.js 16.1.0
- **Socket.IO 客户端**：实时通信
- **ArtPlayer 集成**：播放器事件监听
- **WebRTC**：P2P 语音连接
- **状态管理**：React Context API

### 后端实现

- **Socket.IO 服务器**：WebSocket 长连接
- **内存存储**：房间和成员数据
- **JWT 认证**：AUTH_KEY 验证
- **心跳检测**：自动清理失效连接

### 同步机制

```
房主操作 → ArtPlayer事件 → Socket.IO发送 → 服务器广播 → 成员接收 → 控制播放器
```

**防止循环广播：**
- `isHandlingRemoteCommandRef` 标志位
- 远程命令触发的事件不再广播

**定期同步：**
- 每5秒广播一次播放状态
- 确保长时间播放不会失去同步

---

## 卸载说明

### 移除 LunaTV 观影室功能

在管理后台取消勾选"启用观影室功能"即可。用户菜单中的观影室入口会自动隐藏。

### 销毁服务器

- **Fly.io**: `flyctl destroy your-app-name`
- **Railway**: 在项目设置中点击 "Delete Project"
- **Docker**: `docker-compose down -v`
- **PM2**: `pm2 delete watch-room-server`

---

## 致谢与引用

LunaTV 的观影室功能基于以下开源项目开发：

### 核心依赖

- **[watch-room-server](https://github.com/tgs9915/watch-room-server)** - 外部 Socket.IO 观影室服务器
  - 提供房间管理、实时通信、WebRTC 信令等基础设施
  - 作者：[@tgs9915](https://github.com/tgs9915)
  - 许可证：MIT

### 参考实现

- **[MoonTVPlus](https://github.com/mtvpls/MoonTVPlus)** - 同步播放功能参考
  - 我们的播放同步实现参考了 MoonTVPlus 的 `usePlaySync` hook 设计
  - 感谢 MoonTVPlus 团队提供的优秀实现思路
  - 作者：[@mtvpls](https://github.com/mtvpls)

### 技术栈

- **Socket.IO** - WebSocket 实时通信库
- **WebRTC** - P2P 实时音视频通信
- **ArtPlayer** - HTML5 视频播放器
- **React** - 前端框架

感谢所有开源贡献者的付出！🙏

---

## 许可证

- LunaTV 观影室前端代码遵循 LunaTV 项目许可证
- 观影室服务器遵循 [watch-room-server](https://github.com/tgs9915/watch-room-server) 的 MIT 许可证

---

## 技术支持

- **观影室服务器问题**：在 [watch-room-server](https://github.com/tgs9915/watch-room-server/issues) 提交 Issue
- **LunaTV 集成问题**：在 LunaTV 项目仓库提交 Issue
- **功能建议**：欢迎提交 Feature Request

---

**享受与朋友一起观影的乐趣！** 🎬🍿
