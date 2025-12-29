// src/lib/blocked.ts
import { yellowWords } from './yellow';

/**
 * 违禁关键词列表（赌博 + 成人隐晦词 + 特定标题例外放行）
 * 注意：所有匹配均不区分大小写
 */
export const blockedWords = [
  '伦理片',
  '福利',
  '里番动漫',
  '门事件',
  '萝莉少女',
  '制服诱惑',
  '国产传媒',
  'cosplay',
  '黑丝诱惑',
  '无码',
  '日本无码',
  '有码',
  '日本有码',
  'SWAG',
  '网红主播',
  '色情片',
  '同性片',
  '福利视频',
  '福利片',
  '写真热舞',
  '倫理片',
  '理论片',
  '韩国伦理',
  '港台三级',
  '三级',  
  '三级片',   
  '电影解说',
  '伦理',
  '日本伦理',
  // 新加入 
  '赌博',
  '博彩',
  '赌场',
  '彩票',
  '棋牌',
  '老虎机',
  '百家乐',
  '真人视讯',
  '菠菜',
  '六合彩',
  '时时彩',
  '捕鱼',
  '斗地主',
  '德州扑克',
  'AG',
  'DG',
  'BG',
  'MG',
  'PT',
  'BBIN',
  '沙巴',
  '开元',
  '皇冠',
  '罪恶之渊',  
  // 可继续添加更多隐晦代称
] as const;

/**
 * 白名单：即使包含 blockedWords 中的词，也强制放行的精确标题
 * 用于处理像《罪恶之渊》这种被误杀的正常作品
 */
export const titleWhitelist = [
  '罪恶之渊',        // 2025年正常动画新番
  // 如有其他误杀作品，继续在这里添加完整标题
] as const;

/**
 * 统一敏感内容过滤函数
 * @param results 原始搜索结果数组
 * @param disableYellowFilter 是否禁用黄色过滤（来自配置）
 * @param apiSites 当前用户可用站点配置（用于判断整站成人源）
 * @returns 过滤后的结果数组
 */
export function filterSensitiveContent(
  results: any[],
  disableYellowFilter: boolean = false,
  apiSites: any[] = []
): any[] {
  return results.filter((item) => {
    // 统一转小写处理
    const title = (item.title || item.name || item.vod_name || '').toString().toLowerCase();
    const typeName = (
      item.type_name ||
      item.typeName ||
      item.category ||
      item.class ||
      item.tag ||
      ''
    ).toString().toLowerCase();

    const sourceKey = item.source_key || item.source || item.resourceId || '';
    const source = apiSites.find((s: any) => s.key === sourceKey);

    // 1. 整站标记为成人源的，直接屏蔽
    if (source?.is_adult) {
      return false;
    }

    // 2. 黄色分类过滤（可通过配置关闭）
    if (
      !disableYellowFilter &&
      yellowWords.some((word) => typeName.includes(word.toLowerCase()))
    ) {
      return false;
    }

    // 3. 白名单检查：如果标题精确匹配白名单，则直接放行
    if (titleWhitelist.some((allowed) => title === allowed.toLowerCase())) {
      return true;
    }

    // 4. 违禁关键词过滤（标题或分类）
    if (
      blockedWords.some(
        (word) => title.includes(word.toLowerCase()) || typeName.includes(word.toLowerCase())
      )
    ) {
      return false;
    }

    // 通过所有检查
    return true;
  });
}