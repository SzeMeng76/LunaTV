'use client';

import {
  Sparkles,
  X,
  Zap,
  Image as ImageIcon,
  Gauge,
  SplitSquareHorizontal,
  Info,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

interface WebSRSettings {
  enabled: boolean;
  mode: 'upscale' | 'restore';
  contentType: 'an' | 'rl' | '3d';
  networkSize: 's' | 'm' | 'l';
  compareEnabled: boolean;
  comparePosition: number;
}

interface WebSRSettingsPanelProps {
  /** 是否显示面板 */
  isOpen: boolean;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 当前设置 */
  settings: WebSRSettings;
  /** 更新设置回调 */
  onSettingsChange: (settings: Partial<WebSRSettings>) => void;
  /** 是否支持 WebGPU */
  webGPUSupported: boolean;
  /** 是否正在处理 */
  processing?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export const WebSRSettingsPanel = memo(function WebSRSettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  webGPUSupported,
  processing = false,
}: WebSRSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [sliderComparePosition, setSliderComparePosition] = useState(settings.comparePosition);

  // ♿ 检测用户是否偏好减少动画
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // 处理打开动画
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // 处理设置更新
  const handleUpdate = useCallback(
    <K extends keyof WebSRSettings>(key: K, value: WebSRSettings[K]) => {
      onSettingsChange({ [key]: value });
    },
    [onSettingsChange],
  );

  // 同步滑块状态
  useEffect(() => {
    setSliderComparePosition(settings.comparePosition);
  }, [settings.comparePosition]);

  const commitComparePosition = useCallback(() => {
    if (sliderComparePosition !== settings.comparePosition) {
      handleUpdate('comparePosition', sliderComparePosition);
    }
  }, [handleUpdate, settings.comparePosition, sliderComparePosition]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={`fixed right-4 bottom-20 z-[9999] w-80 overflow-hidden transition-all ${
        prefersReducedMotion
          ? 'duration-0'
          : 'duration-500'
      } ${
        isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
      }`}
      style={{
        boxShadow: `
          0 2px 8px rgba(0, 0, 0, 0.1),
          0 8px 32px rgba(0, 0, 0, 0.2),
          0 16px 64px rgba(0, 0, 0, 0.15),
          0 0 0 1px rgba(255, 255, 255, 0.05)
        `,
        transitionTimingFunction: prefersReducedMotion
          ? 'linear'
          : 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.85) 0%, rgba(20, 20, 20, 0.9) 100%)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 💎 边缘光晕效果 */}
      <div
        className="absolute inset-0 rounded-[20px] pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, transparent 50%)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      />

      {/* 头部 */}
      <div className='relative flex items-center justify-between px-5 py-4 border-b border-white/10'>
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.05) 0%, transparent 100%)',
          }}
        />
        <div className='relative flex items-center gap-3'>
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-600/20 backdrop-blur-sm">
            <Sparkles className='w-4 h-4 text-purple-400' />
          </div>
          <div className="flex flex-col">
            <span className='font-semibold text-white text-sm tracking-wide'>
              AI超分设置
            </span>
            <span className="text-[10px] text-gray-400">Super Resolution</span>
          </div>
          {settings.enabled && (
            <span
              className='px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-500/20 to-violet-600/20 text-purple-300 border border-purple-500/30 backdrop-blur-sm'
              style={{
                boxShadow: '0 0 12px rgba(139, 92, 246, 0.2)',
              }}
            >
              {processing ? '处理中' : '已启用'}
            </span>
          )}
        </div>
        <div className='relative flex items-center gap-1'>
          <button
            onClick={onClose}
            className='p-2 hover:bg-white/10 rounded-xl transition-all duration-200 group active:scale-95'
            style={{
              transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <X className='w-4 h-4 text-gray-400 transition-colors group-hover:text-white' />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className='px-5 py-4 space-y-4 overflow-hidden'>
        {/* WebGPU 不支持提示 */}
        {!webGPUSupported && (
          <div
            className='px-3 py-2 rounded-xl backdrop-blur-sm'
            style={{
              background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(185, 28, 28, 0.1) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <p className='text-xs text-red-300 font-medium flex items-center gap-1.5'>
              <Info className='w-3.5 h-3.5' />
              浏览器不支持 WebGPU
            </p>
            <p className='text-[11px] text-red-400/70 mt-0.5'>
              请使用 Chrome/Edge 113+ 浏览器
            </p>
          </div>
        )}

        {/* 启用超分主开关 */}
        <div className='flex items-center justify-between py-1'>
          <span className='text-sm font-medium text-gray-200'>启用AI超分</span>
          <button
            onClick={() => handleUpdate('enabled', !settings.enabled)}
            disabled={!webGPUSupported}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${
              webGPUSupported ? 'active:scale-90' : 'opacity-50 cursor-not-allowed'
            }`}
            style={{
              background: settings.enabled
                ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                : '#4b5563',
              boxShadow: settings.enabled
                ? '0 0 16px rgba(139, 92, 246, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.2)'
                : 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
              transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <span
              className='inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-all duration-300'
              style={{
                transform: settings.enabled ? 'translateX(22px)' : 'translateX(2px)',
                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            />
          </button>
        </div>

        {/* 只有启用超分后才显示其他设置 */}
        {settings.enabled && webGPUSupported && (
          <>
            {/* 超分模式 */}
            <div>
              <div className='flex items-center gap-1.5 text-xs text-gray-300 mb-3'>
                <Zap className='w-3.5 h-3.5 text-gray-400' />
                <span className="font-medium">超分模式</span>
              </div>
              <div className='grid grid-cols-2 gap-2'>
                {[
                  { value: 'upscale' as const, label: '2x超分', desc: '放大2倍' },
                  { value: 'restore' as const, label: '画质修复', desc: '降噪' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleUpdate('mode', option.value)}
                    className={`relative py-2.5 px-3 rounded-xl text-xs font-semibold transition-all duration-300 active:scale-95 overflow-hidden group`}
                    style={{
                      background: settings.mode === option.value
                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: settings.mode === option.value
                        ? '1px solid rgba(139, 92, 246, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.05)',
                      boxShadow: settings.mode === option.value
                        ? '0 4px 16px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                        : 'none',
                      color: settings.mode === option.value ? '#fff' : '#9ca3af',
                      transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-bold">{option.label}</span>
                      <span className="text-[10px] opacity-70">{option.desc}</span>
                    </div>
                    {settings.mode === option.value && (
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 100%)',
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 内容类型 */}
            <div>
              <div className='flex items-center gap-1.5 text-xs text-gray-300 mb-3'>
                <ImageIcon className='w-3.5 h-3.5 text-gray-400' />
                <span className="font-medium">内容类型</span>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                {[
                  { value: 'an' as const, label: '动漫', icon: '🎨' },
                  { value: 'rl' as const, label: '真人', icon: '📷' },
                  { value: '3d' as const, label: '3D', icon: '🎮' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleUpdate('contentType', option.value)}
                    className={`relative py-2 px-2 rounded-xl text-xs font-semibold transition-all duration-300 active:scale-95 overflow-hidden group`}
                    style={{
                      background: settings.contentType === option.value
                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: settings.contentType === option.value
                        ? '1px solid rgba(139, 92, 246, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.05)',
                      boxShadow: settings.contentType === option.value
                        ? '0 4px 16px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                        : 'none',
                      color: settings.contentType === option.value ? '#fff' : '#9ca3af',
                      transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-base">{option.icon}</span>
                      <span>{option.label}</span>
                    </div>
                    {settings.contentType === option.value && (
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 100%)',
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 画质等级 */}
            <div>
              <div className='flex items-center gap-1.5 text-xs text-gray-300 mb-3'>
                <Gauge className='w-3.5 h-3.5 text-gray-400' />
                <span className="font-medium">画质等级</span>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                {[
                  { value: 's' as const, label: '快速', desc: 'Small' },
                  { value: 'm' as const, label: '标准', desc: 'Medium' },
                  { value: 'l' as const, label: '高质', desc: 'Large' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleUpdate('networkSize', option.value)}
                    className={`relative py-2 px-2 rounded-xl text-xs font-semibold transition-all duration-300 active:scale-95 overflow-hidden group`}
                    style={{
                      background: settings.networkSize === option.value
                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: settings.networkSize === option.value
                        ? '1px solid rgba(139, 92, 246, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.05)',
                      boxShadow: settings.networkSize === option.value
                        ? '0 4px 16px rgba(139, 92, 246, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                        : 'none',
                      color: settings.networkSize === option.value ? '#fff' : '#9ca3af',
                      transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-bold">{option.label}</span>
                      <span className="text-[10px] opacity-70">{option.desc}</span>
                    </div>
                    {settings.networkSize === option.value && (
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 100%)',
                        }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 画面对比开关 */}
            <div className='flex items-center justify-between py-1'>
              <div className='flex items-center gap-1.5'>
                <SplitSquareHorizontal className='w-3.5 h-3.5 text-gray-400' />
                <span className='text-sm font-medium text-gray-200'>画面对比</span>
              </div>
              <button
                onClick={() => handleUpdate('compareEnabled', !settings.compareEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 active:scale-90`}
                style={{
                  background: settings.compareEnabled
                    ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                    : '#4b5563',
                  boxShadow: settings.compareEnabled
                    ? '0 0 16px rgba(139, 92, 246, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.2)'
                    : 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
                  transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <span
                  className='inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-all duration-300'
                  style={{
                    transform: settings.compareEnabled ? 'translateX(22px)' : 'translateX(2px)',
                    transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                />
              </button>
            </div>

            {/* 对比位置滑块 */}
            {settings.compareEnabled && (
              <div className='flex items-center gap-3'>
                <div className='flex items-center gap-1.5 text-xs text-gray-300 w-16 shrink-0'>
                  <SplitSquareHorizontal className='w-3.5 h-3.5 text-gray-400' />
                  <span className="font-medium">位置</span>
                </div>
                <div className="relative flex-1">
                  <input
                    type='range'
                    min={0}
                    max={100}
                    step={1}
                    value={sliderComparePosition}
                    onChange={(e) => setSliderComparePosition(parseFloat(e.target.value))}
                    onMouseUp={commitComparePosition}
                    onTouchEnd={commitComparePosition}
                    onBlur={commitComparePosition}
                    className='w-full h-2 rounded-full appearance-none cursor-pointer transition-all'
                    style={{
                      background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${sliderComparePosition}%, rgba(75, 85, 99, 0.5) ${sliderComparePosition}%, rgba(75, 85, 99, 0.5) 100%)`,
                    }}
                  />
                </div>
                <span className='text-xs text-purple-400 w-12 text-right font-mono font-semibold tabular-nums'>
                  {sliderComparePosition}%
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部装饰条 */}
      <div
        className="h-1"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #8b5cf6 50%, transparent 100%)',
          opacity: 0.3,
        }}
      />

      {/* CSS样式 - 自定义滑块样式 */}
      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.1);
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        input[type='range']::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 4px 16px rgba(139, 92, 246, 0.6), 0 0 0 3px rgba(255, 255, 255, 0.15);
        }

        input[type='range']::-webkit-slider-thumb:active {
          transform: scale(1.1);
        }

        input[type='range']::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 8px rgba(139, 92, 246, 0.5), 0 0 0 2px rgba(255, 255, 255, 0.1);
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        input[type='range']::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 4px 16px rgba(139, 92, 246, 0.6), 0 0 0 3px rgba(255, 255, 255, 0.15);
        }

        /* 尊重用户的减少动画偏好 */
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
});

export default WebSRSettingsPanel;

