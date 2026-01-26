'use client';

interface OwnerChangeDialogProps {
  show: boolean;
  videoName: string;
  episode: number;
  onConfirm: () => void;
  onReject: () => void;
}

export default function OwnerChangeDialog({
  show,
  videoName,
  episode,
  onConfirm,
  onReject,
}: OwnerChangeDialogProps) {
  if (!show) return null;

  return (
    <div className='fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-9999'>
      <div className='bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl'>
        <div className='text-center'>
          <div className='w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center'>
            <svg className='w-6 h-6 text-blue-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' />
            </svg>
          </div>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-2'>
            房主切换了内容
          </h3>
          <p className='text-sm text-gray-500 dark:text-gray-400 mb-3'>
            房主正在观看：
          </p>
          <p className='text-base font-medium text-gray-900 dark:text-white mb-1'>
            {videoName || '未知视频'}
          </p>
          <p className='text-xs text-gray-500 dark:text-gray-400 mb-6'>
            第 {episode + 1} 集
          </p>
          <div className='flex gap-3'>
            <button
              onClick={onReject}
              className='flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium'
            >
              自由观看
            </button>
            <button
              onClick={onConfirm}
              className='flex-1 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition-colors font-medium'
            >
              跟随房主
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
