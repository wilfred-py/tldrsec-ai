/**
 * API Endpoint Validation Schemas
 * 
 * Comprehensive validation schemas for all API endpoints to prevent
 * injection attacks and ensure data integrity.
 * 
 * SECURITY FOCUS:
 * - Parameter validation for all API routes
 * - Request body sanitization
 * - Query parameter validation
 * - File upload security
 * - Rate limiting data validation
 */

import { z } from 'zod';
import { 
  ValidationSchemas as _ValidationSchemas,
  tickerSchema,
  emailSchema,
  filingTypeSchema,
  prioritySchema,
  statusSchema as _statusSchema,
  paginationSchema as _paginationSchema,
  searchQuerySchema,
  idSchema as _idSchema,
  uuidSchema,
  secureStringSchema,
  positiveIntegerSchema,
  nonNegativeIntegerSchema,
  urlSchema as _urlSchema,
  dateStringSchema,
  safeJsonSchema
} from './index';

/**
 * Cron API Schemas
 */
export const cronProcessJobsQuerySchema = z.object({
  limit: positiveIntegerSchema.max(50, 'Limit cannot exceed 50').default(5),
  types: z.string()
    .optional()
    .refine(value => {
      if (!value) return true;
      const types = value.split(',');
      return types.length <= 10 && types.every(type => type.length <= 50);
    }, 'Invalid job types parameter')
});

export const cronSecurityHeaderSchema = z.object({
  'x-cron-secret': z.string()
    .min(32, 'Cron secret too short')
    .max(256, 'Cron secret too long')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid cron secret format')
});

/**
 * Filing API Schemas
 */
export const filingsSummaryQuerySchema = z.object({
  ticker: tickerSchema,
  formType: filingTypeSchema,
  skipAuth: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  useCache: z.enum(['true', 'false']).optional().transform(val => val !== 'false'),
  bypassCache: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  returnMetadata: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  useStreaming: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  processAllChunks: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});

export const filingsTestQuerySchema = z.object({
  email: emailSchema,
  ticker: tickerSchema.default('TSLA')
});

export const filingsTickerParamsSchema = z.object({
  ticker: tickerSchema
});

export const filingsTickerQuerySchema = z.object({
  limit: positiveIntegerSchema.max(100, 'Limit cannot exceed 100').optional()
});

/**
 * Summary API Schemas
 */
export const summariesQuerySchema = z.object({
  limit: positiveIntegerSchema.max(100, 'Limit cannot exceed 100').default(10),
  ticker: tickerSchema.optional(),
  filingType: filingTypeSchema.optional()
});

export const summaryParamsSchema = z.object({
  id: uuidSchema
});

/**
 * User API Schemas
 */
export const userTickersParamsSchema = z.object({
  id: uuidSchema
});

export const userTickersBodySchema = z.object({
  ticker: tickerSchema,
  companyName: z.string()
    .min(1, 'Company name required')
    .max(200, 'Company name too long')
    .refine(value => !/[<>\"'&]/.test(value), 'Company name contains invalid characters')
    .transform(value => value.trim())
});

export const userAnalyticsQuerySchema = z.object({
  start: dateStringSchema.optional(),
  end: dateStringSchema.optional(),
  includeDailyBreakdown: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});

export const userSubscriptionsQuerySchema = z.object({
  symbol: tickerSchema.optional()
});

/**
 * Search API Schemas
 */
export const tickersSearchQuerySchema = z.object({
  q: searchQuerySchema,
  limit: positiveIntegerSchema.max(50, 'Limit cannot exceed 50').default(10)
});

/**
 * Monitoring API Schemas
 */
export const metricsQuerySchema = z.object({
  name: z.string()
    .max(100, 'Metric name too long')
    .regex(/^[a-zA-Z0-9._-]*$/, 'Metric name contains invalid characters')
    .optional(),
  format: z.enum(['json', 'prometheus']).default('json'),
  last: positiveIntegerSchema.max(1000, 'Cannot request more than 1000 metrics').optional()
});

export const monitoringCronStatusQuerySchema = z.object({
  days: positiveIntegerSchema.max(90, 'Cannot query more than 90 days').default(7),
  limit: positiveIntegerSchema.max(100, 'Limit cannot exceed 100').default(10)
});

export const monitoringSecFetchQuerySchema = z.object({
  days: positiveIntegerSchema.max(90, 'Cannot query more than 90 days').default(7),
  format: z.enum(['json', 'csv']).default('json'),
  xmlOnly: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});

/**
 * Debug API Schemas
 */
export const debugEmailSummaryQuerySchema = z.object({
  email: emailSchema,
  tickers: z.string()
    .optional()
    .refine(value => {
      if (!value) return true;
      const tickers = value.split(',');
      return tickers.length <= 20 && tickers.every(ticker => tickerSchema.safeParse(ticker).success);
    }, 'Invalid tickers parameter')
});

export const debugSecConnectivityQuerySchema = z.object({
  cik: z.string()
    .regex(/^\d{1,10}$/, 'CIK must be numeric')
    .default('1318605')
});

/**
 * Test API Schemas
 */
export const testEmailQuerySchema = z.object({
  to: emailSchema,
  subject: z.string()
    .max(200, 'Subject too long')
    .refine(value => !/[<>\"']/.test(value), 'Subject contains invalid characters')
    .default('Test Email'),
  content: z.string()
    .max(1000, 'Content too long')
    .refine(value => !/[<>]/.test(value), 'Content contains invalid characters')
    .default('This is a test email.')
});

export const testSecLookupQuerySchema = z.object({
  ticker: tickerSchema.default('AAPL')
});

export const testTickerSubscriptionQuerySchema = z.object({
  ticker: tickerSchema.optional(),
  batch: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});

export const testFilingSummaryQuerySchema = z.object({
  ticker: tickerSchema.default('AAPL')
});

export const testAISummaryQuerySchema = z.object({
  ticker: tickerSchema.default('AAPL'),
  formType: filingTypeSchema.default('10-K')
});

export const testSubscriptionAwareFilingQuerySchema = z.object({
  ticker: tickerSchema.default('KO'),
  type: filingTypeSchema.default('10-Q'),
  dryRun: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});

export const testFilingsMultiQuerySchema = z.object({
  ticker: tickerSchema.default('AAPL')
});

/**
 * DLQ (Dead Letter Queue) API Schemas
 */
export const dlqQuerySchema = z.object({
  limit: positiveIntegerSchema.max(1000, 'Limit cannot exceed 1000').default(100),
  offset: nonNegativeIntegerSchema.default(0),
  include_reprocessed: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});

export const dlqCleanupQuerySchema = z.object({
  older_than_days: positiveIntegerSchema.max(365, 'Cannot cleanup items older than 365 days').default(30)
});

/**
 * Admin API Schemas
 */
export const adminSecurityHealthQuerySchema = z.object({
  refresh_cloudflare: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  include_ranges: z.enum(['true', 'false']).optional().transform(val => val === 'true')
});

/**
 * Job Queue API Schemas
 */
export const jobQueueBodySchema = z.object({
  jobType: z.enum([
    'CHECK_FILINGS', 'PROCESS_FILING', 'ARCHIVE_FILINGS',
    'CHECK_10K_FILINGS', 'CHECK_10Q_FILINGS', 'CHECK_8K_FILINGS', 'CHECK_FORM4_FILINGS',
    'SUMMARIZE_FILING', 'SEND_FILING_NOTIFICATION', 'COMPILE_DAILY_DIGEST',
    'ASYNC_SUMMARIZE_FILING', 'ASYNC_EMAIL_DIGEST', 'ASYNC_FILING_CLEANUP', 'ASYNC_WEBHOOK_NOTIFICATION'
  ], {
    errorMap: () => ({ message: 'Invalid job type' })
  }),
  payload: safeJsonSchema,
  priority: positiveIntegerSchema.max(10, 'Priority cannot exceed 10').default(5),
  scheduledFor: dateStringSchema.optional(),
  idempotencyKey: z.string()
    .max(255, 'Idempotency key too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Idempotency key contains invalid characters')
    .optional(),
  maxAttempts: positiveIntegerSchema.max(10, 'Max attempts cannot exceed 10').default(3)
});

/**
 * Event Bus API Schemas
 */
export const eventBusBodySchema = z.object({
  type: z.string()
    .min(1, 'Event type required')
    .max(100, 'Event type too long')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Event type contains invalid characters'),
  source: z.string()
    .min(1, 'Event source required')
    .max(100, 'Event source too long')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Event source contains invalid characters'),
  data: safeJsonSchema,
  correlationId: uuidSchema.optional(),
  priority: prioritySchema.default('MEDIUM'),
  targetServices: z.array(
    z.string()
      .max(50, 'Service name too long')
      .regex(/^[a-zA-Z0-9._-]+$/, 'Service name contains invalid characters')
  ).max(20, 'Too many target services').optional(),
  broadcast: z.boolean().default(false)
});

/**
 * File Upload Schemas
 */
export const fileUploadSchema = z.object({
  file: z.instanceof(File)
    .refine(file => file.size <= 10 * 1024 * 1024, 'File size cannot exceed 10MB') // 10MB limit
    .refine(file => {
      const allowedTypes = ['application/pdf', 'text/plain', 'application/json', 'text/xml', 'application/xml'];
      return allowedTypes.includes(file.type);
    }, 'Invalid file type. Only PDF, TXT, JSON, and XML files are allowed')
    .refine(file => {
      // Check filename for path traversal
      return !file.name.includes('..') && !/[<>"|*?]/.test(file.name);
    }, 'Invalid filename')
});

/**
 * Health Check Schemas
 */
export const healthCheckQuerySchema = z.object({
  check: z.enum(['database', 'redis', 'external', 'all']).default('all'),
  timeout: positiveIntegerSchema.max(30000, 'Timeout cannot exceed 30 seconds').default(5000)
});

/**
 * Rate Limiting Schemas
 */
export const rateLimitConfigSchema = z.object({
  windowMs: positiveIntegerSchema.max(3600000, 'Window cannot exceed 1 hour').default(900000), // 15 minutes
  max: positiveIntegerSchema.max(10000, 'Max requests cannot exceed 10000').default(100),
  skipSuccessfulRequests: z.boolean().default(false),
  skipFailedRequests: z.boolean().default(false)
});

/**
 * Security Header Schemas
 */
export const securityHeadersSchema = z.object({
  'content-security-policy': secureStringSchema.optional(),
  'x-frame-options': z.enum(['DENY', 'SAMEORIGIN']).optional(),
  'x-content-type-options': z.literal('nosniff').optional(),
  'strict-transport-security': secureStringSchema.optional(),
  'referrer-policy': z.enum(['no-referrer', 'no-referrer-when-downgrade', 'same-origin', 'strict-origin']).optional()
});

/**
 * Request Validation Middleware Schema
 */
export const requestValidationSchema = z.object({
  body: safeJsonSchema.optional(),
  query: z.record(z.string()).optional(),
  params: z.record(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  files: z.array(fileUploadSchema).max(10, 'Cannot upload more than 10 files').optional()
});

/**
 * Export grouped schemas for easy access
 */
export const CronSchemas = {
  processJobsQuery: cronProcessJobsQuerySchema,
  securityHeader: cronSecurityHeaderSchema
};

export const FilingSchemas = {
  summaryQuery: filingsSummaryQuerySchema,
  testQuery: filingsTestQuerySchema,
  tickerParams: filingsTickerParamsSchema,
  tickerQuery: filingsTickerQuerySchema
};

export const SummarySchemas = {
  query: summariesQuerySchema,
  params: summaryParamsSchema
};

export const UserSchemas = {
  tickersParams: userTickersParamsSchema,
  tickersBody: userTickersBodySchema,
  analyticsQuery: userAnalyticsQuerySchema,
  subscriptionsQuery: userSubscriptionsQuerySchema
};

export const SearchSchemas = {
  tickersQuery: tickersSearchQuerySchema
};

export const MonitoringSchemas = {
  metricsQuery: metricsQuerySchema,
  cronStatusQuery: monitoringCronStatusQuerySchema,
  secFetchQuery: monitoringSecFetchQuerySchema
};

export const DebugSchemas = {
  emailSummaryQuery: debugEmailSummaryQuerySchema,
  secConnectivityQuery: debugSecConnectivityQuerySchema
};

export const TestSchemas = {
  emailQuery: testEmailQuerySchema,
  secLookupQuery: testSecLookupQuerySchema,
  tickerSubscriptionQuery: testTickerSubscriptionQuerySchema,
  filingSummaryQuery: testFilingSummaryQuerySchema,
  aiSummaryQuery: testAISummaryQuerySchema,
  subscriptionAwareFilingQuery: testSubscriptionAwareFilingQuerySchema,
  filingsMultiQuery: testFilingsMultiQuerySchema
};

export const AdminSchemas = {
  securityHealthQuery: adminSecurityHealthQuerySchema
};

export const JobQueueSchemas = {
  body: jobQueueBodySchema
};

export const EventBusSchemas = {
  body: eventBusBodySchema
};

export const SecuritySchemas = {
  rateLimitConfig: rateLimitConfigSchema,
  securityHeaders: securityHeadersSchema,
  requestValidation: requestValidationSchema
};