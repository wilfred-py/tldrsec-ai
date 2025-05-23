# TLDRsec-AI Test Suite

This directory contains comprehensive tests for the TLDRsec-AI application, with a focus on the API integration layer.

## Test Coverage

The test suite covers the following areas:

### API Service Layer

- **Ticker Service** (`__tests__/lib/api/ticker-service.test.ts`)
  - Tests for all ticker API endpoints
  - Handles both API-enabled and API-disabled modes
  - Tests error handling and edge cases

- **Filing Service** (`__tests__/lib/api/filing-service.test.ts`)
  - Tests for all filing API endpoints
  - Tests for mock data fallbacks when API is disabled
  - Tests for error handling

### Hooks

- **useAsync Hook** (`__tests__/lib/hooks/use-async.test.tsx`)
  - Tests initialization with default and initial values
  - Tests loading state management
  - Tests error handling
  - Tests success/error callbacks and toast notifications
  - Tests optimistic updates

### Components

- **Dashboard Client** (`__tests__/components/dashboard/dashboard-client.test.tsx`)
  - Tests initial loading state with skeletons
  - Tests rendering with mock company data
  - Tests empty state rendering

- **Logs Page** (`__tests__/app/dashboard/logs-page.test.tsx`)
  - Tests initial loading state with skeletons
  - Tests rendering with mock filing data
  - Tests empty state when no logs exist

## Test Utilities

- **Test Utilities** (`__tests__/test-utils.tsx`)
  - Custom render function that can be extended with providers if needed
  - Helper functions for mocking API responses and errors

## Running Tests

To run the full test suite:

```bash
npm test
```

To run specific tests:

```bash
# Run component tests only
npx jest --config=jest.config.mjs "__tests__/components/**/*.test.tsx" "__tests__/app/**/*.test.tsx"

# Run API service tests only
npx jest --config=jest.config.mjs "__tests__/lib/api/**/*.test.ts"

# Run hooks tests only
npx jest --config=jest.config.mjs "__tests__/lib/hooks/**/*.test.tsx"

# Run a specific test file
npx jest --config=jest.config.mjs "__tests__/lib/hooks/use-async.test.tsx"
```

## Continuous Integration

These tests ensure that the service layer, async hook, and component UI work correctly across different data scenarios, including:

1. Happy paths with successful data loading
2. Loading states with UI skeletons
3. Empty states when no data is available
4. Error states when API requests fail
5. Mock data fallbacks when API is disabled

## Future Test Enhancements

- Add integration tests for:
  - Form preferences modal
  - Add ticker dialog
  - Search/filtering functionality
- Add end-to-end tests with Playwright or Cypress 