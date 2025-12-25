# 自定义去广告功能使用文档

## 功能简介

自定义去广告功能允许管理员编写自定义 JavaScript 代码来实现更强力、更精准的 M3U8 视频流去广告功能。相比默认的去广告规则，自定义代码可以：

- 针对不同播放源实现不同的过滤逻辑
- 过滤特定时长的广告片段
- 实现更复杂的广告检测算法
- 动态调整过滤规则而无需修改源代码

## 快速开始

### 1. 进入管理面板

访问 `/admin` 页面，找到 **"自定义去广告"** 标签页。

### 2. 编写自定义代码

点击 **"载入示例代码"** 按钮查看示例，或直接编写自己的代码。

### 3. 保存配置

编写完成后点击 **"保存配置"** 按钮。

### 4. 测试效果

刷新播放页面，自定义去广告代码将自动生效。打开浏览器控制台可以看到 `✅ 使用自定义去广告代码` 的日志。

## 代码规范

### 函数签名

自定义代码必须定义一个名为 `filterAdsFromM3U8` 的函数：

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  // type: 播放源的 key (例如: 'ruyi', 'dyttzy', 'kuaikan' 等)
  // m3u8Content: 原始的 m3u8 文件内容字符串

  // 返回过滤后的 m3u8 内容字符串
  return filteredContent;
}
```

### 参数说明

- **type** (string): 当前视频的播放源 key，可以根据不同源实现不同的过滤逻辑
- **m3u8Content** (string): 原始的 m3u8 文件内容

### 返回值

必须返回一个字符串，包含过滤后的 m3u8 内容。

## 示例代码

### 示例 1: 基础广告过滤

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  if (!m3u8Content) return '';

  const lines = m3u8Content.split('\n');
  const filteredLines = [];
  let inAdBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测广告开始标记
    if (line.includes('#EXT-X-CUE-OUT') ||
        line.includes('#EXT-X-DISCONTINUITY')) {
      inAdBlock = true;
      continue;
    }

    // 检测广告结束标记
    if (line.includes('#EXT-X-CUE-IN')) {
      inAdBlock = false;
      continue;
    }

    // 跳过广告区块内容
    if (inAdBlock) {
      continue;
    }

    filteredLines.push(line);
  }

  return filteredLines.join('\n');
}
```

### 示例 2: 针对特定源的过滤

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  if (!m3u8Content) return '';

  const lines = m3u8Content.split('\n');
  const filteredLines = [];
  let skipNext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skipNext) {
      skipNext = false;
      continue;
    }

    // 针对 ruyi 源的特殊处理
    if (type === 'ruyi') {
      // 过滤特定时长的广告片段
      if (line.includes('EXTINF:5.640000') ||
          line.includes('EXTINF:2.960000') ||
          line.includes('EXTINF:3.480000')) {
        skipNext = true; // 跳过下一行的 ts 文件
        continue;
      }
    }

    // 针对 dyttzy 源的特殊处理
    if (type === 'dyttzy') {
      // 过滤特定的广告标记
      if (line.includes('ad-marker')) {
        skipNext = true;
        continue;
      }
    }

    // 通用过滤规则
    if (!line.includes('#EXT-X-DISCONTINUITY')) {
      filteredLines.push(line);
    }
  }

  return filteredLines.join('\n');
}
```

### 示例 3: 高级 SCTE-35 广告检测

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  if (!m3u8Content) return '';

  const lines = m3u8Content.split('\n');
  const filteredLines = [];
  let inAdBlock = false;
  let adSegmentCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测行业标准广告标记（SCTE-35系列）
    if (line.includes('#EXT-X-CUE-OUT') ||
        (line.includes('#EXT-X-DATERANGE') && line.includes('SCTE35')) ||
        line.includes('#EXT-X-SCTE35') ||
        line.includes('#EXT-OATCLS-SCTE35')) {
      inAdBlock = true;
      adSegmentCount++;
      continue;
    }

    // 检测广告结束标记
    if (line.includes('#EXT-X-CUE-IN')) {
      inAdBlock = false;
      continue;
    }

    // 跳过广告区块内容
    if (inAdBlock) {
      continue;
    }

    // 过滤 DISCONTINUITY 标记
    if (!line.includes('#EXT-X-DISCONTINUITY')) {
      filteredLines.push(line);
    }
  }

  // 输出统计信息（可选）
  if (adSegmentCount > 0) {
    console.log(`[${type}] 移除了 ${adSegmentCount} 个广告片段`);
  }

  return filteredLines.join('\n');
}
```

## M3U8 文件结构说明

### 基本标签

- `#EXTM3U` - M3U8 文件头
- `#EXT-X-VERSION:3` - 版本号
- `#EXT-X-TARGETDURATION:10` - 每个片段的最大时长
- `#EXTINF:9.975,` - 片段时长信息
- `video-001.ts` - 视频片段文件

### 广告相关标签

- `#EXT-X-CUE-OUT` - 广告开始标记
- `#EXT-X-CUE-IN` - 广告结束标记
- `#EXT-X-DISCONTINUITY` - 不连续标记（通常出现在广告前后）
- `#EXT-X-DATERANGE` - 日期范围标记（可能包含 SCTE35 广告信息）
- `#EXT-X-SCTE35` - SCTE-35 广告标记
- `#EXT-OATCLS-SCTE35` - 其他广告标记

### 多码率流

- `#EXT-X-STREAM-INF` - 多码率流信息
- 后面跟着子 m3u8 文件的 URL

## 最佳实践

### 1. 测试不同播放源

不同的播放源可能使用不同的广告插入方式，建议：

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  // 根据不同源使用不同逻辑
  switch (type) {
    case 'ruyi':
      return filterRuyiAds(m3u8Content);
    case 'dyttzy':
      return filterDyttzAds(m3u8Content);
    default:
      return filterDefaultAds(m3u8Content);
  }
}

function filterRuyiAds(content) {
  // 如意源的专用过滤逻辑
}

function filterDyttzAds(content) {
  // 电影天堂源的专用过滤逻辑
}

function filterDefaultAds(content) {
  // 默认过滤逻辑
}
```

### 2. 保留调试信息

在开发阶段建议保留 console.log 输出：

```javascript
console.log(`[过滤器] 源: ${type}, 原始行数: ${lines.length}, 过滤后行数: ${filteredLines.length}`);
```

### 3. 错误处理

自定义代码应该具有容错性：

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  try {
    if (!m3u8Content) return '';

    // 过滤逻辑

    return filteredContent;
  } catch (error) {
    console.error('[过滤器错误]', error);
    // 返回原始内容作为降级方案
    return m3u8Content;
  }
}
```

### 4. 性能优化

对于大型 m3u8 文件，注意性能：

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  if (!m3u8Content) return '';

  // 使用数组而不是字符串拼接
  const filteredLines = [];

  // 避免重复的正则表达式编译
  const adPatterns = [
    '#EXT-X-CUE-OUT',
    '#EXT-X-DISCONTINUITY'
  ];

  // ... 过滤逻辑

  return filteredLines.join('\n');
}
```

## 版本管理

### 为什么需要版本号？

浏览器可能会缓存自定义去广告代码。当你修改代码后，递增版本号可以强制浏览器重新获取最新代码。

### 如何使用版本号

1. 修改代码后，将版本号从 `1` 改为 `2`
2. 保存配置
3. 用户刷新页面后会自动加载新版本代码

## 故障排查

### 1. 代码不生效

- 检查浏览器控制台是否有错误信息
- 确认已保存配置
- 尝试递增版本号并刷新页面
- 检查函数名是否为 `filterAdsFromM3U8`

### 2. 视频无法播放

- 检查过滤后的 m3u8 是否格式正确
- 确认返回的是字符串而不是其他类型
- 添加 try-catch 错误处理
- 检查是否误删了重要的 m3u8 标签

### 3. 广告仍然出现

- 不同播放源使用不同的广告标记
- 使用 `console.log(m3u8Content)` 查看原始内容
- 分析广告片段的特征
- 调整过滤规则

### 4. 执行失败自动降级

如果自定义代码执行失败，系统会自动降级使用默认去广告规则，并在控制台输出错误信息：

```
执行自定义去广告代码失败,降级使用默认规则: [错误信息]
```

## 技术细节

### 代码执行流程

1. 页面加载时通过 `/api/ad-filter` 获取自定义代码
2. 将代码存储在内存中
3. 当播放器加载 m3u8 时调用 `filterAdsFromM3U8`
4. 优先使用自定义代码，失败则使用默认规则

### TypeScript 类型注解处理

系统会自动移除 TypeScript 类型注解，因此以下代码都是有效的：

```javascript
// 纯 JavaScript（推荐）
function filterAdsFromM3U8(type, m3u8Content) {
  // ...
}

// TypeScript（会自动转换）
function filterAdsFromM3U8(type: string, m3u8Content: string): string {
  // ...
}
```

### 安全性

- 自定义代码在浏览器客户端执行
- 只有管理员可以编辑自定义代码
- 代码通过 `new Function()` 执行，具有沙箱隔离

## 常见问题

### Q: 可以使用 ES6+ 特性吗？

A: 可以，但要确保目标浏览器支持。建议使用 ES5 语法以获得最佳兼容性。

### Q: 可以引入外部库吗？

A: 不可以。自定义代码只能使用原生 JavaScript API。

### Q: 如何获取当前视频信息？

A: `type` 参数包含了播放源的 key。如需更多信息，可以在代码中添加额外的参数传递逻辑。

### Q: 修改代码后需要重启服务器吗？

A: 不需要。保存配置后，用户刷新页面即可生效。

### Q: 可以完全禁用去广告吗？

A: 用户可以在播放器设置中关闭去广告功能。管理员也可以将自定义代码留空，只使用默认规则。

## 贡献示例

如果你有好的去广告规则，欢迎分享到社区！

### 分享格式

```markdown
## [源名称] 去广告规则

**适用源**: source-key
**说明**: 简短描述

\`\`\`javascript
function filterAdsFromM3U8(type, m3u8Content) {
  // 你的代码
}
\`\`\`

**测试情况**:
- ✅ 成功移除片头广告
- ✅ 成功移除中间插播广告
- ❌ 片尾广告暂时无法识别
```

## 相关链接

- [M3U8 格式规范](https://datatracker.ietf.org/doc/html/rfc8216)
- [SCTE-35 广告标准](https://www.scte.org/standards/library/catalog/scte-35-digital-program-insertion-cueing-message/)
- [HLS 协议文档](https://developer.apple.com/streaming/)
