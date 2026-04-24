declare module '@/lib/artplayer-plugin-seek-buttons' {
  import type Artplayer from 'artplayer';

  export interface SeekButtonsOption {
    /**
     * 快进/快退的时间（秒）
     * @default 10
     */
    seekTime?: number;
    /**
     * 移动端按钮布局模式
     * - 'both': 左右两侧都显示（默认）
     * - 'left': 仅左侧显示（左手模式，单手吃饭时方便操作）
     * - 'right': 仅右侧显示（右手模式，单手吃饭时方便操作）
     * @default 'both'
     */
    mobileLayout?: 'both' | 'left' | 'right';
  }

  export default function artplayerPluginSeekButtons(
    option?: SeekButtonsOption
  ): (art: Artplayer) => {
    name: string;
    config: (newOptions: Partial<SeekButtonsOption>) => void;
  };
}
