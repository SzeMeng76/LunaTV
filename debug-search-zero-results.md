# Debug Session: search-zero-results

**Status:** [OPEN]
**Created:** 2026-05-26
**Issue:** 播放页面搜索返回 0/0 结果，但直接访问外部API有数据

---

## 问题描述

- **URL:** `http://localhost:3000/play?source=xbwz&id=72841&title=&year=unknown`
- **症状:** 前端日志显示 `匹配结果: 0/0`
- **预期:** 应该搜索到视频并返回播放地址
- **已验证:** 直接访问 `https://www.xxibaozyw.com/api.php/provide/vod/?ac=videolist&wd=校园霸凌年年有，今年特别多系列8..` 有返回数据

---

## 假设列表

1. **H1: 搜索缓存问题** - 之前搜索过空结果被缓存了10分钟
2. **H2: 搜索API未正确转发请求** - Next.js API路由没有正确请求外部源
3. **H3: 标题匹配逻辑太严格** - 搜索结果被前端过滤逻辑全部过滤掉
4. **H4: 搜索超时** - 20秒超时导致搜索被跳过
5. **H5: 源站点配置问题** - xbwz 源没有被包含在搜索范围内

---

## 调试进度

### Step 1: 初始化 ✅
- 创建 debug 文件
- 生成 session ID

### Step 2: 启动 Debug Server ⏳
- 待启动

### Step 3: 添加插桩日志 ⏳
- 待添加

### Step 4: 复现问题 ⏳
- 待复现

### Step 5: 分析证据 ⏳
- 待分析

### Step 6: 实施修复 ⏳
- 待实施

---

## 关键代码位置

- 搜索API: `src/app/api/search/route.ts`
- 搜索逻辑: `src/lib/downstream.ts`
- 搜索缓存: `src/lib/search-cache.ts`
- 前端匹配: `src/app/play/page.tsx:L2950-3100`
