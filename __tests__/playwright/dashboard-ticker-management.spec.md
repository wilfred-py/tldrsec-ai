# Playwright Test Specifications: Dashboard Ticker Management

## Test Environment Setup
```bash
# Install Playwright locally
npm install -D @playwright/test
npx playwright install chromium

# Run tests
npx playwright test __tests__/playwright/dashboard-ticker-management.spec.ts
```

## Test Suite: Add Ticker Flow (New Inline Search)

### Test 1: Happy Path - Add Ticker via Inline Search
**Objective**: Verify user can add a ticker through the inline search bar with immediate UI feedback

**Steps**:
1. Navigate to `/dashboard`
2. Locate inline search input (should be visible without modal)
3. Type "AAPL" into search bar
4. Wait for autocomplete dropdown to appear (< 300ms debounce)
5. Verify "Apple Inc." appears in dropdown results
6. Click on "Apple Inc." result
7. **Assert**: New row appears in table immediately (< 100ms - optimistic update)
8. **Assert**: New row shows loading indicator briefly
9. **Assert**: Row updates with complete data after API response
10. **Assert**: Search bar clears automatically
11. **Assert**: Success toast notification appears
12. **Measure**: Time from click to optimistic render
13. **Measure**: Time from click to final state

**Expected Results**:
- Optimistic render: < 100ms
- Total time to final state: < 500ms
- Search bar clears after selection
- No modal interactions required

---

### Test 2: Add Ticker - Search Debouncing
**Objective**: Verify search input is properly debounced

**Steps**:
1. Navigate to `/dashboard`
2. Rapidly type "APPL" character by character
3. **Assert**: API calls are debounced (not called for each keystroke)
4. Wait 300ms after last character
5. **Assert**: Search results appear after debounce delay
6. Monitor network requests

**Expected Results**:
- Only one API call after debounce period (300ms)
- No excessive API calls during typing

---

### Test 3: Add Ticker - Duplicate Detection
**Objective**: Verify system prevents adding duplicate tickers

**Steps**:
1. Navigate to `/dashboard`
2. Ensure "AAPL" is already tracked
3. Type "AAPL" in search bar
4. Click on "Apple Inc." result
5. **Assert**: Error toast appears with duplicate message
6. **Assert**: Existing AAPL row is highlighted/pulsed
7. **Assert**: No duplicate row added to table
8. **Assert**: Table remains in consistent state

**Expected Results**:
- Clear error messaging
- Visual feedback on existing row
- No duplicate entries

---

### Test 4: Add Ticker - API Failure Rollback
**Objective**: Verify optimistic update is rolled back on API failure

**Steps**:
1. Mock API to return 500 error for addTrackedCompany
2. Navigate to `/dashboard`
3. Search for and select "TSLA"
4. **Assert**: Optimistic row appears immediately
5. **Assert**: After API failure, optimistic row is removed
6. **Assert**: Error toast appears
7. **Assert**: Search bar retains input (or cleared based on design)
8. **Assert**: Table returns to previous state

**Expected Results**:
- Graceful error handling
- UI rollback on failure
- Clear error messaging
- User can retry

---

### Test 5: Keyboard Navigation - Search and Select
**Objective**: Verify full keyboard navigation support

**Steps**:
1. Navigate to `/dashboard`
2. Press `CMD/CTRL + K` (if implemented)
3. **Assert**: Search bar receives focus
4. Type "APP"
5. **Assert**: Dropdown appears with results
6. Press `ArrowDown` key
7. **Assert**: First result is highlighted
8. Press `ArrowDown` again
9. **Assert**: Second result is highlighted
10. Press `Enter`
11. **Assert**: Highlighted ticker is added
12. Press `ESC` on search bar
13. **Assert**: Search input clears

**Expected Results**:
- Full keyboard navigation
- No mouse required for workflow
- Accessibility compliance

---

## Test Suite: Delete Ticker Flow (Enhanced)

### Test 6: Happy Path - Delete with Animation
**Objective**: Verify ticker deletion with smooth fade-out animation

**Steps**:
1. Navigate to `/dashboard` with tracked tickers
2. Click delete button on "AAPL" row
3. **Assert**: Confirmation dialog appears
4. Click "Remove" button
5. **Assert**: Row begins fade-out animation immediately
6. **Assert**: Row is removed from table after animation (< 150ms)
7. **Assert**: Success toast appears
8. **Assert**: Table layout adjusts smoothly
9. **Measure**: Time from confirmation to row removal

**Expected Results**:
- Smooth fade-out animation (150ms)
- Immediate visual feedback
- Total perceived latency < 200ms

---

### Test 7: Delete Ticker - API Failure Rollback
**Objective**: Verify row is restored if delete API fails

**Steps**:
1. Mock API to return error for deleteTrackedCompany
2. Navigate to `/dashboard`
3. Attempt to delete "AAPL"
4. Confirm deletion
5. **Assert**: Row begins fade-out
6. **Assert**: After API failure, row fades back in
7. **Assert**: Error toast appears
8. **Assert**: Row data is intact
9. **Assert**: User can retry deletion

**Expected Results**:
- Rollback animation on failure
- Data integrity maintained
- Clear error messaging

---

### Test 8: Delete Ticker - Cancel Dialog
**Objective**: Verify cancel button works correctly

**Steps**:
1. Navigate to `/dashboard`
2. Click delete on any ticker
3. **Assert**: Confirmation dialog opens
4. Click "Cancel" button
5. **Assert**: Dialog closes
6. **Assert**: Row remains in table
7. **Assert**: No API call made

**Expected Results**:
- Safe cancellation
- No unintended side effects

---

## Test Suite: Responsiveness and Performance

### Test 9: Rapid Sequential Operations
**Objective**: Verify system handles multiple rapid operations gracefully

**Steps**:
1. Navigate to `/dashboard`
2. Add "AAPL" via search
3. Immediately add "TSLA" (before first completes)
4. Immediately add "MSFT" (before second completes)
5. **Assert**: All three operations queue properly
6. **Assert**: All optimistic updates appear
7. **Assert**: All rows update with real data
8. **Assert**: No race conditions or UI jank
9. **Assert**: Final table state is correct

**Expected Results**:
- Graceful handling of concurrent operations
- No UI freezing or flickering
- Correct final state

---

### Test 10: Mobile Viewport - Inline Search
**Objective**: Verify inline search works well on mobile

**Steps**:
1. Set viewport to mobile size (375x667)
2. Navigate to `/dashboard`
3. **Assert**: Inline search bar is visible and usable
4. Tap search bar
5. **Assert**: Mobile keyboard appears
6. Type "AAPL"
7. **Assert**: Dropdown results are properly sized
8. Tap on result
9. **Assert**: New ticker appears in mobile card view
10. **Assert**: No horizontal scrolling issues

**Expected Results**:
- Mobile-optimized search experience
- No layout issues
- Touch-friendly targets

---

### Test 11: Large Dataset Performance
**Objective**: Verify performance with many tracked tickers

**Steps**:
1. Seed database with 50 tracked tickers
2. Navigate to `/dashboard`
3. **Assert**: Table loads within 2 seconds
4. Use search bar to add new ticker
5. **Assert**: Add operation remains fast (< 100ms optimistic)
6. Delete a ticker
7. **Assert**: Delete operation remains fast (< 150ms)
8. Scroll through table
9. **Assert**: No jank or performance degradation

**Expected Results**:
- Smooth performance with large datasets
- Consistent operation speed
- No memory leaks

---

## Test Suite: Accessibility

### Test 12: Screen Reader Support
**Objective**: Verify screen reader accessibility

**Steps**:
1. Enable screen reader simulation
2. Navigate to `/dashboard`
3. **Assert**: Search bar has proper ARIA label
4. **Assert**: Search results announce properly
5. Tab through table rows
6. **Assert**: Each row announces ticker info
7. **Assert**: Action buttons have aria-labels
8. Trigger add/delete operations
9. **Assert**: Status changes announce properly

**Expected Results**:
- Full screen reader support
- Meaningful ARIA labels
- Status announcements

---

### Test 13: Keyboard Focus Management
**Objective**: Verify proper focus management throughout workflows

**Steps**:
1. Navigate to `/dashboard`
2. Tab through UI elements
3. **Assert**: Focus order is logical
4. **Assert**: Focus indicators are visible
5. Add a ticker via keyboard
6. **Assert**: Focus returns to sensible location
7. Delete a ticker via keyboard
8. **Assert**: Focus doesn't get lost

**Expected Results**:
- Logical tab order
- Visible focus indicators
- Smart focus management

---

## Test Suite: Edge Cases

### Test 14: Network Timeout Handling
**Objective**: Verify graceful handling of slow/timeout API calls

**Steps**:
1. Mock API with 5-second delay
2. Add ticker via search
3. **Assert**: Loading state persists
4. **Assert**: User can still interact with UI
5. After timeout, **Assert**: Error handling
6. **Assert**: User can retry

**Expected Results**:
- Non-blocking operations
- Timeout handling
- Retry capability

---

### Test 15: Empty State Experience
**Objective**: Verify inline search works well in empty state

**Steps**:
1. Navigate to `/dashboard` with no tickers
2. **Assert**: Empty state message visible
3. **Assert**: Inline search bar is prominent
4. **Assert**: Helpful instructional text
5. Add first ticker
6. **Assert**: Smooth transition from empty to populated

**Expected Results**:
- Clear empty state
- Obvious next action
- Smooth state transitions

---

## Performance Benchmarks

### Target Metrics
- **Optimistic Add Render**: < 100ms
- **Full Add Operation**: < 500ms
- **Optimistic Delete Render**: < 150ms
- **Full Delete Operation**: < 300ms
- **Search Debounce**: 300ms
- **Animation Duration**:
  - Add: 200ms fade + slide
  - Delete: 150ms fade
- **API Call Reduction**: 50% fewer calls vs old implementation

### Comparison with Old Modal Flow
| Metric | Old (Modal) | New (Inline) | Improvement |
|--------|-------------|--------------|-------------|
| Clicks to Add | 2 | 1 | 50% |
| Time to Search | ~500ms | 0ms | Instant |
| Modal Overhead | ~200ms | 0ms | Eliminated |
| Perceived Add Latency | ~700ms | <100ms | 86% |
| User Cognitive Load | High | Low | Significant |

---

## Running Tests Locally

```bash
# Install dependencies
npm install

# Run all Playwright tests
npx playwright test

# Run specific test file
npx playwright test dashboard-ticker-management.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui

# Run specific test
npx playwright test -g "Happy Path - Add Ticker"

# Generate HTML report
npx playwright show-report

# Debug mode
npx playwright test --debug
```

---

## Test Implementation Template

```typescript
// __tests__/playwright/dashboard-ticker-management.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Dashboard Ticker Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to dashboard
    await page.goto('/sign-in');
    await page.fill('[name="identifier"]', process.env.TEST_EMAIL);
    await page.fill('[name="password"]', process.env.TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('Happy Path - Add Ticker via Inline Search', async ({ page }) => {
    // Find inline search (should be visible, not in modal)
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    // Type and wait for results
    await searchInput.fill('AAPL');
    await page.waitForTimeout(350); // Debounce + margin

    // Click result
    const result = page.locator('text=Apple Inc.').first();
    await expect(result).toBeVisible();

    const startTime = Date.now();
    await result.click();

    // Verify optimistic update appears quickly
    const newRow = page.locator('table tr', { hasText: 'AAPL' });
    await expect(newRow).toBeVisible({ timeout: 100 });
    const optimisticTime = Date.now() - startTime;

    // Verify final state
    await expect(newRow).not.toHaveClass(/loading/);
    await expect(searchInput).toHaveValue('');
    await expect(page.locator('text=Added AAPL')).toBeVisible();

    const totalTime = Date.now() - startTime;

    console.log(`Optimistic render: ${optimisticTime}ms`);
    console.log(`Total operation: ${totalTime}ms`);

    expect(optimisticTime).toBeLessThan(100);
    expect(totalTime).toBeLessThan(500);
  });

  // Additional tests follow same pattern...
});
```
