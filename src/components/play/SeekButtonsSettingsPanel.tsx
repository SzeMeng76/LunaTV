'use client';

import {
  Clock,
  Layout,
  X,
} from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';

interface SeekButtonsSettings {
  seekTime: number;
  mobileLayout: 'both' | 'left' | 'right';
}

interface SeekButtonsSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SeekButtonsSettings;
  onSettingsChange: (settings: Partial<SeekButtonsSettings>) => void;
}

export const SeekButtonsSettingsPanel = memo(function SeekButtonsSettingsPanel({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
}: SeekButtonsSettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [sliderSeekTime, setSliderSeekTime] = useState(settings.seekTime);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), prefersReducedMotion ? 0 : 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, prefersReducedMotion]);

  useEffect(() => {
    setSliderSeekTime(settings.seekTime);
  }, [settings.seekTime]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isVisible) return null;

  return (
    <>
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #00d4aa;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 212, 170, 0.4);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 4px 12px rgba(0, 212, 170, 0.6);
        }

        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #00d4aa;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 8px rgba(0, 212, 170, 0.4);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        input[type="range"]::-moz-range-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 4px 12px rgba(0, 212, 170, 0.6);
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
      {/* 背景遮罩 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          opacity: isOpen ? 1 : 0,
          transition: prefersReducedMotion ? 'none' : 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* 面板容器 */}
      <div
        ref={panelRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '480px',
          backgroundColor: '#1a1a1a',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          transform: isOpen ? 'scale(1)' : 'scale(0.95)',
          opacity: isOpen ? 1 : 0,
          transition: prefersReducedMotion
            ? 'none'
            : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* 头部 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            快进快退设置
          </h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div
          style={{
            padding: '1.5rem',
            maxHeight: '60vh',
            overflowY: 'auto',
          }}
        >
          {/* 快进快退时间 */}
          <div style={{ marginBottom: '2rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <Clock size={18} style={{ color: '#00d4aa' }} />
              <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#ffffff' }}>
                快进快退时间
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                type="range"
                min="3"
                max="60"
                step="1"
                value={sliderSeekTime}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  setSliderSeekTime(value);
                  onSettingsChange({ seekTime: value });
                }}
                style={{
                  flex: 1,
                  height: '6px',
                  borderRadius: '3px',
                  background: `linear-gradient(to right, #00d4aa 0%, #00d4aa ${((sliderSeekTime - 3) / (60 - 3)) * 100}%, rgba(255, 255, 255, 0.2) ${((sliderSeekTime - 3) / (60 - 3)) * 100}%, rgba(255, 255, 255, 0.2) 100%)`,
                  outline: 'none',
                  cursor: 'pointer',
                  WebkitAppearance: 'none',
                }}
              />
              <span
                style={{
                  minWidth: '60px',
                  textAlign: 'right',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: '#00d4aa',
                }}
              >
                {sliderSeekTime} 秒
              </span>
            </div>

            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.85rem',
                color: 'rgba(255, 255, 255, 0.6)',
              }}
            >
              点击按钮时前进或后退的时间（3-60秒）
            </div>
          </div>

          {/* 按钮布局 */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <Layout size={18} style={{ color: '#00d4aa' }} />
              <span style={{ fontSize: '0.95rem', fontWeight: 500, color: '#ffffff' }}>
                按钮布局（移动端）
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {[
                { value: 'both', label: '双侧', desc: '左右各一个' },
                { value: 'left', label: '左手模式', desc: '仅左侧' },
                { value: 'right', label: '右手模式', desc: '仅右侧' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => onSettingsChange({ mobileLayout: option.value as any })}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    border: settings.mobileLayout === option.value
                      ? '2px solid #00d4aa'
                      : '2px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    backgroundColor: settings.mobileLayout === option.value
                      ? 'rgba(0, 212, 170, 0.1)'
                      : 'rgba(255, 255, 255, 0.05)',
                    color: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                  }}
                  onMouseEnter={(e) => {
                    if (settings.mobileLayout !== option.value) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (settings.mobileLayout !== option.value) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }
                  }}
                >
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    {option.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                    {option.desc}
                  </div>
                </button>
              ))}
            </div>

            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 212, 170, 0.1)',
                border: '1px solid rgba(0, 212, 170, 0.2)',
                fontSize: '0.85rem',
                color: 'rgba(255, 255, 255, 0.8)',
                lineHeight: '1.5',
              }}
            >
              💡 单手模式：按钮显示双向箭头，点击上半边快退，下半边快进
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
});