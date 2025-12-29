// ... 其他导入不变
import { blockedWords } from '@/lib/blocked';  // 新增导入

// 在过滤部分修改：
let filteredResults = results;
if (!config.SiteConfig.DisableYellowFilter) {
  filteredResults = results.filter((result) => {
    const typeName = (result.type_name || '').toLowerCase();
    const title = (result.title || '').toLowerCase();

    if (yellowWords.some((word) => typeName.includes(word))) {
      return false;
    }
    if (blockedWords.some((word) => title.includes(word) || typeName.includes(word))) {
      return false;
    }
    return true;
  });
} else {
  // 即使关闭黄色过滤，也要屏蔽黑名单
  filteredResults = results.filter((result) => {
    const typeName = (result.type_name || '').toLowerCase();
    const title = (result.title || '').toLowerCase();
    return !blockedWords.some((word) => title.includes(word) || typeName.includes(word));
  });
}