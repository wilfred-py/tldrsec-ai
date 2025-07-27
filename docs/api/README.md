# TLDRsec AI - Optimized Filing Services API Documentation

## Overview

The Optimized Filing Services API provides high-performance SEC filing summaries with enterprise-grade features including multi-level caching, batch processing, and comprehensive monitoring.

## Quick Start

### Single Filing Summary

```bash
# Get a 10-K summary for Apple
curl "https://your-domain.com/api/filings/optimized-summary?ticker=AAPL&formType=10-K" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

### Batch Processing

```bash
# Process multiple filings at once
curl -X POST "https://your-domain.com/api/filings/optimized-batch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{
    "requests": [
      {"ticker": "AAPL", "formType": "10-K", "id": "req-1"},
      {"ticker": "TSLA", "formType": "10-Q", "id": "req-2"},
      {"ticker": "MSFT", "formType": "8-K", "id": "req-3"}
    ],
    "concurrency": 5,
    "returnMetadata": true
  }'
```

### Health Check

```bash
# Check system health
curl "https://your-domain.com/api/health/optimized"
```

## API Endpoints

### 🚀 Optimized Filing Services

#### `GET /api/filings/optimized-summary`
High-performance single filing summary endpoint with sub-second response times.

**Parameters:**
- `ticker` (required): Stock ticker symbol (e.g., AAPL, TSLA)
- `formType` (required): SEC form type (10-K, 10-Q, 8-K, Form 4, etc.)
- `bypassCache` (optional): Skip cache and fetch fresh data
- `returnMetadata` (optional): Include processing metadata

**Features:**
- Direct Claude AI integration
- Multi-level caching (memory + database + Redis)
- Content-aware document chunking
- Rate limiting and resource management

#### `POST /api/filings/optimized-batch`
Intelligent batch processing for up to 25 concurrent filing summaries.

**Request Body:**
```json
{
  "requests": [
    {"ticker": "AAPL", "formType": "10-K", "id": "optional-id"}
  ],
  "concurrency": 5,
  "bypassCache": false,
  "returnMetadata": true
}
```

**Features:**
- Concurrent processing with automatic optimization
- Shared caching across batch requests
- Partial result handling for resilient processing
- Request payload size limits (1MB default)

### 🏥 Health Monitoring

#### `GET /api/health/optimized`
Comprehensive health check for all optimized services.

**Response includes:**
- Service initialization status
- Cache system health (memory, database, Redis)
- Claude AI connectivity
- Database connection status
- Feature flag configuration
- Performance metrics

## Authentication

All endpoints require authentication using Clerk session tokens:

```bash
curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" ...
```

## Feature Flags

The API supports gradual rollout through feature flags:

- `ENABLE_OPTIMIZED_FILING`: Enable/disable optimized service
- `OPTIMIZED_TRAFFIC_PERCENTAGE`: Route percentage of traffic to optimized service

## Performance Optimizations

### Caching Strategy
- **Memory Cache**: In-process caching for frequently accessed data
- **Database Cache**: Persistent caching with PostgreSQL
- **Redis Cache**: Distributed caching (optional)

### Batch Processing
- Intelligent concurrency based on batch size and system load
- Shared cache lookups across batch requests
- Partial failure handling with detailed error reporting

### Circuit Breaker
Protection against external API failures with automatic recovery:
- Configurable failure thresholds
- Exponential backoff for recovery attempts
- Real-time status monitoring

## Rate Limiting

### Claude AI Integration
- Configurable requests per minute limit
- Token usage tracking and optimization
- Automatic rate limit detection and backoff

### API Endpoints
- Per-endpoint rate limiting
- Burst capacity for spike handling
- Client-specific rate limit tracking

## Security Features

### CORS Configuration
Production-safe CORS headers with configurable allowed origins:

```env
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Request Validation
- Payload size limits (1MB default for batch requests)
- Input sanitization and validation
- SQL injection protection

### Error Handling
- Secure error messages without sensitive data exposure
- Request ID tracking for debugging
- Comprehensive audit logging

## Monitoring & Observability

### Performance Metrics
- Request duration tracking
- Cache hit rate monitoring
- Throughput and concurrency metrics
- Error rate tracking

### Health Checks
- Service dependency monitoring
- Resource usage tracking
- Feature flag status reporting
- Database connection health

### Logging
Structured logging with request correlation:

```json
{
  "level": "info",
  "message": "✅ Optimized filing summary completed",
  "requestId": "opt-1642123456789-abc123def",
  "ticker": "AAPL",
  "formType": "10-K",
  "duration": 1234,
  "cacheHit": true,
  "cacheSource": "memory"
}
```

## Configuration

### Environment Variables

#### Core Feature Flags
```env
ENABLE_OPTIMIZED_FILING=true
OPTIMIZED_TRAFFIC_PERCENTAGE=100
```

#### Performance Configuration
```env
ENABLE_CHUNKING=true
BATCH_PROCESSING_ENABLED=true
BATCH_CONCURRENCY=5
PRIORITIZE_SPEED=true
```

#### Security Configuration
```env
ALLOWED_ORIGINS=https://yourdomain.com
MAX_BATCH_PAYLOAD_SIZE=1048576
```

#### Cache Configuration
```env
ENABLE_IN_MEMORY_CACHE=true
ENABLE_DATABASE_CACHE=true
ENABLE_REDIS_CACHE=false
CACHE_TIMEOUT_SECONDS=3600
```

See `config/optimized-production.env` for complete configuration reference.

## Error Codes

| Status | Description | Common Causes |
|--------|-------------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid parameters, malformed JSON |
| 404 | Not Found | Filing not available, invalid ticker |
| 413 | Payload Too Large | Batch request exceeds size limit |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Service failure, database error |
| 503 | Service Unavailable | Health check failed, circuit breaker open |

## Response Format

### Successful Response
```json
{
  "success": true,
  "data": {
    "ticker": "AAPL",
    "formType": "10-K",
    "summary": "Apple Inc. reported strong financial performance...",
    "keyPoints": ["Revenue increased 12%", "iPhone sales strong"],
    "filingDate": "2024-01-15"
  },
  "requestId": "opt-1642123456789-abc123def",
  "performance": {
    "duration": 1234,
    "optimized": true,
    "version": "tranche-4"
  }
}
```

### Error Response
```json
{
  "error": "Filing not found for ticker INVALID",
  "requestId": "opt-1642123456789-abc123def",
  "performance": {
    "duration": 567,
    "optimized": true,
    "version": "tranche-4"
  }
}
```

## SDK Support

### JavaScript/TypeScript
```typescript
import { OptimizedFilingClient } from '@tldrsec/filing-client';

const client = new OptimizedFilingClient({
  baseUrl: 'https://your-domain.com/api',
  authToken: 'YOUR_SESSION_TOKEN'
});

// Single filing
const summary = await client.getFilingSummary('AAPL', '10-K');

// Batch processing
const results = await client.batchGetFilingSummaries([
  { ticker: 'AAPL', formType: '10-K' },
  { ticker: 'TSLA', formType: '10-Q' }
]);
```

### Python
```python
from tldrsec_client import OptimizedFilingClient

client = OptimizedFilingClient(
    base_url='https://your-domain.com/api',
    auth_token='YOUR_SESSION_TOKEN'
)

# Single filing
summary = client.get_filing_summary('AAPL', '10-K')

# Batch processing
results = client.batch_get_filing_summaries([
    {'ticker': 'AAPL', 'formType': '10-K'},
    {'ticker': 'TSLA', 'formType': '10-Q'}
])
```

## Best Practices

### Performance
1. **Use batch endpoints** for multiple requests to leverage shared caching
2. **Enable metadata** only when needed to reduce response size
3. **Set appropriate concurrency** based on your rate limits
4. **Implement client-side caching** for frequently accessed data

### Error Handling
1. **Implement retry logic** with exponential backoff
2. **Handle partial failures** in batch requests gracefully
3. **Monitor rate limits** and implement queue-based processing
4. **Use request IDs** for debugging and correlation

### Security
1. **Validate inputs** on the client side before sending requests
2. **Store session tokens securely** and refresh as needed
3. **Use HTTPS** for all API communications
4. **Implement request signing** for high-security environments

## Migration Guide

### From Legacy API
1. Update endpoint URLs to use `/optimized-*` variants
2. Handle new response format with `performance` metadata
3. Implement new error handling for `requestId` tracking
4. Update authentication to use Clerk session tokens

### Backward Compatibility
The legacy API endpoints remain available during the transition period:
- `/api/test-summarize` (deprecated)
- `/api/batch-summarize` (deprecated)

## Support

- **OpenAPI Spec**: Available at `/docs/api/openapi.yaml`
- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Updated API documentation and examples
- **Health Dashboard**: Monitor service status at `/api/health/optimized`