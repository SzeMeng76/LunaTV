declare module '@/lib/artplayer-plugin-seek-buttons' {
  import type Artplayer from 'artplayer';

  export interface SeekButtonsOption {
    /**
     * 快进/快退的时间（秒）
     * @default 10
     */
    seekTime?: number;
  }

  export default function artplayerPluginSeekButtons(
    option?: SeekButtonsOption
  ): (art: Artplayer) => {
    name: string;
  };
}
