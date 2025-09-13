/**
 * Redis configuration and connection types
 * Provides type safety for Redis client configuration and operations
 */

// Redis configuration interface for type safety
export interface RedisConfig {
  url: string;
  maxRetriesPerRequest: number;
  retryDelayOnFailover: number;
  connectTimeout: number;
  // Additional connection options
  lazyConnect?: boolean;
  keepAlive?: number;
  commandTimeout?: number;
  db?: number;
  password?: string;
  family?: 4 | 6;
  enableReadyCheck?: boolean;
  maxLoadingTimeout?: number;
}

// Redis connection status
export enum RedisConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  READY = 'READY',
  ERROR = 'ERROR',
  RECONNECTING = 'RECONNECTING'
}

// Redis operation result interface
export interface RedisOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTimeMs: number;
  connectionStatus: RedisConnectionStatus;
}

// Redis rate limiting data structure
export interface RedisRateLimitData {
  count: number;
  windowStart: number;
  windowEnd: number;
  resetTime: number;
  remaining: number;
}

// Redis cluster configuration (for future scaling)
export interface RedisClusterConfig extends Omit<RedisConfig, 'url'> {
  nodes: Array<{
    host: string;
    port: number;
  }>;
  enableOfflineQueue?: boolean;
  redisOptions?: Partial<RedisConfig>;
  scaleReads?: 'master' | 'slave' | 'all';
}

// Redis monitoring metrics
export interface RedisMetrics {
  totalConnections: number;
  activeConnections: number;
  totalCommands: number;
  errorCount: number;
  avgResponseTimeMs: number;
  memoryUsageMB: number;
  hitRate: number;
  missRate: number;
}