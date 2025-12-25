# 观影室功能部署指南

观影室功能允许多个用户同步观看视频并实时聊天。本指南将帮助你部署外部观影室服务器。

## 架构说明

观影室功能由两部分组成：

1. **LunaTV 前端**：已集成到本项目中，无需额外部署
2. **观影室服务器**：需要单独部署的 Socket.IO 服务器

**为什么要分离？**

- Vercel 等 Serverless 平台不支持 WebSocket 长连接
- 独立部署更灵活，可选择最佳的服务器平台
- 可选功能，不影响主应用部署

## 服务器源码

观影室服务器开源项目：[watch-room-server](https://github.com/tgs9915/watch-room-server)

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

#### 准备工作

确保服务器已安装 Docker 和 Docker Compose。

#### 部署步骤

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

### 配置说明

- **服务器地址**：必须是完整的 URL，包含协议（http:// 或 https://）
- **认证密钥**：用于验证 LunaTV 客户端身份，防止未授权访问
  - 必须与服务器的 `AUTH_KEY` 环境变量一致
  - 建议使用 32 位以上的随机字符串
  - 可使用在线工具生成：[Random.org](https://www.random.org/strings/)

---

## 功能测试

配置完成后，测试观影室功能：

1. 在 LunaTV 用户菜单中找到"观影室"入口
2. 设置你的昵称
3. 创建一个测试房间
4. 使用另一个浏览器或设备加入该房间
5. 测试聊天功能是否正常

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

### 5. 视频同步功能何时实现？

当前版本的观影室支持：
- ✅ 创建/加入房间
- ✅ 实时聊天
- ✅ 成员列表
- ⏳ 视频同步播放（占位符，将在后续版本实现）

### 6. 支持语音聊天吗？

观影室服务器已包含 WebRTC 语音聊天的基础设施，但 LunaTV 前端尚未集成此功能。将在后续版本中实现。

### 7. 如何更新服务器？

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

### 8. 服务器日志在哪里？

- **Fly.io**: `flyctl logs`
- **Railway**: 项目 Dashboard → Deployments → 点击部署 → Logs
- **Docker**: `docker-compose logs -f`
- **PM2**: `pm2 logs watch-room-server`

---

## 安全建议

1. **使用 HTTPS**：确保服务器使用 HTTPS（Fly.io 和 Railway 默认提供）
2. **强密码 AUTH_KEY**：使用 32 位以上随机字符串
3. **定期更新**：关注 watch-room-server 仓库的更新
4. **监控资源**：定期检查服务器资源使用情况
5. **备份配置**：妥善保存 AUTH_KEY 等配置信息

---

## 技术支持

- **观影室服务器问题**：在 [watch-room-server](https://github.com/tgs9915/watch-room-server/issues) 提交 Issue
- **LunaTV 集成问题**：在 LunaTV 项目仓库提交 Issue

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

## 许可证

观影室服务器遵循其原项目的开源许可证，请参考 [watch-room-server](https://github.com/tgs9915/watch-room-server) 仓库。
