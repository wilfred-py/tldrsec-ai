/**
 * Secure Prisma Database Client
 * 
 * Enterprise-grade database security wrapper that prevents SQL injection,
 * validates all queries, and provides comprehensive audit logging.
 * 
 * SECURITY CONTROLS:
 * - SQL injection prevention through parameterized queries only
 * - Input validation and sanitization for all parameters
 * - Query pattern analysis and malicious pattern detection
 * - Comprehensive audit logging for all database operations
 * - Rate limiting and query complexity analysis
 * - Connection security and timeout management
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { SecurePrismaClient, SecureQueryBuilder } from '../validation/database/secure-queries';
import { ValidationSchemas } from '../validation/schemas';
import { sanitizeString as _sanitizeString } from '../validation/sanitizers';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

/**
 * Database Security Configuration
 */
export const DB_SECURITY_CONFIG = {
  enableQueryLogging: true,
  enablePerformanceMonitoring: true,
  maxQueryTimeout: 30000, // 30 seconds
  maxBatchSize: 1000,
  enableSlowQueryLogging: true,
  slowQueryThreshold: 5000, // 5 seconds
  enableConnectionPoolMonitoring: true
} as const;

/**
 * Secure Database Logger
 */
const dbLogger = logger.child('secure-database');

/**
 * Query Performance Monitor
 */
class QueryPerformanceMonitor {
  private static queryStats = new Map<string, {
    count: number;
    totalTime: number;
    maxTime: number;
    minTime: number;
    errors: number;
  }>();
  
  static recordQuery(operation: string, model: string, duration: number, success: boolean): void {
    const key = `${operation}:${model}`;
    const stats = this.queryStats.get(key) || {
      count: 0,
      totalTime: 0,
      maxTime: 0,
      minTime: Infinity,
      errors: 0
    };
    
    stats.count++;
    stats.totalTime += duration;
    stats.maxTime = Math.max(stats.maxTime, duration);
    stats.minTime = Math.min(stats.minTime, duration);
    
    if (!success) {
      stats.errors++;
    }
    
    this.queryStats.set(key, stats);
    
    // Log slow queries
    if (duration > DB_SECURITY_CONFIG.slowQueryThreshold) {
      dbLogger.warn('Slow query detected', {
        operation,
        model,
        duration,
        key
      });
    }
    
    // Record metrics
    monitoring.recordTiming(`db.query.${operation}.${model}`, duration);
    monitoring.incrementCounter('db.queries.total', 1, {
      operation,
      model,
      success: success.toString()
    });
  }
  
  static getStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};
    
    for (const [key, data] of this.queryStats.entries()) {
      stats[key] = {
        ...data,
        avgTime: data.count > 0 ? data.totalTime / data.count : 0,
        errorRate: data.count > 0 ? data.errors / data.count : 0,
        minTime: data.minTime === Infinity ? 0 : data.minTime
      };
    }
    
    return stats;
  }
  
  static resetStats(): void {
    this.queryStats.clear();
  }
}

/**
 * Database Connection Security Manager
 */
class DatabaseSecurityManager {
  private static connectionPool: PrismaClient | null = null;
  private static isConnected = false;
  private static connectionAttempts = 0;
  private static readonly maxConnectionAttempts = 5;
  
  static async getSecureConnection(): Promise<SecurePrismaClient> {
    if (!this.connectionPool) {
      await this.createSecureConnection();
    }
    
    if (!this.connectionPool) {
      throw new Error('Failed to establish secure database connection');
    }
    
    return new SecurePrismaClient(this.connectionPool, DB_SECURITY_CONFIG.enableQueryLogging);
  }
  
  private static async createSecureConnection(): Promise<void> {
    try {
      this.connectionAttempts++;
      
      if (this.connectionAttempts > this.maxConnectionAttempts) {
        throw new Error(`Exceeded maximum connection attempts (${this.maxConnectionAttempts})`);
      }
      
      dbLogger.info('Creating secure database connection', {
        attempt: this.connectionAttempts,
        config: {
          enableQueryLogging: DB_SECURITY_CONFIG.enableQueryLogging,
          maxQueryTimeout: DB_SECURITY_CONFIG.maxQueryTimeout
        }
      });
      
      // Create Prisma client with security configurations
      this.connectionPool = new PrismaClient({
        log: [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' }
        ],
        errorFormat: 'minimal', // Reduce information leakage
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        }
      });
      
      // Set up event listeners for security monitoring
      this.connectionPool.$on('query', (e) => {
        if (DB_SECURITY_CONFIG.enableQueryLogging) {
          dbLogger.debug('Database query executed', {
            query: e.query,
            params: e.params,
            duration: e.duration,
            timestamp: e.timestamp
          });
        }
        
        // Monitor for suspicious queries
        const suspiciousPatterns = [
          /drop\s+table/i,
          /delete\s+from.*where\s+1\s*=\s*1/i,
          /truncate\s+table/i,
          /alter\s+table/i,
          /create\s+table/i
        ];
        
        if (suspiciousPatterns.some(pattern => pattern.test(e.query))) {
          dbLogger.error('Suspicious database query detected', {
            query: e.query,
            params: e.params,
            timestamp: e.timestamp
          });
          
          monitoring.incrementCounter('db.security.suspicious_query', 1, {
            type: 'dangerous_operation'
          });
        }
      });
      
      this.connectionPool.$on('error', (e) => {
        dbLogger.error('Database error occurred', {
          error: e.message,
          timestamp: e.timestamp
        });
        
        monitoring.incrementCounter('db.errors.total', 1);
      });
      
      this.connectionPool.$on('warn', (e) => {
        dbLogger.warn('Database warning', {
          message: e.message,
          timestamp: e.timestamp
        });
      });
      
      // Test connection
      await this.connectionPool.$connect();
      
      // Verify connection with a safe query
      await this.connectionPool.$queryRaw`SELECT 1 as test`;
      
      this.isConnected = true;
      this.connectionAttempts = 0; // Reset on successful connection
      
      dbLogger.info('Secure database connection established successfully');
      
      monitoring.incrementCounter('db.connections.successful', 1);
      
    } catch (error) {
      dbLogger.error('Failed to create secure database connection', {
        error: error instanceof Error ? error.message : String(error),
        attempt: this.connectionAttempts
      });
      
      monitoring.incrementCounter('db.connections.failed', 1);
      
      if (this.connectionAttempts >= this.maxConnectionAttempts) {
        monitoring.incrementCounter('db.connections.max_attempts_exceeded', 1);
      }
      
      throw error;
    }
  }
  
  static async disconnect(): Promise<void> {
    if (this.connectionPool) {
      await this.connectionPool.$disconnect();
      this.connectionPool = null;
      this.isConnected = false;
      
      dbLogger.info('Database connection closed');
      monitoring.incrementCounter('db.connections.closed', 1);
    }
  }
  
  static getConnectionStatus(): {
    isConnected: boolean;
    connectionAttempts: number;
    stats: Record<string, unknown>;
  } {
    return {
      isConnected: this.isConnected,
      connectionAttempts: this.connectionAttempts,
      stats: QueryPerformanceMonitor.getStats()
    };
  }
}

/**
 * Secure Database Operations Class
 */
export class SecureDatabase {
  private static instance: SecureDatabase | null = null;
  private securePrisma: SecurePrismaClient | null = null;
  private queryBuilder: SecureQueryBuilder | null = null;
  
  private constructor() {}
  
  static async getInstance(): Promise<SecureDatabase> {
    if (!this.instance) {
      this.instance = new SecureDatabase();
      await this.instance.initialize();
    }
    
    return this.instance;
  }
  
  private async initialize(): Promise<void> {
    try {
      this.securePrisma = await DatabaseSecurityManager.getSecureConnection();
      this.queryBuilder = new SecureQueryBuilder(this.securePrisma);
      
      dbLogger.info('SecureDatabase instance initialized');
    } catch (error) {
      dbLogger.error('Failed to initialize SecureDatabase', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get secure Prisma client instance
   */
  getPrisma(): SecurePrismaClient {
    if (!this.securePrisma) {
      throw new Error('SecureDatabase not initialized. Call getInstance() first.');
    }
    return this.securePrisma;
  }
  
  /**
   * Get secure query builder instance
   */
  getQueryBuilder(): SecureQueryBuilder {
    if (!this.queryBuilder) {
      throw new Error('SecureDatabase not initialized. Call getInstance() first.');
    }
    return this.queryBuilder;
  }
  
  /**
   * Secure user operations
   */
  async getUser(userId: string) {
    const startTime = Date.now();
    try {
      const result = await this.getQueryBuilder().getUserById(userId);
      QueryPerformanceMonitor.recordQuery('getUserById', 'user', Date.now() - startTime, true);
      return result;
    } catch (error) {
      QueryPerformanceMonitor.recordQuery('getUserById', 'user', Date.now() - startTime, false);
      throw error;
    }
  }
  
  /**
   * Secure ticker operations
   */
  async getTicker(symbol: string) {
    const startTime = Date.now();
    try {
      const result = await this.getQueryBuilder().getTickerBySymbol(symbol);
      QueryPerformanceMonitor.recordQuery('getTickerBySymbol', 'ticker', Date.now() - startTime, true);
      return result;
    } catch (error) {
      QueryPerformanceMonitor.recordQuery('getTickerBySymbol', 'ticker', Date.now() - startTime, false);
      throw error;
    }
  }
  
  /**
   * Secure summary operations with advanced filtering
   */
  async getSummaries(filters: {
    userId?: string;
    ticker?: string;
    filingType?: string;
    limit?: number;
    offset?: number;
    dateFrom?: Date;
    dateTo?: Date;
  }) {
    const startTime = Date.now();
    try {
      // Validate date range if provided
      if (filters.dateFrom && filters.dateTo) {
        if (filters.dateFrom > filters.dateTo) {
          throw new Error('Invalid date range: dateFrom must be before dateTo');
        }
        
        // Prevent queries for extremely large date ranges
        const daysDiff = (filters.dateTo.getTime() - filters.dateFrom.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 365) {
          throw new Error('Date range cannot exceed 365 days');
        }
      }
      
      const result = await this.getQueryBuilder().getSummaries(filters);
      QueryPerformanceMonitor.recordQuery('getSummaries', 'summary', Date.now() - startTime, true);
      return result;
    } catch (error) {
      QueryPerformanceMonitor.recordQuery('getSummaries', 'summary', Date.now() - startTime, false);
      throw error;
    }
  }
  
  /**
   * Secure job queue operations
   */
  async getJobsToProcess(limit: number = 10, jobTypes?: string[]) {
    const startTime = Date.now();
    try {
      const result = await this.getQueryBuilder().getJobsToProcess(limit, jobTypes);
      QueryPerformanceMonitor.recordQuery('getJobsToProcess', 'jobQueue', Date.now() - startTime, true);
      return result;
    } catch (error) {
      QueryPerformanceMonitor.recordQuery('getJobsToProcess', 'jobQueue', Date.now() - startTime, false);
      throw error;
    }
  }
  
  /**
   * Secure filing search with advanced validation
   */
  async searchFilings(query: {
    ticker?: string;
    formType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    searchText?: string;
  }) {
    const startTime = Date.now();
    try {
      // Validate search text if provided
      if (query.searchText) {
        const validatedSearchText = ValidationSchemas.searchQuery.parse(query.searchText);
        query.searchText = validatedSearchText;
      }
      
      const result = await this.getQueryBuilder().searchFilings(query);
      QueryPerformanceMonitor.recordQuery('searchFilings', 'secFiling', Date.now() - startTime, true);
      return result;
    } catch (error) {
      QueryPerformanceMonitor.recordQuery('searchFilings', 'secFiling', Date.now() - startTime, false);
      throw error;
    }
  }
  
  /**
   * Secure batch operations with transaction safety
   */
  async performSecureTransaction<T>(
    operations: (tx: SecurePrismaClient) => Promise<T>,
    options?: {
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<T> {
    const startTime = Date.now();
    try {
      // Validate timeout
      const timeout = options?.timeout || 30000;
      if (timeout < 1000 || timeout > 300000) {
        throw new Error('Transaction timeout must be between 1 and 300 seconds');
      }
      
      const result = await this.getPrisma().transaction(operations, {
        timeout,
        isolationLevel: options?.isolationLevel
      });
      
      QueryPerformanceMonitor.recordQuery('transaction', 'multiple', Date.now() - startTime, true);
      return result;
    } catch (error) {
      QueryPerformanceMonitor.recordQuery('transaction', 'multiple', Date.now() - startTime, false);
      throw error;
    }
  }
  
  /**
   * Get database health and performance statistics
   */
  getHealthStats(): {
    connection: Record<string, unknown>;
    performance: Record<string, unknown>;
    security: {
      queryLoggingEnabled: boolean;
      performanceMonitoringEnabled: boolean;
      maxQueryTimeout: number;
    };
  } {
    return {
      connection: DatabaseSecurityManager.getConnectionStatus(),
      performance: QueryPerformanceMonitor.getStats(),
      security: {
        queryLoggingEnabled: DB_SECURITY_CONFIG.enableQueryLogging,
        performanceMonitoringEnabled: DB_SECURITY_CONFIG.enablePerformanceMonitoring,
        maxQueryTimeout: DB_SECURITY_CONFIG.maxQueryTimeout
      }
    };
  }
  
  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    if (this.securePrisma) {
      await this.securePrisma.disconnect();
      this.securePrisma = null;
      this.queryBuilder = null;
    }
    
    await DatabaseSecurityManager.disconnect();
    SecureDatabase.instance = null;
    
    dbLogger.info('SecureDatabase disconnected');
  }
}

/**
 * Global secure database instance
 */
let globalSecureDb: SecureDatabase | null = null;

/**
 * Get or create the global secure database instance
 */
export async function getSecureDatabase(): Promise<SecureDatabase> {
  if (!globalSecureDb) {
    globalSecureDb = await SecureDatabase.getInstance();
  }
  return globalSecureDb;
}

/**
 * Convenience function to get secure Prisma client
 */
export async function getSecurePrisma(): Promise<SecurePrismaClient> {
  const db = await getSecureDatabase();
  return db.getPrisma();
}

/**
 * Convenience function to get secure query builder
 */
export async function getSecureQueryBuilder(): Promise<SecureQueryBuilder> {
  const db = await getSecureDatabase();
  return db.getQueryBuilder();
}

/**
 * Clean shutdown function
 */
export async function cleanupDatabase(): Promise<void> {
  if (globalSecureDb) {
    await globalSecureDb.disconnect();
    globalSecureDb = null;
  }
}

// Export types and classes
export { SecurePrismaClient, SecureQueryBuilder, QueryPerformanceMonitor };