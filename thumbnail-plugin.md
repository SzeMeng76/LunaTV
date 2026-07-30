# 新增自动缩略图插件修改内容

本功能通过引入一个自定义的 ArtPlayer 插件，实现了在视频播放进度条上自动生成预览缩略图的功能。

## 📂 修改文件清单

### 1. 新增文件 (插件实现)

为了提高稳定性并进行定制化优化，采用了本地源码实现而非直接引用 npm 包。

- **`src/lib/artplayer-plugin-auto-thumbnail.js`**
  - **功能**：插件核心逻辑实现。
  - **核心流程**：
    1. 创建一个隐藏的 `<video>` 元素。
    2. 遍历视频总时长，计算采样点。
    3. 使用 `<canvas>` 将视频帧绘制成图片。
    4. 将图片转换为 `Blob URL` 并交给 ArtPlayer 的 `thumbnails` 属性进行渲染。
  - **关键优化**：增加了 `video.muted = true`，以确保在不同浏览器的自动播放策略下，`currentTime` 的跳转（Seek）能够正常触发。

- **`src/types/artplayer-plugin-auto-thumbnail.d.ts`**
  - **功能**：提供 TypeScript 类型定义。
  - **定义内容**：定义了 `AutoThumbnailOption` 配置接口（包括 `url`, `width`, `number`, `scale` 等参数）。

### 2. 修改文件 (功能集成)

将插件集成到播放页的 ArtPlayer 实例中。

- **文件**：`src/app/play/page.tsx`
  - **引入插件** (第 48 行)：
    ```typescript
    import artplayerPluginAutoThumbnail from '@/lib/artplayer-plugin-auto-thumbnail';
    ```
  - **挂载插件** (第 562 行附近)：
    在 ArtPlayer 的 `plugins` 配置数组中添加了该插件的初始化调用：
    ```typescript
    artplayerPluginAutoThumbnail({
      // 配置项...
    }),
    ```

## 🛠️ 技术实现总结

| 维度         | 实现细节                                                                          |
| :----------- | :-------------------------------------------------------------------------------- |
| **采样方式** | 异步 Seek 关键帧                                                                  |
| **图像处理** | Canvas 2D Context 绘制 $\rightarrow$ `toBlob` $\rightarrow$ `URL.createObjectURL` |
| **兼容性**   | 通过静音处理解决浏览器 Seek 限制                                                  |
| **性能**     | 采用分块绘制（column: 10）减少内存占用                                            |
