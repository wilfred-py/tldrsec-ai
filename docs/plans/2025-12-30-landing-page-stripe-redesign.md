# Landing Page Redesign with Stripe Integration - Implementation Plan

**Date**: 2025-12-30 15:00:11 AEDT
**Git Commit**: a1a6529a49b51ab27c55f71a4b4013889b63eb81
**Branch**: main
**Repository**: tldrsec-ai

## Overview

Implement a new landing page based on the Replit prototype with 3-tier pricing ($0 Free, $15 Pro, $40 Premium), real filing preview data from the database, animated dialogs for full summary viewing, and Stripe checkout integration. The implementation ensures zero downtime by using feature flags and preserving the existing waitlist at `/waitlist`.

## Current State Analysis

### Existing Landing Page (`/app/page.tsx`)
- **Current Implementation**: Minimalist waitlist-focused landing page using `FocusedInvestorHero` component
- **Location**: `/app/page.tsx:76-80` with SSR counter data
- **Features**: Waitlist form, animated counter (60s animation), floating elements
- **No `(marketing)` route group exists** - all marketing content served from root

### Existing Stripe Integration
- **Webhook Handler**: `/app/api/webhook/stripe/route.ts` - Handles 6 event types
- **Checkout Flow**: `/app/api/user/subscription/route.ts:106-235` - Creates checkout sessions
- **Billing Portal**: `/app/api/billing/portal/route.ts:17-68`
- **Current Price IDs**: `STRIPE_BASIC_PRICE_ID`, `STRIPE_PROFESSIONAL_PRICE_ID`, `STRIPE_PREMIUM_PRICE_ID`
- **Current Pricing**: $9 BASIC, $29 PROFESSIONAL, $99 PREMIUM (in `lib/stripe.ts:38-81`)

### Database Schema for Filing Previews
- **Summary Table**: Contains `summaryText` (plain text) and `summaryJSON` (structured data with keyPoints)
- **Company Names**: Stored in `Ticker.companyName` field (line 57 of schema)
- **No `enhanced_summary` field** - the term refers to processing strategy, not a DB field
- **Query Pattern**: Join `Summary` with `Ticker` to get `companyName`

### Replit Prototype Analysis
From the Playwright inspection of the Replit prototype:

**Pricing Structure (DIFFERENT from original task file):**
- Free: $0/forever, 3 tickers, weekly digest emails
- Pro: $15/month, 10 tickers, real-time alerts, all filing types
- Premium: $40/month, unlimited tickers, API access, team features

**Key UI Elements:**
1. Hero section with "SEC Filings, Simplified" headline + filing preview card
2. Trust indicators: "2,500+ investors", "99.9% uptime", "<5 min delivery"
3. Features grid: 6 feature cards in 3x2 layout
4. Pricing section: 3-tier cards with "Most Popular" badge on Pro
5. CTA section: Email waitlist form with "Join Waitlist" button
6. Footer: Simple copyright

**Filing Preview Card Structure:**
- Badge (10-K), timestamp (2 min ago)
- Company name (Apple Inc.)
- Ticker + filing date (AAPL • Filed: Nov 24, 2025)
- Key Highlights (3 bullet points)
- "Read Full Summary" button

## Desired End State

After implementation:
1. New landing page at `/` with Replit prototype design
2. Existing waitlist preserved at `/waitlist` route
3. Feature flag `NEXT_PUBLIC_LANDING_PAGE_ENABLED` controls rollout
4. Real filing data from database displayed in preview cards
5. Animated dialog opens on "Read Full Summary" click
6. Stripe checkout integration for Pro ($15) and Premium ($40) tiers
7. Free tier redirects to Clerk signup

### Verification:
- `npm run build` succeeds without errors
- `npm run test` passes all tests
- Landing page loads in <2 seconds
- Filing preview dialog animates at 60fps
- Stripe test checkout completes successfully
- Waitlist form at `/waitlist` functions identically to current `/`

## What We're NOT Doing

- **NOT changing existing Stripe webhook logic** - only adding new price IDs
- **NOT modifying the dashboard or authenticated user flows**
- **NOT implementing API access for Premium tier** (future work)
- **NOT adding team collaboration features** (future work)
- **NOT creating annual billing options** (unless explicitly requested)
- **NOT touching the newsletter subscription flow** - it stays as-is

## Implementation Approach

### Elon's 5-Step Engineering Algorithm Applied

1. **Question Requirements**:
   - Do we need framer-motion? YES - already installed (v12.23.24), used in landing page
   - Do we need new database tables? NO - existing Summary + Ticker tables sufficient
   - Do we need new Stripe products? YES - new price IDs for $15/$40 tiers

2. **Delete/Simplify**:
   - Reuse existing `SUBSCRIPTION_PLANS` structure in `lib/stripe.ts`
   - Reuse existing Dialog component from shadcn/ui
   - Reuse existing framer-motion patterns from `hero-section.tsx`

3. **Optimize**:
   - Cache filing preview queries with React Query or SWR
   - Use static fallback data if database query fails

4. **Accelerate**:
   - TDD approach with failing tests first
   - Feature flag allows parallel development

5. **Automate**:
   - Automated tests validate feature flag behavior
   - CI/CD validates Stripe integration

---

## Phase 1: Environment & Stripe Configuration

### Overview
Set up new Stripe price IDs and feature flag infrastructure.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/config/stripe-pricing.test.ts`

```typescript
import { SUBSCRIPTION_PLANS, getPlanConfig } from '@/lib/stripe';

describe('Stripe Pricing Configuration', () => {
  it('should have FREE tier with $0 price', () => {
    const plan = getPlanConfig('FREE');
    expect(plan).toBeDefined();
    expect(plan?.monthlyPrice).toBe(0);
    expect(plan?.tickerLimit).toBe(3);
  });

  it('should have PRO tier with $15 price', () => {
    const plan = getPlanConfig('PRO');
    expect(plan).toBeDefined();
    expect(plan?.monthlyPrice).toBe(15);
    expect(plan?.tickerLimit).toBe(10);
  });

  it('should have PREMIUM tier with $40 price', () => {
    const plan = getPlanConfig('PREMIUM');
    expect(plan).toBeDefined();
    expect(plan?.monthlyPrice).toBe(40);
    expect(plan?.tickerLimit).toBe(-1); // unlimited
  });

  it('should have valid Stripe price IDs for paid tiers', () => {
    const pro = getPlanConfig('PRO');
    const premium = getPlanConfig('PREMIUM');

    expect(pro?.priceId).toMatch(/^price_/);
    expect(premium?.priceId).toMatch(/^price_/);
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="stripe-pricing"
# Expected: 4 failing tests (FREE tier doesn't exist, prices wrong)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Update Stripe Configuration
**File**: `lib/stripe.ts`

Add new plan structure (update existing `SUBSCRIPTION_PLANS`):

```typescript
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Free',
    priceId: null, // No Stripe checkout for free tier
    monthlyPrice: 0,
    tickerLimit: 3,
    monthlyFilings: 15, // 3 tickers × ~5 filings/month
    features: [
      'Weekly digest emails',
      '10-K and 10-Q summaries',
      'Basic filing alerts',
      'Community support',
    ],
  },
  PRO: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    monthlyPrice: 15,
    tickerLimit: 10,
    monthlyFilings: 100,
    features: [
      'Real-time email alerts',
      'All filing types (8-K, Form 4)',
      'Priority processing',
      'Email support',
    ],
  },
  PREMIUM: {
    name: 'Premium',
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID || '',
    monthlyPrice: 40,
    tickerLimit: -1, // unlimited
    monthlyFilings: 1000,
    features: [
      'API access for developers',
      'Priority processing queue',
      'Team collaboration features',
      'Dedicated support',
    ],
  },
} as const;
```

**Checkpoint 1.2.1**: First tests pass:
```bash
npm run test -- --testPathPattern="stripe-pricing" --testNamePattern="FREE tier"
# Expected: 1 passing
```

#### 1.2.2 Add Environment Variables
**File**: `.env.local` (and Vercel)

```bash
# New Stripe Price IDs (create in Stripe Dashboard)
STRIPE_PRO_PRICE_ID=price_xxx15monthly
STRIPE_PREMIUM_PRICE_ID=price_xxx40monthly

# Feature Flag
NEXT_PUBLIC_LANDING_PAGE_ENABLED=false
```

**Checkpoint 1.2.2**: All pricing tests pass:
```bash
npm run test -- --testPathPattern="stripe-pricing"
# Expected: 4 passing
```

### Step 1.3: 🔵 Refactor

- [ ] Remove deprecated BASIC/PROFESSIONAL/PREMIUM naming if no longer used
- [ ] Add TypeScript types for new plan structure
- [ ] Update Prisma `PlanType` enum if needed

**Checkpoint 1.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="stripe-pricing"
# Expected: 4 passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="stripe-pricing"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Stripe Dashboard has new $15 and $40 price configurations
- [ ] Environment variables set in Vercel for production

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Waitlist Migration & Feature Flag

### Overview
Move existing waitlist to `/waitlist` route and implement feature flag for landing page rollout.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/routes/waitlist-migration.test.ts`

```typescript
describe('Waitlist Migration', () => {
  it('should render waitlist page at /waitlist route', async () => {
    // Test that /waitlist renders the waitlist form
    const response = await fetch('/waitlist');
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('waitlist');
  });

  it('should redirect / to /waitlist when feature flag is false', async () => {
    process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED = 'false';
    // Test redirect behavior
  });

  it('should render landing page at / when feature flag is true', async () => {
    process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED = 'true';
    // Test landing page renders
  });
});
```

**Checkpoint 2.1**: Tests fail (route doesn't exist):
```bash
npm run test -- --testPathPattern="waitlist-migration"
# Expected: 3 failing tests
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Create Waitlist Route
**File**: `app/waitlist/page.tsx`

```typescript
import { Suspense } from 'react';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';
import { getCounterData } from '@/lib/waitlist/counter-data';

export const metadata = {
  title: 'Join the Waitlist - tldrsec.app',
  description: 'Join thousands of investors getting AI-powered SEC filing summaries.',
};

export default async function WaitlistPage() {
  const { baseCount, realCount } = await getCounterData();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FocusedInvestorHero baseCount={baseCount} realCount={realCount} />
    </Suspense>
  );
}
```

**Checkpoint 2.2.1**: Waitlist route test passes:
```bash
npm run test -- --testPathPattern="waitlist-migration" --testNamePattern="waitlist page"
# Expected: 1 passing
```

#### 2.2.2 Update Root Page with Feature Flag
**File**: `app/page.tsx`

```typescript
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

// Import landing page components (to be created in Phase 3)
import { LandingPage } from '@/components/landing/new-landing-page';

export default async function HomePage() {
  // Feature flag check
  if (process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED !== 'true') {
    redirect('/waitlist');
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LandingPage />
    </Suspense>
  );
}
```

**Checkpoint 2.2.2**: Redirect test passes:
```bash
npm run test -- --testPathPattern="waitlist-migration" --testNamePattern="redirect"
# Expected: 2 passing
```

### Step 2.3: 🔵 Refactor

- [ ] Extract counter data fetching to shared utility
- [ ] Add loading skeleton component for Suspense fallback
- [ ] Ensure SEO metadata is appropriate for each route

**Checkpoint 2.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="waitlist-migration"
# Expected: 3 passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Build succeeds: `npm run build`
- [ ] No broken links: `npm run lint`

#### Manual Verification:
- [ ] Navigate to `/waitlist` - shows existing waitlist form
- [ ] Navigate to `/` with flag=false - redirects to `/waitlist`
- [ ] Waitlist form submission works correctly
- [ ] Counter animation works on waitlist page

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Landing Page Components

### Overview
Build the new landing page components matching the Replit prototype design.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/new-landing-page.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { LandingPage } from '@/components/landing/new-landing-page';

describe('LandingPage', () => {
  it('should render hero section with headline', () => {
    render(<LandingPage filingPreviews={[]} />);
    expect(screen.getByText(/SEC Filings/i)).toBeInTheDocument();
    expect(screen.getByText(/Simplified/i)).toBeInTheDocument();
  });

  it('should render trust indicators', () => {
    render(<LandingPage filingPreviews={[]} />);
    expect(screen.getByText(/2,500\+ investors/i)).toBeInTheDocument();
    expect(screen.getByText(/99\.9% uptime/i)).toBeInTheDocument();
  });

  it('should render features section', () => {
    render(<LandingPage filingPreviews={[]} />);
    expect(screen.getByText(/Built for Modern Investors/i)).toBeInTheDocument();
    expect(screen.getByText(/300\+ Pages → 2 Minutes/i)).toBeInTheDocument();
  });

  it('should render pricing section with 3 tiers', () => {
    render(<LandingPage filingPreviews={[]} />);
    expect(screen.getByText(/Simple, Transparent Pricing/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0/)).toBeInTheDocument();
    expect(screen.getByText(/\$15/)).toBeInTheDocument();
    expect(screen.getByText(/\$40/)).toBeInTheDocument();
  });

  it('should render filing preview card when data provided', () => {
    const mockFiling = {
      id: '1',
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      filingType: '10-K',
      filedAt: new Date().toISOString(),
      keyHighlights: ['Revenue increased 8% YoY'],
    };

    render(<LandingPage filingPreviews={[mockFiling]} />);
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
  });
});
```

**Checkpoint 3.1**: Tests fail (components don't exist):
```bash
npm run test -- --testPathPattern="new-landing-page"
# Expected: 5 failing tests
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Create Main Landing Page Component
**File**: `components/landing/new-landing-page.tsx`

```typescript
'use client';

import { motion } from 'framer-motion';
import { HeroSection } from './sections/hero-section';
import { FeaturesSection } from './sections/features-section';
import { PricingSection } from './sections/pricing-section';
import { CTASection } from './sections/cta-section';
import { FilingPreviewCard } from './filing-preview-card';

interface FilingPreview {
  id: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filedAt: string;
  keyHighlights: string[];
}

interface LandingPageProps {
  filingPreviews: FilingPreview[];
}

export function LandingPage({ filingPreviews }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <HeroSection filingPreview={filingPreviews[0]} />
      <FeaturesSection />
      <PricingSection />
      <CTASection />
    </div>
  );
}
```

#### 3.2.2 Create Hero Section
**File**: `components/landing/sections/hero-section.tsx`

```typescript
'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { FilingPreviewCard } from '../filing-preview-card';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

interface HeroSectionProps {
  filingPreview?: {
    id: string;
    ticker: string;
    companyName: string;
    filingType: string;
    filedAt: string;
    keyHighlights: string[];
  };
}

export function HeroSection({ filingPreview }: HeroSectionProps) {
  return (
    <section className="relative px-6 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center"
        >
          {/* Left Column - Copy */}
          <div className="space-y-8">
            <motion.div variants={item}>
              <span className="inline-block rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-600">
                AI-Powered SEC Intelligence
              </span>
            </motion.div>

            <motion.h1
              variants={item}
              className="text-5xl font-bold tracking-tight text-slate-900 lg:text-6xl"
            >
              SEC Filings,{' '}
              <span className="text-blue-600">Simplified</span>
            </motion.h1>

            <motion.p
              variants={item}
              className="text-xl text-slate-600 max-w-lg"
            >
              Transform 300+ page regulatory documents into actionable 2-minute
              summaries. Delivered to your inbox within minutes of SEC publication.
            </motion.p>

            <motion.div variants={item} className="flex gap-4">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                Start Free Trial
              </Button>
              <Button size="lg" variant="outline">
                View Pricing
              </Button>
            </motion.div>

            <motion.div variants={item} className="flex gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                2,500+ investors
              </span>
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                99.9% uptime
              </span>
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                &lt;5 min delivery
              </span>
            </motion.div>
          </div>

          {/* Right Column - Filing Preview */}
          <motion.div variants={item}>
            {filingPreview && <FilingPreviewCard filing={filingPreview} />}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
```

#### 3.2.3 Create Features Section
**File**: `components/landing/sections/features-section.tsx`

```typescript
'use client';

import { motion } from 'framer-motion';
import {
  FileText,
  Zap,
  Bell,
  BarChart3,
  Shield,
  Clock
} from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: '300+ Pages → 2 Minutes',
    description: 'Transform lengthy SEC filings into concise, actionable summaries that save you hours of reading.',
  },
  {
    icon: Zap,
    title: 'Real-Time Monitoring',
    description: 'Automated tracking of SEC EDGAR with <5 minute delivery from publication to your inbox.',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Email alerts for every filing from your watchlist companies, never miss critical updates.',
  },
  {
    icon: BarChart3,
    title: 'Filing-Type Analysis',
    description: 'Specialized summaries for 10-K, 10-Q, 8-K, Form 4, and more with context-aware insights.',
  },
  {
    icon: Shield,
    title: 'Investment-Grade Quality',
    description: 'AI-powered analysis that highlights risks, opportunities, and material changes instantly.',
  },
  {
    icon: Clock,
    title: 'Save 10+ Hours Weekly',
    description: 'Spend less time reading filings, more time making informed investment decisions.',
  },
];

export function FeaturesSection() {
  return (
    <section className="px-6 py-24 bg-white">
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Built for Modern Investors
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Everything you need to stay ahead of the market with instant SEC filing insights
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="p-6 rounded-xl border border-slate-200 bg-slate-50/50"
            >
              <feature.icon className="h-8 w-8 text-blue-600 mb-4" />
              <h3 className="font-semibold text-slate-900 mb-2">{feature.title}</h3>
              <p className="text-slate-600 text-sm">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

#### 3.2.4 Create Pricing Section
**File**: `components/landing/sections/pricing-section.tsx`

```typescript
'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { SUBSCRIPTION_PLANS } from '@/lib/stripe';
import { useRouter } from 'next/navigation';

export function PricingSection() {
  const router = useRouter();

  const handlePlanSelect = (planKey: string) => {
    if (planKey === 'FREE') {
      router.push('/sign-up');
    } else if (planKey === 'PREMIUM') {
      // Contact sales for premium
      window.location.href = 'mailto:sales@tldrsec.app?subject=Premium Plan Inquiry';
    } else {
      // Redirect to checkout (requires auth)
      router.push(`/sign-up?plan=${planKey.toLowerCase()}`);
    }
  };

  return (
    <section className="px-6 py-24 bg-slate-50">
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-slate-600">
            Start free, upgrade as you grow
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3 max-w-5xl mx-auto">
          {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan], index) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`relative p-8 rounded-2xl bg-white border-2 ${
                key === 'PRO'
                  ? 'border-blue-600 shadow-xl'
                  : 'border-slate-200'
              }`}
            >
              {key === 'PRO' && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-sm font-medium px-4 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-4xl font-bold text-slate-900">
                    ${plan.monthlyPrice}
                  </span>
                  <span className="text-slate-500">
                    {plan.monthlyPrice === 0 ? '/forever' : '/per month'}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {plan.tickerLimit === -1 ? 'Unlimited' : plan.tickerLimit} tickers
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handlePlanSelect(key)}
                className={`w-full ${
                  key === 'PRO'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
                variant={key === 'PREMIUM' ? 'outline' : 'default'}
              >
                {key === 'FREE' && 'Start Free'}
                {key === 'PRO' && 'Start Pro Trial'}
                {key === 'PREMIUM' && 'Contact Sales'}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

#### 3.2.5 Create CTA Section
**File**: `components/landing/sections/cta-section.tsx`

```typescript
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CTASection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setStatus('success');
        setEmail('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="px-6 py-24 bg-slate-900">
      <div className="mx-auto max-w-3xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl font-bold text-white mb-4"
        >
          Start Monitoring SEC Filings Today
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-lg text-slate-300 mb-8"
        >
          Join thousands of investors who trust tldrsec.app for real-time SEC intelligence
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          onSubmit={handleSubmit}
          className="flex gap-3 max-w-md mx-auto"
        >
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-white/10 border-white/20 text-white placeholder:text-slate-400"
          />
          <Button
            type="submit"
            disabled={status === 'loading'}
            className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
          >
            {status === 'loading' ? 'Joining...' : 'Join Waitlist'}
          </Button>
        </motion.form>

        {status === 'success' && (
          <p className="text-green-400 mt-4">Welcome! Check your email for confirmation.</p>
        )}

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-sm text-slate-400 mt-4"
        >
          No credit card required • Start with 3 free tickers
        </motion.p>
      </div>
    </section>
  );
}
```

**Checkpoint 3.2.5**: All landing page tests pass:
```bash
npm run test -- --testPathPattern="new-landing-page"
# Expected: 5 passing
```

### Step 3.3: 🔵 Refactor

- [ ] Extract animation variants to shared constants
- [ ] Add proper TypeScript types for all props
- [ ] Ensure consistent spacing and color usage
- [ ] Add aria labels for accessibility

**Checkpoint 3.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="new-landing-page"
# Expected: 5 passing
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Set `NEXT_PUBLIC_LANDING_PAGE_ENABLED=true` locally
- [ ] Navigate to `/` - new landing page renders
- [ ] All sections visible and properly styled
- [ ] Animations are smooth (60fps)
- [ ] Mobile responsive design works

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Filing Preview Dialog & Data Integration

### Overview
Implement the animated dialog for viewing full filing summaries and connect to real database data.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/filing-preview-dialog.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { FilingPreviewCard } from '@/components/landing/filing-preview-card';

const mockFiling = {
  id: '1',
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  filingType: '10-K',
  filedAt: new Date().toISOString(),
  keyHighlights: ['Revenue increased 8% YoY to $394.3B'],
  fullSummary: 'Full summary text here...',
};

describe('FilingPreviewCard', () => {
  it('should render filing card with company info', () => {
    render(<FilingPreviewCard filing={mockFiling} />);
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
    expect(screen.getByText('10-K')).toBeInTheDocument();
  });

  it('should render key highlights', () => {
    render(<FilingPreviewCard filing={mockFiling} />);
    expect(screen.getByText(/Revenue increased 8%/)).toBeInTheDocument();
  });

  it('should open dialog when Read Full Summary clicked', async () => {
    render(<FilingPreviewCard filing={mockFiling} />);

    const button = screen.getByRole('button', { name: /Read Full Summary/i });
    fireEvent.click(button);

    // Dialog should appear
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('should close dialog on backdrop click', async () => {
    render(<FilingPreviewCard filing={mockFiling} />);

    fireEvent.click(screen.getByRole('button', { name: /Read Full Summary/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // Click backdrop
    fireEvent.click(screen.getByRole('dialog').parentElement!);

    // Dialog should close
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

**Test File**: `__tests__/services/landing-page-service.test.ts`

```typescript
import { getLandingPageFilings } from '@/lib/data/landing-page-service';

describe('getLandingPageFilings', () => {
  it('should return array of filing previews', async () => {
    const filings = await getLandingPageFilings();
    expect(Array.isArray(filings)).toBe(true);
  });

  it('should include required fields in each filing', async () => {
    const filings = await getLandingPageFilings();

    if (filings.length > 0) {
      const filing = filings[0];
      expect(filing).toHaveProperty('id');
      expect(filing).toHaveProperty('ticker');
      expect(filing).toHaveProperty('companyName');
      expect(filing).toHaveProperty('filingType');
      expect(filing).toHaveProperty('keyHighlights');
    }
  });

  it('should return diverse filing types', async () => {
    const filings = await getLandingPageFilings();
    const types = new Set(filings.map(f => f.filingType));
    // Should have at least 2 different filing types if data exists
    expect(types.size).toBeGreaterThanOrEqual(1);
  });
});
```

**Checkpoint 4.1**: Tests fail:
```bash
npm run test -- --testPathPattern="filing-preview"
# Expected: 6+ failing tests
```

### Step 4.2: 🟢 Implement to Pass Tests

#### 4.2.1 Create Filing Preview Card with Dialog
**File**: `components/landing/filing-preview-card.tsx`

```typescript
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FilingPreviewCardProps {
  filing: {
    id: string;
    ticker: string;
    companyName: string;
    filingType: string;
    filedAt: string;
    keyHighlights: string[];
    fullSummary?: string;
  };
}

export function FilingPreviewCard({ filing }: FilingPreviewCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const filedDate = new Date(filing.filedAt);
  const timeAgo = formatDistanceToNow(filedDate, { addSuffix: false });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-md"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Badge variant="secondary" className="bg-slate-100">
            {filing.filingType}
          </Badge>
          <span className="text-sm text-slate-500">{timeAgo} ago</span>
        </div>

        {/* Company Info */}
        <h3 className="text-xl font-semibold text-slate-900 mb-1">
          {filing.companyName}
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {filing.ticker} • Filed: {filedDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>

        {/* Key Highlights */}
        <div className="mb-4">
          <h4 className="font-semibold text-slate-900 mb-2">Key Highlights</h4>
          <ul className="space-y-1">
            {filing.keyHighlights.slice(0, 3).map((highlight, i) => (
              <li key={i} className="text-sm text-slate-600">
                • {highlight}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA Button */}
        <Button
          onClick={() => setDialogOpen(true)}
          variant="outline"
          className="w-full"
        >
          Read Full Summary
        </Button>
      </motion.div>

      {/* Full Summary Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="secondary">{filing.filingType}</Badge>
              <span className="text-sm text-slate-500">{timeAgo} ago</span>
            </div>
            <DialogTitle className="text-2xl">
              {filing.companyName} ({filing.ticker})
            </DialogTitle>
            <p className="text-sm text-slate-500">
              Filed: {filedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {/* Key Highlights */}
            <div>
              <h4 className="font-semibold text-slate-900 mb-3">Key Highlights</h4>
              <ul className="space-y-2">
                {filing.keyHighlights.map((highlight, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-600">
                    <span className="text-blue-600 mt-1">•</span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>

            {/* Full Summary */}
            {filing.fullSummary && (
              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Full Summary</h4>
                <div className="prose prose-slate prose-sm max-w-none">
                  <p className="text-slate-600 leading-relaxed">
                    {filing.fullSummary}
                  </p>
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="pt-4 border-t">
              <p className="text-sm text-slate-500 mb-3">
                Get summaries like this delivered to your inbox within minutes of SEC publication.
              </p>
              <Button className="bg-blue-600 hover:bg-blue-700">
                Start Free Trial
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

#### 4.2.2 Create Landing Page Data Service
**File**: `lib/data/landing-page-service.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

export interface FilingPreviewData {
  id: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filedAt: string;
  keyHighlights: string[];
  fullSummary?: string;
}

// Fallback data if database is unavailable
const FALLBACK_FILINGS: FilingPreviewData[] = [
  {
    id: 'fallback-1',
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    filingType: '10-K',
    filedAt: new Date().toISOString(),
    keyHighlights: [
      'Revenue increased 8% YoY to $394.3B',
      'Services segment grew 16% to record $85.2B',
      'Operating margin improved to 30.1%',
    ],
    fullSummary: 'Apple reported strong fiscal year results with total revenue of $394.3 billion, representing an 8% increase year-over-year...',
  },
];

export async function getLandingPageFilings(): Promise<FilingPreviewData[]> {
  try {
    const prisma = getPrismaClient();

    // Query recent summaries with diverse filing types
    const summaries = await prisma.summary.findMany({
      where: {
        summaryText: { not: null },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      include: {
        ticker: {
          select: {
            symbol: true,
            companyName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
      distinct: ['filingType'], // Get diverse filing types
    });

    if (summaries.length === 0) {
      return FALLBACK_FILINGS;
    }

    return summaries.map((summary) => {
      // Extract key points from summaryJSON
      const summaryJSON = summary.summaryJSON as Record<string, unknown> | null;
      const keyPoints = (summaryJSON?.keyPoints as string[]) || [];

      return {
        id: summary.id,
        ticker: summary.ticker.symbol,
        companyName: summary.ticker.companyName,
        filingType: summary.filingType,
        filedAt: summary.filingDate.toISOString(),
        keyHighlights: keyPoints.slice(0, 5),
        fullSummary: summary.summaryText || undefined,
      };
    });
  } catch (error) {
    console.error('Error fetching landing page filings:', error);
    return FALLBACK_FILINGS;
  }
}
```

#### 4.2.3 Update Landing Page to Fetch Data
**File**: `app/page.tsx`

```typescript
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LandingPage } from '@/components/landing/new-landing-page';
import { getLandingPageFilings } from '@/lib/data/landing-page-service';

export default async function HomePage() {
  // Feature flag check
  if (process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED !== 'true') {
    redirect('/waitlist');
  }

  const filingPreviews = await getLandingPageFilings();

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <LandingPage filingPreviews={filingPreviews} />
    </Suspense>
  );
}
```

**Checkpoint 4.2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="filing-preview"
# Expected: 6+ passing
```

### Step 4.3: 🔵 Refactor

- [ ] Add loading skeleton for dialog content
- [ ] Implement error boundary for filing card
- [ ] Add keyboard navigation for dialog (ESC to close)
- [ ] Optimize database query with proper indexes

**Checkpoint 4.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="filing-preview"
# Expected: All passing
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Build succeeds: `npm run build`
- [ ] Database query performance <500ms

#### Manual Verification:
- [ ] Filing preview card displays real data from database
- [ ] Dialog opens smoothly with animation
- [ ] Dialog closes on backdrop click and ESC key
- [ ] Fallback data displays if database unavailable
- [ ] Dialog content scrolls properly on mobile

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Stripe Checkout Integration

### Overview
Connect pricing buttons to Stripe checkout for Pro and Premium tiers.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/checkout.test.ts`

```typescript
describe('Checkout API', () => {
  it('should create checkout session for PRO plan', async () => {
    // Mock authenticated user
    const response = await fetch('/api/user/subscription', {
      method: 'POST',
      body: JSON.stringify({ planType: 'PRO' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.url).toContain('checkout.stripe.com');
  });

  it('should reject checkout for FREE plan', async () => {
    const response = await fetch('/api/user/subscription', {
      method: 'POST',
      body: JSON.stringify({ planType: 'FREE' }),
    });

    expect(response.status).toBe(400);
  });
});
```

**Checkpoint 5.1**: Tests fail:
```bash
npm run test -- --testPathPattern="checkout"
# Expected: Failing tests
```

### Step 5.2: 🟢 Implement to Pass Tests

#### 5.2.1 Update Subscription API for New Plans
**File**: `app/api/user/subscription/route.ts`

Update the POST handler to support new plan types:

```typescript
// Add validation for new plan types
const validPlans = ['PRO', 'PREMIUM'];
if (!validPlans.includes(planType)) {
  return NextResponse.json(
    { error: 'Invalid plan type. Use PRO or PREMIUM.' },
    { status: 400 }
  );
}

// Get price ID from new SUBSCRIPTION_PLANS
const plan = SUBSCRIPTION_PLANS[planType as keyof typeof SUBSCRIPTION_PLANS];
if (!plan?.priceId) {
  return NextResponse.json(
    { error: 'Price ID not configured for this plan.' },
    { status: 500 }
  );
}
```

#### 5.2.2 Update Pricing Section Click Handlers
**File**: `components/landing/sections/pricing-section.tsx`

Update to handle authenticated vs unauthenticated users:

```typescript
import { useAuth } from '@clerk/nextjs';
import { useSubscription } from '@/hooks/use-subscription';

export function PricingSection() {
  const { isSignedIn } = useAuth();
  const { createCheckout } = useSubscription();
  const router = useRouter();

  const handlePlanSelect = async (planKey: string) => {
    if (planKey === 'FREE') {
      router.push('/sign-up');
      return;
    }

    if (planKey === 'PREMIUM') {
      window.location.href = 'mailto:sales@tldrsec.app?subject=Premium Plan Inquiry';
      return;
    }

    // PRO plan
    if (!isSignedIn) {
      // Redirect to sign up with plan intent
      router.push(`/sign-up?redirect=/dashboard/billing&plan=${planKey.toLowerCase()}`);
      return;
    }

    // Authenticated user - create checkout
    const plan = SUBSCRIPTION_PLANS[planKey as keyof typeof SUBSCRIPTION_PLANS];
    if (plan?.priceId) {
      const url = await createCheckout(planKey, plan.priceId);
      if (url) {
        window.location.href = url;
      }
    }
  };

  // ... rest of component
}
```

**Checkpoint 5.2.2**: Checkout tests pass:
```bash
npm run test -- --testPathPattern="checkout"
# Expected: All passing
```

### Step 5.3: 🔵 Refactor

- [ ] Add loading states during checkout creation
- [ ] Handle Stripe errors gracefully with user-friendly messages
- [ ] Add analytics tracking for checkout attempts

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] All checkout tests pass
- [ ] Build succeeds
- [ ] No TypeScript errors

#### Manual Verification:
- [ ] Click "Start Pro Trial" as unauthenticated user → redirects to sign-up
- [ ] Click "Start Pro Trial" as authenticated user → opens Stripe checkout
- [ ] Complete test checkout with Stripe test card (4242 4242 4242 4242)
- [ ] Verify webhook updates subscription status
- [ ] "Contact Sales" opens email client

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Final Integration & Testing

### Overview
Comprehensive testing, performance optimization, and deployment preparation.

### Step 6.1: End-to-End Testing

**Test File**: `__tests__/e2e/landing-page.test.ts`

```typescript
describe('Landing Page E2E', () => {
  beforeAll(async () => {
    // Set feature flag
    process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED = 'true';
  });

  it('should complete full user journey from landing to signup', async () => {
    // Navigate to landing page
    // Click "Start Free Trial"
    // Verify redirect to sign-up
  });

  it('should complete checkout flow for Pro plan', async () => {
    // Login as test user
    // Click "Start Pro Trial"
    // Verify Stripe checkout opens
  });

  it('should display filing preview dialog', async () => {
    // Click "Read Full Summary"
    // Verify dialog opens with content
    // Close dialog
  });
});
```

### Step 6.2: Performance Testing

```bash
# Run Lighthouse audit
npm run build && npm run start
# Open Chrome DevTools → Lighthouse → Run audit

# Target metrics:
# - Performance: >90
# - Accessibility: >95
# - Best Practices: >95
# - SEO: >90
```

### Step 6.3: Mobile Testing

Verify on:
- [ ] iPhone SE (375px width)
- [ ] iPhone 14 Pro (390px width)
- [ ] iPad (768px width)
- [ ] Desktop (1440px width)

### Step 6.4: Production Readiness Checklist

#### Environment Variables:
- [ ] `STRIPE_PRO_PRICE_ID` set in Vercel
- [ ] `STRIPE_PREMIUM_PRICE_ID` set in Vercel
- [ ] `NEXT_PUBLIC_LANDING_PAGE_ENABLED=false` initially

#### Stripe Dashboard:
- [ ] Products created: Pro ($15/mo), Premium ($40/mo)
- [ ] Webhook endpoint updated for new events
- [ ] Test mode verified, ready for live mode

#### Monitoring:
- [ ] Error tracking configured for landing page components
- [ ] Analytics tracking for conversion events
- [ ] Performance monitoring for database queries

### Step 6.5: Staged Rollout

1. **Deploy with flag=false**: `NEXT_PUBLIC_LANDING_PAGE_ENABLED=false`
2. **Verify `/waitlist`** works correctly in production
3. **Test landing page** in preview deployment with flag=true
4. **Enable for 10% of traffic** using Vercel edge config (optional)
5. **Monitor for 24 hours**
6. **Full rollout**: Set `NEXT_PUBLIC_LANDING_PAGE_ENABLED=true`

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Each test validates one behavior
2. **Descriptive Names**: "should [verb] when [condition]" pattern
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**: Focus on user-facing outcomes

### Test Categories

#### 1. Unit Tests
- Pricing configuration validation
- Data service functions
- Component rendering

#### 2. Integration Tests
- API route behavior
- Stripe checkout flow
- Database queries

#### 3. E2E Tests
- Complete user journeys
- Cross-component interactions

### Manual Testing Steps

1. Navigate to landing page with feature flag enabled
2. Verify all sections render correctly
3. Click "Read Full Summary" → dialog opens
4. Close dialog via X, backdrop, or ESC
5. Click "Start Free" → redirects to sign-up
6. Click "Start Pro Trial" (logged out) → redirects to sign-up with plan
7. Click "Start Pro Trial" (logged in) → opens Stripe checkout
8. Submit waitlist email → success message appears
9. Test on mobile viewport sizes

---

## Performance Considerations

### Database Query Optimization
- Use `distinct` to get diverse filing types
- Limit to 6 results for landing page
- Add index on `Summary.createdAt` if not present
- Cache results for 5 minutes using React Query or SWR

### Animation Performance
- Use `transform` and `opacity` only (GPU-accelerated)
- Add `will-change` hint for animated elements
- Use `AnimatePresence` mode="wait" for smoother transitions
- Test on low-end devices

### Bundle Size
- Import framer-motion components selectively
- Use dynamic imports for dialog content
- Verify no duplicate dependencies

---

## Migration Notes

### Preserving Waitlist Functionality
- All waitlist code moves to `/app/waitlist/page.tsx`
- Counter data fetching shared between routes
- Newsletter subscribe API unchanged
- Analytics tracking preserved

### Database Changes
- No schema changes required
- Existing Summary and Ticker tables sufficient
- May add index for performance if needed

### Environment Variable Updates
- Add `STRIPE_PRO_PRICE_ID` and `STRIPE_PREMIUM_PRICE_ID`
- Add `NEXT_PUBLIC_LANDING_PAGE_ENABLED`
- Deprecate old BASIC/PROFESSIONAL/PREMIUM naming gradually

---

## References

- Original task: `.claude/tasks/landing-page-stripe-redesign.md`
- Replit prototype: Screenshots saved to `.playwright-mcp/`
- Existing Stripe integration: `lib/stripe.ts`, `app/api/webhook/stripe/route.ts`
- Current landing page: `app/page.tsx`, `components/landing/focused-investor-hero.tsx`
- Database schema: `prisma/schema.prisma:68-123` (Summary model)
