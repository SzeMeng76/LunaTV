
                        ) : (
                          <span>网盘资源</span>
                        )}
                      </div>
                    </button>
{/* 第三方播放器按钮组 - 与网盘资源按钮对齐 */}        
{(() => {            
  const bananaSource = availableSources.find(source => source.source === 'banana');            
  if (!bananaSource) return null;            
              
  const bananaVideoUrl = bananaSource.episodes?.[currentEpisodeIndex] || '';            
  if (!bananaVideoUrl) return null;            
              
  const convertVideoUrl = (url: string): string => {            
    try {            
      const urlObj = new URL(url);            
      const pathAndQuery = urlObj.pathname + urlObj.search + urlObj.hash;            
      return `https://vod.yankj.workers.dev${pathAndQuery}`;            
    } catch (e) {            
      console.error('URL转换失败:', e);            
      return url;            
    }            
  };            
              
  const convertedUrl = convertVideoUrl(bananaVideoUrl);        
          
  // 操作系统检测函数        
  const getOS = () => {        
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;               
    if (/android/i.test(userAgent)) return "Android";        
    if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) return "iOS";        
    if (/Mac/.test(userAgent)) return "macOS";        
    if (/Win/.test(userAgent)) return "Windows";        
    return "Unknown";        
  };        
        
  const os = getOS();      
    
              
  return (            
    <div className="flex items-center gap-2">            
      {/* IINA - macOS 和未知平台 */}            
      {(os === 'macOS' || os === 'Unknown') && (      
        <button            
          onClick={() => {            
            window.location.href = `iina://weblink?url=${encodeURIComponent(convertedUrl)}&new_window=1`;            
          }}            
          className="relative group flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 w-9 h-9 rounded-full shadow-md transition-colors"            
        >            
          <img             
            src="https://fastly.jsdelivr.net/gh/bpking1/embyExternalUrl@0.0.5/embyWebAddExternalUrl/icons/icon-IINA.webp"             
            alt="IINA"            
            className="w-5 h-5"            
          />            
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none z-50">            
            IINA             
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>            
          </div>            
        </button>      
      )}      
                  
      {/* PotPlayer - Windows 和未知平台 */}            
      {(os === 'Windows' || os === 'Unknown') && (      
        <button            
          onClick={() => {            
            window.location.href = `potplayer://${encodeURI(convertedUrl)}`;            
          }}            
          className="relative group flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 w-9 h-9 rounded-full shadow-md transition-colors"            
        >            
          <img             
            src="https://fastly.jsdelivr.net/gh/bpking1/embyExternalUrl@0.0.5/embyWebAddExternalUrl/icons/icon-PotPlayer.webp"             
            alt="PotPlayer"            
            className="w-5 h-5"            
          />            
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none z-50">            
            PotPlayer             
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>            
          </div>            
        </button>      
      )}      
                  
      {/* VLC - 所有平台 */}            
      <button            
        onClick={() => {        
          let url = '';        
          switch (os) {        
            case 'Windows':        
              url = `vlc://${encodeURI(convertedUrl)}`;        
              break;        
            case 'iOS':        
              url = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(convertedUrl)}`;        
              break;        
            case 'Android':        
              url = `intent:${encodeURI(convertedUrl)}#Intent;package=org.videolan.vlc;type=video/*;end`;        
              break;        
            default:        
              url = `vlc://${encodeURI(convertedUrl)}`;        
              break;        
          }        
          window.location.href = url;        
        }}            
        className="relative group flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 w-9 h-9 rounded-full shadow-md transition-colors"            
      >            
        <img             
          src="https://fastly.jsdelivr.net/gh/bpking1/embyExternalUrl@0.0.5/embyWebAddExternalUrl/icons/icon-VLC.webp"             
          alt="VLC"            
          className="w-5 h-5"            
        />            
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none z-50">            
          VLC             
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>            
        </div>            
      </button> 
	  
          {/* Infuse - iOS 和未知平台 */}    
      {(os === 'iOS' || os === 'Unknown') && (    
        <button    
          onClick={() => {    
            const infuseUrl = `infuse://x-callback-url/play?url=${encodeURIComponent(mediaInfo.streamUrl)}&sub=${encodeURIComponent(mediaInfo.subUrl)}`;    
            window.location.href = infuseUrl;    
          }}    
          className="relative group flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 w-9 h-9 rounded-full shadow-md transition-colors"    
        >    
          <img    
            src="https://fastly.jsdelivr.net/gh/bpking1/embyExternalUrl@0.0.5/embyWebAddExternalUrl/icons/icon-infuse.webp"    
            alt="Infuse"    
            className="w-5 h-5"    
          />    
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none z-50">    
            Infuse    
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>    
          </div>    
        </button>    
      )}    
                  
      {/* nPlayer - macOS、移动端和未知平台 */}            
      {(os === 'macOS' || os === 'iOS' || os === 'Android' || os === 'Unknown') && (      
        <button            
          onClick={() => {        
            let url = '';        
            if (os === 'macOS') {        
              url = `nplayer-mac://weblink?url=${encodeURIComponent(convertedUrl)}&new_window=1`;        
            } else {        
              url = `nplayer-${encodeURI(convertedUrl)}`;        
            }        
            window.location.href = url;        
          }}            
          className="relative group flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 w-9 h-9 rounded-full shadow-md transition-colors"            
        >            
          <img             
            src="https://fastly.jsdelivr.net/gh/bpking1/embyExternalUrl@0.0.5/embyWebAddExternalUrl/icons/icon-NPlayer.webp"             
            alt="nPlayer"            
            className="w-5 h-5"            
          />            
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none z-50">            
            nPlayer             
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>            
          </div>            
        </button>      
      )}      
          
      {/* MXPlayer - Android 和未知平台 */}    
      {(os === 'Android' || os === 'Unknown') && (    
        <button    
          onClick={() => {    
            window.location.href = `intent:${encodeURI(convertedUrl)}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end`;    
          }}    
          className="relative group flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 w-9 h-9 rounded-full shadow-md transition-colors"    
        >    
          <img    
            src="https://fastly.jsdelivr.net/gh/bpking1/embyExternalUrl@0.0.5/embyWebAddExternalUrl/icons/icon-MXPlayer.webp"    
            alt="MXPlayer"    
            className="w-5 h-5"    
          />    
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none z-50">    
            MXPlayer    
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>    
          </div>    
        </button>    
      )}    
                  
      {/* 下载按钮 - 所有平台 */}            
<a              
  href={convertedUrl}              
  target="_blank"  
  rel="noopener noreferrer"  
  className="relative group flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-2.5 rounded-full text-sm font-medium shadow-md transition-colors"              
>              
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">              
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />              
  </svg>           
  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none z-50">              
    下载视频               
    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>              
  </div>              
</a>   
    </div>            
  );            
})()}
