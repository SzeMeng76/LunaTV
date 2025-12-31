/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Brain, Send, Sparkles, X, Play, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useOptimistic, useTransition, useMemo, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  addMovieTitleClickListeners,
  AI_RECOMMEND_PRESETS,
  AIMessage,
  cleanMovieTitle,
  formatAIResponseWithLinks,
  generateChatSummary,
  generateSearchUrl,
  sendAIRecommendMessage,
  MovieRecommendation,
} from '@/lib/ai-recommend.client';
import { VideoContext } from '@/lib/ai-orchestrator';

interface AIRecommendModalProps {
  isOpen: boolean;
  onClose: () => void;
  context?: VideoContext; // 视频上下文（从VideoCard传入）
  welcomeMessage?: string; // 自定义欢迎消息
}

interface ExtendedAIMessage extends AIMessage {
  recommendations?: MovieRecommendation[];
  youtubeVideos?: any[];
  videoLinks?: any[];
  type?: string;
}

// ⚡ 优化：记忆化的消息组件
interface MessageItemProps {
  message: ExtendedAIMessage;
  index: number;
  handleTitleClick: (title: string) => void;
  handleMovieSelect: (movie: MovieRecommendation) => void;
  handleYouTubeVideoSelect: (video: any) => void;
  handleVideoLinkPlay: (video: any) => void;
  playingVideoId: string | null;
  setPlayingVideoId: (id: string | null) => void;
}

const MessageItem = memo(({
  message,
  index,
  handleTitleClick,
  handleMovieSelect,
  handleYouTubeVideoSelect,
  handleVideoLinkPlay,
  playingVideoId,
  setPlayingVideoId
}: MessageItemProps) => {
  return (
    <div
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div
        className={`max-w-[80%] p-3 rounded-xl shadow-sm ${
          message.role === 'user'
            ? 'bg-linear-to-br from-blue-600 to-blue-700 text-white shadow-blue-500/20'
            : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200/50 dark:border-gray-600/50 shadow-gray-200/50 dark:shadow-gray-900/50'
        } ${message.content === '思考中...' ? 'opacity-70 animate-pulse' : ''}`}
      >
        {message.role === 'assistant' ? (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-relaxed prose-pre:bg-gray-800 prose-pre:text-gray-100 dark:prose-pre:bg-gray-900 prose-code:text-purple-600 dark:prose-code:text-purple-400 prose-code:bg-purple-50 dark:prose-code:bg-purple-900/20 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-strong:text-gray-900 dark:prose-strong:text-white prose-ul:my-2 prose-ol:my-2 prose-li:my-1">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // 自定义文本渲染，将《片名》转换为可点击链接
                p: ({node, children, ...props}) => {
                  const processChildren = (child: any): any => {
                    if (typeof child === 'string') {
                      // 匹配《片名》格式并转换为可点击的span
                      const parts = child.split(/(《[^》]+》)/g);
                      return parts.map((part, i) => {
                        const match = part.match(/《([^》]+)》/);
                        if (match) {
                          const title = match[1];
                          return (
                            <span
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTitleClick(title);
                              }}
                              className="text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline"
                            >
                              {part}
                            </span>
                          );
                        }
                        return part;
                      });
                    }
                    return child;
                  };

                  return (
                    <p {...props}>
                      {Array.isArray(children)
                        ? children.map(child => processChildren(child))
                        : processChildren(children)
                      }
                    </p>
                  );
                },
                // 自定义列表项渲染，将《片名》转换为可点击链接
                li: ({node, children, ...props}) => {
                  const processChildren = (child: any): any => {
                    if (typeof child === 'string') {
                      // 匹配《片名》格式并转换为可点击的span
                      const parts = child.split(/(《[^》]+》)/g);
                      return parts.map((part, i) => {
                        const match = part.match(/《([^》]+)》/);
                        if (match) {
                          const title = match[1];
                          return (
                            <span
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTitleClick(title);
                              }}
                              className="text-blue-600 dark:text-blue-400 font-medium cursor-pointer hover:underline"
                            >
                              {part}
                            </span>
                          );
                        }
                        return part;
                      });
                    } else if (child?.props?.children) {
                      // 递归处理嵌套子元素
                      return {
                        ...child,
                        props: {
                          ...child.props,
                          children: Array.isArray(child.props.children)
                            ? child.props.children.map(processChildren)
                            : processChildren(child.props.children)
                        }
                      };
                    }
                    return child;
                  };

                  return (
                    <li {...props}>
                      {Array.isArray(children)
                        ? children.map(child => processChildren(child))
                        : processChildren(children)
                      }
                    </li>
                  );
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>

      {/* 推荐影片卡片 */}
      {message.role === 'assistant' && message.recommendations && message.recommendations.length > 0 && (
        <div className="mt-3 space-y-2 max-w-[80%]">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-linear-to-br from-blue-100 to-blue-50 dark:from-blue-900 dark:to-blue-950 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm ring-1 ring-blue-200/50 dark:ring-blue-800/50">
                🎬 点击搜索
              </span>
              <span className="font-medium">推荐影片</span>
            </div>
            <span className="text-gray-400 dark:text-gray-500 opacity-75">
              {message.recommendations.length < 4
                ? `${message.recommendations.length} 个推荐`
                : `前 4 个推荐`
              }
            </span>
          </div>
          {message.recommendations.map((movie, idx) => (
            <div
              key={idx}
              onClick={() => handleMovieSelect(movie)}
              className="@container p-3 bg-white dark:bg-gray-700 border border-gray-200/50 dark:border-gray-600/50 rounded-xl cursor-pointer hover:shadow-lg hover:shadow-blue-500/10 hover:border-blue-400 dark:hover:border-blue-500 hover:scale-[1.02] transition-all duration-200 group active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                {movie.poster && (
                  <img
                    src={movie.poster}
                    alt={movie.title}
                    className="w-12 h-16 object-cover rounded-lg shrink-0 shadow-md ring-1 ring-gray-200 dark:ring-gray-600"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-1">
                    {movie.title}
                    {movie.year && (
                      <span className="text-gray-500 dark:text-gray-400 font-normal">({movie.year})</span>
                    )}
                    <span className="ml-auto opacity-0 group-hover:opacity-100 transition-all duration-200 text-blue-600 dark:text-blue-400 text-xs font-medium flex items-center gap-0.5">
                      🔍 <span>搜索</span>
                    </span>
                  </h4>
                  {movie.genre && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">{movie.genre}</p>
                  )}
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {movie.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* YouTube视频推荐卡片 */}
      {message.role === 'assistant' && message.youtubeVideos && message.youtubeVideos.length > 0 && (
        <div className="mt-3 space-y-2 max-w-[80%]">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center justify-between">
            <div className="flex items-center">
              <span className="bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 px-2 py-1 rounded-full text-xs font-medium mr-2">
                📺 点击播放
              </span>
              YouTube视频推荐
            </div>
            <span className="text-gray-400 dark:text-gray-500">
              {message.youtubeVideos.length} 个视频
            </span>
          </div>
          {message.youtubeVideos.map((video, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {playingVideoId === video.id ? (
                <div className="relative">
                  <div className="aspect-video">
                    <iframe
                      src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      title={video.title}
                    />
                  </div>
                  <button
                    onClick={() => setPlayingVideoId(null)}
                    className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-70 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="p-3">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">{video.title}</h4>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{video.channelTitle}</p>
                  </div>
                </div>
              ) : (
                <div onClick={() => handleYouTubeVideoSelect(video)} className="p-3 cursor-pointer hover:shadow-md hover:border-red-300 dark:hover:border-red-600 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <img src={video.thumbnail} alt={video.title} className="w-16 h-12 object-cover rounded shrink-0" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded">
                        <div className="bg-red-600 text-white rounded-full p-1">
                          <Play className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2">{video.title}</h4>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{video.channelTitle}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{video.description}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 视频链接解析卡片 */}
      {message.role === 'assistant' && message.videoLinks && message.videoLinks.length > 0 && (
        <div className="mt-3 space-y-2 max-w-[80%]">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center justify-between">
            <div className="flex items-center">
              <span className="bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 px-2 py-1 rounded-full text-xs font-medium mr-2">
                🔗 链接解析
              </span>
              视频链接解析结果
            </div>
            <span className="text-gray-400 dark:text-gray-500">
              {message.videoLinks.length} 个链接
            </span>
          </div>
          {message.videoLinks.map((video, idx) => (
            <div key={idx} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
              {video.playable ? (
                <div className="space-y-3">
                  {playingVideoId === video.videoId ? (
                    <div className="relative">
                      <div className="aspect-video">
                        <iframe
                          src={video.embedUrl}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          title={video.title}
                        />
                      </div>
                      <button
                        onClick={() => setPlayingVideoId(null)}
                        className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full p-1 hover:bg-opacity-70 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="relative cursor-pointer" onClick={() => handleVideoLinkPlay(video)}>
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-20 h-15 object-cover rounded"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 rounded">
                          <div className="bg-red-600 text-white rounded-full p-2">
                            <Play className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                          {video.title}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {video.channelName}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          原链接: {video.originalUrl}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {playingVideoId !== video.videoId && (
                      <button
                        onClick={() => handleVideoLinkPlay(video)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm"
                      >
                        <Play className="w-4 h-4" />
                        直接播放
                      </button>
                    )}
                    <button
                      onClick={() => window.open(video.originalUrl, '_blank')}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2 text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      原始链接
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-red-600 dark:text-red-400">
                  <p className="font-medium">解析失败</p>
                  <p className="text-sm">{video.error}</p>
                  <p className="text-xs mt-1">原链接: {video.originalUrl}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

export default function AIRecommendModal({ isOpen, onClose, context, welcomeMessage }: AIRecommendModalProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ExtendedAIMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [error, setError] = useState<{message: string, details?: string} | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false); // 🔥 防止循环更新的标志

  // ✨ React 19: useTransition for non-urgent updates (流式聊天不需要useOptimistic)
  const [isPending, startTransition] = useTransition();

  // ⚡ 优化：防抖滚动到底部
  const scrollToBottom = useCallback(() => {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = setTimeout(() => {
      // 使用 scrollTop 直接滚动到底部，更可靠
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      // 备用方案：使用 scrollIntoView
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 50); // 减少延迟到 50ms 提高响应速度
  }, []);

  // ⚡ 优化：异步保存到 localStorage
  const saveMessagesToStorage = useCallback((messagesToSave: ExtendedAIMessage[]) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      // 使用 requestIdleCallback 在浏览器空闲时保存
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          try {
            const existingCache = localStorage.getItem('ai-recommend-messages');
            let existingTimestamp = new Date().getTime();

            if (existingCache) {
              try {
                const parsed = JSON.parse(existingCache);
                existingTimestamp = parsed.timestamp || existingTimestamp;
              } catch {
                // 解析失败时使用当前时间
              }
            }

            const cache = {
              messages: messagesToSave,
              timestamp: existingTimestamp
            };
            localStorage.setItem('ai-recommend-messages', JSON.stringify(cache));

            // 🔥 手动派发 storage 事件，同步同一页面内的其他组件实例
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'ai-recommend-messages',
              newValue: JSON.stringify(cache),
              url: window.location.href,
              storageArea: localStorage,
            }));
          } catch (error) {
            console.error("Failed to save messages to cache", error);
          }
        });
      } else {
        // 降级处理：使用 setTimeout
        setTimeout(() => {
          try {
            const existingCache = localStorage.getItem('ai-recommend-messages');
            let existingTimestamp = new Date().getTime();

            if (existingCache) {
              try {
                const parsed = JSON.parse(existingCache);
                existingTimestamp = parsed.timestamp || existingTimestamp;
              } catch {
                // 解析失败时使用当前时间
              }
            }

            const cache = {
              messages: messagesToSave,
              timestamp: existingTimestamp
            };
            localStorage.setItem('ai-recommend-messages', JSON.stringify(cache));

            // 🔥 手动派发 storage 事件，同步同一页面内的其他组件实例
            window.dispatchEvent(new StorageEvent('storage', {
              key: 'ai-recommend-messages',
              newValue: JSON.stringify(cache),
              url: window.location.href,
              storageArea: localStorage,
            }));
          } catch (error) {
            console.error("Failed to save messages to cache", error);
          }
        }, 0);
      }
    }, 300); // 300ms 防抖延迟
  }, []);

  // ✨ Native dialog control
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      dialog.showModal();
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      dialog.close();
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // 从localStorage加载历史对话
  useEffect(() => {
    try {
      const cachedMessages = localStorage.getItem('ai-recommend-messages');
      if (cachedMessages) {
        const { messages: storedMessages, timestamp } = JSON.parse(cachedMessages);
        const now = new Date().getTime();

        // 检查缓存是否包含旧格式的欢迎消息（不包含Markdown列表标记）
        const hasOldFormatWelcome = storedMessages.length > 0 &&
          storedMessages[0].role === 'assistant' &&
          storedMessages[0].content.includes('🎬 影视剧推荐 - 推荐电影') &&
          !storedMessages[0].content.includes('- 🎬');

        // 30分钟缓存，但如果是旧格式则强制刷新
        if (now - timestamp < 30 * 60 * 1000 && !hasOldFormatWelcome) {
          setMessages(storedMessages.map((msg: ExtendedAIMessage) => ({
            ...msg,
            timestamp: msg.timestamp || new Date().toISOString()
          })));
          return; // 有缓存就不显示欢迎消息
        } else {
          // 超过30分钟或旧格式时删除缓存
          console.log(hasOldFormatWelcome ? 'AI欢迎消息格式已更新，清除旧缓存' : 'AI聊天记录已超过30分钟，自动清除缓存');
          localStorage.removeItem('ai-recommend-messages');
        }
      }

      // 没有有效缓存时显示欢迎消息（Markdown格式）
      const defaultWelcome = context?.title
        ? `想了解《${context.title}》的更多信息吗？我可以帮你查询剧情、演员、评价等。`
        : `你好！我是 **AI 智能助手**，支持以下功能：

- 🎬 **影视剧推荐** - 推荐电影、电视剧、动漫等
- 🔗 **视频链接解析** - 解析 YouTube 链接并播放
- 📺 **视频内容搜索** - 搜索相关视频内容

💡 **提示**：直接告诉我你想看什么类型的内容，或发送 YouTube 链接给我解析！`;

      const welcomeMsg: ExtendedAIMessage = {
        role: 'assistant',
        content: welcomeMessage || defaultWelcome,
        timestamp: new Date().toISOString()
      };
      setMessages([welcomeMsg]);
    } catch (error) {
      console.error("Failed to load messages from cache", error);
      // 发生错误时也清除可能损坏的缓存
      localStorage.removeItem('ai-recommend-messages');
    }
  }, []);

  // 🔥 监听 storage 事件，同步其他组件实例的更新
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // 🚫 防止循环：如果正在同步中，忽略此次事件
      if (isSyncingRef.current) return;

      if (e.key === 'ai-recommend-messages' && e.newValue) {
        try {
          const { messages: updatedMessages, timestamp } = JSON.parse(e.newValue);
          const now = new Date().getTime();

          // 检查缓存是否有效（30分钟内）
          if (now - timestamp < 30 * 60 * 1000) {
            console.log('🔄 检测到其他组件实例更新，同步聊天记录');

            // 🔥 设置同步标志，防止触发保存
            isSyncingRef.current = true;

            setMessages(updatedMessages.map((msg: ExtendedAIMessage) => ({
              ...msg,
              timestamp: msg.timestamp || new Date().toISOString()
            })));

            // 🔥 延迟重置标志，确保保存逻辑不会立即触发
            setTimeout(() => {
              isSyncingRef.current = false;
            }, 500);
          }
        } catch (error) {
          console.error('同步聊天记录失败:', error);
          isSyncingRef.current = false;
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // ⚡ 优化：保存对话到localStorage并滚动到底部
  useEffect(() => {
    scrollToBottom();

    // 🚫 如果正在同步，跳过保存（避免循环）
    if (isSyncingRef.current) {
      console.log('⏭️ 跳过保存（正在同步中）');
      return;
    }

    saveMessagesToStorage(messages);
  }, [messages, scrollToBottom, saveMessagesToStorage]);

  // ⚡ 优化：使用 useCallback 缓存事件处理函数
  const handleTitleClick = useCallback((title: string) => {
    const cleanTitle = cleanMovieTitle(title);
    const searchUrl = generateSearchUrl(cleanTitle);
    router.push(searchUrl);
    onClose();
  }, [router, onClose]);

  const handleMovieSelect = useCallback((movie: MovieRecommendation) => {
    const searchQuery = encodeURIComponent(movie.title);
    router.push(`/search?q=${searchQuery}`);
    onClose();
  }, [router, onClose]);

  const handleYouTubeVideoSelect = useCallback((video: any) => {
    setPlayingVideoId(prev => prev === video.id ? null : video.id);
  }, []);

  const handleVideoLinkPlay = useCallback((video: any) => {
    if (video.playable && video.embedUrl) {
      setPlayingVideoId(prev => prev === video.videoId ? null : video.videoId);
    }
  }, []);

  // ✨ Optimized sendMessage with useState (不使用useOptimistic，直接更新state以确保流式响应立即显示)
  const sendMessage = async (content: string) => {
    if (!content.trim() || isPending) return;

    const userMessage: ExtendedAIMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    // Add a temporary "AI is thinking" message
    const thinkingMessage: ExtendedAIMessage = {
      role: 'assistant',
      content: '思考中...',
      timestamp: new Date().toISOString(),
    };

    setInputMessage('');
    setError(null);

    // 🔥 立即同步更新state（不使用optimistic，确保用户消息和思考中立即显示）
    const updatedMessages = [...messages, userMessage];
    const messagesWithThinking = [...updatedMessages, thinkingMessage];
    setMessages(messagesWithThinking);

    startTransition(async () => {
      try {
        // 智能上下文管理：只发送最近8条消息（4轮对话）
        const conversationHistory = updatedMessages.slice(-8);

        // 🔥 流式响应：逐字显示AI回复
        let streamingContent = '';
        const response = await sendAIRecommendMessage(
          conversationHistory,
          context,
          (chunk: string) => {
            // 每次接收到chunk，更新消息内容
            streamingContent += chunk;
            setMessages((prev) => {
              const newMessages = [...prev];
              // 更新最后一条助手消息（"思考中..."）
              if (newMessages[newMessages.length - 1]?.role === 'assistant') {
                newMessages[newMessages.length - 1] = {
                  ...newMessages[newMessages.length - 1],
                  content: streamingContent,
                };
              }
              return newMessages;
            });
          }
        );

        // 从AI回复中提取推荐影片（用于流式响应）
        const extractRecommendations = (content: string): MovieRecommendation[] => {
          const recommendations: MovieRecommendation[] = [];
          const lines = content.split('\n');

          // 支持多种格式：
          // 1. 《片名》（2023） - 带中文括号年份
          // 2. 《片名》 - 不带年份
          // 3. 1. 类型：《片名》(English Title) - 带类别前缀和英文名
          // 4. 1. 《片名》 - 数字序号

          // 匹配《》中的内容，允许前面有任意文本（类别、序号等）
          const titlePattern = /《([^》]+)》/;

          for (let i = 0; i < lines.length; i++) {
            if (recommendations.length >= 4) break;

            const line = lines[i];
            const match = line.match(titlePattern);

            if (match) {
              const title = match[1].trim();
              let year = '';
              let genre = '';
              let description = 'AI推荐内容';

              // 尝试从同一行提取年份（中文括号优先）
              const yearMatchCN = line.match(/《[^》]+》\s*（(\d{4})）/);
              const yearMatchEN = line.match(/《[^》]+》\s*\((\d{4})\)/);

              if (yearMatchCN) {
                year = yearMatchCN[1];
              } else if (yearMatchEN) {
                year = yearMatchEN[1];
              }

              // 尝试从同一行提取类型（在《》之前的部分）
              const genreMatch = line.match(/(?:\d+\.\s*)?([^：:《]+)[：:]\s*《/);
              if (genreMatch) {
                genre = genreMatch[1].trim();
              }

              // 查找后续行的"类型："或"推荐理由："
              for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const nextLine = lines[j];
                if (nextLine.includes('类型：') || nextLine.includes('类型:')) {
                  const extractedGenre = nextLine.split(/类型[：:]/)[1]?.trim();
                  if (extractedGenre && !genre) {
                    genre = extractedGenre;
                  }
                } else if (nextLine.includes('推荐理由：') || nextLine.includes('推荐理由:') || nextLine.includes('理由：') || nextLine.includes('理由:')) {
                  description = nextLine.split(/(?:推荐)?理由[：:]/)[1]?.trim() || description;
                  break;
                }
              }

              recommendations.push({
                title,
                year,
                genre,
                description,
              });
            }
          }
          return recommendations;
        };

        // 使用最终内容（streamingContent优先，因为它包含完整的流式内容）
        const finalContent = streamingContent || response.choices[0].message.content;
        const extractedRecommendations = extractRecommendations(finalContent);

        const assistantMessage: ExtendedAIMessage = {
          role: 'assistant',
          content: finalContent,
          timestamp: new Date().toISOString(),
          recommendations: response.recommendations || extractedRecommendations,
          youtubeVideos: response.youtubeVideos || [],
          videoLinks: response.videoLinks || [],
          type: response.type || 'normal',
        };

        // Replace thinking message with actual response
        setMessages([...updatedMessages, assistantMessage]);
      } catch (error) {
        console.error('AI推荐请求失败:', error);

        if (error instanceof Error) {
          try {
            const errorResponse = JSON.parse(error.message);
            setError({
              message: errorResponse.error || error.message,
              details: errorResponse.details
            });
          } catch {
            setError({
              message: error.message,
              details: '如果问题持续，请联系管理员检查AI配置'
            });
          }
        } else {
          setError({
            message: '请求失败，请稍后重试',
            details: '未知错误，请检查网络连接'
          });
        }

        // Remove optimistic messages on error
        setMessages(messages);
      }
    });
  };

  // ⚡ 优化：使用 useCallback 缓存更多事件处理函数
  const handlePresetClick = useCallback((preset: { title: string; message: string }) => {
    sendMessage(preset.message);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputMessage);
  }, [inputMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputMessage);
    }
  }, [inputMessage]);

  const resetChat = useCallback(() => {
    try {
      localStorage.removeItem('ai-recommend-messages');
    } catch (error) {
      console.error("Failed to clear messages cache", error);
    }

    const welcomeMessage: ExtendedAIMessage = {
      role: 'assistant',
      content: `你好！我是 **AI 智能助手**，支持以下功能：

- 🎬 **影视剧推荐** - 推荐电影、电视剧、动漫等
- 🔗 **视频链接解析** - 解析 YouTube 链接并播放
- 📺 **视频内容搜索** - 搜索相关视频内容

💡 **提示**：直接告诉我你想看什么类型的内容，或发送 YouTube 链接给我解析！`,
      timestamp: new Date().toISOString()
    };
    setMessages([welcomeMessage]);
    setError(null);
    setInputMessage('');
  }, []);

  // 不再需要为消息内容添加点击监听器，因为点击功能已移至右侧卡片

  return (
    /* ✨ Native HTML dialog element with Tailwind 4.0 styling */
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-4xl h-[80vh] mx-auto p-0 bg-transparent backdrop:bg-black/60 backdrop:backdrop-blur-md rounded-2xl shadow-2xl border-0 open:animate-in open:fade-in open:zoom-in-95 open:duration-300"
    >
      {/* 对话框内容容器 - 使用 @container 查询 */}
      <div className="@container relative w-full h-full bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 头部 - 使用 Tailwind 4.0 改进的渐变 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-linear-to-br from-blue-600 via-purple-600 to-blue-700 shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm ring-1 ring-white/30 shadow-inner">
              <Brain className="h-6 w-6 text-white drop-shadow-md" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white drop-shadow-sm">AI 智能助手</h2>
              <p className="text-blue-50/90 text-sm font-medium">影视推荐 · 视频解析 · YouTube搜索</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {messages.length > 0 && (
              <button
                onClick={resetChat}
                className="px-3 py-1.5 text-sm bg-white/20 text-white rounded-lg hover:bg-white/30 active:scale-95 transition-all duration-200 backdrop-blur-sm ring-1 ring-white/30 font-medium"
              >
                清空对话
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-all duration-200 text-white active:scale-95 backdrop-blur-sm"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 消息区域 - 直接使用 messages state */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-linear-to-b from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-900/50"
        >
          {messages.length <= 1 && messages.every(msg => msg.role === 'assistant') && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-linear-to-br from-blue-500 to-purple-600 rounded-full mb-4">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {context?.title ? `关于《${context.title}》` : '欢迎使用AI智能助手'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {context?.title
                  ? '选择快捷操作或直接输入你的问题'
                  : '支持影视推荐、YouTube链接解析和视频搜索推荐'
                }
              </p>

              {/* 快捷操作按钮 - 针对特定影片 */}
              {context?.title ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
                  <button
                    onClick={() => handlePresetClick({ title: '📖 剧情介绍', message: '这部影片讲了什么故事？请详细介绍一下剧情' })}
                    className="p-4 text-center bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg hover:scale-105 transition-all group"
                    disabled={isPending}
                  >
                    <div className="text-3xl mb-2">📖</div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      剧情介绍
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      获取剧情摘要
                    </div>
                  </button>

                  <button
                    onClick={() => handlePresetClick({ title: '⭐ 影片评价', message: '这部影片评分怎么样？豆瓣和TMDB评分是多少？演员阵容如何？' })}
                    className="p-4 text-center bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-yellow-500 dark:hover:border-yellow-400 hover:shadow-lg hover:scale-105 transition-all group"
                    disabled={isPending}
                  >
                    <div className="text-3xl mb-2">⭐</div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">
                      影片评价
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      查看评分和演员
                    </div>
                  </button>

                  <button
                    onClick={() => handlePresetClick({ title: '🎬 相似推荐', message: '有没有类似的影片推荐？请推荐5部相似的电影或电视剧' })}
                    className="p-4 text-center bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 hover:shadow-lg hover:scale-105 transition-all group"
                    disabled={isPending}
                  >
                    <div className="text-3xl mb-2">🎬</div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      相似推荐
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      推荐类似影片
                    </div>
                  </button>
                </div>
              ) : (
                /* 通用预设问题 - 全局AI按钮 */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                  {AI_RECOMMEND_PRESETS.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => handlePresetClick(preset)}
                      className="p-3 text-left bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all group"
                      disabled={isPending}
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {preset.title}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ⚡ 优化：使用记忆化的消息组件 */}
          {messages.map((message, index) => (
            <MessageItem
              key={index}
              message={message}
              index={index}
              handleTitleClick={handleTitleClick}
              handleMovieSelect={handleMovieSelect}
              handleYouTubeVideoSelect={handleYouTubeVideoSelect}
              handleVideoLinkPlay={handleVideoLinkPlay}
              playingVideoId={playingVideoId}
              setPlayingVideoId={setPlayingVideoId}
            />
          ))}

          {/* 加载状态 - 使用 isPending */}
          {isPending && messages[messages.length - 1]?.content !== '思考中...' && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white dark:bg-gray-700 p-3 rounded-xl border border-gray-200/50 dark:border-gray-600/50 shadow-sm">
                <div className="flex space-x-1.5">
                  <div className="w-2 h-2 bg-linear-to-br from-blue-500 to-purple-500 rounded-full animate-bounce shadow-sm"></div>
                  <div className="w-2 h-2 bg-linear-to-br from-blue-500 to-purple-500 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-2 h-2 bg-linear-to-br from-blue-500 to-purple-500 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.3s' }}></div>
                </div>
              </div>
            </div>
          )}

          {/* 错误提示 - 优化样式 */}
          {error && (
            <div className="bg-linear-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-950/30 border border-red-200/50 dark:border-red-800/50 text-red-700 dark:text-red-400 p-4 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-start space-x-3">
                <div className="shrink-0 p-1">
                  <svg className="h-5 w-5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
                    {error.message}
                  </h3>
                  {error.details && (
                    <div className="mt-2 text-sm text-red-700 dark:text-red-300 leading-relaxed">
                      <p>{error.details}</p>
                    </div>
                  )}
                  <div className="mt-3">
                    <button
                      onClick={() => setError(null)}
                      className="text-sm bg-red-200 hover:bg-red-300 dark:bg-red-800 dark:hover:bg-red-700 text-red-900 dark:text-red-100 px-4 py-1.5 rounded-lg transition-all duration-200 font-medium shadow-sm active:scale-95"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 - 改进样式 */}
        <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-gray-900 shadow-inner">
          <form onSubmit={handleSubmit} className="flex space-x-3">
            <div className="flex-1">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入影视推荐类型、YouTube搜索内容或直接粘贴YouTube链接..."
                className="w-full p-3 border border-gray-300/50 dark:border-gray-600/50 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-gray-50 dark:focus:bg-gray-800 resize-none transition-all duration-200 shadow-sm"
                rows={2}
                disabled={isPending}
              />
            </div>
            <button
              type="submit"
              disabled={!inputMessage.trim() || isPending}
              className="px-6 py-3 bg-linear-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all duration-200 flex items-center space-x-2 shadow-lg shadow-blue-500/30 disabled:shadow-none active:scale-95"
            >
              <Send className="h-4 w-4" />
              <span>{isPending ? '发送中' : '发送'}</span>
            </button>
          </form>

          {/* 提示信息 */}
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              支持影视推荐、YouTube链接解析和视频搜索
            </span>
            <span className="opacity-75">按 Enter 发送，Shift+Enter 换行</span>
          </div>
        </div>
      </div>
    </dialog>
  );
}