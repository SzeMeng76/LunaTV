## 🚀 部署

### 💻 最低配置要求

为确保流畅运行，建议服务器满足以下最低配置：

#### Docker 自托管部署
- **CPU**: 2 核心（推荐 4 核心）
- **内存**: 2GB RAM（推荐 4GB）
- **存储**: 10GB 可用空间（推荐 20GB，用于视频缓存和数据库）
- **网络**: 10Mbps 上行带宽（推荐 100Mbps）

#### Vercel / Render / EdgeOne 云端部署
- **无需自备服务器**：平台自动分配资源
- **Vercel**: 无服务器架构，按需自动扩容
- **Render**: 免费版提供 750 小时/月运行时间，适合个人项目
- **EdgeOne Pages**: 腾讯云边缘计算，国内访问友好

#### ⚠️ 常见卡顿原因
- ❌ **CPU 不足**：单核或低频 CPU 会导致视频转码和搜索缓慢
- ❌ **内存不足**：少于 2GB 内存会导致频繁 OOM（内存溢出）
- ❌ **网络带宽低**：上行带宽低于 5Mbps 会导致视频播放卡顿
- ❌ **磁盘 I/O 慢**：使用机械硬盘会影响数据库和缓存性能

**💡 提示**：如果遇到卡顿问题，请先检查服务器配置是否满足最低要求！

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

3. **修改配置**
   - 修改 `PASSWORD` 为强密码
   - （可选）修改 `SITE_BASE` 为您的访问地址

4. **启动服务**
   - 点击 "启动" 或 "部署" 按钮
   - 等待容器启动完成

5. **访问应用**
   - 浏览器访问：`http://飞牛OS的IP:3000`
   - 使用设置的管理员账号登录

#### 部署方式二：SSH 命令行部署

```bash
# SSH 登录到飞牛OS
ssh root@飞牛OS的IP

# 创建项目目录
mkdir -p /volume1/docker/lunatv
cd /volume1/docker/lunatv

# 创建 docker-compose.yml 文件
nano docker-compose.yml
# 将 Kvrocks 配置粘贴进去，保存退出

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

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
your-space/
├── README.md      # 包含 YAML 元数据
└── Dockerfile     # FROM ghcr.io/szemeng76/lunatv:latest
```

#### ✨ Hugging Face Space 优势

- ✅ **完全免费**：2 核 CPU、16GB 内存、50GB 存储
- ✅ **无需服务器**：托管在 HF 云端
- ✅ **自动 HTTPS**：自带 SSL 证书
- ✅ **简单部署**：只需两个文件
- ✅ **使用官方镜像**：无需构建，直接拉取

#### ⚠️ Hugging Face Space 注意事项

- **无持久化存储**：必须使用 Upstash 等外部数据库存储数据
- **冷启动**：长时间无访问后首次访问较慢（约 30-60 秒）
- **48小时休眠**：免费版 48 小时无访问会自动休眠，再次访问会重新启动
- **公开仓库**：Space 仓库默认公开，Secrets 除外
- **流量限制**：免费版有一定流量限制，个人使用足够

#### 🔗 相关链接

- [Hugging Face Spaces 文档](https://huggingface.co/docs/hub/spaces)
- [Docker Spaces 文档](https://huggingface.co/docs/hub/spaces-sdks-docker)
- [Upstash 免费 Redis](https://upstash.com/)

---

### 🌐 EdgeOne Pages 部署（免费）

[EdgeOne Pages](https://edgeone.ai/products/pages) 是腾讯云提供的边缘计算平台，类似于 Vercel，支持 Next.js SSR/SSG/ISR 部署，适合国内用户访问。

#### 部署步骤

1. **准备工作**
   - 注册 [EdgeOne](https://edgeone.ai/) 账号
   - 在 [Upstash](https://upstash.com/) 创建 Redis 实例（EdgeOne Pages 无持久化存储）
   - Fork 本项目到你的 GitHub/GitLab 账号

2. **创建 Pages 项目**
   - 登录 EdgeOne 控制台
   - 进入 "Pages" > "创建项目"
   - 选择 "连接 Git 仓库"
   - 授权并选择你 Fork 的 LunaTV 仓库

3. **配置构建设置**
   - **框架预设**：选择 `Next.js`
   - **构建命令**：`pnpm build`（或保持默认）
   - **输出目录**：`.next`（默认）
   - **Node.js 版本**：`20`（推荐）

4. **配置环境变量**

   在项目设置中添加以下环境变量：

   ```env
   # 必填：管理员账号
   USERNAME=admin
   PASSWORD=your_secure_password

   # 必填：存储配置（必须使用 Upstash）
   NEXT_PUBLIC_STORAGE_TYPE=upstash
   UPSTASH_URL=https://your-redis-instance.upstash.io
   UPSTASH_TOKEN=AxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==

   # 推荐：禁用首页预告片（无持久化存储平台建议开启）
   DISABLE_HERO_TRAILER=true

   # 可选：站点配置
   SITE_BASE=https://your-project.edgeone.app
   NEXT_PUBLIC_SITE_NAME=LunaTV Enhanced

   # 可选：豆瓣代理配置（推荐）
   NEXT_PUBLIC_DOUBAN_PROXY_TYPE=cmliussss-cdn-tencent
   NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE=cmliussss-cdn-tencent
   ```

5. **部署项目**
   - 点击 "部署" 按钮
   - 等待构建完成（首次约 3-5 分钟）
   - 部署成功后会分配 `xxx.edgeone.app` 域名

6. **绑定自定义域名（可选）**
   - 在项目设置中点击 "域名"
   - 添加自定义域名并配置 DNS 解析

#### ✨ EdgeOne Pages 优势

- ✅ **国内访问友好**：腾讯云边缘节点，国内访问速度快
- ✅ **免费额度充足**：每月 300 万 Edge Functions 请求、100 万 Cloud Functions 请求、500 次构建、流量无限制
- ✅ **自动 HTTPS**：免费 SSL 证书
- ✅ **Git 自动部署**：推送代码自动触发构建
- ✅ **支持 Next.js SSR**：完整支持服务端渲染

#### ⚠️ EdgeOne Pages 注意事项

- **`.nvmrc` 文件冲突**：项目根目录的 `.nvmrc` 文件可能导致 EdgeOne 构建失败，需要删除该文件或将其中的版本号修改为 EdgeOne 支持的版本后才能成功部署
- **无 Docker 支持**：EdgeOne Pages 是无服务器平台，仅支持源码构建部署
- **必须使用 Upstash**：无持久化文件系统，需要外部数据库
- **函数执行限制**：单次请求有执行时间限制（通常 30 秒）
- **不支持视频缓存**：无本地文件系统，视频缓存功能不可用
- **构建资源限制**：免费版构建时间和内存有限制

#### 🔗 相关链接

- [EdgeOne Pages 免费额度](https://pages.edgeone.ai/pricing)
- [EdgeOne Pages 文档（国际区）](https://edgeone.ai/zh/document/160427672961769472)
- [EdgeOne Pages 文档（中国区）](https://cloud.tencent.com/document/product/1552/127366)
- [Upstash 免费 Redis](https://upstash.com/)

---

### ▲ Vercel 部署

[Vercel](https://vercel.com/) 是 Next.js 官方推荐的部署平台，无服务器架构，自动扩容，适合全球用户访问。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/SzeMeng76/LunaTV)

#### 部署步骤

1. **准备工作**
   - 注册 [Vercel](https://vercel.com/) 账号
   - 在 [Upstash](https://upstash.com/) 创建 Redis 实例（Vercel 无持久化存储）
   - Fork 本项目到你的 GitHub 账号

2. **导入项目**
   - 登录 Vercel 控制台
   - 点击 "Add New..." > "Project"
   - 选择你 Fork 的 LunaTV 仓库并导入

3. **配置构建设置**
   - **Framework Preset**：`Next.js`（自动检测）
   - **Build Command**：`pnpm build`（默认）
   - **Output Directory**：`.next`（默认）
   - **Install Command**：`pnpm install`（默认）

4. **配置环境变量**

   在项目 Settings > Environment Variables 中添加：

   ```env
   # 必填：管理员账号
   USERNAME=admin
   PASSWORD=your_secure_password

   # 必填：存储配置（必须使用 Upstash）
   NEXT_PUBLIC_STORAGE_TYPE=upstash
   UPSTASH_URL=https://your-redis-instance.upstash.io
   UPSTASH_TOKEN=AxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==

   # 推荐：禁用首页预告片（无持久化存储平台建议开启）
   DISABLE_HERO_TRAILER=true

   # 可选：站点配置
   SITE_BASE=https://your-project.vercel.app
   NEXT_PUBLIC_SITE_NAME=LunaTV Enhanced
   ```

5. **部署项目**
   - 点击 "Deploy"
   - 等待构建完成（首次约 3-5 分钟）
   - 部署成功后会分配 `xxx.vercel.app` 域名

6. **绑定自定义域名（可选）**
   - 在项目 Settings > Domains 中添加自定义域名
   - 按提示配置 DNS 记录

#### ✨ Vercel 部署优势

- ✅ **Next.js 官方平台**：最佳兼容性和性能优化
- ✅ **自动 HTTPS**：免费 SSL 证书
- ✅ **全球 CDN**：Edge Network 全球加速
- ✅ **Git 自动部署**：推送代码自动触发构建
- ✅ **无服务器架构**：按需自动扩容，无需管理服务器
- ✅ **预览部署**：每个 PR 自动生成预览环境

#### ⚠️ Vercel 注意事项

- **必须使用 Upstash**：无持久化文件系统，需要外部数据库
- **函数执行限制**：Hobby 计划 Serverless Functions 执行时间限制 60 秒
- **不支持视频缓存**：无本地文件系统，视频缓存功能不可用
- **带宽限制**：Hobby 计划每月 100GB 带宽
- **国内访问**：部分地区可能需要自定义域名优化访问

---

### 🟢 Render 部署（免费）

[Render](https://render.com/) 提供免费的 Web Service 托管，支持 Docker 部署，适合个人项目。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/SzeMeng76/LunaTV)

#### 方式一：Docker 部署（推荐）

1. **准备工作**
   - 注册 [Render](https://render.com/) 账号
   - 在 [Upstash](https://upstash.com/) 创建 Redis 实例
   - Fork 本项目到你的 GitHub 账号

2. **创建 Web Service**
   - 登录 Render Dashboard
   - 点击 "New +" > "Web Service"
   - 连接你的 GitHub 账号，选择 Fork 的 LunaTV 仓库

3. **配置服务**
   - **Name**：`lunatv`（自定义）
   - **Region**：选择离用户最近的区域
   - **Runtime**：`Docker`
   - **Instance Type**：`Free`（免费版）或根据需求选择

4. **配置环境变量**

   在 Environment 中添加：

   ```env
   # 必填：管理员账号
   USERNAME=admin
   PASSWORD=your_secure_password

   # 必填：存储配置（推荐使用 Upstash）
   NEXT_PUBLIC_STORAGE_TYPE=upstash
   UPSTASH_URL=https://your-redis-instance.upstash.io
   UPSTASH_TOKEN=AxxxxxxxxxxxxxxxxxxxxxxxxxxxQ==

   # 推荐：禁用首页预告片
   DISABLE_HERO_TRAILER=true

   # 可选：站点配置
   SITE_BASE=https://your-service.onrender.com
   NEXT_PUBLIC_SITE_NAME=LunaTV Enhanced
   ```

5. **部署**
   - 点击 "Create Web Service"
   - Render 会自动使用项目中的 Dockerfile 构建和部署
   - 首次构建约 5-10 分钟
   - 部署成功后会分配 `xxx.onrender.com` 域名

#### 方式二：Node.js 原生部署

如果不想使用 Docker，也可以作为 Node.js 服务部署：

1. **创建 Web Service** 并选择 Git 仓库
2. **配置构建设置**
   - **Runtime**：`Node`
   - **Build Command**：`pnpm install && pnpm build`
   - **Start Command**：`pnpm start`
   - **Node Version**：在 Environment 中设置 `NODE_VERSION=20`
3. **配置环境变量**（同上）

#### ✨ Render 部署优势

- ✅ **免费版可用**：每月 750 小时免费运行时间
- ✅ **Docker 原生支持**：直接使用项目 Dockerfile
- ✅ **自动 HTTPS**：免费 SSL 证书
- ✅ **Git 自动部署**：推送代码自动触发构建
- ✅ **操作简单**：Web 界面配置，无需命令行

#### ⚠️ Render 注意事项

- **免费版冷启动**：15 分钟无访问后服务会休眠，再次访问需要约 30-60 秒启动
- **免费版资源限制**：512MB 内存，0.1 CPU
- **推荐使用 Upstash**：免费版磁盘不持久化，建议使用外部数据库
- **构建时间限制**：免费版每月 750 分钟构建时间
- **自定义域名**：免费版支持自定义域名

#### 🔗 相关链接

- [Render 文档](https://render.com/docs)
- [Render 部署 Next.js](https://render.com/docs/deploy-nextjs-app)
- [Upstash 免费 Redis](https://upstash.com/)

---