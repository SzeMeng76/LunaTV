'use client';

interface SourceSwitchDialogProps {
  show: boolean;
  ownerSource: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SourceSwitchDialog({
  show,
  ownerSource,
  onConfirm,
  onCancel,
}: SourceSwitchDialogProps) {
  if (!show) return null;

  return (
    <div className='fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-9999'>
      <div className='bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl'>
        <div className='text-center'>
          <div className='w-12 h-12 mx-auto mb-4 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center'>
            <svg className='w-6 h-6 text-yellow-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
            </svg>
          </div>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-2'>
            播放源不同
          </h3>
          <p className='text-sm text-gray-500 dark:text-gray-400 mb-3'>
            房主使用的播放源与您不同，是否切换到房主的播放源？
          </p>
          <p className='text-base font-medium text-gray-900 dark:text-white mb-1'>
            房主播放源
          </p>
          <p className='text-sm text-blue-500 dark:text-blue-400 mb-3 font-mono'>
            {ownerSource}
          </p>
          <p className='text-xs text-orange-500 dark:text-orange-400 mb-6'>
            ⚠️ 保持当前源将无法与房主同步进度
          </p>
          <div className='flex gap-3'>
            <button
              onClick={onCancel}
              className='flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium'
            >
              保持当前源
            </button>
            <button
              onClick={onConfirm}
              className='flex-1 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition-colors font-medium'
            >
              切换源
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
