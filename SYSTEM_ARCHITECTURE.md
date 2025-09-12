# tldrSEC-AI System Architecture

## Overview

tldrSEC-AI is a dual-deployment system that monitors SEC filings, generates AI-powered summaries, and delivers them to users via email. The architecture separates web serving from scheduled task execution for optimal performance and cost efficiency.

## Deployment Model

### Primary Components

#### 1. Vercel (Web Application) 
**Domain:** `https://tldrsec.app`  
**Purpose:** User-facing web application and API endpoints

**Responsibilities:**
- User authentication and dashboard (Clerk integration)
- SEC filing summarization pipeline (`/api/cron/unified`)
- Database operations (Neon PostgreSQL)
- Email notifications (Resend integration)
- AI processing (Anthropic Claude API)

**Key Features:**
- Available 24/7 for users
- Handles HTTP API requests
- Manages user subscriptions and tickers
- Processes SEC filings and generates summaries
- Sends email notifications to subscribers

#### 2. Cloudflare Workers (Cron Execution)
**Purpose:** Scheduled task execution only

**Responsibilities:**
- Executes the Worker script every 10 minutes
- Calls Vercel endpoint: `https://tldrsec.app/api/cron/unified`
- No web server or user-facing components

**Configuration:**
- Worker Script: `index.js`
- Cron Schedule: `*/10 * * * *` (Every 10 minutes)
- Environment: `PUBLIC_URL=https://tldrsec.app`, `CRON_SECRET=<secure-key>`

## Data Flow

### SEC Filing Processing Workflow

```
Cloudflare Cron (Every 10 min)
    ↓
HTTP Request to Vercel
    ↓
/api/cron/unified endpoint
    ↓
/api/cron/tier-aware execution
    ↓
1. Monitor SEC RSS feeds for new filings
2. Identify eligible users based on subscription tiers
3. Process unprocessed filings for each user
4. Generate AI summaries (Claude API)
5. Store summaries in database (Neon PostgreSQL)
6. Send email notifications (Resend)
    ↓
Response back to Cloudflare
    ↓
Cloudflare Worker exits
```

### User Interaction Flow

```
User visits https://tldrsec.app
    ↓
Vercel serves Next.js application
    ↓
User authenticates (Clerk)
    ↓
User selects tickers to monitor
    ↓
Data stored in Neon PostgreSQL
    ↓
User receives summaries via email (Resend)
```

## Technology Stack

### Core Framework
- **Next.js 15** with App Router architecture
- **TypeScript** throughout the codebase
- **Prisma ORM** with PostgreSQL (Neon)
- **Clerk** for authentication
- **shadcn/ui** components with Tailwind CSS

### External Services
- **Anthropic Claude API** - AI summarization
- **Resend** - Email delivery
- **SEC EDGAR** - Filing data source
- **Neon PostgreSQL** - Database hosting

### Deployment Platforms
- **Vercel** - Web application hosting
- **Cloudflare Workers** - Cron job execution

## Database Schema

### Core Tables
- **User** - User accounts with subscription tiers
- **Ticker** - Companies users track
- **Summary** - AI-generated filing summaries
- **SecFiling** - SEC filing records
- **JobQueue** - Background job processing
- **CikMapping** - Company ticker to CIK mappings

## Security

### Authentication & Authorization
- **Clerk Integration** - User authentication
- **CRON_SECRET** - Secure cron endpoint access
- **API Keys** - Anthropic and Resend API access
- **Rate Limiting** - Prevents API abuse
- **Input Validation** - All user inputs sanitized

### Data Protection
- **Environment Variables** - Sensitive data protection
- **Database Encryption** - Neon built-in encryption
- **HTTPS Only** - All communications encrypted
- **Access Control** - User-specific data isolation

## Monitoring & Observability

### Logging
- **Cloudflare Logs** - Cron execution monitoring
- **Vercel Logs** - Web application monitoring
- **Database Logs** - Neon PostgreSQL monitoring

### Health Checks
- **Vercel** - `/api/health` endpoint
- **Database** - Connection health monitoring
- **Email** - Delivery status tracking

### Metrics
- **User Processing** - Subscription tier metrics
- **Filing Processing** - Success/failure rates
- **Cost Tracking** - AI API usage monitoring
- **Email Delivery** - Open/click rates

## Cost Optimization

### Resource Allocation
- **Vercel** - Optimized for web traffic patterns
- **Cloudflare Workers** - Minimal resources for cron execution only
- **Database** - Connection pooling and query optimization
- **AI API** - Token usage tracking and limits

### Subscription Tiers
- **FREE** - 3 filings max, $0.20 daily limit
- **PROFESSIONAL** - 5 filings max, $0.60 daily limit  
- **ENTERPRISE** - 8 filings max, $1.25 daily limit
- **INSTITUTION** - 10 filings max, $2.50 daily limit

## Disaster Recovery

### Data Backup
- **Neon PostgreSQL** - Automated backups
- **Configuration** - Version controlled (Git)
- **Environment Variables** - Secure backup storage

### Service Recovery
- **Vercel** - Automatic scaling and recovery
- **Cloudflare Workers** - Automatic execution on schedule
- **Database** - Multi-region availability (Neon)

## Development Workflow

### Testing Strategy
- **Unit Tests** - Jest with ESM configuration
- **Integration Tests** - Critical workflow testing
- **E2E Tests** - Complete pipeline validation
- **Security Tests** - Vulnerability scanning

### Deployment Process
1. **Development** - Local testing with mock data
2. **Staging** - Vercel preview deployments
3. **Production** - Automated deployment from main branch
4. **Monitoring** - Real-time health checks

## Performance Characteristics

### Response Times
- **Web Dashboard** - < 2s page loads
- **API Endpoints** - < 5s response times
- **Cron Processing** - < 10 minutes per execution
- **Email Delivery** - < 30 seconds

### Scalability
- **Users** - Supports thousands of concurrent users
- **Filings** - Processes hundreds of filings per cycle
- **Storage** - Unlimited summary storage via Neon
- **Processing** - Tier-based throttling prevents overload

## Future Considerations

### Potential Enhancements
- **Real-time notifications** - WebSocket integration
- **Mobile app** - React Native development
- **Advanced analytics** - User engagement tracking
- **International expansion** - Multi-language support

### Scaling Strategies
- **Microservices** - Service decomposition as needed
- **Caching** - Redis integration for performance
- **CDN** - Global content delivery
- **Load Balancing** - Multi-region deployment

---

This architecture provides a robust, scalable foundation for SEC filing monitoring and AI-powered summarization while maintaining cost efficiency and operational simplicity.
