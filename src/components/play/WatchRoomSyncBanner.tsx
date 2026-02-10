'use client';

interface WatchRoomSyncBannerProps {
  show: boolean;
  onResumeSync: () => void;
}

export default function WatchRoomSyncBanner({
  show,
  onResumeSync,
}: WatchRoomSyncBannerProps) {
  if (!show) return null;

  return (
    <div className='fixed bottom-20 left-1/2 -translate-x-1/2 z-9998 animate-fade-in'>
      <div className='flex items-center gap-3 px-4 py-2.5 rounded-full bg-orange-500/90 backdrop-blur-sm shadow-lg'>
        <span className='text-sm text-white font-medium'>已退出同步，自由观看中</span>
        <button
          onClick={onResumeSync}
          className='px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors'
        >
          重新同步
        </button>
      </div>
    </div>
  );
}
