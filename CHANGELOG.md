# 修改记录

## 2026-05-26 修复搜索接口解析纯链接格式

### 问题描述

- **URL:** `http://localhost:3000/play?source=xbwz&id=72841`
- **症状:** 前端搜索返回 0 个结果，但直接访问外部API有数据
- **根本原因:** 部分苹果CMS源返回的 `vod_play_url` 是纯链接格式（无 `$` 分隔符），解析逻辑不支持

### 修改文件

- `src/lib/downstream.ts`

### 修改内容

**修改前：**
```typescript
if (
  episode_title_url.length === 2 &&
  episode_title_url[1].endsWith('.m3u8')
) {
  matchTitles.push(episode_title_url[0]);
  matchEpisodes.push(episode_title_url[1]);
}
```

**修改后：**
```typescript
if (
  episode_title_url.length === 2 &&
  episode_title_url[1].endsWith('.m3u8')
) {
  // 标准格式：第1集$https://xxx.m3u8
  matchTitles.push(episode_title_url[0]);
  matchEpisodes.push(episode_title_url[1]);
} else if (
  episode_title_url.length === 1 &&
  episode_title_url[0].endsWith('.m3u8')
) {
  // 纯链接格式：https://xxx.m3u8（无标题信息）
  matchTitles.push(`第${matchEpisodes.length + 1}集`);
  matchEpisodes.push(episode_title_url[0]);
}
```

### 支持的数据格式

**格式1（原有）：** `第1集$https://xxx.m3u8#第2集$https://yyy.m3u8`
- 用 `$` 分隔标题和链接
- 用 `#` 分隔不同集数

**格式2（新增）：** `https://xxx.m3u8`
- 纯链接，无标题信息
- 标题自动生成为 `第1集`、`第2集` 等

### 影响范围

- ✅ 不影响原有带 `$` 分隔符的格式
- ✅ 新增支持纯链接格式
- ✅ 搜索结果不再被过滤掉

### 测试验证

- 待用户验证搜索功能是否正常
