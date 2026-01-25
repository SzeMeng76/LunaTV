/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI数据源协调器（简化版）
 * 负责意图分析和可选的联网搜索增强
 */

export interface VideoContext {
  title?: string;
  year?: string;
  douban_id?: number;
  tmdb_id?: number;
  type?: 'movie' | 'tv';
  currentEpisode?: number;
}

export interface IntentAnalysisResult {
  type: 'recommendation' | 'query' | 'detail' | 'general';
  needWebSearch: boolean;
  keywords: string[];
  confidence: number; // 0-1，判断的置信度
}

export interface TavilySearchResult {
  results: Array<{
    title: string;
    content: string;
    url: string;
    score: number;
  }>;
}

export interface OrchestrationResult {
  systemPrompt: string;
  webSearchResults?: TavilySearchResult;
  intent: IntentAnalysisResult;
}

/**
 * 分析用户意图（关键词匹配版）
 */
export function analyzeIntent(
  message: string,
  context?: VideoContext
): IntentAnalysisResult {
  const lowerMessage = message.toLowerCase();

  // 时效性关键词 - 需要最新信息的问题
  const timeKeywords = [
    '最新', '今年', '2024', '2025', '2026', '即将', '上映', '新出',
    '什么时候', '何时', '几时', '播出', '更新', '下一季',
    '第二季', '第三季', '续集', '下季', '下部', '最近',
    '新番', '新剧', '新片', '刚出', '刚上映', '有片源', '已上映',
    '可以看', '在哪看', '能看', '已播', '正在热映', '热播'
  ];

  // 推荐类关键词
  const recommendKeywords = [
    '推荐', '有什么', '好看', '值得', '介绍',
    '求片', '求推荐', '找片', '想看'
  ];

  // 演员/导演关键词
  const personKeywords = [
    '演员', '导演', '主演', '出演', '作品',
    '演过', '拍过', '主角', '配音', '声优'
  ];

  // 剧情相关关键词
  const plotKeywords = [
    '讲什么', '剧情', '故事', '内容', '讲的是',
    '结局', '大结局', '剧透', '评价', '口碑'
  ];

  // 新闻/资讯关键词
  const newsKeywords = [
    '新闻', '消息', '爆料', '官宣', '定档',
    '杀青', '开拍', '票房', '收视'
  ];

  // 计算关键词匹配度
  const hasTimeKeyword = timeKeywords.some((k) => message.includes(k));
  const hasRecommendKeyword = recommendKeywords.some((k) => message.includes(k));
  const hasPersonKeyword = personKeywords.some((k) => message.includes(k));
  const hasPlotKeyword = plotKeywords.some((k) => message.includes(k));
  const hasNewsKeyword = newsKeywords.some((k) => message.includes(k));

  // 判断类型
  let type: IntentAnalysisResult['type'] = 'general';
  let confidence = 0.5;

  if (hasRecommendKeyword) {
    type = 'recommendation';
    confidence = 0.8;
  } else if (context?.title && (hasPlotKeyword || lowerMessage.includes('这部'))) {
    type = 'detail';
    confidence = 0.9;
  } else if (hasPersonKeyword || hasNewsKeyword) {
    type = 'query';
    confidence = 0.85;
  }

  // 决定是否需要联网搜索
  // 联网场景：
  // 1. 时效性问题（最新、即将上映等）
  // 2. 演员/导演作品查询
  // 3. 新闻资讯
  // 4. 推荐类问题（获取最新热门）
  // 5. 🆕 有视频上下文的detail查询（可能问新片信息）
  const needWebSearch =
    hasTimeKeyword ||
    hasPersonKeyword ||
    hasNewsKeyword ||
    (hasRecommendKeyword && (hasTimeKeyword || message.includes('热门'))) ||
    (context?.title && type === 'detail' && context.year && parseInt(context.year) >= 2024);

  // 提取关键词
  const matchedKeywords = [
    ...timeKeywords.filter((k) => message.includes(k)),
    ...personKeywords.filter((k) => message.includes(k)),
    ...newsKeywords.filter((k) => message.includes(k)),
  ];

  return {
    type,
    needWebSearch,
    keywords: matchedKeywords,
    confidence,
  };
}

/**
 * API Key轮询管理器
 */
class ApiKeyRotator {
  private keys: string[];
  private currentIndex: number = 0;
  private failedKeys: Set<string> = new Set();

  constructor(keys: string | string[]) {
    this.keys = Array.isArray(keys) ? keys : [keys];
  }

  /**
   * 获取下一个可用的API Key
   */
  getNext(): string | null {
    if (this.keys.length === 0) return null;

    // 过滤掉失败的keys
    const availableKeys = this.keys.filter(k => !this.failedKeys.has(k));
    if (availableKeys.length === 0) {
      // 所有keys都失败了，重置失败记录重试
      this.failedKeys.clear();
      return this.keys[0];
    }

    // 轮询选择
    const key = availableKeys[this.currentIndex % availableKeys.length];
    this.currentIndex++;
    return key;
  }

  /**
   * 标记某个key为失败
   */
  markFailed(key: string) {
    this.failedKeys.add(key);
  }

  /**
   * 重置失败记录
   */
  reset() {
    this.failedKeys.clear();
    this.currentIndex = 0;
  }
}

/**
 * 使用Tavily搜索（支持多key轮询）
 */
export async function fetchTavilySearch(
  query: string,
  apiKeys: string | string[],
  options?: {
    maxResults?: number;
    includeDomains?: string[];
  }
): Promise<TavilySearchResult | null> {
  const rotator = new ApiKeyRotator(apiKeys);
  const maxRetries = Array.isArray(apiKeys) ? apiKeys.length : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const apiKey = rotator.getNext();
    if (!apiKey) {
      console.error('Tavily: 没有可用的API Key');
      return null;
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'basic',
          include_domains: options?.includeDomains || [
            'douban.com',
            'imdb.com',
            'themoviedb.org',
            'mtime.com',
            'bilibili.com'
          ],
          max_results: options?.maxResults || 5,
        }),
      });

      if (!response.ok) {
        // API Key可能失效或达到限额
        if (response.status === 401 || response.status === 429) {
          console.warn(`Tavily API Key ${apiKey.slice(0, 8)}... 失败 (${response.status})`);
          rotator.markFailed(apiKey);
          continue; // 尝试下一个key
        }
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Tavily搜索成功，使用key: ${apiKey.slice(0, 8)}...`);
      return data;
    } catch (error) {
      console.error(`Tavily搜索失败 (attempt ${attempt + 1}/${maxRetries}):`, error);
      if (attempt === maxRetries - 1) {
        return null;
      }
    }
  }

  return null;
}

/**
 * 格式化Tavily搜索结果为文本
 */
export function formatTavilyResults(results: TavilySearchResult): string {
  if (!results || !results.results || results.results.length === 0) {
    return '';
  }

  return results.results
    .map(
      (r, index) => `
【搜索结果 ${index + 1}】
标题: ${r.title}
内容: ${r.content}
来源: ${r.url}
`
    )
    .join('\n');
}

/**
 * 获取豆瓣详情数据（直接调用scraper函数，支持所有部署环境）
 */
async function fetchDoubanData(doubanId: number): Promise<any | null> {
  if (!doubanId || doubanId <= 0) {
    return null;
  }

  try {
    // 直接导入并调用豆瓣scraper函数（避免HTTP请求，支持Vercel/Docker）
    const { scrapeDoubanDetails } = await import('@/app/api/douban/details/route');

    const result = await scrapeDoubanDetails(doubanId.toString());

    if (result.code === 200 && result.data) {
      console.log(`✅ 豆瓣数据: ${result.data.title} (${result.data.rate}分)`);
      return result.data;
    }

    console.warn(`⚠️ 豆瓣数据获取失败 (ID: ${doubanId}): ${result.message}`);
    return null;
  } catch (error) {
    console.error(`❌ 获取豆瓣详情失败 (ID: ${doubanId}):`, error);
    return null;
  }
}

/**
 * 获取TMDB详情数据（keywords和similar）
 */
async function fetchTMDBData(
  tmdbId: number | undefined,
  type: 'movie' | 'tv',
  title?: string,
  year?: string
): Promise<any | null> {
  let actualTmdbId = tmdbId;

  // 🔥 如果没有TMDB ID，尝试通过标题和年份搜索
  if (!actualTmdbId && title) {
    try {
      console.log(`🔍 没有TMDB ID，尝试搜索: ${title} (${year || '无年份'})`);
      const { searchTMDBMovie, searchTMDBTV } = await import('@/lib/tmdb.client');

      const searchResult = type === 'movie'
        ? await searchTMDBMovie(title, year)
        : await searchTMDBTV(title, year);

      if (searchResult) {
        actualTmdbId = searchResult.id;
        console.log(`✅ 通过标题搜索到TMDB ID: ${actualTmdbId}`);
      } else {
        console.log(`⚠️ 未能通过标题搜索到TMDB ID`);
        return null;
      }
    } catch (error) {
      console.error(`搜索TMDB ID失败:`, error);
      return null;
    }
  }

  if (!actualTmdbId || actualTmdbId <= 0) {
    return null;
  }

  try {
    // 直接导入TMDB客户端函数
    const { getTMDBMovieDetails, getTMDBTVDetails } = await import('@/lib/tmdb.client');

    const result = type === 'movie'
      ? await getTMDBMovieDetails(actualTmdbId)
      : await getTMDBTVDetails(actualTmdbId);

    if (result) {
      const title = (result as any).title || (result as any).name || '';
      console.log(`✅ TMDB数据: ${title} (keywords: ${result.keywords?.length || 0}, similar: ${result.similar?.length || 0})`);
      return result;
    }

    console.warn(`⚠️ TMDB数据获取失败 (ID: ${actualTmdbId}, type: ${type})`);
    return null;
  } catch (error) {
    console.error(`❌ 获取TMDB详情失败 (ID: ${actualTmdbId}, type: ${type}):`, error);
    return null;
  }
}

/**
 * 主协调函数（简化版）
 */
export async function orchestrateDataSources(
  userMessage: string,
  context?: VideoContext,
  config?: {
    enableWebSearch: boolean;
    tavilyApiKeys?: string | string[];
    siteName?: string;
  }
): Promise<OrchestrationResult> {
  // 1. 意图分析
  const intent = analyzeIntent(userMessage, context);
  console.log('📊 意图分析结果:', {
    type: intent.type,
    needWebSearch: intent.needWebSearch,
    confidence: intent.confidence,
    keywords: intent.keywords
  });

  // 2. 构建基础系统提示词
  const siteName = config?.siteName || 'LunaTV';
  let systemPrompt = `你是 ${siteName} 的 AI 影视助手，专门帮助用户发现和了解影视内容。

## 你的能力
- 提供影视推荐
- 回答影视相关问题（剧情、演员、评分等）
${config?.enableWebSearch && intent.needWebSearch ? '- 搜索最新影视资讯（已启用联网）' : ''}

## 回复要求
1. 语言风格：友好、专业、简洁
2. 推荐理由：说明为什么值得看，包括评分、类型、特色等
3. 格式清晰：使用分段、列表等让内容易读

`;

  // 3. 如果需要且启用了联网搜索，则获取实时数据
  let webSearchResults: TavilySearchResult | null = null;
  if (
    intent.needWebSearch &&
    config?.enableWebSearch &&
    config.tavilyApiKeys
  ) {
    console.log('🌐 开始联网搜索...');
    webSearchResults = await fetchTavilySearch(
      userMessage,
      config.tavilyApiKeys
    );

    if (webSearchResults && webSearchResults.results.length > 0) {
      const formattedSearch = formatTavilyResults(webSearchResults);
      systemPrompt += `\n## 【实时搜索结果】（最新信息）\n${formattedSearch}\n`;
      systemPrompt += `\n**注意**: 优先使用上面的搜索结果回答用户问题，这些是最新的实时信息。\n`;
      systemPrompt += `\n**重要**: 在你的回复开头，必须添加以下提示（使用Markdown格式）：\n`;
      systemPrompt += `> 🌐 **已联网搜索最新资讯**\n\n`;
      systemPrompt += `然后再开始正式回答问题。\n`;
      console.log(`✅ 联网搜索完成，获取到 ${webSearchResults.results.length} 条结果`);
    } else {
      console.log('⚠️ 联网搜索未返回结果');
    }
  }

  // 4. 添加视频上下文（如果有）+ 豆瓣详情数据增强
  if (context?.title) {
    // 🔥 如果有豆瓣ID，优先获取详细信息并自动修正类型
    if (context.douban_id) {
      console.log(`🎬 开始获取豆瓣详情 (ID: ${context.douban_id})...`);
      const doubanData = await fetchDoubanData(context.douban_id);

      if (doubanData) {
        // 🆕 智能判断影片类型：基于已提取的数据（集数/单集片长/电影时长）
        let detectedType: 'movie' | 'tv' | undefined;

        // 判断逻辑：有集数或单集片长 = 剧集，有电影时长 = 电影
        if ((doubanData.episodes && doubanData.episodes > 0) || doubanData.episode_length !== undefined) {
          detectedType = 'tv';
        } else if (doubanData.movie_duration !== undefined) {
          detectedType = 'movie';
        }

        // 使用检测到的类型自动修正前端传参错误
        if (detectedType && detectedType !== context.type) {
          console.log(`🔧 类型自动修正: ${context.type} → ${detectedType} (集数:${doubanData.episodes}, 单集片长:${doubanData.episode_length}, 电影时长:${doubanData.movie_duration})`);
          context.type = detectedType;
        } else if (detectedType) {
          console.log(`✅ 类型验证通过: ${context.type}`);
        }

        // 🆕 方案3: 增强系统提示词 - 明确标注类型
        systemPrompt += `\n## 【当前视频上下文】\n`;
        systemPrompt += `用户正在浏览: ${context.title}`;
        if (context.year) systemPrompt += ` (${context.year})`;

        // 明确标注影片类型，避免AI混淆
        if (context.type === 'movie') {
          systemPrompt += ` - **【电影】**\n`;
        } else if (context.type === 'tv') {
          systemPrompt += ` - **【电视剧/剧集】**\n`;
          if (context.currentEpisode) {
            systemPrompt += `当前观看第 ${context.currentEpisode} 集\n`;
          }
        }

        systemPrompt += `\n## 【豆瓣影片详情】（真实数据，优先参考）\n`;
        systemPrompt += `片名: ${doubanData.title}`;
        if (doubanData.year) systemPrompt += ` (${doubanData.year})`;
        systemPrompt += `\n`;

        // 再次强调类型
        systemPrompt += `影片类型: ${context.type === 'movie' ? '电影' : '电视剧/剧集'}\n`;

        if (doubanData.rate) {
          systemPrompt += `豆瓣评分: ${doubanData.rate}/10\n`;
        }

        if (doubanData.directors && doubanData.directors.length > 0) {
          systemPrompt += `导演: ${doubanData.directors.join('、')}\n`;
        }

        if (doubanData.cast && doubanData.cast.length > 0) {
          const mainCast = doubanData.cast.slice(0, 5).join('、');
          systemPrompt += `主演: ${mainCast}\n`;
        }

        if (doubanData.genres && doubanData.genres.length > 0) {
          systemPrompt += `类型: ${doubanData.genres.join('、')}\n`;
        }

        if (doubanData.countries && doubanData.countries.length > 0) {
          systemPrompt += `制片地区: ${doubanData.countries.join('、')}\n`;
        }

        if (doubanData.plot_summary) {
          // 限制简介长度，避免token过多
          const summary = doubanData.plot_summary.length > 300
            ? doubanData.plot_summary.substring(0, 300) + '...'
            : doubanData.plot_summary;
          systemPrompt += `剧情简介: ${summary}\n`;
        }

        if (doubanData.episodes) {
          systemPrompt += `总集数: ${doubanData.episodes}集\n`;
        }

        systemPrompt += `\n**关键要求**: \n`;
        systemPrompt += `1. 以上豆瓣数据是真实的，必须优先使用这些信息\n`;
        systemPrompt += `2. 如果豆瓣评分存在（${doubanData.rate ? doubanData.rate + '/10' : '暂无'}），回答时必须引用真实评分，不要说"系列前两作"或类似推测\n`;
        systemPrompt += `3. 导演、演员、类型等信息都必须使用上述真实数据，不要凭记忆修改\n`;
        systemPrompt += `4. 如果某项数据不存在（如暂无评分），可以说"暂无评分"，但不要编造或推测\n`;

        // 🆕 针对电影的特殊强调
        if (context.type === 'movie') {
          systemPrompt += `5. **重要**: 这是一部【电影】，不是电视剧或剧集。回答时绝对不要提及"第X集"、"剧集"、"连续剧"等词汇\n`;
          systemPrompt += `6. 如果用户询问剧情，请回答电影的完整剧情，而不是某一集的内容\n`;
        }

        console.log(`✅ 豆瓣详情已注入AI上下文 (类型: ${context.type})`);
      } else {
        console.log(`⚠️ 豆瓣详情获取失败，继续使用基础上下文`);

        // 即使豆瓣数据获取失败，也要添加基础上下文
        systemPrompt += `\n## 【当前视频上下文】\n`;
        systemPrompt += `用户正在浏览: ${context.title}`;
        if (context.year) systemPrompt += ` (${context.year})`;
        if (context.type === 'movie') {
          systemPrompt += ` - **【电影】**\n`;
        } else if (context.type === 'tv') {
          systemPrompt += ` - **【电视剧/剧集】**\n`;
          if (context.currentEpisode) {
            systemPrompt += `，当前第 ${context.currentEpisode} 集`;
          }
        }
        systemPrompt += '\n';
      }
    } else {
      // 没有豆瓣ID时的基础上下文
      systemPrompt += `\n## 【当前视频上下文】\n`;
      systemPrompt += `用户正在浏览: ${context.title}`;
      if (context.year) systemPrompt += ` (${context.year})`;
      if (context.type === 'movie') {
        systemPrompt += ` - **【电影】**\n`;
      } else if (context.type === 'tv') {
        systemPrompt += ` - **【电视剧/剧集】**\n`;
        if (context.currentEpisode) {
          systemPrompt += `，当前第 ${context.currentEpisode} 集`;
        }
      }
      systemPrompt += '\n';
    }

    // 🔥 如果有video context且有type，尝试获取TMDB数据
    // 优先使用tmdb_id，如果没有则通过标题搜索
    if (context.title && context.type) {
      console.log(`🎬 开始获取TMDB详情 (title: ${context.title}, type: ${context.type})...`);
      const tmdbData = await fetchTMDBData(
        context.tmdb_id,
        context.type,
        context.title,
        context.year
      );

      if (tmdbData) {
        systemPrompt += `\n## 【TMDB数据】（国际化数据和相似推荐）\n`;

        // Keywords - 帮助AI理解影片主题
        if (tmdbData.keywords && tmdbData.keywords.length > 0) {
          const keywordNames = tmdbData.keywords.map((k: any) => k.name).join(', ');
          systemPrompt += `关键词标签: ${keywordNames}\n`;
        }

        // Similar movies/shows - 真实相似推荐
        if (tmdbData.similar && tmdbData.similar.length > 0) {
          systemPrompt += `\n相似${context.type === 'movie' ? '影片' : '剧集'}推荐（基于TMDB算法）:\n`;
          tmdbData.similar.forEach((item: any, index: number) => {
            const title = item.title || item.name;
            const date = item.release_date || item.first_air_date || '';
            const year = date ? new Date(date).getFullYear() : '';
            const rating = item.vote_average ? item.vote_average.toFixed(1) : '';

            systemPrompt += `${index + 1}. ${title}`;
            if (year) systemPrompt += ` (${year})`;
            if (rating) systemPrompt += ` - 评分: ${rating}/10`;
            systemPrompt += `\n`;
          });
        }

        systemPrompt += `\n**关键要求**: \n`;
        systemPrompt += `1. 如果用户询问"相似推荐"或"类似的片子"，必须优先使用上述TMDB推荐列表\n`;
        systemPrompt += `2. 推荐时必须说明是"基于TMDB算法的推荐"，不要说"我推荐"或凭记忆推荐\n`;
        systemPrompt += `3. 如果TMDB相似列表为空，可以说"暂无TMDB相似推荐数据"，不要编造\n`;

        console.log(`✅ TMDB详情已注入AI上下文 (keywords: ${tmdbData.keywords?.length || 0}, similar: ${tmdbData.similar?.length || 0})`);
      } else {
        console.log(`⚠️ TMDB详情获取失败，继续使用基础上下文`);
      }
    }
  }

  console.log('📝 生成的系统提示词长度:', systemPrompt.length);

  return {
    systemPrompt,
    webSearchResults: webSearchResults || undefined,
    intent,
  };
}
