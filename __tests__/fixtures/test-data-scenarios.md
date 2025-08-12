# Test Data Scenarios for SEC Filing Cron Job Testing

## Overview
This document defines comprehensive test data scenarios for validating the SEC filing cron job monitoring system. Each scenario represents real-world conditions that the system must handle robustly.

## Filing Content Test Data

### 1. Standard Filing Scenarios

#### Tesla 10-K Sample (Normal Large Filing)
**File**: `__tests__/fixtures/filings/tesla-10k-sample.html`
**Characteristics**:
- Size: ~2MB HTML content
- Contains all standard 10-K sections
- Inline XBRL formatting
- Financial tables with complex structure
- Risk factor sections
- Management discussion

**Test Usage**:
- Normal processing flow validation
- AI summarization accuracy testing
- Parser performance benchmarking

#### Apple 10-Q Sample (Quarterly Report)
**File**: `__tests__/fixtures/filings/apple-10q-sample.html`
**Characteristics**:
- Size: ~800KB HTML content
- Quarterly financial data
- Forward-looking statements
- Condensed financial statements

**Test Usage**:
- Different filing type validation
- Quarterly vs annual content comparison
- Processing time benchmarks

### 2. Edge Case Filing Content

#### Minimal Filing (Empty Content)
**File**: `__tests__/fixtures/filings/minimal-filing.html`
**Content**:
```html
<html>
<head><title>SEC Filing</title></head>
<body>
<div>This filing contains minimal content for testing purposes.</div>
</body>
</html>
```
**Test Usage**:
- Fallback summary generation
- Error handling validation
- Minimum content processing

#### Corrupted Filing (Malformed HTML)
**File**: `__tests__/fixtures/filings/corrupted-filing.html`
**Content**:
```html
<html>
<head><title>Corrupted Filing</title>
<body>
<div>This filing has malformed HTML structure...
<table><tr><td>Incomplete table
<div>Unclosed tags
```
**Test Usage**:
- Parser error handling
- Recovery mechanisms
- Error logging validation

#### Large Filing (Memory Stress Test)
**File**: `__tests__/fixtures/filings/large-filing.html`
**Characteristics**:
- Size: ~50MB HTML content
- Extensive tables and data
- Multiple embedded documents
- Complex nested structure

**Test Usage**:
- Memory usage validation
- Performance stress testing
- Timeout handling

#### Non-English Filing
**File**: `__tests__/fixtures/filings/non-english-filing.html`
**Characteristics**:
- Contains Chinese/Japanese characters
- Special Unicode characters
- Mixed language content

**Test Usage**:
- Character encoding handling
- AI processing of non-English content
- Database storage validation

### 3. Inline XBRL Test Cases

#### Standard Inline XBRL
**File**: `__tests__/fixtures/filings/inline-xbrl-standard.html`
**Content Structure**:
```html
<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL">
<ix:header>
  <ix:hidden>
    <!-- XBRL data elements -->
  </ix:hidden>
</ix:header>
<body>
  <div>
    Revenue for the year: <ix:nonFraction name="us-gaap:Revenues" contextRef="FY2023" unitRef="USD" decimals="-6">1000000000</ix:nonFraction>
  </div>
</body>
</html>
```

#### Complex Inline XBRL with Tables
**File**: `__tests__/fixtures/filings/inline-xbrl-complex.html`
**Test Usage**:
- Enhanced parser validation
- XBRL extraction accuracy
- Table parsing performance

## RSS Feed Test Data

### 1. Standard RSS Feeds

#### Normal RSS Feed
**File**: `__tests__/fixtures/rss/normal-tesla-feed.xml`
**Content**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>TESLA INC (0001318605) (CIK 0001318605)</title>
  <link>https://www.sec.gov/cgi-bin/browse-edgar</link>
  <item>
    <title>10-Q - 0001628280-24-123456</title>
    <link>https://www.sec.gov/Archives/edgar/data/1318605/000162828024123456/tsla-20240930.htm</link>
    <description>10-Q filed on 2024-01-15</description>
    <pubDate>Mon, 15 Jan 2024 18:30:00 EST</pubDate>
  </item>
  <item>
    <title>8-K - 0001628280-24-123457</title>
    <link>https://www.sec.gov/Archives/edgar/data/1318605/000162828024123457/tsla-20240115.htm</link>
    <description>8-K filed on 2024-01-15</description>
    <pubDate>Mon, 15 Jan 2024 16:45:00 EST</pubDate>
  </item>
</channel>
</rss>
```

### 2. Edge Case RSS Feeds

#### Empty RSS Feed
**File**: `__tests__/fixtures/rss/empty-feed.xml`
**Content**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>COMPANY ABC (1234567890) (CIK 1234567890)</title>
  <link>https://www.sec.gov/cgi-bin/browse-edgar</link>
  <!-- No items -->
</channel>
</rss>
```

#### Malformed RSS Feed
**File**: `__tests__/fixtures/rss/malformed-feed.xml`
**Content**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>COMPANY ABC</title>
  <item>
    <title>10-K - Incomplete
    <link>https://sec.gov/incomplete
    <!-- Missing closing tags -->
```

#### Duplicate Entries RSS Feed
**File**: `__tests__/fixtures/rss/duplicate-entries-feed.xml`
**Content**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>TEST COMPANY (1111111111) (CIK 1111111111)</title>
  <item>
    <title>10-Q - 0001628280-24-123456</title>
    <link>https://www.sec.gov/filing-123456</link>
    <pubDate>Mon, 15 Jan 2024 18:30:00 EST</pubDate>
  </item>
  <item>
    <title>10-Q - 0001628280-24-123456</title>
    <link>https://www.sec.gov/filing-123456</link>
    <pubDate>Mon, 15 Jan 2024 18:30:00 EST</pubDate>
  </item>
</channel>
</rss>
```

## Database Test Data

### 1. User and Subscription Scenarios

#### High-Activity User
```javascript
{
  id: 'user-high-activity',
  email: 'power.user@example.com',
  name: 'Power User',
  tickers: ['TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'], // 5 tickers
  subscriptions: 'all-filings',
  notifications: true
}
```

#### Minimal User
```javascript
{
  id: 'user-minimal',
  email: 'minimal@example.com',
  name: 'Minimal User',
  tickers: ['TSLA'], // 1 ticker
  subscriptions: '10-K-only',
  notifications: true
}
```

#### Inactive User (No Notifications)
```javascript
{
  id: 'user-inactive',
  email: 'inactive@example.com',
  name: 'Inactive User',
  tickers: ['TSLA', 'AAPL'],
  subscriptions: 'none',
  notifications: false
}
```

#### Invalid Email User
```javascript
{
  id: 'user-invalid-email',
  email: 'invalid-email-format',
  name: 'Invalid Email User',
  tickers: ['TSLA'],
  subscriptions: 'all-filings',
  notifications: true
}
```

### 2. Ticker and Company Data

#### Active High-Volume Ticker (Tesla)
```javascript
{
  id: 'ticker-tsla',
  cik: '0001318605',
  symbol: 'TSLA',
  companyName: 'Tesla, Inc.',
  subscriberCount: 50,
  lastChecked: null,
  isActive: true
}
```

#### Moderate Activity Ticker (Apple)
```javascript
{
  id: 'ticker-aapl',
  cik: '0000320193',
  symbol: 'AAPL',
  companyName: 'Apple Inc.',
  subscriberCount: 25,
  lastChecked: '2024-01-15T10:00:00Z',
  isActive: true
}
```

#### Inactive Ticker (No Subscribers)
```javascript
{
  id: 'ticker-inactive',
  cik: '0001234567',
  symbol: 'INACTIVE',
  companyName: 'Inactive Company',
  subscriberCount: 0,
  lastChecked: '2024-01-01T00:00:00Z',
  isActive: false
}
```

#### Invalid CIK Ticker
```javascript
{
  id: 'ticker-invalid',
  cik: 'INVALID-CIK',
  symbol: 'INVALID',
  companyName: 'Invalid Company',
  subscriberCount: 1,
  isActive: true
}
```

### 3. Filing Processing Scenarios

#### Standard Unprocessed Filing
```javascript
{
  id: 'filing-standard',
  accessionNumber: '0001628280-24-123456',
  filingType: '10-Q',
  filingDate: '2024-01-15',
  filingUrl: 'https://sec.gov/filing-standard',
  tickerMonitoringId: 'ticker-tsla',
  processed: false,
  rssEntryDate: '2024-01-15T18:30:00Z'
}
```

#### Large Filing (10-K)
```javascript
{
  id: 'filing-large',
  accessionNumber: '0001628280-24-123457',
  filingType: '10-K',
  filingDate: '2024-03-15',
  filingUrl: 'https://sec.gov/filing-large',
  tickerMonitoringId: 'ticker-tsla',
  processed: false,
  rssEntryDate: '2024-03-15T16:00:00Z'
}
```

#### Corrupted Filing URL
```javascript
{
  id: 'filing-corrupted',
  accessionNumber: '0001628280-24-999999',
  filingType: '8-K',
  filingDate: '2024-01-10',
  filingUrl: 'https://sec.gov/non-existent-filing',
  tickerMonitoringId: 'ticker-tsla',
  processed: false,
  rssEntryDate: '2024-01-10T14:30:00Z'
}
```

#### Already Processed Filing
```javascript
{
  id: 'filing-processed',
  accessionNumber: '0001628280-24-111111',
  filingType: '10-Q',
  filingDate: '2024-01-01',
  filingUrl: 'https://sec.gov/filing-processed',
  tickerMonitoringId: 'ticker-tsla',
  processed: true,
  rssEntryDate: '2024-01-01T12:00:00Z'
}
```

## AI Response Test Data

### 1. Successful AI Responses

#### Standard Summary Response
```javascript
{
  summary: "Tesla reported strong Q3 2024 results with revenue of $23.4 billion, up 15% year-over-year. Net income reached $1.85 billion, beating analyst expectations. The company delivered 435,059 vehicles in the quarter and continues to expand production capacity.",
  keyPoints: [
    "Revenue increased 15% to $23.4 billion",
    "Net income of $1.85 billion exceeded expectations", 
    "Vehicle deliveries of 435,059 units",
    "Production capacity expansion ongoing"
  ],
  tokensUsed: 1856,
  inputTokens: 1500,
  outputTokens: 356,
  model: 'claude-3-opus-20240229',
  cost: 0.045
}
```

#### Complex Financial Summary
```javascript
{
  summary: "Apple's Q1 2024 earnings showed mixed results with iPhone revenue declining 10% to $69.7 billion due to market saturation, while Services revenue grew 20% to $23.1 billion. The company announced a $110 billion share buyback program and increased dividend by 4%.",
  keyPoints: [
    "iPhone revenue declined 10% to $69.7 billion",
    "Services revenue surged 20% to $23.1 billion",
    "$110 billion share buyback program announced",
    "Dividend increased by 4%",
    "Market saturation impacting hardware sales"
  ],
  tokensUsed: 2341,
  cost: 0.067
}
```

### 2. Fallback Responses

#### AI Service Unavailable Fallback
```javascript
{
  summary: "This is a fallback summary for Tesla, Inc. (TSLA) 10-Q filing dated 2024-01-15. AI-powered summary generation is currently unavailable. Please review the original filing for complete details.",
  keyPoints: [
    "This is a 10-Q filing for Tesla, Inc. (TSLA)",
    "AI-powered summary generation failed",
    "Please review the original filing for complete details"
  ],
  error: "Anthropic API service unavailable"
}
```

#### Rate Limited Fallback
```javascript
{
  summary: "Fallback summary for Apple Inc. (AAPL) 8-K filing. AI summarization is temporarily rate limited. This filing was processed on 2024-01-15.",
  keyPoints: [
    "This is an 8-K filing for Apple Inc. (AAPL)",
    "AI summarization temporarily rate limited",
    "Filing processed with fallback summary"
  ],
  error: "Rate limit exceeded after retries"
}
```

## Email Template Test Data

### 1. Standard Email Scenarios

#### Single Filing Notification
```javascript
{
  recipientEmail: 'user@example.com',
  recipientName: 'John Doe',
  companyName: 'Tesla, Inc.',
  ticker: 'TSLA',
  filingType: '10-Q',
  filingDate: '2024-01-15',
  summary: 'Tesla reported strong quarterly results...',
  filingUrl: 'https://sec.gov/filing-123456',
  unsubscribeUrl: 'https://app.tldrsec.com/settings/notifications',
  preferencesUrl: 'https://app.tldrsec.com/settings'
}
```

#### Multiple Filings Digest
```javascript
{
  recipientEmail: 'power.user@example.com',
  recipientName: 'Power User',
  tickerGroups: [
    {
      symbol: 'TSLA',
      companyName: 'Tesla, Inc.',
      filings: [
        {
          filingType: '10-Q',
          filingDate: '2024-01-15',
          summaryText: 'Tesla Q3 results...',
          summaryUrl: 'https://app.tldrsec.com/summary/123'
        }
      ]
    },
    {
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      filings: [
        {
          filingType: '8-K',
          filingDate: '2024-01-16',
          summaryText: 'Apple announces...',
          summaryUrl: 'https://app.tldrsec.com/summary/124'
        }
      ]
    }
  ]
}
```

### 2. Edge Case Email Scenarios

#### Very Long Summary Content
```javascript
{
  recipientEmail: 'test@example.com',
  companyName: 'Test Company',
  ticker: 'TEST',
  filingType: '10-K',
  summary: 'This is an extremely long summary that contains...'.repeat(100), // Very long content
  filingDate: '2024-01-15'
}
```

#### Special Characters in Company Name
```javascript
{
  recipientEmail: 'test@example.com',
  companyName: 'Company with Special Chars & Symbols <TEST>',
  ticker: 'SPEC',
  filingType: '10-Q',
  summary: 'Summary with "quotes" and special chars...',
  filingDate: '2024-01-15'
}
```

## Performance Test Data Sets

### 1. High Volume Scenarios

#### Earnings Season Dataset
- 50 active tickers
- 200 unprocessed filings
- 1000 total subscribers
- Average 5 subscribers per ticker
- Mix of filing types (60% 10-Q, 30% 8-K, 10% 10-K)

#### Peak Load Dataset
- 100 active tickers
- 500 unprocessed filings
- 5000 total subscribers
- Average 10 subscribers per ticker
- Large filing sizes (average 5MB each)

### 2. Stress Test Scenarios

#### Memory Stress Dataset
- 10 extremely large filings (50MB+ each)
- Complex inline XBRL structure
- Deep nested HTML content
- Multiple embedded tables

#### Concurrent Processing Dataset
- 20 simultaneous RSS checks
- Mixed response times (100ms to 5s)
- Some timeouts and failures
- High database concurrency

## Error Simulation Data

### 1. Network Failures

#### SEC Server Errors
```javascript
const secErrors = [
  { status: 503, message: 'Service temporarily unavailable' },
  { status: 429, message: 'Rate limit exceeded' },
  { status: 404, message: 'Filing not found' },
  { status: 500, message: 'Internal server error' },
  { error: 'ETIMEDOUT', message: 'Connection timeout' },
  { error: 'ECONNRESET', message: 'Connection reset' }
];
```

#### Anthropic API Errors
```javascript
const anthropicErrors = [
  { status: 429, message: 'Rate limit exceeded' },
  { status: 401, message: 'Authentication failed' },
  { status: 500, message: 'Internal server error' },
  { status: 503, message: 'Service unavailable' },
  { error: 'MODEL_UNAVAILABLE', message: 'Model not available' },
  { error: 'INVALID_RESPONSE', message: 'Malformed response' }
];
```

### 2. Database Failures

#### Connection Issues
```javascript
const dbErrors = [
  { error: 'CONNECTION_TIMEOUT', message: 'Database connection timeout' },
  { error: 'CONNECTION_REFUSED', message: 'Connection refused' },
  { error: 'POOL_EXHAUSTED', message: 'Connection pool exhausted' },
  { error: 'UNIQUE_CONSTRAINT', message: 'Unique constraint violation' },
  { error: 'FOREIGN_KEY', message: 'Foreign key constraint failed' }
];
```

This comprehensive test data set ensures thorough validation of the SEC filing cron job system across all possible scenarios and edge cases.