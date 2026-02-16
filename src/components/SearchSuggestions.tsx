'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface SearchSuggestionsProps {
  query: string;
  isVisible: boolean;
  onSelect: (suggestion: string) => void;
  onClose: () => void;
  onEnterKey: () => void; // 新增：处理回车键的回调
}

interface SuggestionItem {
  text: string;
  type: 'related';
  icon?: React.ReactNode;
}

export default function SearchSuggestions({
  query,
  isVisible,
  onSelect,
  onClose,
  onEnterKey,
}: SearchSuggestionsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 防抖：延迟300ms后更新debouncedQuery
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [query]);

  // 🚀 TanStack Query - 搜索建议
  // 参考源码模式：useQuery with enabled option + 缓存搜索结果
  // TanStack Query 内置了请求取消（AbortController），无需手动管理
  const { data: suggestions = [] } = useQuery<SuggestionItem[]>({
    queryKey: ['searchSuggestions', debouncedQuery],
    queryFn: async () => {
      const response = await fetch(
        `/api/search/suggestions?q=${encodeURIComponent(debouncedQuery.trim())}`
      );
      if (response.ok) {
        const data = await response.json();
        return data.suggestions.map(
          (item: { text: string }) => ({
            text: item.text,
            type: 'related' as const,
          })
        );
      }
      return [];
    },
    enabled: isVisible && debouncedQuery.trim().length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - cache suggestion results
    gcTime: 10 * 60 * 1000,
  });

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onClose]);

  // 处理键盘事件，特别是回车键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isVisible) {
        // 阻止默认行为，避免浏览器自动选择建议
        e.preventDefault();
        e.stopPropagation();
        // 关闭搜索建议并触发搜索
        onClose();
        onEnterKey();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown, true);
    }

    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isVisible, onClose, onEnterKey]);

  if (!isVisible || suggestions.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className='absolute top-full left-0 right-0 z-600 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto'
    >
      {suggestions.map((suggestion) => (
        <button
          key={`related-${suggestion.text}`}
          onClick={() => onSelect(suggestion.text)}
          className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150 flex items-center gap-3"
        >
          <span className='flex-1 text-sm text-gray-700 dark:text-gray-300 truncate'>
            {suggestion.text}
          </span>
        </button>
      ))}
    </div>
  );
}
