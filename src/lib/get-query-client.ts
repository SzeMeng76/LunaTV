import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from '@tanstack/react-query';

/**
 * 创建 QueryClient 实例
 * 配置默认选项：
 * - staleTime: 5分钟 - 数据在5分钟内被认为是新鲜的，不会重新请求
 * - gcTime: 10分钟 - 未使用的数据在10分钟后被垃圾回收
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 数据新鲜时间：5分钟内不会重新请求
        staleTime: 5 * 60 * 1000,
        // 垃圾回收时间：10分钟后清理未使用的缓存
        gcTime: 10 * 60 * 1000,
      },
      dehydrate: {
        // 在服务端渲染时，包含 pending 状态的查询
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

/**
 * 获取 QueryClient 实例
 * - 服务端：每次都创建新实例
 * - 浏览器端：复用单例实例（重要！避免 React Suspense 时重复创建）
 */
export function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}
