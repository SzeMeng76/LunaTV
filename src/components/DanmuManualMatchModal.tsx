/* eslint-disable @next/next/no-img-element */
'use client';

import { Loader2, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DanmuManualSelection {
  animeId: number;
  animeTitle: string;
  episodeId: number;
  episodeTitle: string;
}

interface DanmuSearchEpisodeItem {
  episodeId: number;
  episodeTitle: string;
}

interface DanmuSearchAnimeItem {
  animeId: number;
  animeTitle: string;
  type: string;
  typeDescription?: string;
  imageUrl?: string;
  episodes: DanmuSearchEpisodeItem[];
}

interface DanmuManualMatchModalProps {
  isOpen: boolean;
  defaultKeyword: string;
  currentEpisode: number;
  onClose: () => void;
  onApply: (selection: DanmuManualSelection) => Promise<void> | void;
  portalContainer?: HTMLElement | null;
}

function buildAnimeMeta(anime: DanmuSearchAnimeItem): string {
  const parts = [anime.typeDescription, anime.type].filter(Boolean);
  if (parts.length === 0) return '未知类型';
  return parts.join(' / ');
}

export default function DanmuManualMatchModal({
  isOpen,
  defaultKeyword,
  currentEpisode,
  onClose,
  onApply,
  portalContainer,
}: DanmuManualMatchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [keyword, setKeyword] = useState(defaultKeyword);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DanmuSearchAnimeItem[]>([]);
  const [selectedAnimeId, setSelectedAnimeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingEpisodeId, setApplyingEpisodeId] = useState<number | null>(null);
  const [episodeDescending, setEpisodeDescending] = useState(false);
  const [episodeViewMode, setEpisodeViewMode] = useState<'list' | 'grid'>('list');

  const selectedAnime = useMemo(
    () => results.find((item) => item.animeId === selectedAnimeId) || null,
    [results, selectedAnimeId],
  );

  const searchDanmuSource = useCallback(async (rawKeyword: string) => {
    const normalizedKeyword = rawKeyword.trim();
    if (!normalizedKeyword) {
      setError('请输入搜索关键词');
      setResults([]);
      setSelectedAnimeId(null);
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/danmu-external/search?keyword=${encodeURIComponent(normalizedKeyword)}`,
        { cache: 'no-store' },
      );
      const data = await response.json();
      if (!response.ok || data?.code !== 200) {
        throw new Error(data?.message || `搜索失败: ${response.status}`);
      }

      const animes = Array.isArray(data?.animes)
        ? (data.animes as DanmuSearchAnimeItem[])
        : [];
      setResults(animes);

      if (animes.length === 0) {
        setSelectedAnimeId(null);
        setError('没有找到匹配的弹幕源，请尝试更换关键词');
        return;
      }

      setSelectedAnimeId((prev) => {
        if (prev && animes.some((item) => item.animeId === prev)) {
          return prev;
        }
        return animes[0].animeId;
      });
    } catch (err) {
      setResults([]);
      setSelectedAnimeId(null);
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setKeyword(defaultKeyword || '');
    setResults([]);
    setSelectedAnimeId(null);
    setError(null);
    setApplyingEpisodeId(null);
  }, [defaultKeyword, isOpen, currentEpisode]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const firstKeyword = defaultKeyword.trim();
    if (!firstKeyword) return;
    void searchDanmuSource(firstKeyword);
  }, [defaultKeyword, isOpen, searchDanmuSource]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <>
      <div className='fixed inset-0 z-[1008] bg-black/65 backdrop-blur-sm'
        onClick={onClose}
      />
      {/* Mobile: full-screen sheet / Desktop: centered dialog */}
      <div className='fixed inset-0 z-[1009] flex flex-col bg-gray-950/95 dark:bg-slate-950/95 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[90vh] md:w-[min(96vw,1080px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:border-white/20 md:pb-0 md:pt-0 md:shadow-2xl'>
        {/* Header */}
        <div className='flex shrink-0 items-center justify-between border-b border-white/10 px-[max(1rem,env(safe-area-inset-left))] py-3 sm:px-5'>
          <div>
            <h2 className='text-base font-semibold text-white sm:text-lg'>
              手动匹配弹幕
            </h2>
            <p className='text-xs text-slate-400'>
              搜索番剧并指定集数，立即覆盖当前弹幕
            </p>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white'
            aria-label='关闭手动匹配弹窗'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        {/* Search Bar */}
        <div className='shrink-0 border-b border-white/10 px-[max(1rem,env(safe-area-inset-left))] py-3 sm:px-5'>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <input
              type='text'
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void searchDanmuSource(keyword);
                }
              }}
              placeholder='输入标题关键词，例如：猫和老鼠'
              className='h-10 flex-1 rounded-lg border border-white/15 bg-gray-900/80 px-3 text-sm text-slate-100 outline-none transition focus:border-green-400'
            />
            <button
              type='button'
              onClick={() => void searchDanmuSource(keyword)}
              disabled={searching}
              className='inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60'
            >
              {searching ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Search className='h-4 w-4' />
              )}
              搜索弹幕源
            </button>
          </div>
          {error && <p className='mt-2 text-xs text-amber-300'>{error}</p>}
        </div>

        {/* Two-panel layout: Mobile stacked scroll / Desktop side-by-side */}
        <div className='min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-2 md:overflow-hidden'>
          {/* Left: Anime list */}
          <div className='border-b border-white/10 md:border-b-0 md:border-r md:border-white/10 md:flex md:flex-col md:min-h-0'>
            <div className='border-b border-white/10 px-4 py-2 text-xs text-slate-400 sm:px-5'>
              搜索结果（选择正确番剧）
            </div>
            <div className='p-3 sm:p-4 md:flex-1 md:overflow-y-auto'>
              {searching && results.length === 0 ? (
                <div className='rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-slate-300'>
                  正在搜索...
                </div>
              ) : results.length === 0 ? (
                <div className='rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-center text-sm text-slate-300'>
                  暂无结果
                </div>
              ) : (
                <div className='space-y-2'>
                  {results.map((anime) => (
                    <button
                      key={anime.animeId}
                      type='button'
                      onClick={() => setSelectedAnimeId(anime.animeId)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-2.5 text-left transition ${
                        selectedAnimeId === anime.animeId
                          ? 'border-green-400/70 bg-green-500/15'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className='h-14 w-10 shrink-0 overflow-hidden rounded bg-slate-800/80'>
                        {anime.imageUrl ? (
                          <img
                            src={anime.imageUrl.replace(/^http:\/\//, 'https://')}
                            alt={anime.animeTitle}
                            className='h-full w-full object-cover'
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              if (target.nextElementSibling) {
                                (target.nextElementSibling as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className='h-full w-full items-center justify-center text-[10px] text-slate-400'
                          style={{ display: anime.imageUrl ? 'none' : 'flex' }}
                        >
                          无封面
                        </div>
                      </div>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium text-white'>
                          {anime.animeTitle}
                        </p>
                        <p className='mt-0.5 truncate text-xs text-slate-400'>
                          {buildAnimeMeta(anime)}
                        </p>
                        <p className='mt-0.5 text-[11px] text-slate-500'>
                          共 {anime.episodes.length} 集
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Episode list */}
          <div className='md:flex md:min-h-0 md:flex-col'>
            <div className='flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs text-slate-400 sm:px-5'>
              <span>
                {selectedAnime
                  ? `集数列表：${selectedAnime.animeTitle}`
                  : '集数列表'}
              </span>
              {selectedAnime && selectedAnime.episodes.length > 0 && (
                <div className='flex items-center gap-2'>
                  {/* 倒序切换按钮 */}
                  <button
                    type='button'
                    onClick={() => setEpisodeDescending((prev) => !prev)}
                    className='rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-green-400'
                    title={episodeDescending ? '切换正序' : '切换倒序'}
                  >
                    <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4' />
                    </svg>
                  </button>
                  {/* 视图切换按钮 */}
                  <div className='flex items-center gap-1 rounded-md bg-gray-800/80 p-1'>
                    <button
                      type='button'
                      onClick={() => setEpisodeViewMode('list')}
                      title='列表视图'
                      className={`rounded px-1.5 py-1 text-xs font-medium transition-colors ${
                        episodeViewMode === 'list'
                          ? 'bg-green-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <svg className='h-3.5 w-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' />
                      </svg>
                    </button>
                    <button
                      type='button'
                      onClick={() => setEpisodeViewMode('grid')}
                      title='格子视图'
                      className={`rounded px-1.5 py-1 text-xs font-medium transition-colors ${
                        episodeViewMode === 'grid'
                          ? 'bg-green-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <svg className='h-3.5 w-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z' />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className='p-3 sm:p-4 md:flex-1 md:overflow-y-auto'>
              {!selectedAnime ? (
                <div className='rounded-lg border border-dashed border-white/15 bg-white/5 p-4 text-center text-sm text-slate-300'>
                  请先选择左侧番剧
                </div>
              ) : (
                <>
                  {episodeViewMode === 'list' ? (
                    <div className='space-y-2'>
                      {(episodeDescending ? [...selectedAnime.episodes].reverse() : selectedAnime.episodes).map((ep, index) => {
                        const originalIndex = episodeDescending ? selectedAnime.episodes.length - 1 - index : index;
                        const currentMark = originalIndex + 1 === currentEpisode;
                        const applying = applyingEpisodeId === ep.episodeId;
                        return (
                          <button
                            key={ep.episodeId}
                            type='button'
                            disabled={applyingEpisodeId !== null}
                            onClick={async () => {
                              setApplyingEpisodeId(ep.episodeId);
                              try {
                                await onApply({
                                  animeId: selectedAnime.animeId,
                                  animeTitle: selectedAnime.animeTitle,
                                  episodeId: ep.episodeId,
                                  episodeTitle: ep.episodeTitle || `第${originalIndex + 1}集`,
                                });
                              } finally {
                                setApplyingEpisodeId(null);
                              }
                            }}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                              currentMark
                                ? 'border-cyan-400/60 bg-cyan-500/10'
                                : 'border-white/10 bg-white/5 hover:bg-white/10'
                            } ${applyingEpisodeId !== null ? 'cursor-not-allowed opacity-70' : ''}`}
                          >
                            <span className='truncate text-sm text-slate-100'>
                              {ep.episodeTitle || `第${originalIndex + 1}集`}
                            </span>
                            <span className='shrink-0 text-xs text-slate-400'>
                              {applying ? (
                                <span className='inline-flex items-center gap-1'>
                                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                                  应用中
                                </span>
                              ) : currentMark ? (
                                '当前集'
                              ) : (
                                '使用此集'
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className='grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4'>
                      {(episodeDescending ? [...selectedAnime.episodes].reverse() : selectedAnime.episodes).map((ep, index) => {
                        const originalIndex = episodeDescending ? selectedAnime.episodes.length - 1 - index : index;
                        const currentMark = originalIndex + 1 === currentEpisode;
                        const applying = applyingEpisodeId === ep.episodeId;
                        return (
                          <button
                            key={ep.episodeId}
                            type='button'
                            disabled={applyingEpisodeId !== null}
                            onClick={async () => {
                              setApplyingEpisodeId(ep.episodeId);
                              try {
                                await onApply({
                                  animeId: selectedAnime.animeId,
                                  animeTitle: selectedAnime.animeTitle,
                                  episodeId: ep.episodeId,
                                  episodeTitle: ep.episodeTitle || `第${originalIndex + 1}集`,
                                });
                              } finally {
                                setApplyingEpisodeId(null);
                              }
                            }}
                            className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                              currentMark
                                ? 'bg-cyan-500 text-white shadow-md'
                                : 'bg-white/5 text-slate-100 hover:bg-white/10 border border-white/10'
                            } ${applyingEpisodeId !== null ? 'cursor-not-allowed opacity-70' : ''}`}
                            title={ep.episodeTitle || `第${originalIndex + 1}集`}
                          >
                            <div className='truncate'>
                              {applying ? (
                                <Loader2 className='h-4 w-4 animate-spin mx-auto' />
                              ) : (
                                originalIndex + 1
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    portalContainer || document.body,
  );
}
