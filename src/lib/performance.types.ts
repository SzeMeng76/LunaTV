/**
 * 性能监控数据类型定义
 */

// 单次请求的性能数据
export interface RequestMetrics {
  timestamp: number;           // 请求时间戳
  method: string;              // HTTP 方法
  path: string;                // 请求路径
  statusCode: number;          // 响应状态码
  duration: number;            // 请求耗时（毫秒）
  memoryUsed: number;          // 内存使用（MB）
  dbQueries: number;           // 数据库查询次数
  requestSize: number;         // 请求大小（字节）
  responseSize: number;        // 响应大小（字节）
  filter?: string;             // 过滤条件（如用户名、资源ID等）
}

// 每小时聚合的性能数据
export interface HourlyMetrics {
  hour: string;                // 小时标识（ISO 8601 格式，精确到小时）
  totalRequests: number;       // 总请求数
  successRequests: number;     // 成功请求数（2xx）
  errorRequests: number;       // 错误请求数（4xx, 5xx）
  avgDuration: number;         // 平均响应时间（毫秒）
  maxDuration: number;         // 最大响应时间（毫秒）
  avgMemory: number;           // 平均内存使用（MB）
  maxMemory: number;           // 最大内存使用（MB）
  totalDbQueries: number;      // 总数据库查询次数
  totalTraffic: number;        // 总流量（字节）
  topPaths: {                  // 最常访问的路径
    path: string;
    count: number;
  }[];
  slowestPaths: {              // 最慢的路径
    path: string;
    avgDuration: number;
  }[];
}

// 系统资源使用情况
export interface SystemMetrics {
  timestamp: number;
  cpuUsage: number;            // CPU 使用率（百分比）
  cpuCores: number;            // CPU 核心数
  cpuModel: string;            // CPU 型号名称
  memoryUsage: {
    heapUsed: number;          // 堆内存使用（MB）
    heapTotal: number;         // 堆内存总量（MB）
    rss: number;               // 常驻内存（MB）
    external: number;          // C++ 对象内存（MB）
    systemTotal: number;       // 系统总内存（MB）
    systemUsed: number;        // 系统已用内存（MB）
    systemFree: number;        // 系统可用内存（MB）
  };
  eventLoopDelay: number;      // 事件循环延迟（毫秒）
}

// 数据库查询统计
export interface DbQueryStats {
  timestamp: number;
  operation: string;           // 操作类型（get, set, delete 等）
  duration: number;            // 查询耗时（毫秒）
  success: boolean;            // 是否成功
}

// 性能监控配置
export interface PerformanceConfig {
  enabled: boolean;            // 是否启用性能监控
  sampleRate: number;          // 采样率（0-1，1 表示 100%）
  retentionHours: number;      // 数据保留时长（小时）
  aggregationInterval: number; // 聚合间隔（毫秒）
}
