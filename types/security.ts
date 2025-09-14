/**
 * Security configuration and validation types
 * Provides type safety for middleware security, authentication, and authorization
 */

// Security event types for audit logging
export type SecurityEventType =
  | 'ACCESS_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_SIGNATURE'
  | 'UNAUTHORIZED_IP'
  | 'IP_VALIDATION_FAILURE'
  | 'INVALID_API_KEY'
  | 'ACCESS_GRANTED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'CONFIGURATION_ERROR'
  | 'MISSING_AUTH_HEADER'
  | 'INVALID_AUTH_FORMAT'
  | 'INVALID_CREDENTIALS'
  | 'WEAK_CREDENTIALS'
  | 'INVALID_CONTENT_TYPE';

// Endpoint types for different security profiles
export type EndpointType = 'CRON' | 'HEALTH' | 'PUBLIC' | 'ADMIN' | 'API';

// Rate limiting configuration
export interface RateLimitConfig {
  limit: number;
  windowMs: number;
  emergencyLimit: number;
  skipOnSuccess?: boolean;
  skipFailedRequests?: boolean;
  keyPrefix?: string;
}

// Security configuration interface
export interface SecurityConfig {
  // IP Allowlisting configuration
  allowedIPs: string[];
  
  // Rate limiting configuration by endpoint type
  rateLimits: Record<EndpointType, RateLimitConfig>;
  
  // Request signature validation
  signature: {
    algorithm: string;
    timestampTolerance: number;
    headerName: string;
    timestampHeader: string;
  };
  
  // Security headers configuration
  securityHeaders: Record<string, string>;
  
  // Additional security options
  enableIPValidation: boolean;
  enableSignatureValidation: boolean;
  enableAPIKeyValidation: boolean;
  enableSuspiciousActivityDetection: boolean;
  logAllSecurityEvents: boolean;
  enableCSRFProtection?: boolean;
  enableCORSValidation?: boolean;
}

// IP validation result
export interface IPValidationResult {
  isAllowed: boolean;
  matchedRange?: string;
  reason?: string;
  ipType: 'IPv4' | 'IPv6' | 'Unknown';
  source?: 'static' | 'cloudflare_dynamic' | 'cache' | 'fallback';
  metadata?: Record<string, unknown>;
}

// Signature validation result
export interface SignatureValidationResult {
  valid: boolean;
  reason?: string;
  timestamp?: number;
  algorithm?: string;
  keyId?: string;
}

// API key validation result
export interface APIKeyValidationResult {
  valid: boolean;
  keyId?: string;
  reason?: string;
  expiresAt?: Date;
  permissions?: string[];
}

// Security audit event
export interface SecurityAuditEvent {
  timestamp: string;
  eventType: SecurityEventType;
  clientIP: string;
  userAgent: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  userId?: string;
  sessionId?: string;
  result: 'ALLOWED' | 'DENIED';
  reason?: string;
  metadata?: Record<string, unknown>;
}

// Suspicious activity detection result
export interface SuspiciousActivityResult {
  suspicious: boolean;
  reasons: string[];
  riskScore: number;
  detectionRules: string[];
  recommendedAction: 'ALLOW' | 'CHALLENGE' | 'BLOCK' | 'MONITOR';
}

// Middleware security validation result
export interface SecurityValidationResult {
  allowed: boolean;
  reason?: string;
  responseHeaders?: Record<string, string>;
  statusCode?: number;
  auditEvent?: SecurityAuditEvent;
  securityMetrics?: SecurityMetrics;
}

// Security metrics for monitoring
export interface SecurityMetrics {
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  rateLimitedRequests: number;
  suspiciousRequests: number;
  invalidSignatureAttempts: number;
  invalidAPIKeyAttempts: number;
  unauthorizedIPAttempts: number;
  avgResponseTimeMs: number;
  errorRate: number;
}

// CORS configuration
export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  optionsSuccessStatus?: number;
}

// CSRF protection configuration
export interface CSRFConfig {
  enabled: boolean;
  secret: string;
  tokenLength: number;
  cookieName: string;
  headerName: string;
  sameSite: 'strict' | 'lax' | 'none';
  secure: boolean;
  httpOnly: boolean;
}
