declare module '@/lib/artplayer-plugin-chromecast' {
  interface ChromecastPluginOptions {
    icon?: string;
    sdk?: string;
    url?: string;
    mimeType?: string;
    title?: string;
    poster?: string;
    onStateChange?: (state: 'connected' | 'connecting' | 'disconnected' | 'disconnecting') => void;
    onCastAvailable?: (available: boolean) => void;
    onCastStart?: () => void;
    onCastEnd?: () => void;
    onError?: (error: Error) => void;
  }

  interface MediaInfo {
    title?: string;
    poster?: string;
    url?: string;
  }

  interface ChromecastPlugin {
    name: 'artplayerPluginChromecast';
    getCastState: () => any;
    isCasting: () => boolean;
    endSession: () => void;
    getCurrentMedia: () => any;
    setMediaInfo: (info: MediaInfo) => void;
  }

  function artplayerPluginChromecast(options?: ChromecastPluginOptions): (art: any) => Promise<ChromecastPlugin>;
  export default artplayerPluginChromecast;
}
