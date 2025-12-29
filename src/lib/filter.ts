// 新建文件：lib/filter.ts
// 统一管理敏感词过滤逻辑，所有搜索接口都引用此文件

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
 * 统一敏感内容过滤函数
 * 同时屏蔽：
 *   1. 成人分类（yellowWords）
 *   2. 赌博/博彩等违禁关键词（blockedWords，检查 title 和 type_name）
 */
export function filterSensitiveContent(
  results: any[],
  shouldFilter: boolean
): any[] {
  if (!shouldFilter) return results;

  return results.filter((result) => {
    const typeName = (result.type_name || '').toLowerCase();
    const title = (result.title || '').toLowerCase();

    // 屏蔽成人分类
    if (yellowWords.some((word) => typeName.includes(word.toLowerCase()))) {
      return false;
    }

    // 屏蔽赌博等违禁关键词（标题或分类中出现即屏蔽）
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