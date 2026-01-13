// artplayer-plugin-liquid-glass
// 毛玻璃效果控制栏插件
// 样式已提取到 src/styles/artplayer-liquid-glass.css

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

if (typeof window !== 'undefined') {
  window.artplayerPluginLiquidGlass = artplayerPluginLiquidGlass;
}
