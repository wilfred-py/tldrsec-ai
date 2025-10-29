# Rate Limiting Test Execution Plan

## Overview

This document provides comprehensive test execution procedures for the rate limiting infrastructure, including automated test scripts, manual validation procedures, and quality gates.

## Test Suite Organization

### 1. Component Tests (70% of test coverage)
- **Circuit Breaker Tests**: `circuit-breaker-comprehensive.test.ts`
- **Request Queue Tests**: `request-queue-comprehensive.test.ts` 
- **Rate Limiting Algorithms**: `rate-limit-algorithms.test.ts`

### 2. Integration Tests (20% of test coverage)
- **Cross-Service Coordination**: `integration-cross-service.test.ts`

### 3. End-to-End Tests (10% of test coverage)
- **Pipeline Validation**: `e2e-pipeline-validation.test.ts`
- **Load Testing**: `load-testing-framework.test.ts`
- **Monitoring & Alerting**: `monitoring-alerting.test.ts`

## Automated Test Execution

### NPM Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "test:rate-limiting:components": "jest __tests__/rate-limiting/circuit-breaker-comprehensive.test.ts __tests__/rate-limiting/request-queue-comprehensive.test.ts __tests__/rate-limiting/rate-limit-algorithms.test.ts --verbose",
    "test:rate-limiting:integration": "jest __tests__/rate-limiting/integration-cross-service.test.ts --verbose --runInBand",
    "test:rate-limiting:e2e": "jest __tests__/rate-limiting/e2e-pipeline-validation.test.ts --verbose --runInBand --detectOpenHandles",
    "test:rate-limiting:load": "jest __tests__/rate-limiting/load-testing-framework.test.ts --verbose --runInBand --testTimeout=60000",
    "test:rate-limiting:monitoring": "jest __tests__/rate-limiting/monitoring-alerting.test.ts --verbose --runInBand",
    "test:rate-limiting:comprehensive": "npm run test:rate-limiting:components && npm run test:rate-limiting:integration && npm run test:rate-limiting:e2e && npm run test:rate-limiting:monitoring",
    "test:rate-limiting:quick": "jest __tests__/rate-limiting/ --testPathPattern='(circuit-breaker|request-queue|rate-limit-algorithms)' --verbose",
    "test:rate-limiting:ci": "jest __tests__/rate-limiting/ --coverage --verbose --runInBand --maxWorkers=1"
  }
}
```

### Execution Order and Dependencies

1. **Pre-test Setup**
   ```bash
   # Ensure database is running
   npm run db:generate
   
   # Verify environment variables
   npm run test:rate-limiting:env-check
   ```

2. **Component Tests (Parallel Execution)**
   ```bash
   npm run test:rate-limiting:components
   ```

3. **Integration Tests (Sequential Execution)**
   ```bash
   npm run test:rate-limiting:integration
   ```

4. **End-to-End Tests (Sequential with Cleanup)**
   ```bash
   npm run test:rate-limiting:e2e
   ```

5. **Load Tests (Resource Intensive)**
   ```bash
   npm run test:rate-limiting:load
   ```

6. **Monitoring Tests**
   ```bash
   npm run test:rate-limiting:monitoring
   ```

## Quality Gates and Success Criteria

### Must-Pass Criteria (Blocking)

1. **Component Test Coverage**: >95%
   ```bash
   # Verify with coverage report
   npm run test:rate-limiting:components -- --coverage
   ```

2. **Zero Memory Leaks**
   ```bash
   # Run with leak detection
   npm run test:rate-limiting:comprehensive -- --detectLeaks --detectOpenHandles
   ```

3. **Integration Test Success**: 100% pass rate
   ```bash
   npm run test:rate-limiting:integration
   ```

4. **Performance Benchmarks**: Meet defined targets
   - Average response time <200ms under normal load
   - Circuit breaker activation <5s under sustained failures
   - Queue processing <2s for standard requests

### Should-Pass Criteria (Warning)

1. **Load Test Stability**: <15% error rate under stress
2. **Monitoring Coverage**: All critical events captured
3. **Recovery Time**: <60s circuit breaker recovery

## Test Environment Setup

### Required Environment Variables

```bash
# Test configuration
export TEST_RATE_LIMITING=true
export TEST_TIMEOUT_EXTENDED=60000
export TEST_CIRCUIT_BREAKER_FAST=true

# Mock API configurations
export MOCK_SEC_API_RATE_LIMIT=10
export MOCK_AI_API_RATE_LIMIT=15
export MOCK_EMAIL_API_RATE_LIMIT=100

# Performance test limits
export LOAD_TEST_MAX_USERS=25
export LOAD_TEST_MAX_DURATION=10000
export LOAD_TEST_MAX_RPS=50
```

### Docker Test Environment (Optional)

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  rate-limiting-tests:
    build: .
    environment:
      - NODE_ENV=test
      - TEST_RATE_LIMITING=true
    command: npm run test:rate-limiting:comprehensive
    volumes:
      - .:/app
    depends_on:
      - postgres-test
      
  postgres-test:
    image: postgres:15
    environment:
      POSTGRES_DB: tldrsec_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
```

## Manual Validation Procedures

### 1. Circuit Breaker Manual Testing

#### Test Scenario: Manual Circuit Breaker Trigger
```bash
# 1. Start monitoring dashboard
npm run monitoring:dashboard

# 2. Execute failing requests manually
curl -X POST http://localhost:3000/api/test/rate-limiting/circuit-breaker \
  -H "Content-Type: application/json" \
  -d '{"simulate": "failure", "count": 10}'

# 3. Verify circuit breaker opens
# Check monitoring dashboard for circuit state = "OPEN"

# 4. Wait for timeout period (default 2s)
sleep 3

# 5. Execute successful request
curl -X POST http://localhost:3000/api/test/rate-limiting/circuit-breaker \
  -H "Content-Type: application/json" \
  -d '{"simulate": "success"}'

# 6. Verify circuit breaker transitions to HALF_OPEN then CLOSED
```

#### Expected Results:
- Circuit breaker transitions: CLOSED → OPEN → HALF_OPEN → CLOSED
- Monitoring dashboard shows state changes
- Response times improve after recovery

### 2. Rate Limiting Manual Testing

#### Test Scenario: Manual 429 Error Simulation
```bash
# 1. Generate rapid requests to trigger rate limiting
for i in {1..20}; do
  curl -X GET "http://localhost:3000/api/test/rate-limiting/sec-api?request=$i" &
done
wait

# 2. Check logs for 429 errors
tail -f logs/rate-limiting.log | grep "429"

# 3. Verify graceful degradation
curl -X GET "http://localhost:3000/api/test/rate-limiting/status"
```

#### Expected Results:
- Some requests return 429 status codes
- System remains responsive
- No service crashes or timeouts

### 3. Queue Depth Manual Testing

#### Test Scenario: Manual Queue Buildup
```bash
# 1. Start slow processing requests
for i in {1..30}; do
  curl -X POST "http://localhost:3000/api/test/rate-limiting/slow-process" \
    -H "Content-Type: application/json" \
    -d "{\"delay\": 2000, \"id\": \"$i\"}" &
done

# 2. Monitor queue depth
watch -n 1 'curl -s http://localhost:3000/api/test/rate-limiting/queue-stats'

# 3. Verify queue processing
wait # Wait for all requests to complete
```

#### Expected Results:
- Queue depth increases then decreases
- All requests eventually process
- No queue overflow errors

### 4. End-to-End Pipeline Manual Testing

#### Test Scenario: Complete Filing Processing
```bash
# 1. Trigger full pipeline with rate limiting
curl -X POST "http://localhost:3000/api/test/rate-limiting/full-pipeline" \
  -H "Content-Type: application/json" \
  -d '{
    "cik": "0000123456",
    "formType": "10-K",
    "userEmail": "test@example.com",
    "simulateRateLimiting": true
  }'

# 2. Monitor processing stages
curl -X GET "http://localhost:3000/api/test/rate-limiting/pipeline-status/latest"

# 3. Verify email delivery
# Check test email account for summary delivery

# 4. Verify database consistency
curl -X GET "http://localhost:3000/api/test/rate-limiting/database-consistency"
```

#### Expected Results:
- Filing processed successfully despite rate limiting
- Email delivered to test account
- Database contains consistent data

## Continuous Integration Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/rate-limiting-tests.yml
name: Rate Limiting Tests

on:
  pull_request:
    paths:
      - 'lib/infrastructure/**'
      - '__tests__/rate-limiting/**'
  push:
    branches: [main, develop]

jobs:
  rate-limiting-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: tldrsec_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: npm
          
      - name: Install dependencies
        run: npm ci
        
      - name: Setup test environment
        run: |
          echo "TEST_RATE_LIMITING=true" >> $GITHUB_ENV
          echo "DATABASE_URL=postgresql://test:test@localhost:5432/tldrsec_test" >> $GITHUB_ENV
          
      - name: Run database migrations
        run: npm run db:migrate
        
      - name: Run component tests
        run: npm run test:rate-limiting:components -- --coverage
        
      - name: Run integration tests
        run: npm run test:rate-limiting:integration
        
      - name: Run E2E tests
        run: npm run test:rate-limiting:e2e
        
      - name: Run monitoring tests
        run: npm run test:rate-limiting:monitoring
        
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
          flags: rate-limiting
          
      - name: Performance regression check
        run: npm run test:rate-limiting:performance-check
```

### Quality Gates in CI

```yaml
# Quality gate checks
- name: Check test coverage
  run: |
    coverage=$(npm run test:rate-limiting:components -- --coverage --silent | grep "All files" | awk '{print $4}' | sed 's/%//')
    if [ "$coverage" -lt 95 ]; then
      echo "Coverage $coverage% is below required 95%"
      exit 1
    fi

- name: Check performance benchmarks
  run: |
    npm run test:rate-limiting:performance-benchmark
    if [ $? -ne 0 ]; then
      echo "Performance benchmarks failed"
      exit 1
    fi

- name: Check memory leaks
  run: |
    npm run test:rate-limiting:components -- --detectLeaks --logHeapUsage
    if [ $? -ne 0 ]; then
      echo "Memory leaks detected"
      exit 1
    fi
```

## Test Data Management

### Mock Data Setup

Create test fixtures for consistent testing:

```typescript
// __tests__/rate-limiting/fixtures/test-data.ts
export const TEST_FILINGS = [
  {
    cik: '0000123456',
    formType: '10-K',
    ticker: 'TEST',
    userEmail: 'test@example.com'
  },
  // ... more test data
];

export const RATE_LIMITING_SCENARIOS = [
  {
    name: 'SEC API Rate Limiting',
    errorAfter: 10,
    errorType: '429',
    recovery: 30000
  },
  // ... more scenarios
];
```

### Test Database Setup

```sql
-- test-setup.sql
CREATE DATABASE tldrsec_rate_limiting_test;

-- Create test-specific tables for rate limiting metrics
CREATE TABLE IF NOT EXISTS rate_limit_test_metrics (
  id SERIAL PRIMARY KEY,
  test_run_id VARCHAR(255),
  metric_name VARCHAR(100),
  metric_value DECIMAL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS circuit_breaker_test_events (
  id SERIAL PRIMARY KEY,
  test_run_id VARCHAR(255),
  event_type VARCHAR(50),
  previous_state VARCHAR(20),
  new_state VARCHAR(20),
  failure_count INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Reporting and Metrics

### Test Results Format

```typescript
interface RateLimitingTestReport {
  testSuite: string;
  timestamp: Date;
  duration: number;
  results: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  coverage: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  performance: {
    averageResponseTime: number;
    p95ResponseTime: number;
    throughput: number;
    errorRate: number;
  };
  circuitBreaker: {
    activations: number;
    recoveryTime: number;
    stateTransitions: number;
  };
  queueMetrics: {
    maxDepth: number;
    averageDepth: number;
    processingTime: number;
  };
}
```

### Dashboard Integration

```typescript
// scripts/rate-limiting-dashboard.ts
export async function generateRateLimitingDashboard() {
  const testResults = await runRateLimitingTests();
  
  const dashboard = {
    circuitBreakerHealth: calculateCircuitBreakerHealth(testResults),
    queuePerformance: calculateQueuePerformance(testResults),
    rateLimitingEffectiveness: calculateRateLimitingEffectiveness(testResults),
    systemStability: calculateSystemStability(testResults)
  };
  
  await uploadDashboard(dashboard);
}
```

## Troubleshooting Guide

### Common Test Failures

1. **Circuit Breaker Not Opening**
   ```
   Error: Expected circuit breaker to be OPEN but was CLOSED
   
   Cause: Volume threshold not reached
   Solution: Increase failure count or decrease volumeThreshold in test config
   ```

2. **Queue Depth Not Building**
   ```
   Error: Expected queue depth > 10 but was 2
   
   Cause: Requests processing too quickly
   Solution: Increase request processing delay or number of concurrent requests
   ```

3. **Rate Limiting Not Triggered**
   ```
   Error: Expected 429 errors but none occurred
   
   Cause: Mock API rate limit too high
   Solution: Lower MOCK_*_API_RATE_LIMIT environment variables
   ```

4. **Test Timeout**
   ```
   Error: Test exceeded 30000ms timeout
   
   Cause: Circuit breaker timeout too long for test environment
   Solution: Use TEST_CIRCUIT_BREAKER_FAST=true environment variable
   ```

### Performance Issues

1. **Slow Test Execution**
   - Run component tests in parallel: `--maxWorkers=4`
   - Use test-specific shorter timeouts
   - Mock external dependencies properly

2. **Memory Leaks in Tests**
   - Ensure proper cleanup in `afterEach` hooks
   - Use `--detectLeaks` flag to identify sources
   - Check for unclosed connections/timers

3. **Flaky Tests**
   - Increase timeouts for timing-dependent tests
   - Use deterministic mock data
   - Add proper wait conditions for async operations

## Success Metrics

### Test Execution Success Criteria

- **Component Tests**: 100% pass rate, >95% coverage
- **Integration Tests**: 100% pass rate, all cross-service scenarios validated
- **E2E Tests**: 100% pass rate, data consistency verified
- **Load Tests**: Performance targets met under stress
- **Monitoring Tests**: All critical events captured and alerted

### Performance Benchmarks

- **Circuit Breaker Response**: <5s activation under failures
- **Queue Processing**: <2s average for standard requests
- **Rate Limiting Overhead**: <50ms additional latency
- **Memory Usage**: <100MB peak during load tests
- **Recovery Time**: <60s from failure to full operation

This comprehensive test execution plan ensures thorough validation of the rate limiting infrastructure while maintaining high quality standards and providing clear guidance for both automated and manual testing procedures.