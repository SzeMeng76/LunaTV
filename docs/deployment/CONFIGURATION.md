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

> 💡 **Redis 兼容服务**：`REDIS_URL` 支持所有 Redis 协议兼容的服务，包括：
> - 自建 Redis / KVRocks
> - [Redis Cloud](https://redis.io/cloud/) - 官方云服务，免费 30MB
> - [Aiven Valkey](https://aiven.io/valkey) - 免费 1GB，Redis 7.2 兼容
> - [Northflank](https://northflank.com/dbaas/managed-redis) - 免费 256MB
>
> ⚠️ **Vercel 部署请使用 Upstash**：Vercel Serverless 函数是无状态的，每次请求可能冷启动新实例。TCP 长连接的 Redis 服务（Redis Cloud、Aiven、Northflank 等）在此环境下会遇到连接池失效、冷启动延迟高、连接数耗尽等问题。Upstash 基于 HTTP REST API，天然适配 Serverless 环境，是 Vercel 部署的唯一推荐存储方案。

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
| `DISABLE_HERO_TRAILER`              | 禁用首页预告片       | `false`     | `true` / `false`          |

> 💡 **DISABLE_HERO_TRAILER**：首页 HeroBanner 预告片会消耗较多流量，且预告片 URL 带时间戳会定时过期。
> - **Vercel**：自动禁用（无需设置）
> - **Docker/VPS（可挂载持久化卷）**：无需禁用，视频会缓存到本地（`VIDEO_CACHE_DIR`），URL 过期后自动刷新并重新缓存
> - **ClawCloud、HF Space、EdgeOne Pages 等无持久化平台**：建议设置 `DISABLE_HERO_TRAILER=true`，因为无法缓存视频，URL 过期后每次刷新都要重新下载

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
  - 视频源导入/导出（支持批量管理配置，便于备份和迁移）
  - 视频源有效性检测
  - 一键选择无效源（现代化按钮UI设计）
  - 拖拽排序
  - 编辑/删除单个视频源
- **源浏览器和测试模块**：
  - 源站内容浏览和搜索
  - 源站测试和健康检查
  - 移动端响应式布局
  - 侧抽屉测试结果展示

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

