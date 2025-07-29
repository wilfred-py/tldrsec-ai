# SEC Filing Monitoring Cron System

## Overview

Cost-optimized serverless cron system for monitoring SEC filings using RSS feeds. Runs single job per ticker at 30-minute intervals, overriding user tier preferences for maximum efficiency.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Vercel Cron   │───▶│  RSS Feed Check  │───▶│ Process Filings │
│   (30 minutes)  │    │  (All Tickers)   │    │ (Batch of 5)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │ Database Storage │    │  Email Notify   │
                    │ (New Accessions) │    │ (All Subscribers)│
                    └──────────────────┘    └─────────────────┘
```

## Key Features

- **Single Job Per Ticker**: One monitoring job for all tickers, ignoring user tiers
- **RSS-Based Detection**: Uses SEC's RSS feeds (updated every 10 minutes)
- **Cost Optimization**: Batch processing, rate limiting, efficient caching
- **Daily Processing**: Once per day during market hours (Vercel Hobby plan)
- **Automatic Scaling**: Serverless architecture scales with subscription growth

## Database Schema

### TickerMonitoring
```sql
- id: UUID (Primary Key)
- cik: String (Unique company identifier)
- symbol: String (Ticker symbol)
- companyName: String
- isActive: Boolean
- rssUrl: String (SEC RSS feed URL)
- lastChecked: DateTime
- lastAccessionSeen: String
- subscriberCount: Integer
```

### RssFilingCheck
```sql
- id: UUID (Primary Key)
- tickerMonitoringId: String (Foreign Key)
- accessionNumber: String (Unique)
- filingType: String (8-K, 10-K, etc.)
- filingDate: DateTime
- filingUrl: String
- processed: Boolean
```

### User (Enhanced)
```sql
- subscriptionTier: Enum (FREE, PREMIUM, ENTERPRISE)
```

## Setup Instructions

### 1. Environment Variables
```bash
# Add to Vercel environment or .env.local
CRON_SECRET=your-secure-random-string
DATABASE_URL=your-neon-postgres-url
ANTHROPIC_API_KEY=your-claude-api-key
RESEND_API_KEY=your-email-api-key
```

### 2. Database Migration
```bash
# Generate Prisma client with new schema
npm run db:generate

# Push schema changes to Neon
npm run db:push
```

### 3. Vercel Deployment
```bash
# Deploy with cron configuration
vercel deploy --prod

# Verify cron jobs are registered
vercel crons ls
```

### 4. Verify Setup
```bash
# Test cron endpoint manually
curl -X GET "https://your-app.vercel.app/api/cron/monitor-sec-filings" \
  -H "Authorization: Bearer your-cron-secret"
```

## Cost Optimization Features

### Rate Limiting
- **RSS Checks**: Max 3 concurrent ticker checks
- **Filing Processing**: 5 filings per cron run
- **API Calls**: 500ms delay between requests

### Batch Processing
- Process multiple subscribers per filing
- Single email template for all notifications
- Efficient database queries with proper indexing

### Smart Caching
- Store RSS results to avoid duplicate fetches
- Track processed accession numbers
- Automatic cleanup of old data (30+ days)

### Error Handling
- Graceful failure with retry logic
- Mark failed filings as processed to avoid infinite loops
- Comprehensive logging for debugging

## Monitoring & Metrics

### Cron Job Statistics
```typescript
interface ProcessingStats {
  tickersChecked: number;
  newFilingsFound: number;
  filingsProcessed: number;
  emailsSent: number;
  errors: number;
  durationMs: number;
}
```

### Key Performance Indicators
- **Average Processing Time**: < 2 minutes per run
- **Cost Per Filing**: < $0.10 per summary
- **Error Rate**: < 5% of processed filings
- **Email Delivery Rate**: > 95% success

## RSS Feed Details

### SEC RSS URL Format
```
https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={CIK}&output=atom
```

### RSS Update Schedule
- **Frequency**: Every 10 minutes (SEC updates)
- **Cron Frequency**: Daily (Vercel Hobby limitation)
- **Operating Hours**: Monday-Friday, 6am-10pm EST
- **Content**: New filings with accession numbers and URLs

### Sample RSS Entry
```xml
<entry>
  <id>000110465925042659</id>
  <title>8-K - Current report filing</title>
  <summary>Filed: 2025-01-15</summary>
  <link href="https://www.sec.gov/Archives/edgar/data/1318605/000110465925042659"/>
  <updated>2025-01-15T16:30:00Z</updated>
</entry>
```

## Operational Considerations

### Subscription Management
- Tickers activated only when first user subscribes
- Automatic deactivation when no subscribers remain
- Subscriber count tracking for prioritization

### Data Retention
- **Processed Filings**: 30 days
- **Summaries**: Permanent storage
- **RSS Checks**: Auto-cleanup after processing

### Scalability
- **Current Capacity**: 100+ tickers, 1000+ subscribers
- **Scaling Strategy**: Horizontal scaling via additional cron frequencies
- **Performance**: Sub-linear cost growth with subscriber increases

## Troubleshooting

### Common Issues

**Cron Not Running**
```bash
# Check Vercel cron status
vercel crons ls

# Verify environment variables
vercel env ls
```

**RSS Parsing Errors**
```bash
# Test RSS URL manually
curl "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1318605&output=atom"
```

**Database Connection Issues**
```bash
# Test database connectivity
npm run db:test
```

### Debugging
- Check Vercel function logs for detailed error traces
- Monitor database query performance
- Verify SEC rate limiting compliance

## Cost Analysis

### Current Costs (Monthly)
- **Vercel Cron**: Free tier (Hobby plan - daily crons only)
- **Database**: ~$25/month (Neon Pro)
- **Claude API**: ~$50/month (5000 summaries)
- **Email**: ~$5/month (Resend)

**Total**: ~$80/month for 5000 summaries across 100 tickers

### Cost Per User
- **All Users**: Daily summary processing due to Hobby plan limitations
- **Marginal Cost**: $0.016 per summary
- **Upgrade Path**: Vercel Pro ($20/month) enables 30-minute real-time processing

### Scaling Strategy
- **Phase 1**: Hobby plan with daily processing for validation
- **Phase 2**: Upgrade to Pro plan when paying customers validate demand
- **Phase 3**: Real-time 30-minute processing for premium experience

This approach minimizes upfront costs while maintaining growth flexibility.