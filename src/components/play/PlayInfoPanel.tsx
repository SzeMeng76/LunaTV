/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
import VideoCard from '@/components/VideoCard';
import CommentSection from '@/components/play/CommentSection';
import { processImageUrl } from '@/lib/utils';

type Tab = 'overview' | 'cast' | 'recommendations' | 'comments';

interface PlayInfoPanelProps {
  title: string;
  year?: string;
  cover?: string;
  sourceName?: string;
  totalEpisodes: number;
  currentEpisodeIndex: number;
  episodeName?: string;
  backdropUrl?: string | null;
  tmdbPoster?: string | null;
  tmdbOverview?: string | null;
  tmdbRating?: number | null;
  tmdbLogo?: string | null;
  tmdbNumberOfSeasons?: number | null;
  favorited: boolean;
  onToggleFavorite: () => void;
  detail?: any;
  movieDetails?: any;
  bangumiDetails?: any;
  shortdramaDetails?: any;
  movieComments: any[];
  commentsError?: string | null;
  loadingMovieDetails: boolean;
  loadingBangumiDetails: boolean;
  loadingComments: boolean;
  loadingCelebrityWorks: boolean;
  selectedCelebrityName: string | null;
  celebrityWorks: any[];
  onCelebrityClick: (name: string) => void;
  onClearCelebrity: () => void;
  videoDoubanId: number;
  currentSource: string;
}

export default function PlayInfoPanel(props: PlayInfoPanelProps) {
  const {
    title, year, cover, sourceName, totalEpisodes, currentEpisodeIndex,
    episodeName, backdropUrl, tmdbPoster, tmdbOverview, tmdbRating, tmdbLogo, tmdbNumberOfSeasons,
    favorited, onToggleFavorite,
    detail, movieDetails, bangumiDetails, shortdramaDetails,
    movieComments, commentsError, loadingMovieDetails, loadingBangumiDetails,
    loadingComments, loadingCelebrityWorks, selectedCelebrityName,
    celebrityWorks, onCelebrityClick, onClearCelebrity, videoDoubanId, currentSource,
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const tabListRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, width: 0, ready: false });

  const bgUrl = backdropUrl || (cover ? processImageUrl(cover) : null);
  // TMDB poster 优先，没有则用封面
  const posterUrl = tmdbPoster || (cover ? processImageUrl(cover) : null);
  // 简介：TMDB 优先
  const overview = tmdbOverview || movieDetails?.plot_summary || bangumiDetails?.summary || shortdramaDetails?.desc || detail?.desc;
  // 评分：TMDB 优先
  const displayRating = tmdbRating || (movieDetails?.rate ? parseFloat(movieDetails.rate) : null) || (bangumiDetails?.rating?.score ? parseFloat(bangumiDetails.rating.score) : null);

  const hasCast = (movieDetails?.celebrities?.length ?? 0) > 0 &&
    movieDetails.celebrities.some((c: any) => c.avatar);
  const hasRecommendations = (movieDetails?.recommendations?.length ?? 0) > 0;

  const tabs: Array<{ key: Tab; label: string; show: boolean }> = [
    { key: 'overview', label: '概览', show: true },
    { key: 'cast', label: '演员', show: hasCast },
    { key: 'recommendations', label: '推荐', show: hasRecommendations },
    { key: 'comments', label: '短评', show: videoDoubanId !== 0 },
  ];
  const visibleTabs = tabs.filter(t => t.show);

  const updateIndicator = useCallback(() => {
    const list = tabListRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLButtonElement>(`button[data-tab="${activeTab}"]`);
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    setIndicator({ x: activeRect.left - listRect.left, width: activeRect.width, ready: true });
  }, [activeTab]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(updateIndicator);
    return () => cancelAnimationFrame(id);
  }, [updateIndicator]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  const episodeText = totalEpisodes > 1 ? (episodeName || `第 ${currentEpisodeIndex + 1} 集`) : null;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700/50">

      {/* ── Hero 背景图 ── */}
      {bgUrl && (
        <section className="relative overflow-hidden rounded-t-xl min-h-[360px] sm:min-h-[420px] md:min-h-[520px] lg:min-h-[620px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgUrl} alt={title}
            className="absolute inset-0 w-full h-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/70 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />

          {/* 右下角竖版海报 */}
          {posterUrl && (
            <div className="hidden lg:block absolute bottom-4 right-5 w-24 xl:w-28 overflow-hidden rounded-lg border border-white/20 shadow-2xl z-10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={posterUrl} alt={title} className="w-full aspect-[2/3] object-cover" />
            </div>
          )}

          {/* 内容区 — 右边留出海报宽度 */}
          <div className="absolute inset-0 z-10 flex flex-col justify-end gap-2.5 p-4 sm:p-6 lg:pr-36 xl:pr-40">

            {/* 标签行 */}
            <div className="flex flex-wrap items-center gap-1.5">
              {sourceName && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20">
                  {sourceName}
                </span>
              )}
              {(detail?.year || year) && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20">
                  {detail?.year || year}
                </span>
              )}
              {displayRating && displayRating > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/80 text-white font-medium">
                  ★ {displayRating.toFixed(1)}
                </span>
              )}
              {bangumiDetails?.rating?.score && !tmdbRating && parseFloat(bangumiDetails.rating.score) > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-pink-500/80 text-white font-medium">
                  ★ {parseFloat(bangumiDetails.rating.score).toFixed(1)}
                </span>
              )}
              {detail?.class && String(detail.class) !== '0' && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/80 text-white font-medium">
                  {detail.class}
                </span>
              )}
              {episodeText && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20">
                  {episodeText}
                </span>
              )}
              {tmdbNumberOfSeasons && tmdbNumberOfSeasons > 1 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20">
                  共 {tmdbNumberOfSeasons} 季
                </span>
              )}
            </div>

            {/* 标题 — 有 TMDB logo 就显示图片，没有就显示文字 */}
            {tmdbLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tmdbLogo} alt={title}
                className="max-h-16 sm:max-h-20 md:max-h-28 w-auto max-w-[60%] object-contain drop-shadow-lg" />
            ) : (
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight line-clamp-2">
                {title}
              </h1>
            )}

            {/* 简介 — TMDB 优先 */}
            {overview && (
              <p className="text-sm text-white/80 leading-relaxed line-clamp-2 md:line-clamp-3 max-w-2xl">
                {overview}
              </p>
            )}

            {/* 按钮行 — 收藏 */}
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={onToggleFavorite}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/35 bg-white/12 text-white font-medium text-sm hover:bg-white/20 transition-colors"
                aria-label={favorited ? '取消收藏' : '加入收藏'}
              >
                <Heart className={`size-4 transition-colors ${favorited ? 'fill-rose-500 text-rose-500' : ''}`} />
                {favorited ? '已加入收藏' : '加入收藏'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Tab 导航 ── */}
      {visibleTabs.length > 1 && (
        <div className="border-b border-gray-200 dark:border-gray-700 px-2">
          <div ref={tabListRef} className="relative flex">
            {visibleTabs.map(tab => (
              <button
                key={tab.key}
                data-tab={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {indicator.ready && (
              <div
                className="absolute bottom-0 h-0.5 bg-green-500 rounded-full transition-all duration-300 ease-out"
                style={{ left: indicator.x, width: indicator.width }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Tab 内容 ── */}
      <div className="p-4 sm:p-6">
        {activeTab === 'overview' && (
          <OverviewTab
            detail={detail} year={year} movieDetails={movieDetails}
            bangumiDetails={bangumiDetails} shortdramaDetails={shortdramaDetails}
            loadingMovieDetails={loadingMovieDetails} loadingBangumiDetails={loadingBangumiDetails}
            currentSource={currentSource} videoDoubanId={videoDoubanId}
          />
        )}
        {activeTab === 'cast' && (
          <CastTab
            movieDetails={movieDetails} loadingCelebrityWorks={loadingCelebrityWorks}
            selectedCelebrityName={selectedCelebrityName} celebrityWorks={celebrityWorks}
            onCelebrityClick={onCelebrityClick} onClearCelebrity={onClearCelebrity}
          />
        )}
        {activeTab === 'recommendations' && (
          <RecommendationsTab movieDetails={movieDetails} />
        )}
        {activeTab === 'comments' && (
          <CommentSection
            comments={movieComments} loading={loadingComments}
            error={commentsError ?? null} videoDoubanId={videoDoubanId}
          />
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ detail, year, movieDetails, bangumiDetails, shortdramaDetails,
  loadingMovieDetails, loadingBangumiDetails, currentSource, videoDoubanId, hasBg }: any) {

  const showDetails = currentSource !== 'shortdrama' && videoDoubanId !== 0
    && detail && detail.source !== 'shortdrama';

  return (
    <div className="space-y-4 text-sm">
      {/* 关键信息行 */}
      <div className="flex flex-wrap items-center gap-2">
        {detail?.class && String(detail.class) !== '0' && (
          <span className="text-green-600 dark:text-green-400 font-semibold">{detail.class}</span>
        )}
        {(detail?.year || year) && (
          <span className="text-gray-600 dark:text-gray-400">{detail?.year || year}</span>
        )}
        {detail?.source_name && (
          <span className="border border-gray-400/50 dark:border-gray-600 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">
            {detail.source_name}
          </span>
        )}
        {detail?.type_name && <span className="text-gray-600 dark:text-gray-400">{detail.type_name}</span>}
      </div>

      {/* 简介 — 始终用豆瓣数据 */}
      {(shortdramaDetails?.desc || bangumiDetails?.summary || movieDetails?.plot_summary || detail?.desc) && (
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {movieDetails?.plot_summary || bangumiDetails?.summary || shortdramaDetails?.desc || detail?.desc}
        </p>
      )}

      {/* 加载中 */}
      {showDetails && (loadingMovieDetails || loadingBangumiDetails) && !movieDetails && !bangumiDetails && (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
        </div>
      )}

      {/* Bangumi 详情 */}
      {bangumiDetails && (
        <div className="space-y-2">
          {bangumiDetails.rating?.score && parseFloat(bangumiDetails.rating.score) > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Bangumi评分:</span>
              <span className="text-pink-500 font-bold text-lg">{bangumiDetails.rating.score}</span>
            </div>
          )}
          {bangumiDetails.infobox?.map((info: any, i: number) => {
            if ((info.key === '导演' || info.key === '制作') && info.value) {
              const v = Array.isArray(info.value) ? info.value.map((x: any) => x.v || x).join('、') : info.value;
              return <div key={i}><span className="font-semibold text-gray-700 dark:text-gray-300">{info.key}: </span><span className="text-gray-600 dark:text-gray-400">{v}</span></div>;
            }
            return null;
          })}
          {bangumiDetails.date && (
            <div><span className="font-semibold text-gray-700 dark:text-gray-300">播出日期: </span><span className="text-gray-600 dark:text-gray-400">{bangumiDetails.date}</span></div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {bangumiDetails.tags?.slice(0, 6).map((tag: any, i: number) => (
              <span key={i} className="bg-blue-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">{tag.name}</span>
            ))}
            {bangumiDetails.total_episodes && (
              <span className="bg-green-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">共{bangumiDetails.total_episodes}话</span>
            )}
          </div>
        </div>
      )}

      {/* 豆瓣详情 */}
      {movieDetails && (
        <div className="space-y-2">
          {movieDetails.rate && parseFloat(movieDetails.rate) > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700 dark:text-gray-300">豆瓣评分:</span>
              <span className="text-amber-500 font-bold text-lg">{movieDetails.rate}</span>
            </div>
          )}
          {movieDetails.directors?.length > 0 && (
            <div><span className="font-semibold text-gray-700 dark:text-gray-300">导演: </span><span className="text-gray-600 dark:text-gray-400">{movieDetails.directors.join('、')}</span></div>
          )}
          {movieDetails.screenwriters?.length > 0 && (
            <div><span className="font-semibold text-gray-700 dark:text-gray-300">编剧: </span><span className="text-gray-600 dark:text-gray-400">{movieDetails.screenwriters.join('、')}</span></div>
          )}
          {movieDetails.cast?.length > 0 && (
            <div><span className="font-semibold text-gray-700 dark:text-gray-300">主演: </span><span className="text-gray-600 dark:text-gray-400">{movieDetails.cast.slice(0, 5).join('、')}</span></div>
          )}
          {movieDetails.first_aired && (
            <div><span className="font-semibold text-gray-700 dark:text-gray-300">{movieDetails.episodes ? '首播' : '上映'}: </span><span className="text-gray-600 dark:text-gray-400">{movieDetails.first_aired}</span></div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {movieDetails.countries?.slice(0, 2).map((c: string, i: number) => (
              <span key={i} className="bg-blue-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">{c}</span>
            ))}
            {movieDetails.languages?.slice(0, 2).map((l: string, i: number) => (
              <span key={i} className="bg-purple-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">{l}</span>
            ))}
            {movieDetails.episodes && <span className="bg-green-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">共{movieDetails.episodes}集</span>}
            {movieDetails.episode_length && <span className="bg-orange-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">单集{movieDetails.episode_length}分钟</span>}
            {movieDetails.movie_duration && <span className="bg-red-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">{movieDetails.movie_duration}分钟</span>}
          </div>
        </div>
      )}

      {/* 短剧 */}
      {(detail?.source === 'shortdrama' || shortdramaDetails) && (
        <div className="flex flex-wrap gap-2">
          {(shortdramaDetails?.episodes || detail?.episodes)?.length && (
            <span className="bg-blue-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">共{(shortdramaDetails?.episodes || detail?.episodes)?.length}集</span>
          )}
          <span className="bg-green-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">短剧</span>
          {(shortdramaDetails?.year || detail?.year) && (
            <span className="bg-purple-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">{shortdramaDetails?.year || detail?.year}年</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Cast Tab ─────────────────────────────────────────────────────────────────

function CastTab({ movieDetails, loadingCelebrityWorks, selectedCelebrityName,
  celebrityWorks, onCelebrityClick, onClearCelebrity }: any) {

  const celebrities = movieDetails?.celebrities?.filter((c: any) => c.avatar) || [];

  return (
    <div className="space-y-6">
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {celebrities.slice(0, 20).map((c: any) => (
          <div key={c.id} onClick={() => onCelebrityClick(c.name)}
            className="shrink-0 text-center group cursor-pointer">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 mb-2 ring-2 ring-transparent group-hover:ring-green-500 transition-all duration-200 group-hover:scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={processImageUrl(c.avatar)} alt={c.name}
                className="w-full h-full object-cover" loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 w-16 sm:w-20 truncate group-hover:text-green-500 transition-colors">{c.name}</p>
            {c.role && <p className="text-[10px] text-gray-500 w-16 sm:w-20 truncate mt-0.5">{c.role}</p>}
          </div>
        ))}
      </div>

      {selectedCelebrityName && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">{selectedCelebrityName} 的作品</h3>
            <button onClick={onClearCelebrity} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">收起 ✕</button>
          </div>
          {loadingCelebrityWorks ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500" />
            </div>
          ) : celebrityWorks.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {celebrityWorks.map((work: any) => {
                const url = work.source === 'tmdb'
                  ? `/play?title=${encodeURIComponent(work.title)}&prefer=true`
                  : `/play?title=${encodeURIComponent(work.title)}&douban_id=${work.id}&prefer=true`;
                return (
                  <a key={work.id} href={url}>
                    <VideoCard id={work.id} title={work.title} poster={work.poster}
                      rate={work.rate} year={work.year} from="douban" douban_id={parseInt(work.id)} />
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">暂无相关作品</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Recommendations Tab ──────────────────────────────────────────────────────

function RecommendationsTab({ movieDetails }: any) {
  const items = movieDetails?.recommendations || [];
  if (!items.length) return <p className="text-center text-gray-500 dark:text-gray-400 py-8">暂无推荐</p>;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
      {items.map((item: any) => (
        <a key={item.id} href={`/play?title=${encodeURIComponent(item.title)}&douban_id=${item.id}&prefer=true`}>
          <VideoCard id={item.id} title={item.title} poster={item.poster}
            rate={item.rate} douban_id={parseInt(item.id)} from="douban" isAggregate />
        </a>
      ))}
    </div>
  );
}
