# 虚拟滑动优化使用指南

## 🚀 功能概述

LunaTV 现在支持虚拟滑动技术，大幅提升页面性能表现：

- **虚拟化渲染**：只渲染可视区域内的内容，显著减少 DOM 节点
- **无感无限滚动**：智能预加载，滚动时完全无感
- **动态阈值**：根据屏幕尺寸自动调整加载时机
- **图片优化**：首屏图片优先加载，已加载图片缓存复用
- **响应式适配**：智能适配各种屏幕尺寸，从手机到 4K 显示器
- **无缝切换**：可随时在虚拟模式和传统模式间切换

## 📱 支持的页面

虚拟滑动已应用于以下页面：

- ✅ **豆瓣页面** (`/douban`)
- ✅ **Emby 私人媒体库** (`/emby`)
- ✅ **短剧页面** (`/shortdrama`)

## 🎛️ 使用方法

### 启用/关闭虚拟滑动

1. 在页面右上角或筛选区域找到 "⚡ 虚拟滑动" 开关
2. 开关状态会自动保存到本地存储（每个页面独立保存）
3. 默认启用虚拟滑动模式

### 本地存储键名

- 豆瓣页面：`useDoubanVirtualization`
- Emby 页面：`useEmbyVirtualization`
- 短剧页面：`useShortDramaVirtualization`

## ⚡ 性能提升

### 传统模式 vs 虚拟化模式

- **DOM 节点减少**：从 1000+ 个卡片减少到 20-50 个
- **内存占用**：降低 60-80%
- **渲染时间**：提升 3-5 倍
- **滚动流畅度**：明显改善，特别是低端设备和移动端

### 无感无限滚动

- **智能预加载**：距离底部 3 行时自动触发加载
- **动态阈值**：根据视口高度自动调整触发时机
  - 手机（700px）：约 5-6 行阈值
  - PC（1080px）：约 6-7 行阈值
- **完全无感**：正常滚动速度下看不到"加载中"提示

### 图片优化

- **优先级加载**：首屏 30 张图片立即加载（`priority={true}`）
- **懒加载**：其他图片使用 `loading="lazy"`
- **图片缓存**：已加载图片存入 `loadedImageUrls` Set
- **缓存复用**：虚拟滚动重新渲染时，已加载图片立即显示

## 🔧 技术实现

### 核心组件

- **`VirtualGrid.tsx`**：统一的虚拟化网格组件
  - 基于 `@tanstack/react-virtual`
  - 支持 CSS Grid 自动列数检测
  - 实现 `endReached` 回调机制

### 依赖包

```json
{
  "@tanstack/react-virtual": "^3.x.x"
}
```

### 关键特性

#### 1. 动态列数检测

使用隐藏的 probe 元素检测 CSS Grid 的列数：

```typescript
const probeRef = useRef<HTMLDivElement>(null);
const detectColumns = () => {
  const style = window.getComputedStyle(probeRef.current);
  const cols = style.gridTemplateColumns.split(' ').length;
  setColumns(cols);
};
```

#### 2. 动态阈值计算

根据视口高度和行高自动计算触发阈值：

```typescript
const viewportHeight = window.innerHeight;
const visibleRows = Math.ceil(viewportHeight / estimateRowHeight);
const dynamicThreshold = Math.max(visibleRows + endReachedThreshold, endReachedThreshold);
```

#### 3. endReached 回调

监听虚拟滚动状态，而不是 DOM 元素：

```typescript
if (lastRowIndex >= rowCount - dynamicThreshold) {
  endReached(); // 触发加载更多
}
```

### 兼容性

- ✅ React 18+
- ✅ 现代浏览器（Chrome 88+, Firefox 78+, Safari 14+）
- ✅ 移动端浏览器
- ✅ PWA 应用

## 🎯 最佳实践

### 何时使用虚拟滑动

- ✅ 数据量超过 50 个时
- ✅ 用户设备性能较低时
- ✅ 移动端使用时
- ✅ 需要无限滚动时

### 何时使用传统模式

- ✅ 数据量很少时（< 20 个）
- ✅ 需要快速浏览所有结果时
- ✅ 调试或开发时
- ✅ 需要打印页面时

## 🛠️ 开发说明

### 添加虚拟滚动到新页面

1. 导入 VirtualGrid 组件：

```typescript
import VirtualGrid from '@/components/VirtualGrid';
```

2. 添加虚拟化状态：

```typescript
const [useVirtualization, setUseVirtualization] = useState(() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('useYourPageVirtualization');
    return saved !== null ? JSON.parse(saved) : true;
  }
  return true;
});
```

3. 使用 VirtualGrid：

```typescript
<VirtualGrid
  items={data}
  className='grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4'
  rowGapClass='pb-4'
  estimateRowHeight={280}
  endReached={() => {
    if (hasMore && !loading) {
      loadMore();
    }
  }}
  endReachedThreshold={3}
  renderItem={(item, index) => (
    <YourCard item={item} priority={index < 30} />
  )}
/>
```

### 调整参数

#### estimateRowHeight

根据卡片实际高度调整：

- 豆瓣/Emby：`320px`（海报 + 标题 + 间距）
- 短剧：`280px`（封面 + 标题 + 间距）

#### endReachedThreshold

基础阈值，会自动加上可见行数：

- 推荐值：`2-3`
- 手机端会自动增加到 5-6 行
- PC 端会自动增加到 6-7 行

#### overscan

预渲染的行数（上下各 N 行）：

- 默认值：`3`
- 增加可提升滚动流畅度，但会增加 DOM 节点

### 图片优化配置

1. 在卡片组件添加 `priority` 属性：

```typescript
interface CardProps {
  priority?: boolean;
}
```

2. 根据 priority 设置加载策略：

```typescript
<img
  loading={priority ? undefined : 'lazy'}
  onLoad={() => {
    loadedImageUrls.add(imageUrl);
    setImageLoaded(true);
  }}
/>
```

3. 初始化时检查缓存：

```typescript
const [imageLoaded, setImageLoaded] = useState(() =>
  loadedImageUrls.has(imageUrl)
);
```

## 📊 性能监控

### Chrome DevTools

1. **Performance 标签**：
   - 记录页面加载和滚动性能
   - 对比虚拟化前后的 FPS
   - 查看 DOM 节点数量变化

2. **Memory 标签**：
   - 对比内存占用
   - 检查是否有内存泄漏

3. **Lighthouse**：
   - 测试 LCP（Largest Contentful Paint）
   - 测试 TBT（Total Blocking Time）

### 控制台调试

```javascript
// 查看虚拟化状态
console.log('豆瓣虚拟化:', localStorage.getItem('useDoubanVirtualization'));
console.log('Emby虚拟化:', localStorage.getItem('useEmbyVirtualization'));
console.log('短剧虚拟化:', localStorage.getItem('useShortDramaVirtualization'));

// 查看图片缓存
console.log('已缓存图片数量:', loadedImageUrls.size);
```

## 🐛 故障排除

### 常见问题

1. **滚动卡顿**
   - 检查是否启用了硬件加速
   - 减少 `overscan` 值
   - 检查图片是否过大

2. **布局错位**
   - 确认 `estimateRowHeight` 接近实际高度
   - 检查 CSS Grid 配置是否正确
   - 确认 `rowGapClass` 包含在高度估算中

3. **图片加载慢**
   - 确认首屏图片使用了 `priority={true}`
   - 检查图片是否添加到缓存
   - 使用 CDN 加速图片加载

4. **还是能看到"加载中"**
   - 增加 `endReachedThreshold` 值
   - 检查网络速度是否过慢
   - 减少每次加载的数据量

### 调试技巧

1. **查看渲染的行数**：

```typescript
console.log('可见行:', virtualizer.getVirtualItems().length);
console.log('总行数:', Math.ceil(items.length / columns));
```

2. **监控 endReached 触发**：

```typescript
endReached={() => {
  console.log('触发加载，当前数据量:', items.length);
  loadMore();
}}
```

3. **检查动态阈值**：

```typescript
const viewportHeight = window.innerHeight;
const visibleRows = Math.ceil(viewportHeight / 320);
console.log('可见行数:', visibleRows);
console.log('动态阈值:', visibleRows + 3);
```

## 🔄 从旧版本迁移

如果你的项目之前使用 `react-virtuoso`，迁移步骤：

1. 移除旧依赖：
```bash
pnpm remove react-virtuoso
```

2. 安装新依赖：
```bash
pnpm add @tanstack/react-virtual
```

3. 替换组件：
   - `VirtuosoGrid` → `VirtualGrid`
   - `endReached` 回调保持不变
   - 移除 `increaseViewportBy` 等 virtuoso 特有配置

4. 更新 localStorage 键名（避免冲突）

---

💡 **提示**：虚拟滑动技术特别适合大量数据的展示场景，配合图片缓存和优先级加载，可以显著提升用户体验。建议在数据量超过 50 个时启用以获得最佳性能。
