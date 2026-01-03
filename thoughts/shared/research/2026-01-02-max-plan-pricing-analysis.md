---
date: 2026-01-02T15:56:48+11:00
researcher: Claude
git_commit: 2742423c31a6593d377b452baf3594a83754298c
branch: feature/remove-budget-add-credit-monitoring
repository: tldrsec-ai
topic: "Max Plan Pricing Analysis - Current State and Value Proposition"
tags: [research, pricing, max-plan, subscription, stripe]
status: complete
last_updated: 2026-01-02
last_updated_by: Claude
---

# Research: Max Plan Pricing Analysis

**Date**: 2026-01-02T15:56:48 AEDT
**Researcher**: Claude
**Git Commit**: 2742423c31a6593d377b452baf3594a83754298c
**Branch**: feature/remove-budget-add-credit-monitoring
**Repository**: tldrsec-ai

## Research Question

Should the pricing of the Max plan be higher? The proposition value of the plan should be reflected in the price.

## Summary

The Max plan is currently priced at **$139/month** (or **$1,390/year** with 2 months free). This document describes the current pricing structure, how it compares to existing competitive research, and the value proposition as currently implemented.

## Detailed Findings

### Current Max Plan Pricing Configuration

The Max plan pricing is defined in [lib/stripe.ts:75-91](lib/stripe.ts#L75-L91):

```typescript
MAX: {
  name: 'Max',
  monthlyPriceId: process.env.STRIPE_MAX_MONTHLY_PRICE_ID || '',
  annualPriceId: process.env.STRIPE_MAX_ANNUAL_PRICE_ID || '',
  monthlyPrice: 139,
  annualPrice: 1390, // 2 months free (10 months x $139)
  tickerLimit: -1, // unlimited
  filingTypes: ['ALL'] as const,
  emailFrequency: 'realtime' as const,
  features: [
    '**Unlimited** companies',
    'Real-time email alerts',
    '**First** priority processing queue',
    'All filing types',
    'Dedicated support',
  ],
}
```

### Full Pricing Tier Structure

| Plan | Monthly Price | Annual Price | Tickers | Filing Types | Email Frequency |
|------|---------------|--------------|---------|--------------|-----------------|
| Free | $0 | $0 | 3 | 10-K, 10-Q only | Weekly |
| Pro | $99 | $990 | 10 | 10-K, 10-Q, 8-K, FORM4, DEF14A | Real-time |
| Max | $139 | $1,390 | Unlimited | ALL | Real-time |

### Annual Discount Structure

The annual discount is calculated in [lib/stripe.ts:194-199](lib/stripe.ts#L194-L199):

```typescript
export function calculateSavingsPercentage(planType: PlanType): number {
  const plan = SUBSCRIPTION_PLANS[planType];
  if (plan.monthlyPrice === 0) return 0;
  const monthlyTotal = plan.monthlyPrice * 12;
  return Math.round(((monthlyTotal - plan.annualPrice) / monthlyTotal) * 100);
}
```

**Current Annual Savings:**
- Pro: $990 annual vs $1,188 monthly total = **~17% savings** (2 months free)
- Max: $1,390 annual vs $1,668 monthly total = **~17% savings** (2 months free)

### Max Plan Value Proposition (as displayed)

From [components/landing/sections-v2/pricing-section-v2.tsx:52-64](components/landing/sections-v2/pricing-section-v2.tsx#L52-L64):

- Description: "For professional traders & analysts"
- Icon: Crown
- Features:
  1. **Unlimited** companies
  2. Real-time email alerts
  3. **First** priority processing queue
  4. All filing types
  5. Dedicated support

The pricing section displays "Everything in Pro" to indicate tier inheritance.

### Price Gap Analysis (Current)

| Tier Jump | Price Difference | Value Difference |
|-----------|------------------|------------------|
| Free → Pro | +$99/mo | +7 tickers, real-time alerts, more filing types, email support |
| Pro → Max | +$40/mo | Unlimited tickers (vs 10), first priority processing, dedicated support |

**Observation:** The $40 gap between Pro ($99) and Max ($139) represents a 40% price increase for unlimited tickers.

## Competitive Research Context

According to existing research in [thoughts/shared/research/2025-12-06-competitive-pricing-intelligence-report.md](thoughts/shared/research/2025-12-06-competitive-pricing-intelligence-report.md):

### Market Tier Comparison

| Market Tier | Price Range (Annual) | Example Platforms |
|-------------|---------------------|-------------------|
| Enterprise | $20,000-$32,000/user | Bloomberg ($31,980), AlphaSense, Tegus |
| Professional | $200-$2,500/user | Koyfin Pro ($948), Seeking Alpha PRO ($2,400) |
| Prosumer | $200-$500/user | Koyfin Plus ($468), Seeking Alpha Premium ($299) |
| Retail | $100-$300/user | Motley Fool ($199), Simply Wall St ($258) |

### tldrsec Current Positioning

- **Free**: $0/year - Retail tier (low end)
- **Pro**: $1,188/year ($99/mo) - Professional tier (mid-range)
- **Max**: $1,668/year ($139/mo) - Professional tier (mid-range)

### Prior Strategy Research Recommendations

From [thoughts/shared/research/2025-12-02-pricing-strategy-analysis.md](thoughts/shared/research/2025-12-02-pricing-strategy-analysis.md):

The prior research recommended a four-tier structure with higher price points:

| Recommended Tier | Monthly Price | Annual Price |
|-----------------|---------------|--------------|
| Starter | $47 | $470 |
| Growth | $97 | $970 |
| Professional | $197 | $1,970 |
| Enterprise | Custom | Custom |

**Key finding from prior research:** "Even at $197/month, product is dramatically underpriced vs value created"

### Value-Based Pricing Calculation (from prior research)

**Time savings value per filing:**
- Average 10-K: 100-300 pages
- Manual review: 2-4 hours
- Analyst rate: $50-150/hour
- Value per filing: $100-$600

**Monthly value at Max tier (unlimited tickers, 20+ filings/month):**
- Value created: $2,000-$12,000/month
- Current subscription: $139/month
- **ROI: 14x to 86x**

## Code References

- [lib/stripe.ts:41-92](lib/stripe.ts#L41-L92) - SUBSCRIPTION_PLANS constant with all tier definitions
- [lib/stripe.ts:79-80](lib/stripe.ts#L79-L80) - Max plan monthly and annual prices
- [lib/stripe.ts:188-192](lib/stripe.ts#L188-L192) - Annual savings calculation
- [components/landing/sections-v2/pricing-section-v2.tsx:25-65](components/landing/sections-v2/pricing-section-v2.tsx#L25-L65) - Pricing UI plan configuration
- [components/landing/sections-v2/pricing-section-v2.tsx:80-97](components/landing/sections-v2/pricing-section-v2.tsx#L80-L97) - Price display logic

## Architecture Documentation

### How Pricing Flows Through the System

1. **Definition**: Prices defined in `lib/stripe.ts` as `SUBSCRIPTION_PLANS` constant
2. **Display**: `pricing-section-v2.tsx` imports from `lib/stripe.ts` and renders UI
3. **Checkout**: Uses `getPriceIdForPlan()` to get Stripe price IDs for checkout sessions
4. **Billing**: Stripe webhook at `/api/webhook/stripe/route.ts` handles subscription events

### Price Change Impact Points

To change Max plan pricing, modifications needed in:
1. `lib/stripe.ts` - `SUBSCRIPTION_PLANS.MAX.monthlyPrice` and `annualPrice`
2. Stripe Dashboard - Create new price objects or update existing
3. Environment variables - `STRIPE_MAX_MONTHLY_PRICE_ID` and `STRIPE_MAX_ANNUAL_PRICE_ID`

## Historical Context (from thoughts/)

Prior research documents indicate:

1. **December 2025 Competitive Intelligence Report** - Extensive market research showing tldrsec's current pricing positions it at the lower end of the professional tier

2. **December 2025 Pricing Strategy Analysis** - Recommended higher price points ($197/mo for top tier) based on value-based pricing methodology

3. **Market Gap Identified** - $100-$500/month range is "dramatically underserved" according to competitive analysis

## Related Research

- [thoughts/shared/research/2025-12-06-competitive-pricing-intelligence-report.md](thoughts/shared/research/2025-12-06-competitive-pricing-intelligence-report.md)
- [thoughts/shared/research/2025-12-02-pricing-strategy-analysis.md](thoughts/shared/research/2025-12-02-pricing-strategy-analysis.md)
- [thoughts/shared/research/2025-12-06-pricing-implementation-research.md](thoughts/shared/research/2025-12-06-pricing-implementation-research.md)

## Open Questions

1. What is the current conversion rate from Pro to Max tier?
2. What is the churn rate for Max tier subscribers?
3. Have there been customer interviews validating willingness-to-pay at higher price points?
4. What is the current distribution of subscribers across tiers?
