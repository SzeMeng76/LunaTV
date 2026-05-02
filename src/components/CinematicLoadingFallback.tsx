'use client';

import { useEffect, useState } from 'react';
import { Film, Popcorn, Star, Sparkles } from 'lucide-react';

/**
 * Cinematic Loading Fallback - Movie-themed loading experience
 *
 * Features:
 * - Bing daily wallpaper background (blurred)
 * - Film reel loading animation with progress percentage
 * - Rotating fun messages to keep users engaged
 * - Dark mode optimized for movie watching experience
 * - Smooth animations without jarring flashes
 *
 * Design principles from:
 * - https://www.numberanalytics.com/blog/the-art-of-loading-animations
 * - https://dribbble.com/tags/movie-streaming
 */

const loadingMessages = [
  { icon: Film, text: '正在为您准备今晚的观影清单...', emoji: '🎬' },
  { icon: Popcorn, text: '爆米花准备好了吗？', emoji: '🍿' },
  { icon: Star, text: '发现了数百部精彩影片...', emoji: '⭐' },
  { icon: Sparkles, text: '正在寻找最适合您的推荐...', emoji: '✨' },
];

export function CinematicLoadingFallback() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [bingWallpaper, setBingWallpaper] = useState<string>('');

  // Fetch Bing wallpaper
  useEffect(() => {
    const fetchBingWallpaper = async () => {
      try {
        const response = await fetch('/api/bing-wallpaper');
        const data = await response.json();
        if (data.url) {
          setBingWallpaper(data.url);
        }
      } catch (error) {
        console.log('Failed to fetch Bing wallpaper:', error);
      }
    };

    fetchBingWallpaper();
  }, []);

  // Fade in after mount
  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Rotate messages every 2.5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const currentMessage = loadingMessages[messageIndex];
  const IconComponent = currentMessage.icon;

  return (
    <div
      className={`min-h-screen flex items-center justify-center relative overflow-hidden transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Bing wallpaper background */}
      {bingWallpaper && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
          style={{ backgroundImage: `url(${bingWallpaper})` }}
        />
      )}

      {/* Fallback gradient background */}
      {!bingWallpaper && (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-800 to-black" />
      )}

      {/* Gradient overlay layers (like login page) */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/40 via-blue-600/30 to-pink-500/40 dark:from-purple-900/50 dark:via-blue-900/40 dark:to-pink-900/50" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />

      {/* Subtle animated background stars */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full animate-twinkle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 text-center px-4 sm:px-6 max-w-md w-full">
        {/* Film reel loading animation - responsive sizing */}
        <div className="mb-6 sm:mb-8 relative">
          {/* Subtle glow effect - responsive */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 sm:w-32 sm:h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse-slow" />
          </div>

          {/* Film reel icon with rotation - responsive sizing */}
          <div className="relative flex items-center justify-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center animate-spin-gentle backdrop-blur-sm border-2 border-white/10">
              {/* Film reel holes (4 corners) - responsive */}
              <div className="absolute w-2 h-2 sm:w-3 sm:h-3 bg-gray-900 rounded-full top-1.5 left-1.5 sm:top-2 sm:left-2" />
              <div className="absolute w-2 h-2 sm:w-3 sm:h-3 bg-gray-900 rounded-full top-1.5 right-1.5 sm:top-2 sm:right-2" />
              <div className="absolute w-2 h-2 sm:w-3 sm:h-3 bg-gray-900 rounded-full bottom-1.5 left-1.5 sm:bottom-2 sm:left-2" />
              <div className="absolute w-2 h-2 sm:w-3 sm:h-3 bg-gray-900 rounded-full bottom-1.5 right-1.5 sm:bottom-2 sm:right-2" />

              {/* Center icon - responsive */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-900 flex items-center justify-center">
                <IconComponent className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Message with emoji - responsive text sizing */}
        <div className="mb-5 sm:mb-6 space-y-2 sm:space-y-3">
          <div className="text-3xl sm:text-4xl">
            {currentMessage.emoji}
          </div>
          <h2 className="text-lg sm:text-xl font-medium text-white transition-opacity duration-500 leading-relaxed">
            {currentMessage.text}
          </h2>
        </div>

        {/* Pulsing dots (iOS style) - responsive sizing */}
        <div className="flex justify-center gap-2 mb-6 sm:mb-8">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-500 rounded-full animate-pulse-dot" style={{ animationDelay: '0s' }} />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-purple-500 rounded-full animate-pulse-dot" style={{ animationDelay: '0.15s' }} />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-pink-500 rounded-full animate-pulse-dot" style={{ animationDelay: '0.3s' }} />
        </div>

        {/* Subtle tip - responsive padding and text */}
        <div className="mt-6 sm:mt-8 p-2.5 sm:p-3 bg-gray-800/30 rounded-lg border border-gray-700/30 backdrop-blur-sm">
          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
            💡 快捷键 <kbd className="px-1.5 py-0.5 sm:px-2 bg-gray-700/50 rounded text-xs mx-1">Space</kbd> 播放/暂停
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }

        @keyframes spin-gentle {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }

        @keyframes pulse-dot {
          0%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }

        .animate-twinkle {
          animation: twinkle ease-in-out infinite;
        }

        .animate-spin-gentle {
          animation: spin-gentle 6s linear infinite;
        }

        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }

        .animate-pulse-dot {
          animation: pulse-dot 1.4s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-twinkle,
          .animate-spin-gentle,
          .animate-pulse-slow,
          .animate-pulse-dot {
            animation: none !important;
          }
        }

        kbd {
          box-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}

