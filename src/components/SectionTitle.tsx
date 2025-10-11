import { LucideIcon } from 'lucide-react';
import React from 'react';

interface SectionTitleProps {
  title: string;
  icon?: LucideIcon;
  iconColor?: string;
}

export default function SectionTitle({
  title,
  icon: Icon,
  iconColor = 'text-blue-500'
}: SectionTitleProps) {
  return (
    <div className="relative inline-block group">
      {/* 标题文本 */}
      <div className="flex items-center gap-2">
        {/* 图标 */}
        {Icon && (
          <div className={`${iconColor} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
            <Icon size={24} strokeWidth={2.5} />
          </div>
        )}

        {/* 渐变文本 */}
        <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 dark:from-gray-100 dark:via-gray-200 dark:to-gray-300 bg-clip-text text-transparent transition-all duration-300">
          {title}
        </h2>
      </div>

      {/* 动态下划线 */}
      <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out group-hover:w-full rounded-full shadow-lg shadow-blue-500/50"></div>

      {/* 装饰点 */}
      <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
    </div>
  );
}
