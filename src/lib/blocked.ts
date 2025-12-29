// src/lib/filter.ts
import { yellowWords } from './yellow';

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
  // 赌博相关
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
  // 可继续添加
] as const;

/**
 * 统一敏感内容过滤函数
 * @param results 搜索结果数组
 * @param shouldFilterYellow 是否启用黄色过滤（受配置控制）
 * @param apiSites 当前用户可用站点列表（用于判断整站成人源）
 */
export function filterSensitiveContent(
  results: any[],
  shouldFilterYellow: boolean,
  apiSites: any[] = []
): any[] {
  // 如果完全关闭黄色过滤，但仍需屏蔽赌博等硬性违禁词
  return results.filter((result) => {
    const typeName = (result.type_name || '').toLowerCase();
    const title = (result.title || '').toLowerCase();
    const sourceKey = result.source_key || result.source || '';

    // 1. 整站标记为成人源的，直接屏蔽（最高优先级）
    const source = apiSites.find((s: any) => s.key === sourceKey);
    if (source?.is_adult) {
      return false;
    }

    // 2. 黄色分类过滤（可被配置关闭）
    if (
      shouldFilterYellow &&
      yellowWords.some((word: string) => typeName.includes(word.toLowerCase()))
    ) {
      return false;
    }

    // 3. 违禁关键词过滤（标题或分类，永久生效）
    if (
      blockedWords.some(
        (word) => title.includes(word.toLowerCase()) || typeName.includes(word.toLowerCase())
      )
    ) {
      return false;
    }

    return true;
  });
}