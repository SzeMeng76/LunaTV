/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { DoubanItem, DoubanResult } from './types';
import { fetchDoubanData } from './douban';

interface DoubanCategoryApiResponse {
  total: number;
  items: Array<{
    id: string;
    title: string;
    card_subtitle: string;
    pic: {
      large: string;
      normal: string;
    };
    rating: {
      value: number;
    };
  }>;
}

export async function getDoubanCategories(params: {
  kind: string;
  category: string;
  type: string;
  pageLimit?: number;
  pageStart?: number;
}): Promise<DoubanResult> {
  const { kind, category, type, pageLimit = 20, pageStart = 0 } = params;

  try {
    const url = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/${kind}?start=${pageStart}&limit=${pageLimit}&category=${category}&type=${type}`;

    const data = await fetchDoubanData<DoubanCategoryApiResponse>(url);

    const items: DoubanItem[] = data.items.map((item) => ({
      id: item.id,
      title: item.title,
      poster: item.pic?.normal || item.pic?.large || '',
      rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
    }));

    return {
      code: 200,
      message: 'success',
      list: items,
    };
  } catch (error) {
    console.error('获取豆瓣分类数据失败:', error);
    return {
      code: 500,
      message: 'error',
      list: [],
    };
  }
}
