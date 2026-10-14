export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface MovieRecommendation {
  title: string;
  year?: string;
  genre?: string;
  description: string;
  poster?: string;
}

export interface AIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  recommendations?: MovieRecommendation[];
  youtubeVideos?: any[];
  videoLinks?: any[];
  type?: string;
}

export interface AIRecommendHistory {
  timestamp: string;
  messages: AIMessage[];
  response: string;
}

export function isAIRecommendFeatureDisabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const runtimeConfig = (window as any).RUNTIME_CONFIG;
  return runtimeConfig?.AI_RECOMMEND_ENABLED === false;
}

/**
 * 发送AI推荐请求（支持流式响应）
 */
export async function sendAIRecommendMessage(
  messages: AIMessage[],
  context?: {
    title?: string;
    year?: string;
    douban_id?: number;
    tmdb_id?: number;
    type?: 'movie' | 'tv';
    currentEpisode?: number;
  },
  onStream?: (chunk: string) => void, // 🔥 流式回调函数
): Promise<AIChatResponse> {
  const response = await fetch('/api/ai-recommend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      context, // 🔥 传递视频上下文
      stream: !!onStream, // 🔥 如果有回调函数，启用流式
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    // 将完整错误信息作为JSON字符串抛出，以便前端解析
    throw new Error(
      JSON.stringify({
        error: errorData.error || 'AI推荐请求失败',
        details: errorData.details,
        status: errorData.status || response.status,
      }),
    );
  }

  // 🔥 流式响应处理
  if (onStream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let youtubeVideos: any[] = [];
    let videoLinks: any[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((line) => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              break;
            }

            try {
              const json = JSON.parse(data);

              // 处理文本流
              if (json.text) {
                fullContent += json.text;
                onStream(json.text); // 回调每个chunk
              }

              // 🎥 处理YouTube视频数据
              if (json.type === 'youtube_data' && json.youtubeVideos) {
                youtubeVideos = json.youtubeVideos;
                console.log(
                  '✅ 收到YouTube视频数据:',
                  youtubeVideos.length,
                  '个视频',
                );
              }

              // 🔗 处理视频链接数据
              if (json.type === 'video_links' && json.videoLinks) {
                videoLinks = json.videoLinks;
                console.log(
                  '✅ 收到视频链接数据:',
                  videoLinks.length,
                  '个链接',
                );
              }
            } catch (e) {
              console.error('解析SSE数据失败:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // 返回完整响应（兼容原有格式，包含YouTube数据）
    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: fullContent,
          },
        },
      ],
      youtubeVideos,
      videoLinks,
    } as AIChatResponse;
  }

  // 非流式响应（保持原有逻辑）
  return response.json();
}

/**
 * 获取AI推荐历史记录
 */
export async function getAIRecommendHistory(): Promise<{
  history: AIRecommendHistory[];
  total: number;
}> {
  const response = await fetch('/api/ai-recommend', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || '获取历史记录失败');
  }

  return response.json();
}

/**
 * 检查AI推荐功能是否可用
 */
export async function checkAIRecommendAvailable(): Promise<boolean> {
  if (isAIRecommendFeatureDisabled()) {
    return false;
  }

  try {
    const response = await fetch('/api/ai-recommend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '测试' }],
      }),
    });

    // 如果是403错误，说明功能未启用
    if (response.status === 403) {
      return false;
    }

    // 如果是401错误，说明需要登录但功能可用
    if (response.status === 401) {
      return true;
    }

    return response.ok;
  } catch {
    // 静默处理错误
    return false;
  }
}

/**
 * 生成推荐相关的预设问题
 */
export const AI_RECOMMEND_PRESETS = [
  {
    title: '🎬 推荐热门电影',
    message: '请推荐几部最近的热门电影，包括不同类型的，请直接列出片名',
  },
  {
    title: '📺 推荐电视剧',
    message: '推荐一些口碑很好的电视剧，最好是最近几年的，请直接列出剧名',
  },
  {
    title: '😂 推荐喜剧片',
    message: '推荐几部搞笑的喜剧电影，能让人开心的那种，请直接列出片名',
  },
  {
    title: '🔥 推荐动作片',
    message: '推荐一些精彩的动作电影，场面要刺激的，请直接列出片名',
  },
  {
    title: '💕 推荐爱情片',
    message: '推荐几部经典的爱情电影，要感人的，请直接列出片名',
  },
  {
    title: '🔍 推荐悬疑片',
    message: '推荐一些烧脑的悬疑推理电影，请直接列出片名',
  },
  {
    title: '🌟 推荐经典老片',
    message: '推荐一些经典的老电影，值得收藏的那种，请直接列出片名',
  },
  {
    title: '🎭 推荐综艺节目',
    message: '推荐一些好看的综艺节目，要有趣的，请直接列出节目名',
  },
];

/**
 * 影视作品名称的正则匹配模式
 */
const MOVIE_TITLE_PATTERNS = [
  // 《片名》格式
  /《([^》]+)》/g,
  // "片名"格式
  /"([^"]+)"/g,
  // 【片名】格式
  /【([^】]+)】/g,
  // 1. 片名 格式
  /^\d+[.、]\s*(.+?)(?:\s*[（(]|$)/gm,
  // - 片名 格式
  /^[-•]\s*(.+?)(?:\s*[（(]|$)/gm,
];

/**
 * 从AI回复中提取影视作品名称
 */
export function extractMovieTitles(content: string): string[] {
  const titles = new Set<string>();

  MOVIE_TITLE_PATTERNS.forEach((pattern) => {
    let match;
    const globalPattern = new RegExp(pattern.source, pattern.flags);
    while ((match = globalPattern.exec(content)) !== null) {
      const title = match[1]?.trim();
      if (title && title.length > 1 && title.length < 50) {
        // 过滤掉一些非影视作品的内容
        if (
          !title.match(
            /^(推荐|电影|电视剧|综艺|动漫|年|导演|主演|类型|简介|评分)$/,
          )
        ) {
          titles.add(title);
        }
      }
      // 防止无限循环
      if (!pattern.global) break;
    }
  });

  return Array.from(titles);
}

/**
 * 将AI回复中的影视作品名称转换为可点击链接
 */
export function formatAIResponseWithLinks(
  content: string,
  _onTitleClick?: (title: string) => void,
): string {
  let formatted = content;

  // 提取所有影视作品名称
  const titles = extractMovieTitles(content);

  // 只添加视觉样式，不添加点击功能（点击功能由右侧卡片提供）
  titles.forEach((title) => {
    // 替换《片名》格式 - 只添加样式，不添加点击
    formatted = formatted.replace(
      new RegExp(`《${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}》`, 'g'),
      `<span class="text-blue-600 dark:text-blue-400 font-medium">《${title}》</span>`,
    );

    // 替换"片名"格式
    formatted = formatted.replace(
      new RegExp(`"${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
      `<span class="text-blue-600 dark:text-blue-400 font-medium">"${title}"</span>`,
    );

    // 替换【片名】格式
    formatted = formatted.replace(
      new RegExp(`【${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}】`, 'g'),
      `<span class="text-blue-600 dark:text-blue-400 font-medium">【${title}】</span>`,
    );
  });

  // 处理其他markdown格式
  // 处理标题
  formatted = formatted.replace(
    /^### (.*$)/gim,
    '<h3 class="text-lg font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h3>',
  );
  formatted = formatted.replace(
    /^## (.*$)/gim,
    '<h2 class="text-xl font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h2>',
  );
  formatted = formatted.replace(
    /^# (.*$)/gim,
    '<h1 class="text-2xl font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h1>',
  );

  // 处理粗体
  formatted = formatted.replace(
    /\*\*(.*?)\*\*/g,
    '<strong class="font-semibold text-gray-900 dark:text-gray-100">$1</strong>',
  );

  // 处理数字列表 - 先匹配整行包括换行符
  formatted = formatted.replace(
    /^\d+[.、]\s*(.*?)(?=\n|$)/gim,
    '<div class="ml-4 text-gray-800 dark:text-gray-200">• $1</div>',
  );

  // 处理普通列表 - 先匹配整行包括换行符
  formatted = formatted.replace(
    /^[-•]\s*(.*?)(?=\n|$)/gim,
    '<div class="ml-4 text-gray-800 dark:text-gray-200">• $1</div>',
  );

  // 清理列表项之间多余的换行符
  formatted = formatted.replace(/(<\/div>)\n+(?=<div class="ml-4)/g, '$1');

  // 处理段落分隔
  formatted = formatted.replace(/\n\n+/g, '<br><br>');

  // 处理剩余的单换行
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

/**
 * 生成搜索URL
 */
export function generateSearchUrl(title: string): string {
  return `/search?q=${encodeURIComponent(title)}`;
}

// 存储每个元素的事件处理器，避免重复绑定
const elementHandlers = new WeakMap<HTMLElement, (e: Event) => void>();

/**
 * 添加点击事件监听器到格式化后的内容
 */
export function addMovieTitleClickListeners(
  element: HTMLElement,
  onTitleClick: (title: string) => void,
): void {
  // 移除之前的监听器
  const existingHandler = elementHandlers.get(element);
  if (existingHandler) {
    element.removeEventListener('click', existingHandler);
  }

  // 创建新的事件处理器
  const handleClick = (e: Event) => {
    const target = e.target as HTMLElement;

    // 查找最近的具有movie-title类的元素
    const movieTitleEl = target.closest(
      '.movie-title[data-title]',
    ) as HTMLElement;
    if (movieTitleEl) {
      e.preventDefault();
      e.stopPropagation();

      const title = movieTitleEl.getAttribute('data-title');
      if (title) {
        onTitleClick(title);
      }
    }
  };

  // 存储并添加新的监听器
  elementHandlers.set(element, handleClick);
  element.addEventListener('click', handleClick);
}

/**
 * 生成对话摘要
 */
export function generateChatSummary(messages: AIMessage[]): string {
  const userMessages = messages.filter((msg) => msg.role === 'user');
  if (userMessages.length === 0) return '新对话';

  const firstUserMessage = userMessages[0].content;
  if (firstUserMessage.length <= 20) {
    return firstUserMessage;
  }

  return firstUserMessage.substring(0, 17) + '...';
}

/**
 * 检查消息是否包含影视推荐相关内容
 */
export function isRecommendationRelated(message: string): boolean {
  const keywords = [
    '推荐',
    '电影',
    '电视剧',
    '综艺',
    '动漫',
    '纪录片',
    '好看',
    '有趣',
    '值得',
    '经典',
    '热门',
    '口碑',
    '喜剧',
    '爱情',
    '动作',
    '悬疑',
    '科幻',
    '恐怖',
    '剧情',
    '战争',
    '历史',
    '犯罪',
    '冒险',
    '奇幻',
  ];

  return keywords.some((keyword) => message.includes(keyword));
}

/**
 * 清理片名中的特殊字符和多余信息
 */
export function cleanMovieTitle(title: string): string {
  return title
    .replace(/（.*?）/g, '') // 移除中文括号内容
    .replace(/\(.*?\)/g, '') // 移除英文括号内容
    .replace(/\d{4}年?/g, '') // 移除年份
    .replace(/第\d+季/g, '') // 移除季数
    .replace(/\s+/g, ' ') // 多个空格合并为一个
    .trim();
}
