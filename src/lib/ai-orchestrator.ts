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
    '新番', '新剧', '新片', '刚出', '刚上映'
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
  const needWebSearch =
    hasTimeKeyword ||
    hasPersonKeyword ||
    hasNewsKeyword ||
    (hasRecommendKeyword && (hasTimeKeyword || message.includes('热门')));

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

  // 4. 添加视频上下文（如果有）
  if (context?.title) {
    systemPrompt += `\n## 【当前视频上下文】\n`;
    systemPrompt += `用户正在浏览: ${context.title}`;
    if (context.year) systemPrompt += ` (${context.year})`;
    if (context.currentEpisode) {
      systemPrompt += `，当前第 ${context.currentEpisode} 集`;
    }
    systemPrompt += '\n';
  }

  console.log('📝 生成的系统提示词长度:', systemPrompt.length);

  return {
    systemPrompt,
    webSearchResults: webSearchResults || undefined,
    intent,
  };
}
