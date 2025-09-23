'use client';

import React, { useState, useCallback } from 'react';
import {
  FunnelIcon,
  XMarkIcon,
  CalendarIcon,
  StarIcon,
  FireIcon,
  LanguageIcon,
  TagIcon,
} from '@heroicons/react/24/outline';

export interface TMDBFilterState {
  // 时间筛选
  startYear?: number;
  endYear?: number;

  // 评分筛选
  minRating?: number;
  maxRating?: number;

  // 人气筛选
  minPopularity?: number;
  maxPopularity?: number;

  // 投票数筛选
  minVoteCount?: number;

  // 集数筛选（TV剧用）
  minEpisodeCount?: number;

  // 类型筛选（TMDB类型ID）
  genreIds?: number[];

  // 语言筛选
  languages?: string[];

  // 只显示有评分的
  onlyRated?: boolean;

  // 排序方式
  sortBy?: 'rating' | 'date' | 'popularity' | 'vote_count' | 'title' | 'episode_count';
  sortOrder?: 'asc' | 'desc';

  // 结果限制
  limit?: number;
}

interface TMDBFilterPanelProps {
  filters: TMDBFilterState;
  onFiltersChange: (filters: TMDBFilterState) => void;
  contentType: 'movie' | 'tv';
  isVisible: boolean;
  onToggleVisible: () => void;
  resultCount?: number;
}

// TMDB类型映射（简化版，常见类型）
const MOVIE_GENRES = [
  { id: 28, name: '动作' },
  { id: 35, name: '喜剧' },
  { id: 18, name: '剧情' },
  { id: 27, name: '恐怖' },
  { id: 10749, name: '爱情' },
  { id: 878, name: '科幻' },
  { id: 53, name: '惊悚' },
  { id: 80, name: '犯罪' },
  { id: 14, name: '奇幻' },
  { id: 12, name: '冒险' },
];

const TV_GENRES = [
  { id: 18, name: '剧情' },
  { id: 35, name: '喜剧' },
  { id: 80, name: '犯罪' },
  { id: 9648, name: '悬疑' },
  { id: 10759, name: '动作冒险' },
  { id: 16, name: '动画' },
  { id: 99, name: '纪录片' },
  { id: 10765, name: '科幻奇幻' },
  { id: 10762, name: '儿童' },
  { id: 10763, name: '新闻' },
];

const LANGUAGES = [
  { code: 'zh', name: '中文' },
  { code: 'en', name: '英文' },
  { code: 'ja', name: '日文' },
  { code: 'ko', name: '韩文' },
  { code: 'es', name: '西班牙文' },
  { code: 'fr', name: '法文' },
  { code: 'de', name: '德文' },
  { code: 'it', name: '意大利文' },
];

const SORT_OPTIONS = [
  { value: 'rating', label: '评分', icon: StarIcon },
  { value: 'date', label: '时间', icon: CalendarIcon },
  { value: 'popularity', label: '人气', icon: FireIcon },
  { value: 'vote_count', label: '投票数', icon: TagIcon },
  { value: 'title', label: '标题', icon: LanguageIcon },
  { value: 'episode_count', label: '集数', icon: TagIcon, tvOnly: true },
];

export const TMDBFilterPanel: React.FC<TMDBFilterPanelProps> = ({
  filters,
  onFiltersChange,
  contentType,
  isVisible,
  onToggleVisible,
  resultCount = 0,
}) => {
  const [localFilters, setLocalFilters] = useState<TMDBFilterState>(filters);

  const genres = contentType === 'movie' ? MOVIE_GENRES : TV_GENRES;
  const sortOptions = SORT_OPTIONS.filter(option => !option.tvOnly || contentType === 'tv');

  const updateFilter = useCallback((key: keyof TMDBFilterState, value: any) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const applyFilters = useCallback(() => {
    onFiltersChange(localFilters);
  }, [localFilters, onFiltersChange]);

  const resetFilters = useCallback(() => {
    const emptyFilters: TMDBFilterState = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  }, [onFiltersChange]);

  const hasActiveFilters = Object.keys(localFilters).some(key => {
    const value = localFilters[key as keyof TMDBFilterState];
    return value !== undefined && value !== null && (Array.isArray(value) ? value.length > 0 : true);
  });

  return (
    <div className="relative">
      {/* 筛选按钮 */}
      <button
        onClick={onToggleVisible}
        className={`inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium ${
          hasActiveFilters
            ? 'text-blue-700 bg-blue-50 border-blue-300 dark:text-blue-300 dark:bg-blue-900/20 dark:border-blue-600'
            : 'text-gray-700 bg-white hover:bg-gray-50 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700'
        } transition-colors`}
      >
        <FunnelIcon className="h-4 w-4 mr-2" />
        筛选
        {hasActiveFilters && (
          <span className="ml-1 bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">
            {Object.keys(localFilters).length}
          </span>
        )}
      </button>

      {/* 筛选面板 */}
      {isVisible && (
        <div className="absolute top-full left-0 mt-2 w-96 max-w-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {contentType === 'movie' ? '电影' : '电视剧'}筛选
            </h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={resetFilters}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                重置
              </button>
              <button
                onClick={onToggleVisible}
                className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {/* 年份筛选 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                年份范围
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="起始年份"
                  value={localFilters.startYear || ''}
                  onChange={(e) => updateFilter('startYear', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  min="1900"
                  max={new Date().getFullYear()}
                />
                <input
                  type="number"
                  placeholder="结束年份"
                  value={localFilters.endYear || ''}
                  onChange={(e) => updateFilter('endYear', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  min="1900"
                  max={new Date().getFullYear()}
                />
              </div>
            </div>

            {/* 评分筛选 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                评分范围 (0-10)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="最低评分"
                  value={localFilters.minRating || ''}
                  onChange={(e) => updateFilter('minRating', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  min="0"
                  max="10"
                  step="0.1"
                />
                <input
                  type="number"
                  placeholder="最高评分"
                  value={localFilters.maxRating || ''}
                  onChange={(e) => updateFilter('maxRating', e.target.value ? parseFloat(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  min="0"
                  max="10"
                  step="0.1"
                />
              </div>
            </div>

            {/* 人气筛选 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                最低人气值
              </label>
              <input
                type="number"
                placeholder="例如: 10"
                value={localFilters.minPopularity || ''}
                onChange={(e) => updateFilter('minPopularity', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                min="0"
              />
            </div>

            {/* 最低投票数 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                最低投票数
              </label>
              <input
                type="number"
                placeholder="例如: 100"
                value={localFilters.minVoteCount || ''}
                onChange={(e) => updateFilter('minVoteCount', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                min="0"
              />
            </div>

            {/* TV剧集数筛选 */}
            {contentType === 'tv' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  最少参演集数
                </label>
                <input
                  type="number"
                  placeholder="例如: 5"
                  value={localFilters.minEpisodeCount || ''}
                  onChange={(e) => updateFilter('minEpisodeCount', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  min="1"
                />
              </div>
            )}

            {/* 类型筛选 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                类型
              </label>
              <div className="flex flex-wrap gap-1">
                {genres.map((genre) => (
                  <button
                    key={genre.id}
                    onClick={() => {
                      const current = localFilters.genreIds || [];
                      const isSelected = current.includes(genre.id);
                      updateFilter(
                        'genreIds',
                        isSelected
                          ? current.filter(id => id !== genre.id)
                          : [...current, genre.id]
                      );
                    }}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      (localFilters.genreIds || []).includes(genre.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {genre.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 语言筛选 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                语言
              </label>
              <div className="flex flex-wrap gap-1">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      const current = localFilters.languages || [];
                      const isSelected = current.includes(lang.code);
                      updateFilter(
                        'languages',
                        isSelected
                          ? current.filter(code => code !== lang.code)
                          : [...current, lang.code]
                      );
                    }}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      (localFilters.languages || []).includes(lang.code)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 排序方式 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                排序方式
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={localFilters.sortBy || 'rating'}
                  onChange={(e) => updateFilter('sortBy', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={localFilters.sortOrder || 'desc'}
                  onChange={(e) => updateFilter('sortOrder', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="desc">降序</option>
                  <option value="asc">升序</option>
                </select>
              </div>
            </div>

            {/* 选项开关 */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={localFilters.onlyRated || false}
                  onChange={(e) => updateFilter('onlyRated', e.target.checked || undefined)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  只显示有评分的作品
                </span>
              </label>
            </div>

            {/* 结果限制 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                显示数量限制
              </label>
              <select
                value={localFilters.limit || ''}
                onChange={(e) => updateFilter('limit', e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">不限制</option>
                <option value="50">50 个</option>
                <option value="100">100 个</option>
                <option value="200">200 个</option>
                <option value="500">500 个</option>
              </select>
            </div>
          </div>

          {/* 应用按钮 */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {resultCount > 0 && `当前 ${resultCount} 个结果`}
              </span>
              <button
                onClick={applyFilters}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                应用筛选
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TMDBFilterPanel;