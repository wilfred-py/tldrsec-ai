/**
 * Secure Database Query Layer
 * 
 * Provides SQL injection protection and parameterized query enforcement
 * for all database operations using Prisma ORM.
 * 
 * SECURITY CONTROLS:
 * - Parameterized query validation
 * - Input sanitization before database operations
 * - Query pattern analysis
 * - Transaction safety
 * - Query logging and monitoring
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { sanitizeQueryParam, detectMaliciousPatterns } from '../sanitizers';
import { ValidationSchemas } from '../schemas';
import { z } from 'zod';

/**
 * Secure Prisma Client Wrapper
 */
export class SecurePrismaClient {
  private prisma: PrismaClient;
  private enableQueryLogging: boolean;
  
  constructor(prisma: PrismaClient, enableQueryLogging: boolean = true) {
    this.prisma = prisma;
    this.enableQueryLogging = enableQueryLogging;
  }
  
  /**
   * Validate and sanitize query parameters
   */
  private validateQueryParams(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(params)) {
      try {
        // Validate key name
        const sanitizedKey = ValidationSchemas.secureString.parse(key);
        
        // Sanitize value
        sanitized[sanitizedKey] = sanitizeQueryParam(value);
      } catch (error) {
        throw new Error(`Invalid query parameter '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return sanitized;
  }
  
  /**
   * Log query for security monitoring
   */
  private logQuery(operation: string, model: string, params: unknown): void {
    if (!this.enableQueryLogging) return;
    
    console.log('SECURE_QUERY:', {
      timestamp: new Date().toISOString(),
      operation,
      model,
      params: JSON.stringify(params),
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n')
    });
  }
  
  /**
   * Secure findMany operation
   */
  async findMany<T extends keyof PrismaClient>(
    model: T,
    args?: Prisma.Args<PrismaClient[T], 'findMany'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'findMany'>> {
    this.logQuery('findMany', model as string, args);
    
    if (args) {
      // Validate where clause
      if (args.where) {
        this.validateQueryParams(args.where as Record<string, unknown>);
      }
      
      // Validate orderBy
      if (args.orderBy) {
        this.validateOrderBy(args.orderBy);
      }
      
      // Validate take/skip
      if (args.take && (args.take < 0 || args.take > 1000)) {
        throw new Error('Invalid take parameter: must be between 0 and 1000');
      }
      
      if (args.skip && args.skip < 0) {
        throw new Error('Invalid skip parameter: must be non-negative');
      }
    }
    
    return (this.prisma[model] as any).findMany(args);
  }
  
  /**
   * Secure findUnique operation
   */
  async findUnique<T extends keyof PrismaClient>(
    model: T,
    args: Prisma.Args<PrismaClient[T], 'findUnique'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'findUnique'>> {
    this.logQuery('findUnique', model as string, args);
    
    if (args.where) {
      this.validateQueryParams(args.where as Record<string, unknown>);
    }
    
    return (this.prisma[model] as any).findUnique(args);
  }
  
  /**
   * Secure findFirst operation
   */
  async findFirst<T extends keyof PrismaClient>(
    model: T,
    args?: Prisma.Args<PrismaClient[T], 'findFirst'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'findFirst'>> {
    this.logQuery('findFirst', model as string, args);
    
    if (args) {
      if (args.where) {
        this.validateQueryParams(args.where as Record<string, unknown>);
      }
      
      if (args.orderBy) {
        this.validateOrderBy(args.orderBy);
      }
    }
    
    return (this.prisma[model] as any).findFirst(args);
  }
  
  /**
   * Secure create operation
   */
  async create<T extends keyof PrismaClient>(
    model: T,
    args: Prisma.Args<PrismaClient[T], 'create'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'create'>> {
    this.logQuery('create', model as string, args);
    
    if (args.data) {
      this.validateCreateData(args.data as Record<string, unknown>);
    }
    
    return (this.prisma[model] as any).create(args);
  }
  
  /**
   * Secure update operation
   */
  async update<T extends keyof PrismaClient>(
    model: T,
    args: Prisma.Args<PrismaClient[T], 'update'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'update'>> {
    this.logQuery('update', model as string, args);
    
    if (args.where) {
      this.validateQueryParams(args.where as Record<string, unknown>);
    }
    
    if (args.data) {
      this.validateUpdateData(args.data as Record<string, unknown>);
    }
    
    return (this.prisma[model] as any).update(args);
  }
  
  /**
   * Secure updateMany operation
   */
  async updateMany<T extends keyof PrismaClient>(
    model: T,
    args: Prisma.Args<PrismaClient[T], 'updateMany'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'updateMany'>> {
    this.logQuery('updateMany', model as string, args);
    
    if (args.where) {
      this.validateQueryParams(args.where as Record<string, unknown>);
    }
    
    if (args.data) {
      this.validateUpdateData(args.data as Record<string, unknown>);
    }
    
    return (this.prisma[model] as any).updateMany(args);
  }
  
  /**
   * Secure delete operation
   */
  async delete<T extends keyof PrismaClient>(
    model: T,
    args: Prisma.Args<PrismaClient[T], 'delete'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'delete'>> {
    this.logQuery('delete', model as string, args);
    
    if (args.where) {
      this.validateQueryParams(args.where as Record<string, unknown>);
    }
    
    return (this.prisma[model] as any).delete(args);
  }
  
  /**
   * Secure deleteMany operation
   */
  async deleteMany<T extends keyof PrismaClient>(
    model: T,
    args?: Prisma.Args<PrismaClient[T], 'deleteMany'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'deleteMany'>> {
    this.logQuery('deleteMany', model as string, args);
    
    if (args?.where) {
      this.validateQueryParams(args.where as Record<string, unknown>);
    }
    
    return (this.prisma[model] as any).deleteMany(args);
  }
  
  /**
   * Secure count operation
   */
  async count<T extends keyof PrismaClient>(
    model: T,
    args?: Prisma.Args<PrismaClient[T], 'count'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'count'>> {
    this.logQuery('count', model as string, args);
    
    if (args?.where) {
      this.validateQueryParams(args.where as Record<string, unknown>);
    }
    
    return (this.prisma[model] as any).count(args);
  }
  
  /**
   * Secure aggregate operation
   */
  async aggregate<T extends keyof PrismaClient>(
    model: T,
    args?: Prisma.Args<PrismaClient[T], 'aggregate'>
  ): Promise<Prisma.Result<PrismaClient[T], typeof args, 'aggregate'>> {
    this.logQuery('aggregate', model as string, args);
    
    if (args?.where) {
      this.validateQueryParams(args.where as Record<string, unknown>);
    }
    
    if (args?.orderBy) {
      this.validateOrderBy(args.orderBy);
    }
    
    return (this.prisma[model] as any).aggregate(args);
  }
  
  /**
   * Validate orderBy clause
   */
  private validateOrderBy(orderBy: unknown): void {
    if (Array.isArray(orderBy)) {
      orderBy.forEach(item => this.validateOrderByItem(item));
    } else {
      this.validateOrderByItem(orderBy);
    }
  }
  
  private validateOrderByItem(item: unknown): void {
    if (typeof item === 'object' && item !== null) {
      for (const [field, direction] of Object.entries(item)) {
        // Validate field name
        ValidationSchemas.secureString.parse(field);
        
        // Validate sort direction
        if (typeof direction === 'string') {
          if (!['asc', 'desc'].includes(direction.toLowerCase())) {
            throw new Error(`Invalid sort direction: ${direction}`);
          }
        }
      }
    }
  }
  
  /**
   * Validate create data
   */
  private validateCreateData(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      // Validate field name
      ValidationSchemas.secureString.parse(key);
      
      // Sanitize value based on type
      if (typeof value === 'string') {
        const detection = detectMaliciousPatterns(value);
        if (detection.detected) {
          throw new Error(`Field '${key}' contains potentially malicious patterns: ${detection.threats.join(', ')}`);
        }
      }
    }
  }
  
  /**
   * Validate update data
   */
  private validateUpdateData(data: Record<string, unknown>): void {
    this.validateCreateData(data); // Same validation logic
  }
  
  /**
   * Secure transaction wrapper
   */
  async transaction<T>(
    operations: (tx: PrismaClient) => Promise<T>,
    options?: {
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<T> {
    this.logQuery('transaction', 'multiple', { operationCount: 'multiple' });
    
    // Validate timeout
    if (options?.timeout && (options.timeout < 1000 || options.timeout > 60000)) {
      throw new Error('Transaction timeout must be between 1 and 60 seconds');
    }
    
    return this.prisma.$transaction(operations, {
      timeout: options?.timeout || 30000, // Default 30 seconds
      isolationLevel: options?.isolationLevel
    });
  }
  
  /**
   * Execute raw SQL with strict validation (USE WITH EXTREME CAUTION)
   */
  async executeRaw(sql: TemplateStringsArray, ...values: unknown[]): Promise<unknown> {
    // Log the raw query attempt
    console.warn('RAW_SQL_EXECUTION:', {
      timestamp: new Date().toISOString(),
      sql: sql.join('?'),
      values,
      stack: new Error().stack
    });
    
    // Validate that this is a parameterized query
    if (values.length === 0 && sql.some(part => part.includes('?'))) {
      throw new Error('Raw SQL queries must use parameterized queries');
    }
    
    // Validate all parameter values
    const sanitizedValues = values.map(value => {
      if (typeof value === 'string') {
        const detection = detectMaliciousPatterns(value);
        if (detection.detected) {
          throw new Error(`Raw SQL parameter contains malicious patterns: ${detection.threats.join(', ')}`);
        }
        return sanitizeQueryParam(value);
      }
      return sanitizeQueryParam(value);
    });
    
    // Check SQL for dangerous operations
    const fullQuery = sql.join('?').toLowerCase();
    const dangerousOperations = ['drop', 'truncate', 'alter', 'create', 'grant', 'revoke'];
    
    if (dangerousOperations.some(op => fullQuery.includes(op))) {
      throw new Error('Raw SQL contains potentially dangerous operations');
    }
    
    return this.prisma.$executeRaw(sql, ...sanitizedValues);
  }
  
  /**
   * Query raw SQL with strict validation (USE WITH EXTREME CAUTION)
   */
  async queryRaw<T>(sql: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    // Log the raw query attempt
    console.warn('RAW_SQL_QUERY:', {
      timestamp: new Date().toISOString(),
      sql: sql.join('?'),
      values,
      stack: new Error().stack
    });
    
    // Same validation as executeRaw
    if (values.length === 0 && sql.some(part => part.includes('?'))) {
      throw new Error('Raw SQL queries must use parameterized queries');
    }
    
    const sanitizedValues = values.map(value => {
      if (typeof value === 'string') {
        const detection = detectMaliciousPatterns(value);
        if (detection.detected) {
          throw new Error(`Raw SQL parameter contains malicious patterns: ${detection.threats.join(', ')}`);
        }
        return sanitizeQueryParam(value);
      }
      return sanitizeQueryParam(value);
    });
    
    // Only allow SELECT operations for queryRaw
    const fullQuery = sql.join('?').toLowerCase().trim();
    if (!fullQuery.startsWith('select')) {
      throw new Error('queryRaw only allows SELECT statements');
    }
    
    return this.prisma.$queryRaw(sql, ...sanitizedValues);
  }
  
  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
  
  /**
   * Get the underlying Prisma client (USE WITH CAUTION)
   */
  get unsafe(): PrismaClient {
    console.warn('UNSAFE_PRISMA_ACCESS:', {
      timestamp: new Date().toISOString(),
      stack: new Error().stack
    });
    return this.prisma;
  }
}

/**
 * Query Builder for Common Secure Patterns
 */
export class SecureQueryBuilder {
  private securePrisma: SecurePrismaClient;
  
  constructor(securePrisma: SecurePrismaClient) {
    this.securePrisma = securePrisma;
  }
  
  /**
   * Secure user lookup by ID
   */
  async getUserById(userId: string) {
    const validatedId = ValidationSchemas.uuid.parse(userId);
    return this.securePrisma.findUnique('user', {
      where: { id: validatedId }
    });
  }
  
  /**
   * Secure ticker lookup
   */
  async getTickerBySymbol(symbol: string) {
    const validatedSymbol = ValidationSchemas.ticker.parse(symbol);
    return this.securePrisma.findUnique('ticker', {
      where: { symbol: validatedSymbol }
    });
  }
  
  /**
   * Secure summary lookup with pagination
   */
  async getSummaries(filters: {
    userId?: string;
    ticker?: string;
    filingType?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {};
    
    if (filters.userId) {
      where.userId = ValidationSchemas.uuid.parse(filters.userId);
    }
    
    if (filters.ticker) {
      where.ticker = ValidationSchemas.ticker.parse(filters.ticker);
    }
    
    if (filters.filingType) {
      where.filingType = ValidationSchemas.filingType.parse(filters.filingType);
    }
    
    const limit = filters.limit ? ValidationSchemas.positiveInteger.parse(filters.limit) : 10;
    const offset = filters.offset ? ValidationSchemas.nonNegativeInteger.parse(filters.offset) : 0;
    
    return this.securePrisma.findMany('summary', {
      where,
      take: Math.min(limit, 100), // Maximum 100 items
      skip: offset,
      orderBy: { createdAt: 'desc' }
    });
  }
  
  /**
   * Secure job queue operations
   */
  async getJobsToProcess(limit: number = 10, jobTypes?: string[]) {
    const validatedLimit = ValidationSchemas.positiveInteger.max(50).parse(limit);
    
    const where: Record<string, unknown> = {
      status: { in: ['PENDING', 'RETRYING'] },
      scheduledFor: { lte: new Date() }
    };
    
    if (jobTypes && jobTypes.length > 0) {
      // Validate job types
      const validJobTypes = jobTypes.map(type => 
        ValidationSchemas.secureString.parse(type)
      );
      where.jobType = { in: validJobTypes };
    }
    
    return this.securePrisma.findMany('jobQueue', {
      where,
      take: validatedLimit,
      orderBy: [
        { priority: 'desc' },
        { scheduledFor: 'asc' },
        { createdAt: 'asc' }
      ]
    });
  }
  
  /**
   * Secure filing search
   */
  async searchFilings(query: {
    ticker?: string;
    formType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};
    
    if (query.ticker) {
      where.ticker = ValidationSchemas.ticker.parse(query.ticker);
    }
    
    if (query.formType) {
      where.formType = ValidationSchemas.filingType.parse(query.formType);
    }
    
    if (query.dateFrom || query.dateTo) {
      where.filedAt = {};
      if (query.dateFrom) {
        (where.filedAt as any).gte = query.dateFrom;
      }
      if (query.dateTo) {
        (where.filedAt as any).lte = query.dateTo;
      }
    }
    
    const limit = query.limit ? ValidationSchemas.positiveInteger.max(100).parse(query.limit) : 20;
    
    return this.securePrisma.findMany('secFiling', {
      where,
      take: limit,
      orderBy: { filedAt: 'desc' }
    });
  }
}

/**
 * Export secure database utilities
 */
export const DatabaseSecurity = {
  SecurePrismaClient,
  SecureQueryBuilder
} as const;