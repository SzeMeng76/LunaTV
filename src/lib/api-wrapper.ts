/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * API 路由包装器 - 用于性能监控
 * 只在 Node.js Runtime 中使用
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordRequest } from './performance-monitor';

/**
 * 包装 API 路由处理函数，自动记录性能数据
 * 注意：只能在 runtime = 'nodejs' 的 API 路由中使用
 */
export function withPerformanceMonitoring(
  handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: any[]): Promise<NextResponse> => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    let statusCode = 200;

    try {
      const response = await handler(request, ...args);
      statusCode = response.status;

      // 记录成功的请求
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      recordRequest({
        timestamp: startTime,
        method: request.method,
        path: new URL(request.url).pathname,
        statusCode,
        duration: endTime - startTime,
        memoryUsed: (endMemory - startMemory) / 1024 / 1024, // MB
        dbQueries: 0,
        requestSize: 0,
        responseSize: 0,
      });

      return response;
    } catch (error) {
      statusCode = 500;

      // 记录失败的请求
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      recordRequest({
        timestamp: startTime,
        method: request.method,
        path: new URL(request.url).pathname,
        statusCode,
        duration: endTime - startTime,
        memoryUsed: (endMemory - startMemory) / 1024 / 1024,
        dbQueries: 0,
        requestSize: 0,
        responseSize: 0,
      });

      throw error;
    }
  };
}
