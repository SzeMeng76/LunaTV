// src/lib/blocked.ts
// 搜索结果黑名单关键词列表（可自行在配置或此处扩展）
export const blockedWords: string[] = [
  '赌博',
  '博彩',
  '赌场',
  '棋牌',
  '彩票',
  '成人',
  'AV',
  '伦理',
  '伦理片',
  '福利',
  '约炮',
  '援交',
  '小姐',
  '陪睡',
  // 根据需要继续添加...
].map(word => word.toLowerCase());