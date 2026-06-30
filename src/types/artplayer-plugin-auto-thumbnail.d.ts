declare module '@/lib/artplayer-plugin-auto-thumbnail' {
  import type Artplayer from 'artplayer';

  export interface AutoThumbnailOption {
    url?: string;
    width?: number;
    number?: number;
    scale?: number;
  }

  export default function artplayerPluginAutoThumbnail(
    option?: AutoThumbnailOption
  ): (art: Artplayer) => {
    name: string;
  };
}
