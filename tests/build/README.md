# Build Test Suite

Comprehensive testing suite for validating build processes and deployment readiness.

## Test Structure

### Pre-Build Tests (`pre-build.test.ts`)
Validates environment configuration, dependencies, and project structure before building:
- Environment variables validation
- File structure verification  
- Package dependencies check
- Database configuration validation
- TypeScript and Next.js configuration

### Post-Build Tests (`post-build.test.ts`)
Validates build artifacts and production readiness:
- Build directory structure
- Static page generation
- JavaScript bundle analysis
- CSS compilation
- Performance optimizations
- Security configurations

### Integration Tests (`integration.test.ts`)
Tests the running application in production mode:
- Server health checks
- Critical page routes
- API endpoint functionality
- Static asset serving
- Performance benchmarks
- Error handling

## Usage

### Run Individual Test Suites
```bash
# Pre-build validation
npm run test:build:pre

# Post-build validation
npm run test:build:post

# Integration tests
npm run test:build:integration

# All build tests
npm run test:build
```

### Run Complete Build Pipeline
```bash
# Automated pipeline with reporting
npm run test:build:pipeline
```

The pipeline runs tests in sequence:
1. Pre-build validation
2. Production build
3. Post-build validation  
4. Integration tests

## Test Configuration

- **Test Environment**: Node.js
- **Test Runner**: Jest with ES modules
- **Timeout**: 60 seconds (build tests), 120 seconds (integration)
- **Coverage**: Collected from app/, lib/, components/, services/

## Test Reports

The build pipeline generates a detailed JSON report (`build-test-report.json`) with:
- Test execution results
- Performance metrics
- Error details
- Success/failure summary

## Environment Requirements

Tests require these environment variables:
- `DATABASE_URL` - PostgreSQL connection
- `CLERK_SECRET_KEY` - Clerk authentication  
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `ANTHROPIC_API_KEY` - Claude AI integration

Optional:
- `RESEND_API_KEY` - Email service
- `SEC_USER_AGENT` - SEC API access

## CI/CD Integration

Add to your CI/CD pipeline:
```yaml
- name: Run Build Tests
  run: npm run test:build:pipeline
  
- name: Upload Test Report
  uses: actions/upload-artifact@v3
  with:
    name: build-test-report
    path: build-test-report.json
```

## Troubleshooting

### Common Issues

**Prisma Generation Errors**
- Ensure database is accessible
- Check environment variables
- Run `npm run db:generate` manually

**Build Failures**
- Clear `.next` directory: `rm -rf .next`
- Reinstall dependencies: `npm ci`
- Check for TypeScript errors: `npm run lint`

**Integration Test Failures**
- Verify server starts successfully
- Check port availability (default: 3000)
- Ensure database connectivity

**Test Configuration Issues**
- Tests use ES modules - ensure `.mjs` extensions
- Check Jest configuration in `jest.config.mjs`
- Verify test sequencer runs tests in correct order