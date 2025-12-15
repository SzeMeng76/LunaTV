// artplayer-plugin-liquid-glass
// 毛玻璃效果控制栏插件

export default function artplayerPluginLiquidGlass(option = {}) {
  return (art) => {
    const { constructor } = art;
    const { addClass, append, createElement } = constructor.utils;
    const { $bottom, $progress, $controls, $player } = art.template;

    const $liquidGlass = createElement('div');
    addClass($player, 'artplayer-plugin-liquid-glass');
    addClass($liquidGlass, 'art-liquid-glass');

    // 恢复官方实现：progress和controls一起包裹
    append($bottom, $liquidGlass);
    append($liquidGlass, $progress);
    append($liquidGlass, $controls);

    // 移除control事件监听，完全由CSS控制宽度
    // 避免与CSS的!important冲突，防止拖动进度条时布局错乱

    return {
      name: 'artplayerPluginLiquidGlass',
    };
  };
}

// 注入样式
if (typeof document !== 'undefined') {
  const id = 'artplayer-plugin-liquid-glass';
  let $style = document.getElementById(id);
  if (!$style) {
    $style = document.createElement('style');
    $style.id = id;
    $style.textContent = `
.artplayer-plugin-liquid-glass.art-control-show {
    --art-control-height: 42px;
    --art-control-icon-size: 24px;
    --art-control-icon-scale: 1.1;
}

.artplayer-plugin-liquid-glass.art-control-show .art-bottom {
    align-items: center;
    background-image: none;
    padding-bottom: var(--art-padding);
}

.artplayer-plugin-liquid-glass.art-control-show .art-bottom .art-liquid-glass {
    border-radius: 8px;
    backdrop-filter: blur(12px);
    background-color: rgba(0, 0, 0, 0.25);
    padding: var(--art-padding) calc(var(--art-padding) * 1.5) 5px;
}

.artplayer-plugin-liquid-glass.art-control-show .art-settings {
    bottom: calc(var(--art-control-height) + var(--art-bottom-gap) + var(--art-padding));
}

.artplayer-plugin-liquid-glass.art-control-show .art-layer-auto-playback {
    bottom: calc(var(--art-control-height) + var(--art-bottom-gap) + var(--art-padding) * 4 + 10px);
}

/* 让按钮可自动缩小，防止溢出 */
.artplayer-plugin-liquid-glass .art-control {
    flex-shrink: 1 !important;
    min-width: 32px !important;
    padding: 0 6px !important;
}

/* 🔑 关键：完全按照官方CSS，不设置width让容器自适应 */
.artplayer-plugin-liquid-glass .art-bottom {
    align-items: center;  /* 官方唯一的对齐设置 */
}

/* 移动端优化 */
@media (max-width: 768px) {
    .artplayer-plugin-liquid-glass .art-control {
        padding: 0 4px !important;
        min-width: 28px !important;
    }
}
`;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild($style);
      });
    } else {
      (document.head || document.documentElement).appendChild($style);
    }
  }
}

if (typeof window !== 'undefined') {
  window.artplayerPluginLiquidGlass = artplayerPluginLiquidGlass;
}
