# 自定义去广告功能使用文档

LunaTV 提供强大的自定义去广告功能，允许管理员编写 JavaScript 代码实现更精准的 M3U8 视频流广告过滤。

---

## 功能特性

✅ **灵活的过滤逻辑**
- 针对不同播放源实现不同的过滤策略
- 过滤特定时长的广告片段
- 支持复杂的广告检测算法

✅ **动态配置**
- 无需修改源代码，在线编辑即可生效
- 版本管理机制，确保更新及时推送
- 自动降级策略，失败时使用默认规则

✅ **开发友好**
- 内置示例代码，快速上手
- 支持 TypeScript 类型注解（自动转换）
- 详细的调试日志输出

✅ **安全可靠**
- 仅管理员可编辑
- 客户端沙箱执行
- 错误自动降级，不影响播放

---

## 快速开始

### 步骤 1：进入管理面板

访问 `/admin` 页面，找到 **"自定义去广告"** 标签页。

### 步骤 2：编写自定义代码

点击 **"载入示例代码"** 按钮查看示例，或直接编写自己的代码。

### 步骤 3：保存配置

编写完成后点击 **"保存配置"** 按钮。

### 步骤 4：测试效果

刷新播放页面，自定义去广告代码将自动生效。打开浏览器控制台（F12）可以看到 `✅ 使用自定义去广告代码` 的日志。

---

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

| 参数 | 类型 | 说明 |
|------|------|------|
| `type` | string | 当前视频的播放源 key，可根据不同源实现不同逻辑 |
| `m3u8Content` | string | 原始的 m3u8 文件内容 |

### 返回值

**必须返回**一个字符串，包含过滤后的 m3u8 内容。

⚠️ **重要**：如果返回空字符串或非字符串类型，可能导致视频无法播放。

---

## 示例代码

### 示例 1：基础广告过滤

适合大多数播放源的通用过滤逻辑。

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

### 示例 2：针对特定源的过滤

根据不同播放源使用不同的过滤策略。

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

### 示例 3：高级 SCTE-35 广告检测（推荐）

支持行业标准的 SCTE-35 广告标记检测，适用于大多数专业视频流。

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

  // 输出统计信息（开发调试用）
  if (adSegmentCount > 0) {
    console.log(`[去广告] ${type} 源移除了 ${adSegmentCount} 个广告片段`);
  }

  return filteredLines.join('\n');
}
```

---

## M3U8 文件结构说明

### 基本标签

| 标签 | 说明 |
|------|------|
| `#EXTM3U` | M3U8 文件头（必需） |
| `#EXT-X-VERSION:3` | 协议版本号 |
| `#EXT-X-TARGETDURATION:10` | 每个片段的最大时长（秒） |
| `#EXTINF:9.975,` | 片段时长信息 |
| `video-001.ts` | 视频片段文件 URL |

### 广告相关标签

| 标签 | 说明 | 重要性 |
|------|------|--------|
| `#EXT-X-CUE-OUT` | 广告开始标记 | ⭐⭐⭐⭐⭐ |
| `#EXT-X-CUE-IN` | 广告结束标记 | ⭐⭐⭐⭐⭐ |
| `#EXT-X-DISCONTINUITY` | 不连续标记（广告前后常出现） | ⭐⭐⭐⭐ |
| `#EXT-X-DATERANGE` | 日期范围标记（可能包含 SCTE35） | ⭐⭐⭐ |
| `#EXT-X-SCTE35` | SCTE-35 标准广告标记 | ⭐⭐⭐⭐⭐ |
| `#EXT-OATCLS-SCTE35` | 其他平台广告标记 | ⭐⭐⭐ |

### 多码率流标签

- `#EXT-X-STREAM-INF` - 多码率流信息
- 后面跟着子 m3u8 文件的 URL

---

## 最佳实践

### 1. 针对不同源使用不同策略

不同的播放源可能使用不同的广告插入方式，建议使用 switch 语句组织代码：

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  // 根据不同源使用不同逻辑
  switch (type) {
    case 'ruyi':
      return filterRuyiAds(m3u8Content);
    case 'dyttzy':
      return filterDyttzAds(m3u8Content);
    case 'kuaikan':
      return filterKuaikanAds(m3u8Content);
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

function filterKuaikanAds(content) {
  // 快看源的专用过滤逻辑
}

function filterDefaultAds(content) {
  // 默认过滤逻辑（SCTE-35 标准）
}
```

### 2. 添加调试信息

在开发阶段建议保留 console.log 输出，方便调试：

```javascript
const originalLines = lines.length;
const filteredCount = originalLines - filteredLines.length;

console.log(`[去广告] 源: ${type}`);
console.log(`[去广告] 原始行数: ${originalLines}`);
console.log(`[去广告] 过滤行数: ${filteredCount}`);
console.log(`[去广告] 剩余行数: ${filteredLines.length}`);
```

### 3. 完善的错误处理

自定义代码应该具有容错性，防止一个错误导致所有视频无法播放：

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  try {
    if (!m3u8Content) return '';

    // 过滤逻辑
    const filtered = performFiltering(m3u8Content);

    // 验证结果
    if (!filtered || typeof filtered !== 'string') {
      console.error('[过滤器] 返回值无效，使用原始内容');
      return m3u8Content;
    }

    return filtered;
  } catch (error) {
    console.error('[过滤器错误]', error);
    // 返回原始内容作为降级方案
    return m3u8Content;
  }
}
```

### 4. 性能优化技巧

对于大型 m3u8 文件（几千行），注意性能优化：

```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  if (!m3u8Content) return '';

  // ✅ 使用数组而不是字符串拼接（性能更好）
  const filteredLines = [];

  // ✅ 预编译常用的检测模式
  const adMarkers = [
    '#EXT-X-CUE-OUT',
    '#EXT-X-CUE-IN',
    '#EXT-X-DISCONTINUITY',
    'SCTE35'
  ];

  // ✅ 避免重复的 split 操作
  const lines = m3u8Content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 过滤逻辑
    // ...
  }

  // ✅ 一次性 join，避免多次字符串连接
  return filteredLines.join('\n');
}
```

---

## 版本管理

### 为什么需要版本号？

浏览器会缓存自定义去广告代码。当你修改代码后，递增版本号可以**强制浏览器重新获取最新代码**。

### 如何使用版本号

1. 修改代码后，将版本号从 `1` 改为 `2`
2. 点击"保存配置"
3. 用户刷新页面后会自动加载新版本代码

💡 **提示**：每次修改代码都应该递增版本号，确保所有用户获得最新版本。

---

## 故障排查

### 问题 1：代码不生效

**症状**：修改代码后，播放器仍使用旧规则或默认规则

**排查步骤**：
1. ✅ 检查浏览器控制台是否有 JavaScript 错误
2. ✅ 确认已点击"保存配置"按钮
3. ✅ 尝试递增版本号并刷新页面（Ctrl+F5 强制刷新）
4. ✅ 检查函数名是否为 `filterAdsFromM3U8`（大小写敏感）
5. ✅ 检查是否有语法错误（如缺少括号、分号）

### 问题 2：视频无法播放

**症状**：应用自定义代码后，视频播放失败或黑屏

**排查步骤**：
1. ✅ 检查是否返回了字符串类型（不能是 null 或 undefined）
2. ✅ 检查过滤后的 m3u8 格式是否正确（必须有 #EXTM3U 头）
3. ✅ 添加 try-catch 错误处理
4. ✅ 检查是否误删了重要的 m3u8 标签（如 #EXTINF）
5. ✅ 暂时返回原始内容 `return m3u8Content;` 测试

### 问题 3：广告仍然出现

**症状**：应用自定义代码后，广告依然播放

**排查步骤**：
1. ✅ 不同播放源使用不同的广告标记，需要针对性分析
2. ✅ 使用 `console.log(m3u8Content)` 打印原始内容
3. ✅ 分析广告片段的特征（时长、标记、URL 模式）
4. ✅ 根据分析结果调整过滤规则
5. ✅ 测试多个视频，确保规则通用性

**示例调试代码**：
```javascript
function filterAdsFromM3U8(type, m3u8Content) {
  // 打印原始内容分析
  console.log('=== M3U8 原始内容 ===');
  console.log(m3u8Content);

  // 分析广告标记
  const hasAdMarkers = m3u8Content.includes('#EXT-X-CUE-OUT');
  console.log('包含广告标记:', hasAdMarkers);

  // 继续过滤...
}
```

### 问题 4：执行失败自动降级

**症状**：控制台显示"执行自定义去广告代码失败，降级使用默认规则"

**说明**：这是正常的降级机制，不会影响视频播放

**排查步骤**：
1. ✅ 查看控制台的详细错误信息
2. ✅ 检查代码中是否有语法错误
3. ✅ 检查是否使用了浏览器不支持的 API
4. ✅ 添加 try-catch 错误处理
5. ✅ 修复错误后递增版本号

---

## 技术细节

### 代码执行流程

```
1. 用户访问播放页面
   ↓
2. 前端通过 /api/ad-filter 获取自定义代码和版本号
   ↓
3. 将代码存储在内存中（带版本号缓存）
   ↓
4. 播放器加载 m3u8 文件
   ↓
5. 调用 filterAdsFromM3U8(type, content)
   ↓
6. 优先使用自定义代码，失败则降级到默认规则
   ↓
7. 返回过滤后的 m3u8 内容给播放器
```

### TypeScript 类型注解处理

系统会自动移除 TypeScript 类型注解，因此以下代码都是有效的：

```javascript
// ✅ 纯 JavaScript（推荐，兼容性最好）
function filterAdsFromM3U8(type, m3u8Content) {
  // ...
}

// ✅ TypeScript（会自动转换为 JavaScript）
function filterAdsFromM3U8(type: string, m3u8Content: string): string {
  // ...
}
```

### 安全性说明

- ✅ 自定义代码在**浏览器客户端**执行，不在服务器端
- ✅ 只有**管理员**可以编辑自定义代码
- ✅ 代码通过 `new Function()` 执行，具有**沙箱隔离**
- ✅ 代码不能访问敏感数据（如 Cookie、LocalStorage 之外的数据）
- ⚠️ 请勿在代码中包含恶意脚本或试图访问用户隐私

---

## 常见问题 FAQ

### Q1: 可以使用 ES6+ 特性吗？

**A**: 可以，但要确保目标浏览器支持。建议使用 ES5 语法以获得最佳兼容性。

**推荐的 ES6 特性**：
- ✅ `const` / `let`（大部分浏览器支持）
- ✅ 箭头函数 `() => {}`（现代浏览器支持）
- ✅ 模板字符串 `` `${var}` ``（现代浏览器支持）

**避免使用**：
- ❌ `async/await`（可能不支持）
- ❌ 可选链 `?.`（较新特性）
- ❌ 空值合并 `??`（较新特性）

### Q2: 可以引入外部库吗？

**A**: 不可以。自定义代码只能使用**原生 JavaScript API**。

### Q3: 如何获取当前视频的详细信息？

**A**: `type` 参数包含了播放源的 key。如需更多信息（如视频 ID、标题等），需要在源代码中添加额外的参数传递逻辑。

### Q4: 修改代码后需要重启服务器吗？

**A**: **不需要**。保存配置后，用户刷新页面即可生效。这是在线热更新机制。

### Q5: 可以完全禁用去广告吗？

**A**:
- **用户端**：可以在播放器设置中关闭去广告功能
- **管理端**：可以将自定义代码留空，系统会使用默认规则；或者在默认规则中也可以选择禁用

### Q6: 代码执行失败会怎样？

**A**: 系统会**自动降级**使用默认去广告规则，并在控制台输出错误信息。不会导致视频无法播放。

### Q7: 版本号有上限吗？

**A**: 没有。版本号可以是任意正整数，建议每次修改递增 1。

### Q8: 可以针对特定视频 ID 进行过滤吗？

**A**: 当前版本只提供 `type`（播放源）参数。如需按视频 ID 过滤，需要修改源代码添加该参数。

---

## 贡献与分享

如果你有好的去广告规则，欢迎分享到社区！

### 分享格式

```markdown
## [源名称] 去广告规则

**适用源**: source-key
**说明**: 简短描述这个规则的作用
**作者**: 你的名字（可选）

\`\`\`javascript
function filterAdsFromM3U8(type, m3u8Content) {
  // 你的代码
}
\`\`\`

**测试情况**:
- ✅ 成功移除片头广告
- ✅ 成功移除中间插播广告
- ✅ 成功移除片尾广告
- ⚠️ 某些特定广告暂时无法识别
```

### 示例分享

```markdown
## 如意源（ruyi）去广告规则

**适用源**: ruyi
**说明**: 移除如意源中特定时长的广告片段
**作者**: LunaTV 社区

\`\`\`javascript
function filterAdsFromM3U8(type, m3u8Content) {
  if (type !== 'ruyi' || !m3u8Content) return m3u8Content;

  const lines = m3u8Content.split('\n');
  const filteredLines = [];
  let skipNext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skipNext) {
      skipNext = false;
      continue;
    }

    // 过滤 5.64秒、2.96秒、3.48秒 的广告片段
    if (line.includes('EXTINF:5.640000') ||
        line.includes('EXTINF:2.960000') ||
        line.includes('EXTINF:3.480000')) {
      skipNext = true;
      continue;
    }

    filteredLines.push(line);
  }

  return filteredLines.join('\n');
}
\`\`\`

**测试情况**:
- ✅ 成功移除片头 5.64 秒广告
- ✅ 成功移除中间 2.96 秒插播广告
- ✅ 成功移除片尾 3.48 秒广告
```

---

## 相关资源

### 官方文档

- [M3U8 格式规范 (RFC 8216)](https://datatracker.ietf.org/doc/html/rfc8216) - M3U8/HLS 协议官方标准
- [SCTE-35 广告标准](https://www.scte.org/standards/library/catalog/scte-35-digital-program-insertion-cueing-message/) - 行业标准广告插入规范
- [HLS 协议文档](https://developer.apple.com/streaming/) - Apple 官方 HLS 流媒体协议文档

### 社区资源

- LunaTV Issues - 提交 Bug 或功能建议
- LunaTV Discussions - 讨论去广告规则和最佳实践

### 工具推荐

- **在线 M3U8 解析器** - 分析 m3u8 文件结构
- **浏览器开发者工具 (F12)** - 查看网络请求和调试代码
- **VSCode** - 编写和测试 JavaScript 代码

---

## 更新日志

### 版本历史

- **v1.0** - 初始版本，支持基本的自定义去广告功能
- **v1.1** - 添加版本管理机制，支持代码热更新
- **v1.2** - 添加 TypeScript 类型注解自动移除
- **v1.3** - 优化错误处理，添加自动降级机制

---

## 许可证与免责声明

- LunaTV 自定义去广告功能遵循 LunaTV 项目许可证
- 去广告功能仅供学习和研究使用
- 请遵守当地法律法规和版权规定
- 使用自定义代码产生的任何后果由使用者自行承担

---

## 技术支持

遇到问题？我们随时为你提供帮助！

- **功能问题** - 在 LunaTV 项目仓库提交 Issue
- **规则分享** - 在 Discussions 区域发布你的去广告规则
- **Bug 报告** - 提供详细的复现步骤和错误日志

---

**让观影体验更纯粹，享受无广告的流畅播放！** 🎬✨
