/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { memo } from 'react';
import FavoriteButton from '@/components/play/FavoriteButton';
import VideoCard from '@/components/VideoCard';
import CommentSection from '@/components/play/CommentSection';

interface VideoInfoSectionProps {
  videoTitle: string;
  videoYear?: string;
  videoCover?: string;
  videoDoubanId: number;
  currentSource: string;
  favorited: boolean;
  onToggleFavorite: () => void;
  detail?: any;
  movieDetails?: any;
  bangumiDetails?: any;
  shortdramaDetails?: any;
  movieComments: any[];
  commentsError?: string;
  loadingMovieDetails: boolean;
  loadingBangumiDetails: boolean;
  loadingComments: boolean;
  loadingCelebrityWorks: boolean;
  selectedCelebrityName: string | null;
  celebrityWorks: any[];
  onCelebrityClick: (name: string) => void;
  onClearCelebrity: () => void;
  processImageUrl: (url: string) => string;
}

function VideoInfoSection(props: VideoInfoSectionProps) {
  const {
    videoTitle, videoYear, videoDoubanId, currentSource, favorited, onToggleFavorite,
    detail, movieDetails, bangumiDetails, shortdramaDetails, movieComments, commentsError,
    loadingMovieDetails, loadingBangumiDetails, loadingComments, loadingCelebrityWorks,
    selectedCelebrityName, celebrityWorks, onCelebrityClick, onClearCelebrity, processImageUrl
  } = props;

  return (
    <div className='md:col-span-3'>
      <div className='p-6 flex flex-col min-h-0'>
              {/* 标题 */}
              <div className='mb-4 shrink-0'>
                <div className='flex flex-col md:flex-row md:items-center gap-3'>
                  <h1 className='text-2xl md:text-3xl font-bold tracking-wide text-center md:text-left bg-linear-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent'>
                    {videoTitle || '影片标题'}
                  </h1>

                  {/* 按钮组 */}
                  <div className='flex items-center justify-center md:justify-start gap-2 flex-wrap'>
                    {/* 收藏按钮 - 使用独立组件优化性能 */}
                    <FavoriteButton
                      favorited={favorited}
                      onToggle={onToggleFavorite}
                    />
                  </div>
                </div>
              </div>

              {/* 关键信息行 */}
              <div className='flex flex-wrap items-center gap-3 text-base mb-4 opacity-80 shrink-0'>
                {detail?.class && String(detail.class) !== '0' && (
                  <span className='text-green-600 font-semibold'>
                    {detail.class}
                  </span>
                )}
                {(detail?.year || videoYear) && (
                  <span>{detail?.year || videoYear}</span>
                )}
                {detail?.source_name && (
                  <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
                    {detail.source_name}
                  </span>
                )}
                {detail?.type_name && <span>{detail.type_name}</span>}
              </div>

              {/* 详细信息（豆瓣或bangumi） */}
              {currentSource !== 'shortdrama' && videoDoubanId !== 0 && detail && detail.source !== 'shortdrama' && (
                <div className='mb-4 shrink-0'>
                  {/* 加载状态 */}
                  {(loadingMovieDetails || loadingBangumiDetails) && !movieDetails && !bangumiDetails && (
                    <div className='animate-pulse'>
                      <div className='h-4 bg-gray-300 rounded w-64 mb-2'></div>
                      <div className='h-4 bg-gray-300 rounded w-48'></div>
                    </div>
                  )}
                  
                  {/* Bangumi详情 */}
                  {bangumiDetails && (
                    <div className='space-y-2 text-sm'>
                      {/* Bangumi评分 */}
                      {bangumiDetails.rating?.score && parseFloat(bangumiDetails.rating.score) > 0 && (
                        <div className='flex items-center gap-2'>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>Bangumi评分: </span>
                          <div className='flex items-center group'>
                            <span className='relative text-transparent bg-clip-text bg-linear-to-r from-pink-600 via-rose-600 to-pink-600 dark:from-pink-400 dark:via-rose-400 dark:to-pink-400 font-bold text-lg transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_2px_8px_rgba(236,72,153,0.5)]'>
                              {bangumiDetails.rating.score}
                            </span>
                            <div className='flex ml-2 gap-0.5'>
                              {[...Array(5)].map((_, i) => (
                                <svg
                                  key={i}
                                  className={`w-4 h-4 transition-all duration-300 ${
                                    i < Math.floor(parseFloat(bangumiDetails.rating.score) / 2)
                                      ? 'text-pink-500 drop-shadow-[0_0_4px_rgba(236,72,153,0.5)] group-hover:scale-110'
                                      : 'text-gray-300 dark:text-gray-600'
                                  }`}
                                  fill='currentColor'
                                  viewBox='0 0 20 20'
                                  style={{ transitionDelay: `${i * 50}ms` }}
                                >
                                  <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                                </svg>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 制作信息从infobox提取 */}
                      {bangumiDetails.infobox && bangumiDetails.infobox.map((info: any, index: number) => {
                        if (info.key === '导演' && info.value) {
                          const directors = Array.isArray(info.value) ? info.value.map((v: any) => v.v || v).join('、') : info.value;
                          return (
                            <div key={index}>
                              <span className='font-semibold text-gray-700 dark:text-gray-300'>导演: </span>
                              <span className='text-gray-600 dark:text-gray-400'>{directors}</span>
                            </div>
                          );
                        }
                        if (info.key === '制作' && info.value) {
                          const studios = Array.isArray(info.value) ? info.value.map((v: any) => v.v || v).join('、') : info.value;
                          return (
                            <div key={index}>
                              <span className='font-semibold text-gray-700 dark:text-gray-300'>制作: </span>
                              <span className='text-gray-600 dark:text-gray-400'>{studios}</span>
                            </div>
                          );
                        }
                        return null;
                      })}
                      
                      {/* 播出日期 */}
                      {bangumiDetails.date && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>播出日期: </span>
                          <span className='text-gray-600 dark:text-gray-400'>{bangumiDetails.date}</span>
                        </div>
                      )}
                      
                      {/* 标签信息 */}
                      <div className='flex flex-wrap gap-2 mt-3'>
                        {bangumiDetails.tags && bangumiDetails.tags.slice(0, 4).map((tag: any, index: number) => (
                          <span key={index} className='relative group bg-linear-to-r from-blue-500/90 to-indigo-500/90 dark:from-blue-600/90 dark:to-indigo-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-linear-to-r from-blue-400 to-indigo-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{tag.name}</span>
                          </span>
                        ))}
                        {bangumiDetails.total_episodes && (
                          <span className='relative group bg-linear-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-linear-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>共{bangumiDetails.total_episodes}话</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 豆瓣详情 */}
                  {movieDetails && (
                    <div className='space-y-2 text-sm'>
                      {/* 豆瓣评分 */}
                      {movieDetails.rate && movieDetails.rate !== "0" && parseFloat(movieDetails.rate) > 0 && (
                        <div className='flex items-center gap-2'>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>豆瓣评分: </span>
                          <div className='flex items-center group'>
                            <span className='relative text-transparent bg-clip-text bg-linear-to-r from-yellow-600 via-amber-600 to-yellow-600 dark:from-yellow-400 dark:via-amber-400 dark:to-yellow-400 font-bold text-lg transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_2px_8px_rgba(251,191,36,0.5)]'>
                              {movieDetails.rate}
                            </span>
                            <div className='flex ml-2 gap-0.5'>
                              {[...Array(5)].map((_, i) => (
                                <svg
                                  key={i}
                                  className={`w-4 h-4 transition-all duration-300 ${
                                    i < Math.floor(parseFloat(movieDetails.rate) / 2)
                                      ? 'text-yellow-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)] group-hover:scale-110'
                                      : 'text-gray-300 dark:text-gray-600'
                                  }`}
                                  fill='currentColor'
                                  viewBox='0 0 20 20'
                                  style={{ transitionDelay: `${i * 50}ms` }}
                                >
                                  <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
                                </svg>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 导演 */}
                      {movieDetails.directors && movieDetails.directors.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>导演: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.directors.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 编剧 */}
                      {movieDetails.screenwriters && movieDetails.screenwriters.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>编剧: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.screenwriters.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 主演 */}
                      {movieDetails.cast && movieDetails.cast.length > 0 && (
                        <div>
                          <span className='font-semibold text-gray-700 dark:text-gray-300'>主演: </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {movieDetails.cast.join('、')}
                          </span>
                        </div>
                      )}
                      
                      {/* 首播日期 */}
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
                      
                      {/* 标签信息 */}
                      <div className='flex flex-wrap gap-2 mt-3'>
                        {movieDetails.countries && movieDetails.countries.slice(0, 2).map((country: string, index: number) => (
                          <span key={index} className='relative group bg-linear-to-r from-blue-500/90 to-cyan-500/90 dark:from-blue-600/90 dark:to-cyan-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-linear-to-r from-blue-400 to-cyan-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{country}</span>
                          </span>
                        ))}
                        {movieDetails.languages && movieDetails.languages.slice(0, 2).map((language: string, index: number) => (
                          <span key={index} className='relative group bg-linear-to-r from-purple-500/90 to-pink-500/90 dark:from-purple-600/90 dark:to-pink-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-linear-to-r from-purple-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{language}</span>
                          </span>
                        ))}
                        {movieDetails.episodes && (
                          <span className='relative group bg-linear-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-linear-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>共{movieDetails.episodes}集</span>
                          </span>
                        )}
                        {movieDetails.episode_length && (
                          <span className='relative group bg-linear-to-r from-orange-500/90 to-amber-500/90 dark:from-orange-600/90 dark:to-amber-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-orange-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-linear-to-r from-orange-400 to-amber-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>单集{movieDetails.episode_length}分钟</span>
                          </span>
                        )}
                        {movieDetails.movie_duration && (
                          <span className='relative group bg-linear-to-r from-red-500/90 to-rose-500/90 dark:from-red-600/90 dark:to-rose-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-red-500/30 transition-all duration-300 hover:scale-105'>
                            <span className='absolute inset-0 bg-linear-to-r from-red-400 to-rose-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                            <span className='relative'>{movieDetails.movie_duration}分钟</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 短剧详细信息 */}
              {(detail?.source === 'shortdrama' || shortdramaDetails) && (
                <div className='mb-4 shrink-0'>
                  <div className='space-y-2 text-sm'>
                    {/* 集数信息 */}
                    {((detail?.source === 'shortdrama' && detail?.episodes && detail.episodes.length > 0) ||
                      (shortdramaDetails?.episodes && shortdramaDetails.episodes.length > 0)) && (
                      <div className='flex flex-wrap gap-2'>
                        <span className='relative group bg-linear-to-r from-blue-500/90 to-indigo-500/90 dark:from-blue-600/90 dark:to-indigo-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-linear-to-r from-blue-400 to-indigo-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>共{(shortdramaDetails?.episodes || detail?.episodes)?.length}集</span>
                        </span>
                        <span className='relative group bg-linear-to-r from-green-500/90 to-emerald-500/90 dark:from-green-600/90 dark:to-emerald-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-linear-to-r from-green-400 to-emerald-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>短剧</span>
                        </span>
                        <span className='relative group bg-linear-to-r from-purple-500/90 to-pink-500/90 dark:from-purple-600/90 dark:to-pink-600/90 text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105'>
                          <span className='absolute inset-0 bg-linear-to-r from-purple-400 to-pink-400 rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300'></span>
                          <span className='relative'>{shortdramaDetails?.year || detail?.year}年</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 剧情简介 */}
              {(shortdramaDetails?.desc || detail?.desc || bangumiDetails?.summary || movieDetails?.plot_summary) && (
                <div
                  className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {movieDetails?.plot_summary || shortdramaDetails?.desc || bangumiDetails?.summary || detail?.desc}
                </div>
              )}

              {/* 短剧元数据（备用API提供） */}
              {shortdramaDetails?.metadata && (
                <div className='mt-4 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4'>
                  {/* 评分 */}
                  {shortdramaDetails.metadata.vote_average > 0 && (
                    <div className='flex items-center gap-2'>
                      <span className='text-yellow-500'>⭐</span>
                      <span className='font-semibold text-gray-800 dark:text-gray-200'>
                        {shortdramaDetails.metadata.vote_average.toFixed(1)}
                      </span>
                      <span className='text-sm text-gray-500 dark:text-gray-400'>/ 10</span>
                    </div>
                  )}
                  {/* 演员 */}
                  {shortdramaDetails.metadata.author && (
                    <div className='flex items-start gap-2'>
                      <span className='text-gray-600 dark:text-gray-400 shrink-0'>🎭 演员:</span>
                      <span className='text-gray-800 dark:text-gray-200'>
                        {shortdramaDetails.metadata.author}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 演员阵容 - 只有当演员有头像时才显示 */}
              {movieDetails?.celebrities && movieDetails.celebrities.length > 0 && movieDetails.celebrities.some((c: any) => c.avatar) && (
                <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
                  <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
                    <span>🎭</span>
                    <span>演员阵容</span>
                  </h3>
                  <div className='flex gap-4 overflow-x-auto pb-4 scrollbar-hide'>
                    {movieDetails.celebrities.slice(0, 15).map((celebrity: any) => (
                      <div
                        key={celebrity.id}
                        onClick={() => onCelebrityClick(celebrity.name)}
                        className='shrink-0 text-center group cursor-pointer'
                      >
                        <div className='w-20 h-20 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 mb-2 ring-2 ring-transparent group-hover:ring-blue-500 transition-all duration-300 group-hover:scale-110 shadow-md group-hover:shadow-xl'>
                          <img
                            src={processImageUrl(celebrity.avatar)}
                            alt={celebrity.name}
                            className='w-full h-full object-cover'
                            loading='lazy'
                            onError={(e) => {
                              console.error('演员头像加载失败:', celebrity.name, celebrity.avatar, processImageUrl(celebrity.avatar));
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                        <p className='text-xs font-medium text-gray-700 dark:text-gray-300 w-20 truncate group-hover:text-blue-500 transition-colors' title={celebrity.name}>
                          {celebrity.name}
                        </p>
                        {celebrity.role && (
                          <p className='text-[10px] text-gray-500 dark:text-gray-500 w-20 truncate mt-0.5' title={celebrity.role}>
                            {celebrity.role}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 演员作品展示 */}
              {selectedCelebrityName && (
                <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
                  <div className='flex justify-between items-center mb-4'>
                    <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                      <span>🎬</span>
                      <span>{selectedCelebrityName} 的作品</span>
                    </h3>
                    <button
                      onClick={onClearCelebrity}
                      className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    >
                      收起 ✕
                    </button>
                  </div>

                  {loadingCelebrityWorks ? (
                    <div className='flex flex-col items-center justify-center py-12'>
                      <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4'></div>
                      <p className='text-gray-600 dark:text-gray-400'>正在加载作品...</p>
                    </div>
                  ) : celebrityWorks.length > 0 ? (
                    <>
                      <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
                        找到 {celebrityWorks.length} 部相关作品
                      </p>
                      <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
                        {celebrityWorks.map((work: any) => {
                          // TMDB作品不传douban_id，仅传title搜索
                          const playUrl = work.source === 'tmdb'
                            ? `/play?title=${encodeURIComponent(work.title)}&prefer=true`
                            : `/play?title=${encodeURIComponent(work.title)}&douban_id=${work.id}&prefer=true`;
                          return (
                            <div
                              key={work.id}
                              ref={(node) => {
                                if (node) {
                                  // 移除旧的监听器
                                  const oldClick = (node as any)._clickHandler;
                                  const oldTouchStart = (node as any)._touchStartHandler;
                                  const oldTouchEnd = (node as any)._touchEndHandler;
                                  if (oldClick) node.removeEventListener('click', oldClick, true);
                                  if (oldTouchStart) node.removeEventListener('touchstart', oldTouchStart, true);
                                  if (oldTouchEnd) node.removeEventListener('touchend', oldTouchEnd, true);

                                  // 长按检测
                                  let touchStartTime = 0;
                                  let isLongPress = false;
                                  let longPressTimer: NodeJS.Timeout | null = null;

                                  const touchStartHandler = (e: Event) => {
                                    touchStartTime = Date.now();
                                    isLongPress = false;

                                    // 设置长按定时器（500ms）
                                    longPressTimer = setTimeout(() => {
                                      isLongPress = true;
                                    }, 500);
                                  };

                                  const touchEndHandler = (e: Event) => {
                                    // 清除长按定时器
                                    if (longPressTimer) {
                                      clearTimeout(longPressTimer);
                                      longPressTimer = null;
                                    }

                                    const touchDuration = Date.now() - touchStartTime;

                                    // 如果是长按（超过500ms）或已标记为长按，不跳转
                                    if (isLongPress || touchDuration >= 500) {
                                      // 让 VideoCard 的长按菜单正常工作
                                      return;
                                    }

                                    // 否则是短按，执行跳转
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();
                                    window.location.href = playUrl;
                                  };

                                  const clickHandler = (e: Event) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();
                                    window.location.href = playUrl;
                                  };

                                  node.addEventListener('touchstart', touchStartHandler, true);
                                  node.addEventListener('touchend', touchEndHandler, true);
                                  node.addEventListener('click', clickHandler, true);

                                  // 保存引用以便清理
                                  (node as any)._touchStartHandler = touchStartHandler;
                                  (node as any)._touchEndHandler = touchEndHandler;
                                  (node as any)._clickHandler = clickHandler;
                                }
                              }}
                              style={{
                                WebkitTapHighlightColor: 'transparent',
                                touchAction: 'manipulation'
                              }}
                            >
                              <VideoCard
                                id={work.id}
                                title={work.title}
                                poster={work.poster}
                                rate={work.rate}
                                year={work.year}
                                from='douban'
                                douban_id={parseInt(work.id)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className='text-center py-12'>
                      <p className='text-gray-500 dark:text-gray-400 mb-2'>暂无相关作品</p>
                      <p className='text-sm text-gray-400 dark:text-gray-500'>
                        可能该演员的作品暂未收录
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 推荐影片 */}
              {movieDetails?.recommendations && movieDetails.recommendations.length > 0 && (
                <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
                  <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
                    <span>💡</span>
                    <span>喜欢这部{movieDetails.episodes ? '剧' : '电影'}的人也喜欢</span>
                  </h3>
                  <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
                    {movieDetails.recommendations.map((item: any) => {
                      const playUrl = `/play?title=${encodeURIComponent(item.title)}&douban_id=${item.id}&prefer=true`;
                      return (
                        <div
                          key={item.id}
                          ref={(node) => {
                            if (node) {
                              // 移除旧的监听器
                              const oldClick = (node as any)._clickHandler;
                              const oldTouchStart = (node as any)._touchStartHandler;
                              const oldTouchEnd = (node as any)._touchEndHandler;
                              if (oldClick) node.removeEventListener('click', oldClick, true);
                              if (oldTouchStart) node.removeEventListener('touchstart', oldTouchStart, true);
                              if (oldTouchEnd) node.removeEventListener('touchend', oldTouchEnd, true);

                              // 长按检测
                              let touchStartTime = 0;
                              let isLongPress = false;
                              let longPressTimer: NodeJS.Timeout | null = null;

                              const touchStartHandler = (e: Event) => {
                                touchStartTime = Date.now();
                                isLongPress = false;

                                // 设置长按定时器（500ms）
                                longPressTimer = setTimeout(() => {
                                  isLongPress = true;
                                }, 500);
                              };

                              const touchEndHandler = (e: Event) => {
                                // 清除长按定时器
                                if (longPressTimer) {
                                  clearTimeout(longPressTimer);
                                  longPressTimer = null;
                                }

                                const touchDuration = Date.now() - touchStartTime;

                                // 如果是长按（超过500ms）或已标记为长按，不跳转
                                if (isLongPress || touchDuration >= 500) {
                                  // 让 VideoCard 的长按菜单正常工作
                                  return;
                                }

                                // 否则是短按，执行跳转
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                window.location.href = playUrl;
                              };

                              const clickHandler = (e: Event) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                window.location.href = playUrl;
                              };

                              node.addEventListener('touchstart', touchStartHandler, true);
                              node.addEventListener('touchend', touchEndHandler, true);
                              node.addEventListener('click', clickHandler, true);

                              // 保存引用以便清理
                              (node as any)._touchStartHandler = touchStartHandler;
                              (node as any)._touchEndHandler = touchEndHandler;
                              (node as any)._clickHandler = clickHandler;
                            }
                          }}
                          style={{
                            WebkitTapHighlightColor: 'transparent',
                            touchAction: 'manipulation'
                          }}
                        >
                          <VideoCard
                            id={item.id}
                            title={item.title}
                            poster={item.poster}
                            rate={item.rate}
                            douban_id={parseInt(item.id)}
                            from='douban'
                            isAggregate={true}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

        {/* 豆瓣短评 - 使用独立组件优化性能 */}
        <CommentSection
          comments={movieComments}
          loading={loadingComments}
          error={commentsError}
          videoDoubanId={videoDoubanId}
        />
      </div>
    </div>
  );
}

export default memo(VideoInfoSection);
