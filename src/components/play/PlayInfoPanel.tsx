/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
} from 'react';
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
    title,
    year,
    cover,
    sourceName,
    totalEpisodes,
    currentEpisodeIndex,
    episodeName,
    backdropUrl,
    tmdbPoster,
    tmdbOverview,
    tmdbRating,
    tmdbLogo,
    tmdbNumberOfSeasons,
    favorited,
    onToggleFavorite,
    detail,
    movieDetails,
    bangumiDetails,
    shortdramaDetails,
    movieComments,
    commentsError,
    loadingMovieDetails,
    loadingBangumiDetails,
    loadingComments,
    loadingCelebrityWorks,
    selectedCelebrityName,
    celebrityWorks,
    onCelebrityClick,
    onClearCelebrity,
    videoDoubanId,
    currentSource,
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [tabIndicator, setTabIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);
  const tabRefs = useRef<Map<Tab, HTMLButtonElement | null>>(new Map());

  const posterUrl = tmdbPoster || (cover ? processImageUrl(cover) : null);
  const bgUrl = backdropUrl || posterUrl;

  const overview =
    tmdbOverview ||
    movieDetails?.plot_summary ||
    bangumiDetails?.summary ||
    shortdramaDetails?.desc ||
    detail?.desc;
  const displayRating =
    tmdbRating || (movieDetails?.rate ? parseFloat(movieDetails.rate) : null);

  const episodeText =
    totalEpisodes > 1
      ? episodeName || `第 ${currentEpisodeIndex + 1} 集`
      : null;

  const setTabRef = useCallback(
    (tab: Tab) => (el: HTMLButtonElement | null) => {
      tabRefs.current.set(tab, el);
    },
    [],
  );

  useLayoutEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (el) {
      setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  useEffect(() => {
    const handleResize = () => {
      const el = tabRefs.current.get(activeTab);
      if (el) {
        setTabIndicator({ left: el.offsetLeft, width: el.offsetWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: '概览' },
    { key: 'cast', label: '演员' },
    { key: 'recommendations', label: '推荐' },
    { key: 'comments', label: '短评' },
  ];

  return (
    <div className='rounded-xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800'>
      {/* ── Hero 背景图 ── */}
      {bgUrl && (
        <section className='relative overflow-hidden rounded-t-xl min-h-[360px] sm:min-h-[420px] md:min-h-[520px] lg:min-h-[620px]'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgUrl}
            alt={title}
            className='absolute inset-0 w-full h-full object-cover object-top'
          />
          <div className='absolute inset-0 bg-gradient-to-r from-black/92 via-black/70 to-black/30' />
          <div className='absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent' />

          {/* 右下角竖版海报 */}
          {posterUrl && (
            <div className='hidden lg:block absolute right-6 bottom-6 z-20 w-44 xl:w-52'>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={posterUrl}
                alt=''
                className='w-full rounded-lg shadow-2xl ring-1 ring-white/10'
              />
            </div>
          )}

          {/* 内容区 */}
          <div className='absolute inset-0 z-10 flex flex-col justify-end gap-2.5 p-4 sm:p-6 lg:pr-36 xl:pr-40'>
            {/* 标签行 */}
            <div className='flex flex-wrap items-center gap-1.5'>
              {sourceName && (
                <span className='text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20'>
                  {sourceName}
                </span>
              )}
              {(detail?.year || year) && (
                <span className='text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20'>
                  {detail?.year || year}
                </span>
              )}
              {displayRating && displayRating > 0 && (
                <span className='text-[11px] px-2 py-0.5 rounded-full bg-amber-500/80 text-white font-medium'>
                  ★ {displayRating.toFixed(1)}
                </span>
              )}
              {bangumiDetails?.rating?.score &&
                !tmdbRating &&
                parseFloat(bangumiDetails.rating.score) > 0 && (
                  <span className='text-[11px] px-2 py-0.5 rounded-full bg-pink-500/80 text-white font-medium'>
                    ★ {parseFloat(bangumiDetails.rating.score).toFixed(1)}
                  </span>
                )}
              {episodeText && (
                <span className='text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20'>
                  {episodeText}
                </span>
              )}
              {tmdbNumberOfSeasons && tmdbNumberOfSeasons > 1 && (
                <span className='text-[11px] px-2 py-0.5 rounded-full bg-white/15 text-white/90 border border-white/20'>
                  共 {tmdbNumberOfSeasons} 季
                </span>
              )}
            </div>

            {/* 标题 */}
            {tmdbLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tmdbLogo}
                alt={title}
                className='max-h-16 sm:max-h-20 md:max-h-28 w-auto max-w-[60%] object-contain drop-shadow-lg'
              />
            ) : (
              <h1 className='text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight line-clamp-2'>
                {title}
              </h1>
            )}

            {/* 简介 */}
            {overview && (
              <p className='text-sm text-white/80 leading-relaxed line-clamp-2 md:line-clamp-3 max-w-2xl'>
                {overview}
              </p>
            )}

            {/* 收藏按钮 */}
            <div className='flex flex-wrap gap-2.5'>
              <button
                onClick={onToggleFavorite}
                className='flex items-center gap-1.5 px-4 py-2 rounded-full border border-white/35 bg-white/12 text-white font-medium text-sm hover:bg-white/20 transition-colors'
                aria-label={favorited ? '取消收藏' : '加入收藏'}
              >
                <Heart
                  className={`size-4 transition-colors ${favorited ? 'fill-rose-500 text-rose-500' : ''}`}
                />
                {favorited ? '已加入收藏' : '加入收藏'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Tabs ── */}
      <div className='relative border-b border-gray-200 dark:border-gray-800'>
        <div className='flex gap-1 px-4 pt-2 overflow-x-auto'>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              ref={setTabRef(tab.key)}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {tabIndicator && (
          <div
            className='absolute bottom-0 h-0.5 bg-blue-600 dark:bg-blue-400 transition-all duration-200'
            style={{ left: tabIndicator.left, width: tabIndicator.width }}
          />
        )}
      </div>

      {/* ── Tab 内容 ── */}
      <div className='p-4 sm:p-6'>
        {activeTab === 'overview' && (
          <OverviewTab
            detail={detail}
            year={year}
            movieDetails={movieDetails}
            bangumiDetails={bangumiDetails}
            shortdramaDetails={shortdramaDetails}
            loadingMovieDetails={loadingMovieDetails}
            loadingBangumiDetails={loadingBangumiDetails}
            currentSource={currentSource}
            videoDoubanId={videoDoubanId}
          />
        )}
        {activeTab === 'cast' && (
          <CastTab
            movieDetails={movieDetails}
            loadingMovieDetails={loadingMovieDetails}
            selectedCelebrityName={selectedCelebrityName}
            celebrityWorks={celebrityWorks}
            loadingCelebrityWorks={loadingCelebrityWorks}
            onCelebrityClick={onCelebrityClick}
            onClearCelebrity={onClearCelebrity}
          />
        )}
        {activeTab === 'recommendations' && (
          <RecommendationsTab
            movieDetails={movieDetails}
            loadingMovieDetails={loadingMovieDetails}
          />
        )}
        {activeTab === 'comments' && (
          <CommentsTab
            movieComments={movieComments}
            commentsError={commentsError}
            loadingComments={loadingComments}
            videoDoubanId={videoDoubanId}
          />
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  detail,
  year,
  movieDetails,
  bangumiDetails,
  shortdramaDetails,
  loadingMovieDetails,
  loadingBangumiDetails,
  currentSource,
  videoDoubanId,
}: {
  detail?: any;
  year?: string;
  movieDetails?: any;
  bangumiDetails?: any;
  shortdramaDetails?: any;
  loadingMovieDetails: boolean;
  loadingBangumiDetails: boolean;
  currentSource: string;
  videoDoubanId: number;
}) {
  if (loadingMovieDetails || loadingBangumiDetails) {
    return (
      <div className='animate-pulse space-y-3'>
        <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-48' />
        <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-64' />
        <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-32' />
      </div>
    );
  }

  if (
    currentSource !== 'shortdrama' &&
    videoDoubanId !== 0 &&
    detail &&
    detail.source !== 'shortdrama'
  ) {
    return (
      <div className='space-y-4 text-sm'>
        {/* 基本信息 */}
        <div className='flex flex-wrap items-center gap-3 text-base'>
          {detail?.class && String(detail.class) !== '0' && (
            <span className='text-green-600 font-semibold'>{detail.class}</span>
          )}
          {(detail?.year || year) && <span>{detail?.year || year}</span>}
          {detail?.source_name && (
            <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
              {detail.source_name}
            </span>
          )}
          {detail?.type_name && (
            <span className='text-gray-600 dark:text-gray-400'>
              {detail.type_name}
            </span>
          )}
        </div>

        {/* 豆瓣详情 */}
        {movieDetails && (
          <div className='space-y-2'>
            {movieDetails.rate &&
              movieDetails.rate !== '0' &&
              parseFloat(movieDetails.rate) > 0 && (
                <div>
                  <span className='font-semibold text-gray-700 dark:text-gray-300'>
                    豆瓣评分:{' '}
                  </span>
                  <span className='text-yellow-600 dark:text-yellow-400 font-bold'>
                    {movieDetails.rate}
                  </span>
                </div>
              )}
            {movieDetails.directors && movieDetails.directors.length > 0 && (
              <div>
                <span className='font-semibold text-gray-700 dark:text-gray-300'>
                  导演:{' '}
                </span>
                <span className='text-gray-600 dark:text-gray-400'>
                  {movieDetails.directors.join('、')}
                </span>
              </div>
            )}
            {movieDetails.screenwriters &&
              movieDetails.screenwriters.length > 0 && (
                <div>
                  <span className='font-semibold text-gray-700 dark:text-gray-300'>
                    编剧:{' '}
                  </span>
                  <span className='text-gray-600 dark:text-gray-400'>
                    {movieDetails.screenwriters.join('、')}
                  </span>
                </div>
              )}
            {movieDetails.cast && movieDetails.cast.length > 0 && (
              <div>
                <span className='font-semibold text-gray-700 dark:text-gray-300'>
                  主演:{' '}
                </span>
                <span className='text-gray-600 dark:text-gray-400'>
                  {movieDetails.cast.join('、')}
                </span>
              </div>
            )}
            {movieDetails.first_aired && (
              <div>
                <span className='font-semibold text-gray-700 dark:text-gray-300'>
                  {movieDetails.episodes ? '首播' : '上映'}:
                </span>
                <span className='text-gray-600 dark:text-gray-400'>
                  {movieDetails.first_aired}
                </span>
              </div>
            )}
            <div className='flex flex-wrap gap-2 mt-3'>
              {movieDetails.countries &&
                movieDetails.countries
                  .slice(0, 2)
                  .map((c: string, i: number) => (
                    <span
                      key={i}
                      className='px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs'
                    >
                      {c}
                    </span>
                  ))}
              {movieDetails.languages &&
                movieDetails.languages
                  .slice(0, 2)
                  .map((l: string, i: number) => (
                    <span
                      key={i}
                      className='px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs'
                    >
                      {l}
                    </span>
                  ))}
              {movieDetails.episodes && (
                <span className='px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs'>
                  共{movieDetails.episodes}集
                </span>
              )}
              {movieDetails.episode_length && (
                <span className='px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs'>
                  单集{movieDetails.episode_length}分钟
                </span>
              )}
              {movieDetails.movie_duration && (
                <span className='px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs'>
                  {movieDetails.movie_duration}分钟
                </span>
              )}
            </div>
          </div>
        )}

        {/* Bangumi详情 */}
        {bangumiDetails && !movieDetails && (
          <div className='space-y-2'>
            {bangumiDetails.rating?.score &&
              parseFloat(bangumiDetails.rating.score) > 0 && (
                <div>
                  <span className='font-semibold text-gray-700 dark:text-gray-300'>
                    Bangumi评分:{' '}
                  </span>
                  <span className='text-pink-600 dark:text-pink-400 font-bold'>
                    {bangumiDetails.rating.score}
                  </span>
                </div>
              )}
            {bangumiDetails.infobox &&
              bangumiDetails.infobox.map((info: any, index: number) => {
                if (info.key === '导演' && info.value) {
                  const directors = Array.isArray(info.value)
                    ? info.value.map((v: any) => v.v || v).join('、')
                    : info.value;
                  return (
                    <div key={index}>
                      <span className='font-semibold text-gray-700 dark:text-gray-300'>
                        导演:{' '}
                      </span>
                      <span className='text-gray-600 dark:text-gray-400'>
                        {directors}
                      </span>
                    </div>
                  );
                }
                if (info.key === '制作' && info.value) {
                  const studios = Array.isArray(info.value)
                    ? info.value.map((v: any) => v.v || v).join('、')
                    : info.value;
                  return (
                    <div key={index}>
                      <span className='font-semibold text-gray-700 dark:text-gray-300'>
                        制作:{' '}
                      </span>
                      <span className='text-gray-600 dark:text-gray-400'>
                        {studios}
                      </span>
                    </div>
                  );
                }
                return null;
              })}
            {bangumiDetails.date && (
              <div>
                <span className='font-semibold text-gray-700 dark:text-gray-300'>
                  播出日期:{' '}
                </span>
                <span className='text-gray-600 dark:text-gray-400'>
                  {bangumiDetails.date}
                </span>
              </div>
            )}
            <div className='flex flex-wrap gap-2 mt-3'>
              {bangumiDetails.tags &&
                bangumiDetails.tags.slice(0, 4).map((tag: any, i: number) => (
                  <span
                    key={i}
                    className='px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs'
                  >
                    {tag.name}
                  </span>
                ))}
              {bangumiDetails.total_episodes && (
                <span className='px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs'>
                  共{bangumiDetails.total_episodes}话
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  {
    /* 短剧 */
  }
  if (detail?.source === 'shortdrama' || shortdramaDetails) {
    return (
      <div className='space-y-2 text-sm'>
        <div className='flex flex-wrap gap-2'>
          <span className='px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs'>
            共{(shortdramaDetails?.episodes || detail?.episodes)?.length}集
          </span>
          <span className='px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs'>
            短剧
          </span>
        </div>
        {shortdramaDetails?.desc && (
          <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
            {shortdramaDetails.desc}
          </p>
        )}
        {detail?.desc && !shortdramaDetails?.desc && (
          <p className='text-gray-700 dark:text-gray-300 leading-relaxed'>
            {detail.desc}
          </p>
        )}
      </div>
    );
  }

  return null;
}

function CastTab({
  movieDetails,
  loadingMovieDetails,
  selectedCelebrityName,
  celebrityWorks,
  loadingCelebrityWorks,
  onCelebrityClick,
  onClearCelebrity,
}: {
  movieDetails?: any;
  loadingMovieDetails: boolean;
  selectedCelebrityName: string | null;
  celebrityWorks: any[];
  loadingCelebrityWorks: boolean;
  onCelebrityClick: (name: string) => void;
  onClearCelebrity: () => void;
}) {
  if (loadingMovieDetails) {
    return (
      <div className='animate-pulse space-y-3'>
        <div className='h-20 bg-gray-200 dark:bg-gray-700 rounded' />
      </div>
    );
  }
  if (!movieDetails?.celebrities?.length) {
    return (
      <p className='text-gray-500 dark:text-gray-400 text-sm'>暂无演员信息</p>
    );
  }
  return (
    <div>
      {selectedCelebrityName && (
        <div className='mb-4'>
          <div className='flex items-center justify-between mb-2'>
            <h3 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
              {selectedCelebrityName} 的作品
            </h3>
            <button
              onClick={onClearCelebrity}
              className='text-sm text-blue-600 dark:text-blue-400 hover:underline'
            >
              返回演员列表
            </button>
          </div>
          {loadingCelebrityWorks ? (
            <div className='animate-pulse grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'>
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className='h-40 bg-gray-200 dark:bg-gray-700 rounded'
                />
              ))}
            </div>
          ) : celebrityWorks.length > 0 ? (
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'>
              {celebrityWorks.map((work: any, i: number) => (
                <VideoCard
                  key={i}
                  title={work.title}
                  poster={work.poster}
                  from='search'
                />
              ))}
            </div>
          ) : (
            <p className='text-gray-500 dark:text-gray-400 text-sm'>暂无作品</p>
          )}
        </div>
      )}
      <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3'>
        {movieDetails.celebrities.map((c: any, i: number) => (
          <button
            key={i}
            onClick={() => onCelebrityClick(c.name)}
            className='flex flex-col items-center gap-1 group'
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.avatar ? processImageUrl(c.avatar) : ''}
              alt={c.name}
              className='w-16 h-16 rounded-full object-cover bg-gray-100 dark:bg-gray-800 group-hover:ring-2 ring-blue-500 transition-all'
            />
            <span className='text-xs text-gray-700 dark:text-gray-300 truncate w-full text-center group-hover:text-blue-600 dark:group-hover:text-blue-400'>
              {c.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RecommendationsTab({
  movieDetails,
  loadingMovieDetails,
}: {
  movieDetails?: any;
  loadingMovieDetails: boolean;
}) {
  if (loadingMovieDetails) {
    return (
      <div className='animate-pulse space-y-3'>
        <div className='h-40 bg-gray-200 dark:bg-gray-700 rounded' />
      </div>
    );
  }
  if (!movieDetails?.recommendations?.length) {
    return <p className='text-gray-500 dark:text-gray-400 text-sm'>暂无推荐</p>;
  }
  return (
    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'>
      {movieDetails.recommendations.map((rec: any, i: number) => (
        <VideoCard
          key={i}
          title={rec.title}
          poster={rec.poster}
          year={rec.year}
          from='search'
        />
      ))}
    </div>
  );
}

function CommentsTab({
  movieComments,
  commentsError,
  loadingComments,
  videoDoubanId,
}: {
  movieComments: any[];
  commentsError?: string | null;
  loadingComments: boolean;
  videoDoubanId: number;
}) {
  if (loadingComments) {
    return (
      <div className='animate-pulse space-y-3'>
        <div className='h-16 bg-gray-200 dark:bg-gray-700 rounded' />
        <div className='h-16 bg-gray-200 dark:bg-gray-700 rounded' />
      </div>
    );
  }
  if (commentsError) {
    return <p className='text-red-500 text-sm'>{commentsError}</p>;
  }
  if (!movieComments.length) {
    return <p className='text-gray-500 dark:text-gray-400 text-sm'>暂无短评</p>;
  }
  return <CommentSection comments={movieComments} loading={loadingComments} error={commentsError} videoDoubanId={videoDoubanId} />;
}
