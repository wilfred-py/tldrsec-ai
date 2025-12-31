# GST Registration Analysis for tldrsec.app

**Date**: 2025-12-31
**Context**: Business tax planning for Australian-based SaaS serving international customers

---

## Business Overview

- **Product**: tldrsec.app - AI-powered SEC filing summaries for retail investors
- **Developer Location**: Australia (AEDT timezone)
- **Target Market**: US securities market (SEC filings)
- **Customer Base**: International - Netherlands, USA, Russia, global

---

## Pricing Structure (USD)

| Tier | Monthly | Annual | Features |
|------|---------|--------|----------|
| FREE | $0 | $0 | 3 tickers, weekly digest, 10-K/10-Q only |
| PRO | $99 | $990 | 10 tickers, real-time, all major filings |
| MAX | $139 | $1,390 | Unlimited tickers, API access, priority |

---

## Revenue Projections: 100 Paying Users

### Scenario Analysis

| User Mix | Monthly Revenue | Annual Revenue |
|----------|-----------------|----------------|
| 80 Pro / 20 Max | $10,700/mo | $128,400/yr |
| 60 Pro / 40 Max | $11,500/mo | $138,000/yr |
| 40 Pro / 60 Max | $12,300/mo | $147,600/yr |

### After Stripe Fees (2.9% + $0.30)

| Scenario | Net Monthly | Net Annual |
|----------|-------------|------------|
| Conservative | ~$10,300 | ~$123,600 |
| Moderate | ~$11,100 | ~$133,200 |
| Optimistic | ~$11,900 | ~$142,800 |

---

## Operating Costs

### Fixed Infrastructure (Monthly)

| Service | Monthly Cost | Annual | GST Included? |
|---------|-------------|--------|---------------|
| Vercel Pro | $20 | $240 | No (US) |
| Supabase PostgreSQL | $25 | $300 | No (US) |
| Cloudflare Workers | $0 | $0 | No (US) |
| Resend Email | $0-20 | $0-240 | No (US) |
| Clerk Auth | $0-25 | $0-300 | No (US) |

### Variable Costs

| Service | Cost Model | Budget Caps |
|---------|------------|-------------|
| xAI/OpenRouter API | $0.30-0.50/M tokens | $100/day, $3,000/month |
| Stripe fees | 2.9% + $0.30/tx | Per transaction |

### Estimated Total Operating Costs

- **Minimum (low usage)**: ~$45-90/month
- **Typical (moderate usage)**: ~$200-500/month
- **Maximum (budget caps)**: ~$3,090/month

---

## GST Analysis

### Key Facts (ATO)

1. **GST Registration Threshold**: $75,000 annual turnover (mandatory)
2. **Exported Services**: GST-free (0% rate)
3. **Input Tax Credits**: Can claim GST paid on business purchases
4. **Time Limit**: 4 years to claim credits

### Customer Location Impact

| Customer Location | GST on Sales |
|-------------------|--------------|
| Netherlands | No - exported service |
| USA | No - exported service |
| Russia | No - exported service |
| Any overseas | No - exported service |
| Australia | Yes - 10% GST |

### Input Tax Credits Analysis

Most infrastructure costs are from US-based providers (no GST):
- Vercel (US) - No GST
- Supabase (US) - No GST
- Stripe (US) - No GST
- Clerk (US) - No GST
- OpenRouter/xAI (US) - No GST

**Australian expenses with GST**:
- Domain registration: ~$100/yr → $9.09 GST
- AU accounting software: ~$300/yr → $27.27 GST
- AU professional services: Variable

**Total claimable**: ~$100-150/year (minimal)

---

## Decision Framework

### Arguments FOR GST Registration

1. **Mandatory once over $75k** - Legal requirement
2. **Professional appearance** - Tax invoices for AU customers
3. **Input tax credits** - Small benefit (~$100-150/year)
4. **No impact on overseas customers** - Sales remain GST-free

### Arguments AGAINST GST Registration (before threshold)

1. **Compliance overhead** - Quarterly BAS lodgment
2. **Minimal financial benefit** - Most costs are US-based (no GST)
3. **Customer base is overseas** - No GST on exports anyway
4. **Additional record-keeping** - Tax invoice requirements

---

## Recommendation

### Current Stage (Pre-$75k turnover)

**Do NOT register for GST yet**

- Customer base is primarily international
- Overseas sales are GST-free regardless of registration
- Input tax credits benefit is minimal (~$100-150/year)
- Avoid compliance overhead until required

### Future Stage ($75k+ turnover)

**Register for GST (mandatory)**

- Required by law once threshold exceeded
- Continue selling GST-free to overseas customers
- Charge 10% GST only to Australian customers
- Claim input tax credits on AU expenses

---

## ATO Sources

- [Claiming GST credits](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/claiming-gst-credits)
- [Effect of GST credits on income tax deductions](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/claiming-gst-credits/effect-of-gst-credits-on-income-tax-deductions)
- [When you can claim a GST credit](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/claiming-gst-credits/when-you-can-claim-a-gst-credit)
- [When you cannot claim a GST credit](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/claiming-gst-credits/when-you-cannot-claim-a-gst-credit)

---

## Key Takeaways

1. **$75k threshold** triggers mandatory GST registration
2. **Overseas customers** = GST-free sales (exported services)
3. **US-based infrastructure** = No GST to claim back
4. **Net benefit of registration** = Minimal (~$100-150/year credits)
5. **Wait until mandatory** before registering
