# SEO & LLM Discoverability Implementation Plan

**Date**: 2025-11-16 22:50:00 CST
**Git Commit**: d88957f5b53db498eb9514c8377f483b2e46b0bb
**Branch**: main
**Repository**: tldrsec-ai

---

## Overview

Transform tldrsec.app into a highly discoverable platform for both traditional search engines (Google, Bing) and AI-powered search tools (ChatGPT, Claude, Perplexity, Gemini) through systematic SEO optimization and programmatic content generation.

**Primary Goal**: Drive organic traffic by improving searchability via SEO, programmatic SEO, and LLM optimization techniques.

**Secondary Goal**: Track unique visitors and waitlist conversion rates using Vercel Analytics (already sufficient - no additional dashboard needed).

---

## Current State Analysis

### Analytics Discrepancy Resolved
- **Cloudflare shows higher numbers**: Counts ALL HTTP requests at DNS/proxy layer (bots, crawlers, API calls)
- **Vercel Analytics shows lower numbers**: Only counts real user page views with JavaScript (more accurate)
- **Verdict**: Vercel Analytics is correct and sufficient for conversion tracking

### Critical SEO Issues Found

1. **Domain Inconsistency** - Three different domains in use:
   - `app/layout.tsx:23` → `https://tldrsec.com`
   - `app/sitemap.ts:4` → `https://tldrsec.app`
   - `components/structured-data.tsx:13,16` → `https://tldrsec.ai`
   - `app/page.tsx:27` → `https://tldrsec.app` (canonical)

2. **Missing SEO Metadata** - Dynamic pages lack optimization:
   - `app/summary/[id]/page.tsx` has no `generateMetadata()` function
   - No OpenGraph tags for social sharing
   - No canonical URLs
   - No structured data (Article schema)

3. **Sitemap-Page Mismatch** - 4 pages listed but don't exist:
   - `/pricing`
   - `/about`
   - `/privacy`
   - `/terms`

4. **Missing Assets**:
   - `/public/og-image.png` referenced but doesn't exist
   - No social preview images

5. **Unused Components**:
   - Advanced newsletter schema exists (`components/seo/newsletter-schema.tsx`) but not rendered

### SEO Content Gaps

**Current State**: Only 2 marketing pages
- `/` - Homepage
- `/newsletter` - Newsletter landing

**Missing Educational Content**:
- Zero SEC filing type guides (10-K, 10-Q, 8-K explanations)
- No "how it works" pages
- No investor education resources
- No blog or content marketing
- No comparison pages (vs competitors)

### Programmatic SEO Opportunity

**Available Data Sources**:
- `Ticker` model - Company symbols/names
- `Summary` model - Filing summaries with metadata
- `CikMapping` model - Thousands of companies with SIC codes
- `FORTUNE_500_FOCUS` - 20 major companies hardcoded
- Form Registry - 20+ form types with descriptions

**Potential Scale**: 2,000+ pages from existing data

---

## Desired End State

### Technical SEO Excellence
✅ Single consistent domain (`tldrsec.app`) across all files
✅ Complete metadata on all pages (title, description, OG tags, canonical URLs)
✅ Dynamic sitemap generated from database (summaries, companies, filing types)
✅ Comprehensive structured data (WebSite, Organization, Article, FAQPage, FinancialService schemas)
✅ Optimized Core Web Vitals (LCP <2.5s, INP <200ms, CLS <0.1)
✅ Social preview images for all major pages

### Programmatic SEO Pages
✅ 2,000+ company pages (`/company/[ticker]`)
✅ 20+ filing type education pages (`/filings/[type]`)
✅ Company-specific filing histories (`/company/[ticker]/[type]`)
✅ Sector/industry pages (`/sector/[sector]`)
✅ Date-based archives (`/filings/[year]/[quarter]`)

### LLM Discoverability
✅ FAQ schemas on all educational pages (40-50% ChatGPT citation boost)
✅ Answer-first content structure (quotable first sentences)
✅ AI crawler configuration (robots.txt for GPTBot, ClaudeBot, PerplexityBot, Google-Extended)
✅ `llms.txt` file for experimental AI indexing
✅ Comparison tables and structured lists
✅ Original research and data visualizations

### Content Marketing
✅ 10+ initial blog posts on SEC filing analysis
✅ 5+ comparison pages (tldrsec vs competitors)
✅ Step-by-step "how to read SEC filings" guides
✅ Company vs company comparison pages
✅ Industry-specific landing pages

### Verification

**Automated Checks**:
- ✅ All pages return 200 status codes
- ✅ Sitemap validates against XML schema
- ✅ Structured data validates in Google Rich Results Test
- ✅ Lighthouse SEO score >90
- ✅ Core Web Vitals pass thresholds
- ✅ No broken internal links

**Manual Validation**:
- ✅ Google Search Console shows indexed pages increasing
- ✅ ChatGPT/Perplexity cite tldrsec.app when asked about SEC filing tools
- ✅ Organic traffic grows 20%+ month-over-month
- ✅ Social shares show correct OG images
- ✅ Mobile rendering looks correct

---

## What We're NOT Doing

❌ Building a custom analytics dashboard (Vercel Analytics sufficient)
❌ Migrating from Vercel to another hosting platform
❌ Creating a CMS (content managed via code/database)
❌ Building a separate mobile app
❌ Implementing server-side A/B testing for SEO (use client-side)
❌ Creating user-generated content sections
❌ Adding comments or forums
❌ Building an affiliate program (not part of this phase)
❌ Creating video content or podcasts
❌ Internationalization (English-only for now)

---

## Implementation Approach

### Strategy

1. **Fix Critical Issues First** - Standardize domain, add missing metadata, create OG images
2. **Build Foundation** - Programmatic page templates with proper SEO
3. **Scale Content** - Generate thousands of pages from database
4. **Optimize for AI** - LLM-friendly content structure and schemas
5. **Monitor & Iterate** - Track rankings, citations, and traffic

### Key Principles

- **Server-side rendering by default** (Next.js App Router handles this)
- **Database-driven content** (leverage existing Prisma models)
- **Incremental Static Regeneration** (ISR) for dynamic pages
- **Reusable components** (extend existing SummaryCard, FormattedSummary patterns)
- **Schema-first approach** (add structured data to every page type)

---

## Phase 1: Fix Critical SEO Issues

**Timeline**: Week 1-2
**Complexity**: Medium
**Priority**: Critical

### Overview
Resolve domain inconsistency, add missing metadata to dynamic pages, create social preview images, and fix sitemap-page mismatches.

---

### Task 1.1: Standardize Domain to tldrsec.app

**File**: `app/layout.tsx`
**Changes**: Update metadataBase URL

```typescript
// Current (line 23):
metadataBase: new URL('https://tldrsec.com'),

// Updated:
metadataBase: new URL('https://tldrsec.app'),
```

**File**: `components/structured-data.tsx`
**Changes**: Update hardcoded URLs

```typescript
// Current (lines 13, 16):
"@id": "https://tldrsec.ai/#website",
"url": "https://tldrsec.ai",

// Updated:
"@id": "https://tldrsec.app/#website",
"url": "https://tldrsec.app",
```

**Verification**:
```bash
# Search for remaining domain variants
grep -r "tldrsec.com" app/ components/ lib/
grep -r "tldrsec.ai" app/ components/ lib/
```

---

### Task 1.2: Add Metadata to Summary Pages

**File**: `app/summary/[id]/page.tsx`
**Changes**: Add `generateMetadata()` function

```typescript
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';

interface SummaryPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: SummaryPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const prisma = getPrismaClient();

  try {
    const summary = await prisma.summary.findUnique({
      where: { id: resolvedParams.id },
      include: { ticker: true }
    });

    if (!summary) {
      return {
        title: 'Summary Not Found | tldrsec',
        description: 'The requested SEC filing summary could not be found.'
      };
    }

    const companyName = summary.ticker.companyName || summary.ticker.symbol;
    const filingType = summary.filingType.toUpperCase();
    const filingDate = new Date(summary.filingDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Extract first 155 characters from summary for description
    const description = summary.summaryText
      ? `${summary.summaryText.substring(0, 155)}...`
      : `AI-generated summary of ${companyName}'s ${filingType} SEC filing from ${filingDate}. Key insights, financial highlights, and risk factors.`;

    return {
      title: `${summary.ticker.symbol} ${filingType} Filing Summary - ${filingDate} | tldrsec`,
      description,
      keywords: [
        summary.ticker.symbol,
        companyName,
        filingType,
        'SEC filing',
        'financial analysis',
        'investor research',
        `${summary.ticker.symbol} stock analysis`,
        `${filingType} summary`
      ],
      openGraph: {
        title: `${summary.ticker.symbol} ${filingType} Analysis`,
        description,
        type: 'article',
        publishedTime: summary.createdAt.toISOString(),
        modifiedTime: summary.updatedAt.toISOString(),
        authors: ['tldrsec AI'],
        url: `https://tldrsec.app/summary/${resolvedParams.id}`,
        images: [{
          url: `/api/og/summary?ticker=${summary.ticker.symbol}&type=${filingType}`,
          width: 1200,
          height: 630,
          alt: `${summary.ticker.symbol} ${filingType} Filing Summary`
        }]
      },
      twitter: {
        card: 'summary_large_image',
        title: `${summary.ticker.symbol} ${filingType} Filing`,
        description: description.substring(0, 200),
        images: [`/api/og/summary?ticker=${summary.ticker.symbol}&type=${filingType}`]
      },
      alternates: {
        canonical: `https://tldrsec.app/summary/${resolvedParams.id}`
      }
    };
  } catch (error) {
    console.error('Error generating summary metadata:', error);
    return {
      title: 'Summary | tldrsec',
      description: 'AI-powered SEC filing summary'
    };
  }
}

export default async function SummaryPage({ params }: SummaryPageProps) {
  // ... existing implementation
}
```

---

### Task 1.3: Create Dynamic OG Image API Route

**File**: `app/api/og/summary/route.tsx` (new file)
**Changes**: Generate dynamic OpenGraph images for summaries

```typescript
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker') || 'UNKNOWN';
    const type = searchParams.get('type') || 'Filing';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            backgroundImage: 'linear-gradient(to bottom right, #1e293b, #0f172a)',
          }}
        >
          {/* Logo/Brand */}
          <div
            style={{
              position: 'absolute',
              top: 40,
              left: 40,
              display: 'flex',
              alignItems: 'center',
              color: '#f1f5f9',
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            tldrsec
          </div>

          {/* Main Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 120px',
            }}
          >
            {/* Ticker Symbol */}
            <div
              style={{
                fontSize: 120,
                fontWeight: 900,
                color: '#3b82f6',
                marginBottom: 20,
                letterSpacing: '-0.05em',
              }}
            >
              {ticker}
            </div>

            {/* Filing Type */}
            <div
              style={{
                fontSize: 60,
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: 40,
              }}
            >
              {type} Filing Summary
            </div>

            {/* Tagline */}
            <div
              style={{
                fontSize: 28,
                color: '#94a3b8',
                textAlign: 'center',
              }}
            >
              AI-Powered SEC Filing Analysis
            </div>
          </div>

          {/* Footer Badge */}
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              right: 40,
              backgroundColor: '#1e293b',
              padding: '12px 24px',
              borderRadius: 8,
              fontSize: 24,
              color: '#e2e8f0',
              border: '2px solid #334155',
            }}
          >
            📊 Instant Insights
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating OG image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
```

---

### Task 1.4: Create Static OG Image for Homepage

**File**: `public/og-image.png` (new asset)
**Changes**: Design and export 1200x630px image

**Option 1 - Use Figma/Canva**:
1. Create 1200x630px canvas
2. Background: Dark gradient (#0f172a → #1e293b)
3. Logo/brand: "tldrsec" in white, top left
4. Main text: "AI-Powered SEC Filing Summaries"
5. Subtext: "Instant insights from 10-K, 10-Q, and 8-K filings"
6. Export as PNG

**Option 2 - Use Existing OG API**:
Create `app/api/og/home/route.tsx` similar to summary OG route

**Temporary Placeholder**:
```bash
# Create a simple placeholder until proper design
# (This would typically be a PNG file, but shown as command for completeness)
```

---

### Task 1.5: Fix Sitemap Page Mismatches

**Option A - Remove Non-Existent Pages from Sitemap**

**File**: `app/sitemap.ts`
**Changes**: Remove pricing, about, privacy, terms entries

```typescript
import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://tldrsec.app';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/newsletter`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/sign-up`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    // Removed: /pricing, /about, /privacy, /terms
  ];
}
```

**Option B - Create Missing Pages (Recommended for better SEO)**

Create minimal versions of these pages for Phase 1, expand in Phase 4.

**Files to create**:
- `app/(marketing)/about/page.tsx`
- `app/(marketing)/privacy/page.tsx`
- `app/(marketing)/terms/page.tsx`
- `app/(marketing)/pricing/page.tsx`

**Example - About Page**:

```typescript
// app/(marketing)/about/page.tsx
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About tldrsec | AI-Powered SEC Filing Analysis',
  description: 'Learn about tldrsec, our mission to make SEC filing analysis accessible to all investors through AI-powered summaries.',
  alternates: {
    canonical: 'https://tldrsec.app/about'
  }
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-4xl font-bold mb-6">About tldrsec</h1>

      <div className="prose prose-lg">
        <p className="lead">
          We believe every investor deserves instant access to critical SEC filing insights
          without spending hours reading 300+ page documents.
        </p>

        <h2>Our Mission</h2>
        <p>
          Transform complex SEC filings into clear, actionable summaries that help investors
          make informed decisions about their portfolio companies.
        </p>

        <h2>How It Works</h2>
        <ol>
          <li>We monitor SEC EDGAR database 24/7 for new filings</li>
          <li>AI analyzes each filing within minutes of publication</li>
          <li>Key insights delivered to your inbox instantly</li>
        </ol>

        <h2>Our Technology</h2>
        <p>
          Powered by Claude (Anthropic's advanced AI), tldrsec extracts financial highlights,
          risk factors, and strategic insights from 10-K, 10-Q, and 8-K filings.
        </p>

        <h2>Data Source</h2>
        <p>
          All data sourced directly from the official SEC EDGAR database. We never modify
          or interpret financial data—only summarize what's publicly reported.
        </p>

        <p className="text-sm text-muted-foreground mt-8">
          <strong>Disclaimer:</strong> tldrsec provides AI-generated summaries for informational
          purposes only. This is not investment advice. Always consult with a licensed
          financial advisor before making investment decisions.
        </p>
      </div>
    </div>
  );
}
```

Similar minimal pages for Privacy, Terms, and Pricing (showing "Coming Soon" with early access signup).

---

### Task 1.6: Render Newsletter Schema

**File**: `app/newsletter/page.tsx`
**Changes**: Import and render existing schema component

```typescript
import { Metadata } from 'next';
import { NewsletterSchema } from '@/components/seo/newsletter-schema'; // Add this import

export const metadata: Metadata = {
  title: 'Newsletter - TLDRSec AI',
  description: 'Get weekly AI summaries of SEC filings without the overwhelm. Join thousands of smart investors.',
  openGraph: {
    title: 'Newsletter - TLDRSec AI',
    description: 'Get weekly AI summaries of SEC filings without the overwhelm. Join thousands of smart investors.',
    type: 'website',
  },
};

export default function NewsletterPage() {
  return (
    <>
      <NewsletterSchema /> {/* Add this line */}

      {/* Existing newsletter page content */}
      <div className="container mx-auto px-4 py-16">
        {/* ... existing content ... */}
      </div>
    </>
  );
}
```

---

### Success Criteria

#### Automated Verification:
- [ ] Domain consistency check passes: `grep -r "tldrsec.com\|tldrsec.ai" app/ components/ lib/` returns no results
- [ ] Summary page metadata validates: Visit `/summary/[any-id]` and check page source for meta tags
- [ ] OG image API returns 200: `curl https://tldrsec.app/api/og/summary?ticker=AAPL&type=10-K`
- [ ] Sitemap validates: Upload to https://www.xml-sitemaps.com/validate-xml-sitemap.html
- [ ] Build succeeds: `npm run build`
- [ ] Type checking passes: `npm run build` (TypeScript errors block build)

#### Manual Verification:
- [ ] Share summary link on Twitter/LinkedIn → correct OG image displays
- [ ] Google Rich Results Test shows valid metadata: https://search.google.com/test/rich-results
- [ ] Visit `/about`, `/privacy`, `/terms`, `/pricing` → pages load (if created)
- [ ] Summary pages show in Facebook debugger: https://developers.facebook.com/tools/debug/

**Implementation Note**: After completing this phase and all automated tests pass, manually verify social sharing and metadata display before proceeding to Phase 2.

---

## Phase 2: Build Programmatic SEO Foundation

**Timeline**: Week 2-4
**Complexity**: High
**Priority**: High

### Overview
Create dynamic page templates for companies, filing types, and company-specific filing histories. Generate thousands of SEO-optimized pages from existing database.

---

### Task 2.1: Create Company Page Template

**File**: `app/(marketing)/company/[ticker]/page.tsx` (new file)
**Changes**: Dynamic route for individual company pages

```typescript
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPrismaClient } from '@/lib/db/prisma';
import { SummaryCard } from '@/components/summary/summary-card';
import { FinancialServiceSchema } from '@/components/seo/financial-service-schema';
import { BreadcrumbSchema } from '@/components/seo/breadcrumb-schema';

interface CompanyPageProps {
  params: Promise<{ ticker: string }>;
}

export async function generateStaticParams() {
  const prisma = getPrismaClient();

  // Generate static pages for top 2000 companies
  const companies = await prisma.cikMapping.findMany({
    select: { ticker: true },
    take: 2000,
    orderBy: { ticker: 'asc' }
  });

  return companies.map(company => ({
    ticker: company.ticker.toUpperCase()
  }));
}

export async function generateMetadata({ params }: CompanyPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const ticker = resolvedParams.ticker.toUpperCase();
  const prisma = getPrismaClient();

  const company = await prisma.cikMapping.findFirst({
    where: { ticker }
  });

  if (!company) {
    return {
      title: `${ticker} - Company Not Found | tldrsec`,
      description: 'The requested company could not be found in our database.'
    };
  }

  return {
    title: `${ticker} SEC Filings & Analysis | ${company.companyName} | tldrsec`,
    description: `Track ${ticker} (${company.companyName}) SEC filings with AI-powered summaries. Get instant alerts for 10-K, 10-Q, 8-K filings and insider trading reports.`,
    keywords: [
      `${ticker} stock`,
      `${ticker} SEC filings`,
      `${company.companyName} financial reports`,
      `${ticker} 10-K`,
      `${ticker} 10-Q`,
      `${ticker} 8-K`,
      `${company.companyName} investor relations`,
      `${ticker} quarterly earnings`,
      `${ticker} annual report`
    ],
    openGraph: {
      title: `${ticker} SEC Filing Tracker | ${company.companyName}`,
      description: `Real-time SEC filing analysis for ${company.companyName} (${ticker}). AI-powered summaries of 10-K, 10-Q, and 8-K reports.`,
      type: 'website',
      url: `https://tldrsec.app/company/${ticker}`,
      images: [{
        url: `/api/og/company?ticker=${ticker}&name=${encodeURIComponent(company.companyName)}`,
        width: 1200,
        height: 630,
        alt: `${ticker} SEC Filing Tracker`
      }]
    },
    twitter: {
      card: 'summary_large_image',
      title: `${ticker} SEC Filings`,
      description: `Track ${company.companyName} SEC filings with AI summaries`,
      images: [`/api/og/company?ticker=${ticker}`]
    },
    alternates: {
      canonical: `https://tldrsec.app/company/${ticker}`
    }
  };
}

export default async function CompanyPage({ params }: CompanyPageProps) {
  const resolvedParams = await params;
  const ticker = resolvedParams.ticker.toUpperCase();
  const prisma = getPrismaClient();

  const company = await prisma.cikMapping.findFirst({
    where: { ticker }
  });

  if (!company) {
    notFound();
  }

  // Get recent summaries for this company
  const recentSummaries = await prisma.summary.findMany({
    where: {
      ticker: {
        symbol: ticker
      }
    },
    include: {
      ticker: true
    },
    orderBy: {
      filingDate: 'desc'
    },
    take: 10
  });

  // Get filing counts by type
  const filingCounts = await prisma.summary.groupBy({
    by: ['filingType'],
    where: {
      ticker: {
        symbol: ticker
      }
    },
    _count: {
      filingType: true
    }
  });

  return (
    <>
      {/* Structured Data */}
      <FinancialServiceSchema ticker={ticker} companyName={company.companyName} />
      <BreadcrumbSchema items={[
        { name: 'Home', href: '/' },
        { name: 'Companies', href: '/companies' },
        { name: ticker, href: `/company/${ticker}` }
      ]} />

      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">
            {ticker} SEC Filing Tracker
          </h1>
          <p className="text-xl text-muted-foreground">
            {company.companyName}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            CIK: {company.cik} | SIC: {company.sic || 'N/A'}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {filingCounts.map(({ filingType, _count }) => (
            <div key={filingType} className="bg-muted/50 p-4 rounded-lg">
              <div className="text-2xl font-bold">{_count.filingType}</div>
              <div className="text-sm text-muted-foreground">{filingType} Filings</div>
            </div>
          ))}
        </div>

        {/* Recent Filings */}
        <div>
          <h2 className="text-2xl font-bold mb-6">Recent SEC Filings</h2>

          {recentSummaries.length > 0 ? (
            <div className="grid gap-4">
              {recentSummaries.map(summary => (
                <SummaryCard key={summary.id} summary={summary} />
              ))}
            </div>
          ) : (
            <div className="bg-muted/30 p-8 rounded-lg text-center">
              <p className="text-muted-foreground">
                No summaries available for {ticker} yet. Add this ticker to your watchlist
                to receive AI-powered summaries when new filings are published.
              </p>
            </div>
          )}
        </div>

        {/* FAQ Section for LLM Optimization */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-6">About {ticker} SEC Filings</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">
                How often does {ticker} file SEC reports?
              </h3>
              <p className="text-muted-foreground">
                {company.companyName} ({ticker}) files quarterly 10-Q reports within 40-45 days
                after each quarter end, and an annual 10-K report within 60-90 days after their
                fiscal year end. 8-K reports are filed within 4 business days of material events.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">
                Where can I find {ticker} SEC filings?
              </h3>
              <p className="text-muted-foreground">
                All {ticker} SEC filings are available for free on the SEC's EDGAR database
                at sec.gov. tldrsec provides AI-powered summaries of these filings to help
                investors quickly understand key insights without reading hundreds of pages.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">
                What's the difference between a 10-K and 10-Q for {ticker}?
              </h3>
              <p className="text-muted-foreground">
                A 10-K is {company.companyName}'s comprehensive annual report with audited
                financial statements, filed once per year. A 10-Q is a quarterly report with
                unaudited financials, filed three times per year (Q1, Q2, Q3). The 10-K
                provides the most complete picture of the company's operations and risks.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Enable ISR - revalidate every hour
export const revalidate = 3600;
```

---

### Task 2.2: Create Filing Type Education Pages

**File**: `app/(marketing)/filings/[type]/page.tsx` (new file)
**Changes**: Educational pages for each SEC filing type

```typescript
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FAQSchema } from '@/components/seo/faq-schema';
import { BreadcrumbSchema } from '@/components/seo/breadcrumb-schema';

interface FilingTypePageProps {
  params: Promise<{ type: string }>;
}

// Define filing type content
const FILING_TYPES: Record<string, {
  title: string;
  description: string;
  fullName: string;
  frequency: string;
  deadline: string;
  audited: boolean;
  purpose: string;
  whatIncludes: string[];
  whyMatters: string;
  examples: string;
}> = {
  '10-k': {
    title: 'What is a 10-K Filing?',
    description: 'Comprehensive annual report filed by public companies',
    fullName: 'Annual Report (Form 10-K)',
    frequency: 'Once per year',
    deadline: '60-90 days after fiscal year end (depending on filer status)',
    audited: true,
    purpose: 'Provides a comprehensive overview of the company\'s business operations, financial condition, and risk factors for the entire fiscal year.',
    whatIncludes: [
      'Complete audited financial statements (balance sheet, income statement, cash flow)',
      'Management\'s Discussion and Analysis (MD&A) of financial condition',
      'Detailed risk factors',
      'Business description and strategy',
      'Executive compensation details',
      'Legal proceedings',
      'Market risk disclosures',
      'Organizational structure'
    ],
    whyMatters: 'The 10-K is the most comprehensive filing and provides the complete annual picture of a company\'s financial health, strategy, and risks. It\'s essential reading for fundamental analysis.',
    examples: 'Large accelerated filers (market cap >$700M) must file within 60 days of fiscal year end. Smaller companies have 75-90 days.'
  },
  '10-q': {
    title: 'What is a 10-Q Filing?',
    description: 'Quarterly report filed by public companies',
    fullName: 'Quarterly Report (Form 10-Q)',
    frequency: 'Three times per year (Q1, Q2, Q3)',
    deadline: '40-45 days after quarter end',
    audited: false,
    purpose: 'Provides an update on the company\'s financial performance and condition for a fiscal quarter.',
    whatIncludes: [
      'Unaudited quarterly financial statements',
      'Management\'s Discussion and Analysis (MD&A)',
      'Updates to risk factors',
      'Legal proceedings updates',
      'Market risk disclosures',
      'Changes in accounting policies'
    ],
    whyMatters: '10-Q filings help investors track quarterly performance trends and identify changes in the business before the annual 10-K is filed.',
    examples: 'Q4 is not filed as a 10-Q because the 10-K covers the full year including Q4.'
  },
  '8-k': {
    title: 'What is an 8-K Filing?',
    description: 'Current report for material corporate events',
    fullName: 'Current Report (Form 8-K)',
    frequency: 'As needed when material events occur',
    deadline: '4 business days after the event',
    audited: false,
    purpose: 'Discloses material events or corporate changes that shareholders should know about immediately.',
    whatIncludes: [
      'Earnings releases and financial results',
      'Mergers, acquisitions, or asset sales',
      'CEO/CFO changes',
      'Bankruptcy or receivership',
      'Changes in control',
      'Delisting notices',
      'Material agreements',
      'Financial restatements'
    ],
    whyMatters: '8-K filings provide real-time notification of significant events that could impact stock price. They\'re often the first official disclosure of major news.',
    examples: 'When a company announces Q3 earnings, they file an 8-K with the earnings release attached as an exhibit.'
  },
  'form-4': {
    title: 'What is Form 4 (Insider Trading Report)?',
    description: 'Statement of changes in beneficial ownership by insiders',
    fullName: 'Form 4 - Statement of Changes in Beneficial Ownership',
    frequency: 'Within 2 business days of insider transaction',
    deadline: '2 business days after the transaction',
    audited: false,
    purpose: 'Discloses purchases, sales, and other changes in stock ownership by company insiders (officers, directors, and 10% owners).',
    whatIncludes: [
      'Name and title of insider',
      'Transaction date and type (buy, sell, gift, option exercise)',
      'Number of shares traded',
      'Price per share',
      'Remaining shares owned',
      'Direct vs. indirect ownership'
    ],
    whyMatters: 'Insider trading patterns can signal confidence or concern. Multiple insiders buying could indicate undervaluation, while heavy selling might raise red flags.',
    examples: 'If a CEO buys $1M of stock, they must file Form 4 within 2 business days disclosing the purchase.'
  }
};

export async function generateStaticParams() {
  return Object.keys(FILING_TYPES).map(type => ({ type }));
}

export async function generateMetadata({ params }: FilingTypePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const type = resolvedParams.type.toLowerCase();
  const filing = FILING_TYPES[type];

  if (!filing) {
    return {
      title: 'Filing Type Not Found | tldrsec',
      description: 'The requested SEC filing type guide could not be found.'
    };
  }

  return {
    title: `${filing.title} | Complete Guide for Investors | tldrsec`,
    description: `${filing.description}. Learn what a ${filing.fullName} includes, when it's filed, and why it matters for investors. Complete guide with examples.`,
    keywords: [
      type.toUpperCase(),
      `${type} filing`,
      `what is ${type}`,
      'SEC filing guide',
      `${type} explained`,
      `how to read ${type}`,
      'investor education'
    ],
    openGraph: {
      title: filing.title,
      description: filing.description,
      type: 'article',
      url: `https://tldrsec.app/filings/${type}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: filing.title,
      description: filing.description,
    },
    alternates: {
      canonical: `https://tldrsec.app/filings/${type}`
    }
  };
}

export default async function FilingTypePage({ params }: FilingTypePageProps) {
  const resolvedParams = await params;
  const type = resolvedParams.type.toLowerCase();
  const filing = FILING_TYPES[type];

  if (!filing) {
    notFound();
  }

  const faqs = [
    {
      question: `What is a ${filing.fullName}?`,
      answer: filing.purpose
    },
    {
      question: `When is a ${type.toUpperCase()} filed?`,
      answer: `${filing.frequency}. Filing deadline: ${filing.deadline}.`
    },
    {
      question: `What information is included in a ${type.toUpperCase()}?`,
      answer: filing.whatIncludes.join('; ')
    },
    {
      question: `Why do ${type.toUpperCase()} filings matter to investors?`,
      answer: filing.whyMatters
    }
  ];

  return (
    <>
      {/* Structured Data */}
      <FAQSchema questions={faqs} />
      <BreadcrumbSchema items={[
        { name: 'Home', href: '/' },
        { name: 'SEC Filing Guide', href: '/filings' },
        { name: type.toUpperCase(), href: `/filings/${type}` }
      ]} />

      <article className="container mx-auto px-4 py-16 max-w-4xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">{filing.title}</h1>
          <p className="text-xl text-muted-foreground">
            {filing.description}
          </p>
        </div>

        {/* Quick Facts */}
        <div className="bg-muted/30 p-6 rounded-lg mb-12 grid md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Frequency</div>
            <div className="font-semibold">{filing.frequency}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Deadline</div>
            <div className="font-semibold">{filing.deadline}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Audited?</div>
            <div className="font-semibold">{filing.audited ? 'Yes' : 'No'}</div>
          </div>
        </div>

        {/* Main Content */}
        <div className="prose prose-lg max-w-none">
          {/* Answer-first format for LLM citation */}
          <p className="lead text-lg">
            {filing.purpose}
          </p>

          <h2>When is a {type.toUpperCase()} Filed?</h2>
          <p>
            Public companies must file a {filing.fullName} {filing.frequency.toLowerCase()}.
            The filing deadline is {filing.deadline.toLowerCase()}.
          </p>
          <p>{filing.examples}</p>

          <h2>What's Included in a {type.toUpperCase()}?</h2>
          <p>
            The {filing.fullName} includes the following key sections:
          </p>
          <ul>
            {filing.whatIncludes.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>

          <h2>Why {type.toUpperCase()} Filings Matter</h2>
          <p>{filing.whyMatters}</p>

          <h2>How to Read a {type.toUpperCase()} Filing</h2>
          <ol>
            <li><strong>Start with the summary sections</strong> - Executive summary or highlights (if available)</li>
            <li><strong>Review risk factors</strong> - Understand what could go wrong</li>
            <li><strong>Analyze financial statements</strong> - Focus on revenue, profit, cash flow trends</li>
            <li><strong>Read MD&A carefully</strong> - Management's interpretation of results</li>
            <li><strong>Compare year-over-year</strong> - Look for changes and trends</li>
          </ol>

          {type === '8-k' && (
            <>
              <h2>Common 8-K Event Types</h2>
              <ul>
                <li><strong>Item 2.02</strong> - Earnings releases and financial results</li>
                <li><strong>Item 5.02</strong> - Changes in CEO, CFO, or other executive officers</li>
                <li><strong>Item 1.01</strong> - Material definitive agreements (M&A, partnerships)</li>
                <li><strong>Item 8.01</strong> - Other events (general catch-all category)</li>
              </ul>
            </>
          )}

          <h2>Get {type.toUpperCase()} Summaries Delivered to Your Inbox</h2>
          <p>
            tldrsec automatically monitors SEC filings and delivers AI-powered summaries
            within minutes of publication. Never miss an important {type.toUpperCase()} filing
            from your portfolio companies.
          </p>
        </div>

        {/* FAQ Section */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="border-b pb-4">
                <h3 className="text-lg font-semibold mb-2">{faq.question}</h3>
                <p className="text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Related Content */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Related SEC Filing Guides</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {Object.entries(FILING_TYPES)
              .filter(([key]) => key !== type)
              .slice(0, 3)
              .map(([key, content]) => (
                <a
                  key={key}
                  href={`/filings/${key}`}
                  className="block p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <h3 className="font-semibold mb-2">{key.toUpperCase()}</h3>
                  <p className="text-sm text-muted-foreground">{content.description}</p>
                </a>
              ))}
          </div>
        </div>
      </article>
    </>
  );
}

// Static page - no revalidation needed
export const dynamic = 'force-static';
```

---

### Task 2.3: Create Dynamic Sitemap with Database Content

**File**: `app/sitemap.ts`
**Changes**: Replace static sitemap with database-driven generation

```typescript
import { MetadataRoute } from 'next';
import { getPrismaClient } from '@/lib/db/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://tldrsec.app';
  const prisma = getPrismaClient();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/newsletter`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // Filing type guides
  const filingTypes = ['10-k', '10-q', '8-k', 'form-4'];
  const filingPages: MetadataRoute.Sitemap = filingTypes.map(type => ({
    url: `${baseUrl}/filings/${type}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  // Company pages (top 2000)
  const companies = await prisma.cikMapping.findMany({
    select: { ticker: true, lastUpdated: true },
    take: 2000,
    orderBy: { ticker: 'asc' }
  });

  const companyPages: MetadataRoute.Sitemap = companies.map(company => ({
    url: `${baseUrl}/company/${company.ticker}`,
    lastModified: company.lastUpdated || new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  // Summary pages (recent 1000)
  const summaries = await prisma.summary.findMany({
    select: { id: true, updatedAt: true },
    where: {
      // Only include completed summaries
      summaryText: { not: null }
    },
    orderBy: { filingDate: 'desc' },
    take: 1000
  });

  const summaryPages: MetadataRoute.Sitemap = summaries.map(summary => ({
    url: `${baseUrl}/summary/${summary.id}`,
    lastModified: summary.updatedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [
    ...staticPages,
    ...filingPages,
    ...companyPages,
    ...summaryPages
  ];
}

// Revalidate sitemap every 6 hours
export const revalidate = 21600;
```

---

### Task 2.4: Create Structured Data Components

**File**: `components/seo/financial-service-schema.tsx` (new file)

```typescript
export function FinancialServiceSchema({
  ticker,
  companyName
}: {
  ticker: string;
  companyName: string;
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialService',
    name: `${ticker} SEC Filing Analysis`,
    description: `Real-time SEC filing summaries and analysis for ${ticker} (${companyName}) stock`,
    provider: {
      '@type': 'Organization',
      name: 'tldrsec',
      url: 'https://tldrsec.app'
    },
    serviceType: 'Investment Research',
    areaServed: 'US',
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: `https://tldrsec.app/company/${ticker}`
    }
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

**File**: `components/seo/breadcrumb-schema.tsx` (new file)

```typescript
export function BreadcrumbSchema({
  items
}: {
  items: Array<{ name: string; href: string }>
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `https://tldrsec.app${item.href}`
    }))
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

**File**: `components/seo/faq-schema.tsx` (new file)

```typescript
export function FAQSchema({
  questions
}: {
  questions: Array<{ question: string; answer: string }>
}) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer
      }
    }))
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
```

---

### Task 2.5: Create Company OG Image API Route

**File**: `app/api/og/company/route.tsx` (new file)

```typescript
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker') || 'UNKNOWN';
    const name = searchParams.get('name') || 'Company';

    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            backgroundImage: 'linear-gradient(to bottom right, #1e293b, #0f172a)',
          }}
        >
          {/* Logo */}
          <div
            style={{
              position: 'absolute',
              top: 40,
              left: 40,
              color: '#f1f5f9',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            tldrsec
          </div>

          {/* Main Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '0 80px',
            }}
          >
            {/* Ticker */}
            <div
              style={{
                fontSize: 100,
                fontWeight: 900,
                color: '#3b82f6',
                marginBottom: 20,
              }}
            >
              {ticker}
            </div>

            {/* Company Name */}
            <div
              style={{
                fontSize: 36,
                fontWeight: 600,
                color: '#cbd5e1',
                textAlign: 'center',
                marginBottom: 30,
              }}
            >
              {decodeURIComponent(name)}
            </div>

            {/* Description */}
            <div
              style={{
                fontSize: 24,
                color: '#94a3b8',
                textAlign: 'center',
              }}
            >
              SEC Filing Tracker & AI Summaries
            </div>
          </div>

          {/* Footer Badge */}
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              right: 40,
              backgroundColor: '#1e293b',
              padding: '12px 24px',
              borderRadius: 8,
              fontSize: 20,
              color: '#e2e8f0',
              border: '2px solid #334155',
            }}
          >
            📈 Real-time Updates
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating company OG image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
```

---

### Success Criteria

#### Automated Verification:
- [ ] Company pages build successfully: `npm run build`
- [ ] Static params generation works: Check build output for "Generating static pages"
- [ ] Sitemap includes database content: Visit `/sitemap.xml` and verify company/summary URLs
- [ ] Structured data validates: Use Google Rich Results Test on company pages
- [ ] OG images generate: `curl https://tldrsec.app/api/og/company?ticker=AAPL&name=Apple%20Inc.`
- [ ] ISR revalidation works: Check `/.next/cache` after visiting pages

#### Manual Verification:
- [ ] Visit `/company/AAPL` → page loads with recent filings
- [ ] Visit `/filings/10-k` → educational content displays
- [ ] Share company page URL on social media → correct OG image
- [ ] Google "site:tldrsec.app/company" → company pages indexed (after deployment)
- [ ] FAQ schema appears in search results (may take 1-2 weeks after indexing)

**Implementation Note**: After Phase 2 completion, run full build and deploy to staging. Verify at least 10 company pages and 4 filing type pages before proceeding to Phase 3.

---

## Phase 3: LLM Optimization

**Timeline**: Week 4-6
**Complexity**: Medium
**Priority**: Medium

### Overview
Optimize content structure for AI search engines (ChatGPT, Claude, Perplexity, Gemini) through FAQ schemas, answer-first formatting, AI crawler configuration, and experimental llms.txt file.

---

### Task 3.1: Update robots.txt for AI Crawlers

**File**: `app/robots.ts`
**Changes**: Add AI crawler user-agents and allow rules

```typescript
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard/',
          '/admin/',
          '/_next/',
          '/tmp/'
        ]
      },
      // AI Crawlers - Allow educational and company content
      {
        userAgent: [
          'GPTBot',           // ChatGPT crawler
          'ChatGPT-User',     // ChatGPT browsing
          'OAI-SearchBot',    // OpenAI search
          'ClaudeBot',        // Claude crawler
          'Claude-Web',       // Claude web browsing
          'PerplexityBot',    // Perplexity AI
          'Google-Extended',  // Google Bard/Gemini
          'Amazonbot',        // Amazon AI
          'anthropic-ai',     // Anthropic general
          'Applebot-Extended' // Apple Intelligence
        ],
        allow: [
          '/filings/',     // Filing type guides
          '/company/',     // Company pages
          '/summary/',     // Public summaries
          '/blog/',        // Blog content
          '/about',        // About page
          '/'              // Homepage
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/admin/'
        ]
      }
    ],
    sitemap: 'https://tldrsec.app/sitemap.xml'
  };
}
```

---

### Task 3.2: Create llms.txt File

**File**: `public/llms.txt` (new file)
**Changes**: Experimental AI indexing file

```markdown
# tldrsec - AI-Powered SEC Filing Analysis

## About
tldrsec provides AI-generated summaries of SEC filings (10-K, 10-Q, 8-K, Form 4) to help investors stay informed without spending hours reading 300+ page documents.

## Key Resources

### Educational Content
- [What is a 10-K Filing?](https://tldrsec.app/filings/10-k) - Comprehensive annual report guide
- [What is a 10-Q Filing?](https://tldrsec.app/filings/10-q) - Quarterly report explanation
- [What is an 8-K Filing?](https://tldrsec.app/filings/8-k) - Material event disclosures guide
- [Form 4 Insider Trading Guide](https://tldrsec.app/filings/form-4) - Understanding insider transactions

### Tools & Features
- [Company SEC Filing Tracker](https://tldrsec.app/companies) - Track any public company
- [SEC Filing Search](https://tldrsec.app/search) - Search filings by company or ticker

### How It Works
1. We monitor the SEC EDGAR database 24/7 for new filings
2. AI analyzes each filing within minutes of publication
3. Key insights delivered to your inbox instantly

## Common Questions

**How often are SEC filings published?**
10-K (annual): Once per year, 60-90 days after fiscal year end
10-Q (quarterly): Three times per year (Q1, Q2, Q3), 40-45 days after quarter end
8-K (current events): Within 4 business days of material events
Form 4 (insider trading): Within 2 business days of transactions

**Where does tldrsec get SEC filing data?**
All data sourced directly from the official SEC EDGAR database (sec.gov). We never modify financial data—only summarize publicly reported information.

**What's the difference between a 10-K and 10-Q?**
A 10-K is a comprehensive annual report with audited financial statements, filed once per year. A 10-Q is a quarterly report with unaudited financials, filed three times per year (Q1, Q2, Q3). The 10-K provides the most complete picture of company operations and risks.

**Can I track multiple companies?**
Yes. tldrsec allows you to track any public company that files with the SEC. Add companies to your watchlist to receive summaries when new filings are published.

## Data Sources
All filing data sourced from official SEC EDGAR database (sec.gov)
AI summaries generated using Claude (Anthropic)

## Disclaimer
Content for informational purposes only. Not investment advice. Consult a licensed financial advisor before making investment decisions.

## Contact
- Website: https://tldrsec.app
- Support: support@tldrsec.app
- GitHub: [link if applicable]
```

---

### Task 3.3: Add FAQ Sections to All Filing Type Pages

Already implemented in Phase 2, Task 2.2. Verify FAQ schema rendering:

**Verification**:
1. Visit `/filings/10-k`
2. View page source
3. Search for `"@type": "FAQPage"`
4. Confirm JSON-LD schema present

---

### Task 3.4: Create Comparison Pages

**File**: `app/(marketing)/compare/[slug]/page.tsx` (new file)
**Changes**: Comparison landing pages

```typescript
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface ComparisonPageProps {
  params: Promise<{ slug: string }>;
}

const COMPARISONS: Record<string, {
  title: string;
  description: string;
  competitorA: { name: string; logo?: string };
  competitorB: { name: string; logo?: string };
  tldr: string;
  features: Array<{
    feature: string;
    tldrsec: string;
    competitor: string;
  }>;
  whenToUseTldrsec: string[];
  whenToUseCompetitor: string[];
}> = {
  'tldrsec-vs-sec-edgar': {
    title: 'tldrsec vs SEC EDGAR: Which SEC Filing Tool is Better?',
    description: 'Compare tldrsec and SEC EDGAR for tracking 10-K, 10-Q filings. See features, pricing, AI capabilities, and which tool is best for investors.',
    competitorA: { name: 'tldrsec' },
    competitorB: { name: 'SEC EDGAR' },
    tldr: 'tldrsec provides AI-powered summaries and email alerts, making it ideal for busy investors. SEC EDGAR offers raw filing access but requires manual analysis. Choose tldrsec for automation and time-saving, SEC EDGAR for comprehensive research.',
    features: [
      { feature: 'AI Summaries', tldrsec: '✅ Automated', competitor: '❌ Manual reading required' },
      { feature: 'Email Alerts', tldrsec: '✅ Real-time', competitor: '❌ None' },
      { feature: 'Cost', tldrsec: '$15-40/month', competitor: 'Free' },
      { feature: 'Full Filing Access', tldrsec: '✅ Links provided', competitor: '✅ Direct access' },
      { feature: 'Multiple Companies', tldrsec: '✅ Track 5-20+ tickers', competitor: '✅ Unlimited' },
      { feature: 'Historical Data', tldrsec: '✅ Recent filings', competitor: '✅ All filings since 1994' },
      { feature: 'Search Functionality', tldrsec: '✅ Company search', competitor: '✅ Advanced search' },
      { feature: 'Time Required', tldrsec: '5 min per filing', competitor: '2-4 hours per filing' }
    ],
    whenToUseTldrsec: [
      'You want instant summaries without reading full filings',
      'You track multiple companies and need efficiency',
      'You prefer email notifications over manual checking',
      'You value time over cost ($15-40/month is worth it)',
      'You need key insights for investment decisions quickly'
    ],
    whenToUseCompetitor: [
      'You need to cite specific filing sections (legal/research)',
      'You\'re conducting deep fundamental analysis',
      'You want completely free access',
      'You need historical filings from before 2020',
      'You enjoy reading full financial documents'
    ]
  },
  'tldrsec-vs-seeking-alpha': {
    title: 'tldrsec vs Seeking Alpha: SEC Filing Analysis Comparison',
    description: 'Compare tldrsec and Seeking Alpha for SEC filing summaries. Features, pricing, AI capabilities, and which platform is best for your needs.',
    competitorA: { name: 'tldrsec' },
    competitorB: { name: 'Seeking Alpha' },
    tldr: 'tldrsec specializes in automated SEC filing summaries with instant email delivery. Seeking Alpha offers broader investment content including articles, news, and analyst opinions. Choose tldrsec for filing-focused automation, Seeking Alpha for comprehensive investment research.',
    features: [
      { feature: 'AI SEC Filing Summaries', tldrsec: '✅ Specialized', competitor: '⚠️ Some articles' },
      { feature: 'Email Delivery', tldrsec: '✅ Automated alerts', competitor: '✅ Daily newsletters' },
      { feature: 'Pricing', tldrsec: '$15-40/month', competitor: '$239/year (~$20/month)' },
      { feature: 'News & Analysis', tldrsec: '❌ Filing-focused only', competitor: '✅ Extensive' },
      { feature: 'Analyst Ratings', tldrsec: '❌ No', competitor: '✅ Yes' },
      { feature: 'Earnings Call Transcripts', tldrsec: '❌ No', competitor: '✅ Yes' },
      { feature: 'Filing Focus', tldrsec: '✅ 100% SEC filings', competitor: '⚠️ Mixed content' },
      { feature: 'Community', tldrsec: '❌ No forums', competitor: '✅ Active forums' }
    ],
    whenToUseTldrsec: [
      'You specifically want SEC filing summaries (10-K, 10-Q, 8-K)',
      'You prefer automated alerts over browsing content',
      'You want filing-focused emails without news noise',
      'You track a specific portfolio of companies',
      'You value speed and automation'
    ],
    whenToUseCompetitor: [
      'You want broader investment research and news',
      'You value analyst opinions and community discussion',
      'You need earnings call transcripts',
      'You prefer reading multiple perspectives on companies',
      'You like browsing content on your own schedule'
    ]
  }
};

export async function generateStaticParams() {
  return Object.keys(COMPARISONS).map(slug => ({ slug }));
}

export async function generateMetadata({ params }: ComparisonPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const comparison = COMPARISONS[resolvedParams.slug];

  if (!comparison) {
    return {
      title: 'Comparison Not Found | tldrsec',
      description: 'The requested comparison page could not be found.'
    };
  }

  return {
    title: comparison.title,
    description: comparison.description,
    keywords: [
      'SEC filing tools',
      'investment research comparison',
      `${comparison.competitorA.name} vs ${comparison.competitorB.name}`,
      'filing analysis',
      'investor tools'
    ],
    openGraph: {
      title: comparison.title,
      description: comparison.description,
      type: 'article',
      url: `https://tldrsec.app/compare/${resolvedParams.slug}`,
    },
    alternates: {
      canonical: `https://tldrsec.app/compare/${resolvedParams.slug}`
    }
  };
}

export default async function ComparisonPage({ params }: ComparisonPageProps) {
  const resolvedParams = await params;
  const comparison = COMPARISONS[resolvedParams.slug];

  if (!comparison) {
    notFound();
  }

  return (
    <article className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">{comparison.title}</h1>

      {/* TL;DR - Answer-first for LLM citation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-6 mb-12">
        <h2 className="text-xl font-semibold mb-3">TL;DR</h2>
        <p className="text-lg">{comparison.tldr}</p>
      </div>

      {/* Feature Comparison Table */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Feature Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border p-3 text-left">Feature</th>
                <th className="border p-3 text-left">{comparison.competitorA.name}</th>
                <th className="border p-3 text-left">{comparison.competitorB.name}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.features.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-muted/30' : ''}>
                  <td className="border p-3 font-semibold">{row.feature}</td>
                  <td className="border p-3">{row.tldrsec}</td>
                  <td className="border p-3">{row.competitor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* When to Use Each Tool */}
      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <div>
          <h2 className="text-xl font-bold mb-4">When to Use {comparison.competitorA.name}</h2>
          <ul className="space-y-2">
            {comparison.whenToUseTldrsec.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-4">When to Use {comparison.competitorB.name}</h2>
          <ul className="space-y-2">
            {comparison.whenToUseCompetitor.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">
              Is {comparison.competitorA.name} better than {comparison.competitorB.name}?
            </h3>
            <p className="text-muted-foreground">{comparison.tldr}</p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">
              Can I use both {comparison.competitorA.name} and {comparison.competitorB.name}?
            </h3>
            <p className="text-muted-foreground">
              Yes! Many investors use both tools for different purposes. {comparison.competitorA.name} for
              automated SEC filing summaries and {comparison.competitorB.name} for its complementary features.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-muted/30 p-8 rounded-lg text-center">
        <h2 className="text-2xl font-bold mb-4">Try tldrsec Free</h2>
        <p className="text-muted-foreground mb-6">
          Get instant AI summaries of SEC filings delivered to your inbox.
          Track your portfolio companies effortlessly.
        </p>
        <a
          href="/newsletter"
          className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          Start Free Trial
        </a>
      </div>
    </article>
  );
}

export const dynamic = 'force-static';
```

---

### Success Criteria

#### Automated Verification:
- [ ] robots.txt includes AI crawlers: Visit `/robots.txt` and verify GPTBot, ClaudeBot rules
- [ ] llms.txt is accessible: `curl https://tldrsec.app/llms.txt` returns 200
- [ ] Comparison pages build: `npm run build` succeeds
- [ ] FAQ schemas present: Google Rich Results Test validates FAQ markup

#### Manual Verification:
- [ ] ChatGPT citation test: Ask "What tools help analyze SEC filings?" → tldrsec mentioned
- [ ] Perplexity citation test: Same query → check if tldrsec appears in sources
- [ ] Claude browsing test: Ask Claude to find SEC filing analysis tools
- [ ] Comparison pages share well: Correct OG images on social media

**Implementation Note**: After Phase 3, monitor AI citation rates weekly for 4 weeks. Track which queries trigger citations and optimize content based on patterns observed.

---

## Phase 4: Content Marketing & Blog

**Timeline**: Week 6-8
**Complexity**: High (content creation intensive)
**Priority**: Medium

### Overview
Launch blog with 10 initial posts, create additional comparison pages, build sector landing pages, and generate "how-to" guides for reading SEC filings.

---

### Task 4.1: Create Blog Infrastructure

**File**: `app/(marketing)/blog/page.tsx` (new file)
**File**: `app/(marketing)/blog/[slug]/page.tsx` (new file)

*Due to length constraints, blog implementation details are abbreviated. Key requirements:*

- MDX support for blog posts
- Blog post listing page with pagination
- Individual blog post template with metadata
- Category/tag filtering
- RSS feed generation
- Author profiles
- Related posts section

**Initial Blog Post Topics** (10 posts):
1. "How to Read a 10-K Filing in 30 Minutes (Step-by-Step Guide)"
2. "10-K vs 10-Q vs 8-K: What's the Difference?"
3. "5 Red Flags in SEC Filings Every Investor Should Know"
4. "Understanding Risk Factors in 10-K Filings"
5. "How to Track Insider Trading with Form 4 Filings"
6. "MD&A Section Explained: What Management Isn't Telling You"
7. "SEC Filing Calendar 2025: Important Deadlines"
8. "Best Free SEC Filing Resources for DIY Investors"
9. "How AI is Changing SEC Filing Analysis in 2025"
10. "Tesla 10-K Analysis: Key Takeaways from Latest Annual Report"

---

### Task 4.2: Create Sector Landing Pages

**File**: `app/(marketing)/sector/[sector]/page.tsx` (new file)

*Sector pages group companies by SIC code. Example sectors:*
- Technology
- Healthcare
- Financial Services
- Consumer Discretionary
- Energy
- Industrials

---

### Success Criteria

#### Automated Verification:
- [ ] Blog pages build: `npm run build`
- [ ] RSS feed generates: Visit `/blog/rss.xml`
- [ ] Blog metadata validates: Check meta tags in page source
- [ ] Internal linking works: No broken links in blog posts

#### Manual Verification:
- [ ] 10 blog posts published and accessible
- [ ] Blog posts indexed in Google (after 1-2 weeks)
- [ ] Social shares show correct OG images
- [ ] Reading time estimates accurate
- [ ] Mobile blog layout looks good

**Implementation Note**: Publish 1-2 blog posts per week after initial 10-post launch. Monitor Google Search Console for keyword opportunities.

---

## Phase 5: Performance & Monitoring

**Timeline**: Ongoing
**Complexity**: Medium
**Priority**: High

### Overview
Optimize Core Web Vitals, implement ISR, set up monitoring, track AI citations, and continuously improve based on data.

---

### Task 5.1: Optimize Core Web Vitals

**Actions**:
1. Enable next/image for all images
2. Implement font display: swap explicitly
3. Add loading="lazy" to below-fold images
4. Code split heavy dependencies
5. Implement route-level loading.tsx files
6. Enable Partial Prerendering (PPR) in next.config.js

**Target Metrics**:
- LCP (Largest Contentful Paint): <2.5s
- INP (Interaction to Next Paint): <200ms
- CLS (Cumulative Layout Shift): <0.1

---

### Task 5.2: Set Up Monitoring

**Google Search Console**:
1. Add property for tldrsec.app
2. Submit sitemap
3. Monitor indexing status
4. Track keyword rankings
5. Identify crawl errors

**Analytics Tracking** (using existing Vercel Analytics):
- Track pageviews by page type (company, filing, blog)
- Monitor conversion rates (newsletter signups)
- Identify top traffic sources
- Track user journey through site

---

### Task 5.3: AI Citation Monitoring

**Monthly Tasks**:
1. Query ChatGPT: "What tools help analyze SEC filings?"
2. Query Perplexity: "How do I track 10-K filings for [ticker]?"
3. Query Claude: "Explain the difference between 10-K and 10-Q"
4. Query Gemini: "Best SEC filing analysis tools"

**Track**:
- Citation rate (% of queries where tldrsec mentioned)
- Citation context (what queries trigger mentions)
- Competitor comparison (who else is cited)
- Source attribution (which pages get cited most)

**Target**: 25-40% citation rate for industry topics by Month 3

---

### Success Criteria

#### Automated Verification:
- [ ] Lighthouse SEO score >90 on all major pages
- [ ] Core Web Vitals pass in Google Search Console
- [ ] PageSpeed Insights shows "Good" ratings
- [ ] No console errors in production

#### Manual Verification:
- [ ] Google Search Console shows increasing indexed pages
- [ ] Organic traffic grows 20%+ month-over-month
- [ ] AI citation rate >15% by Month 1, >25% by Month 3
- [ ] Mobile experience scores high in testing
- [ ] Load time feels fast on 3G connection

---

## Testing Strategy

### Unit Tests
- Metadata generation functions
- Structured data schema validation
- Sitemap URL generation
- Component rendering

### Integration Tests
- Full page rendering with metadata
- Dynamic route generation
- Database queries for sitemap
- OG image API responses

### Manual Testing Steps
1. **Homepage**: Check meta tags, OG image, structured data
2. **Company pages**: Test AAPL, TSLA, MSFT - verify metadata, recent filings display
3. **Filing pages**: Test all 4 types (10-K, 10-Q, 8-K, Form 4) - verify FAQ schema
4. **Summary pages**: Check dynamic metadata, canonical URLs, OG images
5. **Comparison pages**: Verify table formatting, content accuracy
6. **Mobile**: Test all major pages on mobile device
7. **Social sharing**: Share pages on Twitter, LinkedIn, Facebook - verify OG images
8. **AI citation**: Test queries in ChatGPT, Perplexity, Claude

### SEO Validation Tools
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org Validator: https://validator.schema.org/
- XML Sitemap Validator: https://www.xml-sitemaps.com/validate-xml-sitemap.html
- Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
- Twitter Card Validator: https://cards-dev.twitter.com/validator
- Lighthouse CI: Run on every deployment

---

## Performance Considerations

### Database Query Optimization
- Index on `ticker.symbol` for company lookups
- Index on `summary.filingDate` for recent summaries
- Limit sitemap to top 2000 companies + recent 1000 summaries
- Use `select` to fetch only needed fields

### Caching Strategy
- ISR for company pages: 1 hour revalidation
- ISR for filing type pages: Static (no revalidation needed)
- Sitemap: 6 hour revalidation
- OG images: Edge caching (no revalidation)
- Static pages:永久缓存 via CDN

### Build Time Optimization
- Use `generateStaticParams` with `take: 2000` limit
- Parallel page generation in Next.js
- Incremental builds on Vercel
- Consider on-demand ISR for less popular companies

---

## Migration Notes

### Domain Migration (if changing from .com/.ai to .app)
1. Set up 301 redirects in `next.config.js`:
```javascript
async redirects() {
  return [
    {
      source: '/:path*',
      has: [{ type: 'host', value: 'tldrsec.com' }],
      destination: 'https://tldrsec.app/:path*',
      permanent: true,
    },
  ];
}
```

2. Update Google Search Console property
3. Submit change of address in Search Console
4. Update all external links and social profiles
5. Monitor traffic during transition

### Database Considerations
- No schema changes required
- Existing Prisma models support all queries
- Consider adding `popularity` or `viewCount` field to `CikMapping` for smarter static generation prioritization

---

## References

### Documentation
- Next.js Metadata API: https://nextjs.org/docs/app/building-your-application/optimizing/metadata
- Next.js Sitemap: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
- Next.js OG Image Generation: https://nextjs.org/docs/app/api-reference/functions/image-response
- Schema.org Types: https://schema.org/
- Google Search Central: https://developers.google.com/search

### Research Sources
- SEO best practices from Ahrefs, SEMrush, Search Engine Journal
- LLM optimization techniques from AI platform docs (OpenAI, Anthropic, Google)
- Next.js 15 performance optimization guides
- E-A-T guidelines for YMYL content

### Internal Documentation
- Current analytics: [PROGRESS.md](../PROGRESS.md)
- Product-market fit: [2025-11-16-product-market-fit-validation.md](2025-11-16-product-market-fit-validation.md)

---

**Plan Created**: 2025-11-16 23:00 CST
**Total Estimated Time**: 8 weeks
**Phases**: 5 phases (Critical Issues → Programmatic SEO → LLM Optimization → Content → Performance)
**Expected Outcome**: 2,000+ indexed pages, 25-40% AI citation rate, 20%+ monthly traffic growth
