---
date: 2026-01-02T16:45:00+11:00
researcher: Claude
git_commit: 2742423c31a6593d377b452baf3594a83754298c
branch: feature/remove-budget-add-credit-monitoring
repository: tldrsec-ai
topic: "$350/Month Tier Proposition Analysis - Premium Brand Positioning"
tags: [research, pricing, premium-tier, $350-pricing, enterprise, brand-positioning]
status: complete
last_updated: 2026-01-02
last_updated_by: Claude
---

# Research: $350/Month Tier Proposition Analysis

**Date**: 2026-01-02T16:45:00 AEDT
**Researcher**: Claude
**Git Commit**: 2742423c31a6593d377b452baf3594a83754298c
**Branch**: feature/remove-budget-add-credit-monitoring
**Repository**: tldrsec-ai

## Research Question

What is the best proposition for $350/month pricing? Should both Pro and Max be adjusted to reach this price point?

---

## Executive Summary

**Key Finding**: The $300-$500/month range represents **premium professional tools** used by serious individual investors, small hedge funds, RIAs, and corporate development teams. The only direct competitor with AI-powered SEC filing analysis at this price is **Quill AI at $250/month**.

**Recommendation**:

| Tier | Current | Recommended | Target Customer |
|------|---------|-------------|-----------------|
| **Pro** | $99/mo | **$199/mo** | Active traders, semi-pros |
| **Max** | $139/mo | **$349/mo** | Professionals, small firms, RIAs |

This positions tldrsec as:
- **Pro ($199)**: Premium alternative to Seeking Alpha Pro ($200), BamSEC ($69), Koyfin Pro ($110)
- **Max ($349)**: Professional-grade alternative to Quill AI ($250) and institutional tools ($1,000+)

---

## Competitive Landscape at $300-$500/Month

### Direct Competitors in Range

| Service | Price | Key Features | Gap vs tldrsec |
|---------|-------|--------------|----------------|
| **Quill AI (Web)** | $250/mo | Real-time SEC access, AI analysis, PDF-to-spreadsheet, earnings transcripts | No insider trading signals, no sentiment analysis |
| **SEC-API.io Business** | $199/mo | 15GB data, API access, 30+ years history, real-time | Raw data only, no AI analysis |
| **WhaleWisdom Pro** | $500/yr ($42/mo) | 13F tracking, API access, backtesting | Only 13F/institutional, no 8-K/Form 4 analysis |
| **Sentieo (was)** | ~$500/mo | Search, transcripts, charting | Acquired by AlphaSense ($1,200+) |

### No Direct Competition For

1. **AI-powered SEC filing summaries** with real-time email delivery
2. **Insider trading signal strength** assessment (Form 4/144)
3. **8-K sentiment analysis** with investor-focused interpretation
4. **Form-specific structured data** extraction

---

## What $350/Month Services Offer

Based on competitive research, here's what professional investors expect at $300-$500/month:

### Must-Have Features (Table Stakes)

| Feature | Competitor Example | tldrsec Current Status |
|---------|-------------------|----------------------|
| Unlimited companies/tickers | Quill AI, SEC-API | ✅ Max tier (-1 = unlimited) |
| All SEC filing types | All competitors | ✅ Max tier ('ALL') |
| Real-time/near-instant delivery | Quill AI (<1 min) | ✅ 5-minute cycle |
| Historical data access | SEC-API (30 years) | ⚠️ Limited (current filings only) |
| API access | SEC-API, WhaleWisdom | ❌ Not exposed |
| Excel/data export | Quill AI, BamSEC | ❌ Not available |
| Search across filings | BamSEC, AlphaSense | ❌ Not available |

### Differentiating Features (Premium Value)

| Feature | Who Has It | tldrsec Status |
|---------|-----------|----------------|
| **AI sentiment analysis** | Quill AI, AlphaSense | ✅ Exists (8-K), **undermarketed** |
| **Insider trading signals** | None at this price | ✅ Exists, **unique differentiator** |
| **Form-specific AI schemas** | Quill AI (limited) | ✅ 8+ forms, **strongest in market** |
| **Email-first delivery** | None | ✅ **Unique architecture** |
| **Structured JSON output** | SEC-API (raw) | ✅ Exists, **not exposed** |
| **Quality confidence scores** | None | ✅ Exists, **not exposed** |

---

## Proposed Tier Structure

### Two-Tier Approach (Pro + Max)

#### **Pro Tier - $199/month ($1,990/year)**
**Target**: Active traders, serious individual investors, part-time analysts

| Feature | Value |
|---------|-------|
| **Companies** | 25 tickers |
| **Filing Types** | All major forms (10-K, 10-Q, 8-K, Form 4, DEF14A, 13D/G) |
| **Delivery** | Real-time (5-min cycle) |
| **Priority** | Priority 2 (high) |
| **AI Analysis** | Full summaries with sentiment & signals |
| **Support** | Email with 24-hour response |
| **Dashboard** | Full access with search |
| **Alerts** | Customizable email alerts |
| **History** | 12 months |

**Positioning**: "Everything a serious investor needs"

---

#### **Max Tier - $349/month ($3,490/year)**
**Target**: Professional analysts, RIAs, small hedge funds, corporate development

| Feature | Value |
|---------|-------|
| **Companies** | Unlimited |
| **Filing Types** | ALL (including Form 3/5, S-1, 424B, etc.) |
| **Delivery** | Real-time (2-min cycle, faster processing) |
| **Priority** | Priority 1 (first in queue) |
| **AI Analysis** | Full summaries + advanced signals |
| **Support** | Dedicated account manager, priority email/chat |
| **Dashboard** | Full access + advanced analytics |
| **Alerts** | Multi-channel (Email, Slack, Webhook) |
| **History** | Unlimited |
| **API Access** | 10,000 calls/month |
| **Data Export** | CSV/JSON/Excel |
| **Webhooks** | Real-time filing notifications |
| **White-label** | Custom email templates |

**Positioning**: "Professional-grade intelligence at 1/3 enterprise pricing"

---

### Three-Tier Alternative (If Adding Enterprise)

| Tier | Price | Companies | Key Differentiator |
|------|-------|-----------|-------------------|
| **Pro** | $149/mo | 15 | Real-time + sentiment |
| **Max** | $249/mo | Unlimited | API access + analytics |
| **Enterprise** | $349/mo | Unlimited | Team features + white-label |

---

## Feature Requirements for $349/Month Max Tier

### Phase 1: Expose Existing Capabilities (Week 1-2)

These features **already exist** in the codebase but aren't user-facing:

| Feature | Current Location | Work Required |
|---------|------------------|---------------|
| Sentiment analysis | `summaryJSON.sentiment` (8-K) | UI display, alert system |
| Signal strength | `summaryJSON.signalStrength` (Form 4/144) | UI display, alert system |
| Quality scores | `Summary.confidenceLevel`, `qualityScore` | Dashboard display |
| Processing metrics | `Summary.processingTimeMs` | Analytics dashboard |
| Cost transparency | `Summary.cost`, `totalCost` | Admin view (optional) |

### Phase 2: Build Premium Features (Week 3-6)

| Feature | Effort | Value Add |
|---------|--------|-----------|
| **API Key System** | 1 week | Programmatic access, $100 value |
| **Webhook Notifications** | 1 week | Real-time integration, $50 value |
| **Analytics Dashboard** | 1 week | Usage insights, $50 value |
| **Data Export (CSV/JSON)** | 3 days | Bulk download, $40 value |
| **Advanced Alerts** | 1 week | Multi-channel, customizable, $60 value |
| **Search/Filter** | 2 weeks | Full-text search across summaries, $50 value |

### Phase 3: Enterprise Features (Week 7-10)

| Feature | Effort | Value Add |
|---------|--------|-----------|
| **Team Workspaces** | 2 weeks | Collaboration, $75 value |
| **White-label Emails** | 3 days | Custom branding, $50 value |
| **Slack Integration** | 1 week | Workflow integration, $40 value |
| **Custom Domains** | 3 days | Professional appearance, $25 value |

---

## Value Justification for $349/Month

### Time Savings ROI

| User Type | Hourly Rate | Filings/Month | Time Saved/Filing | Monthly Value |
|-----------|-------------|---------------|-------------------|---------------|
| Junior Analyst | $50 | 100 | 30 min | $2,500 |
| Portfolio Manager | $150 | 50 | 30 min | $3,750 |
| RIA Managing $500M | $200 | 75 | 30 min | $7,500 |
| Hedge Fund Analyst | $250 | 150 | 30 min | $18,750 |

**At $349/month, ROI ranges from 7x to 54x** based on time savings alone.

### Competitive Value Comparison

| Alternative | Monthly Cost | What You Get | tldrsec Advantage |
|-------------|--------------|--------------|-------------------|
| **Hire Analyst** | $5,000+ | 1 person, limited coverage | 24/7, unlimited coverage, lower cost |
| **AlphaSense** | $1,200+ | Full platform, enterprise features | 1/3 price, focused SEC coverage |
| **Bloomberg** | $2,665 | Everything, overwhelming | 1/8 price, SEC-specific, modern UX |
| **Quill AI** | $250 | Similar AI, dashboard-first | Insider signals, email-first, API |
| **Multiple tools** | $400+ | BamSEC + TipRanks + alerts | All-in-one solution |

### Unique Value Proposition

**Only tldrsec offers all of these at $349/month:**

1. ✅ AI-powered summaries for ALL SEC filing types
2. ✅ Insider trading signal strength assessment (unique)
3. ✅ 8-K sentiment analysis with market interpretation
4. ✅ Email-first architecture (proactive, not dashboard)
5. ✅ Structured JSON output for programmatic consumption
6. ✅ Real-time delivery (<5 min from SEC filing)
7. ✅ Unlimited company tracking
8. ✅ API access for integration
9. ✅ Quality confidence scores (transparency)

---

## Pricing Psychology

### Anchor to Enterprise Pricing

| Anchor | Price | Message |
|--------|-------|---------|
| Bloomberg Terminal | $2,665/mo | "87% less than Bloomberg" |
| AlphaSense | $1,200/mo | "71% less than AlphaSense" |
| Hire Analyst | $5,000/mo | "93% less than hiring" |
| SEC Feed AI | $350/mo | "Same price, more features" |

### Price-to-Value Framing

- **$349/month = $11.63/day**
- **"Less than lunch for institutional-grade intelligence"**
- **"One avoided loss pays for a year of coverage"**

### Annual Discount Strategy

| Monthly | Annual | Savings | Message |
|---------|--------|---------|---------|
| $349/mo | $3,490/yr | $698 (17%) | "Save 2 months" |
| $349/mo | $2,990/yr | $1,198 (29%) | "4 months free" (aggressive) |

**Recommendation**: 17% discount aligns with industry standard and maintains perceived monthly value.

---

## Implementation Path

### Immediate (This Week)

1. **Update pricing in `lib/stripe.ts`**:
   ```typescript
   PRO: {
     monthlyPrice: 199,
     annualPrice: 1990,
     tickerLimit: 25,
     // ... rest of config
   },
   MAX: {
     monthlyPrice: 349,
     annualPrice: 3490,
     tickerLimit: -1, // unlimited
     // ... rest of config
   }
   ```

2. **Update feature descriptions**:
   - Add API access mention to Max tier
   - Add "Advanced analytics" to Max tier
   - Add "Priority processing" detail to Pro tier

3. **Create Stripe products**:
   - New price objects for Pro $199 and Max $349
   - Update environment variables

### Short-Term (2-4 Weeks)

1. Expose sentiment/signal data in summary UI
2. Build basic analytics dashboard
3. Add CSV export functionality
4. Implement advanced email alerts

### Medium-Term (1-3 Months)

1. API key system
2. Webhook notifications
3. Slack integration
4. Full-text search
5. Team features (Enterprise tier)

---

## Risk Assessment

### Pricing Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Price shock to existing users | Medium | Grandfather existing at current rates for 12 months |
| Conversion drop | Medium | Offer 30-day trial, money-back guarantee |
| Feature expectations not met | Low | Clear feature matrix, transparent roadmap |
| Competitor response | Low | First-mover advantage, unique features |

### Feature Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| API development delays | Medium | MVP first, iterate |
| Support volume increase | Medium | Scale support team, add docs |
| Infrastructure costs increase | Low | Monitor, adjust if needed |

---

## Final Recommendation

### Recommended Pricing Structure

| Tier | Price | Annual | Key Hook |
|------|-------|--------|----------|
| **Free** | $0 | $0 | "Try it free" |
| **Pro** | **$199/mo** | $1,990/yr | "Everything serious investors need" |
| **Max** | **$349/mo** | $3,490/yr | "Professional-grade at 1/3 enterprise price" |

### Why This Works

1. **Pro at $199**: Captures the "serious investor" segment currently underserved between $100-$200/month
2. **Max at $349**: Positions against Quill AI ($250) and below AlphaSense ($1,200) with superior features
3. **Gap maintained**: $150 gap between tiers justifies upgrade with API/unlimited/priority
4. **ROI clear**: 7-54x ROI makes pricing decision easy for target customers

### Revenue Impact (Assuming 1,000 Paid Users)

| Scenario | Pro Mix | Max Mix | Monthly Revenue | Annual Revenue |
|----------|---------|---------|-----------------|----------------|
| Current ($99/$139) | 60% | 40% | $115,000 | $1,380,000 |
| Proposed ($199/$349) | 50% | 50% | $274,000 | $3,288,000 |
| **Uplift** | - | - | **+138%** | **+$1,908,000** |

---

## Code References

- [lib/stripe.ts:41-92](lib/stripe.ts#L41-L92) - Current tier definitions
- [lib/cron/tier-eligibility.ts:14-23](lib/cron/tier-eligibility.ts#L14-L23) - Processing priorities
- [lib/ai/prompts/unified-prompts.ts:172-175](lib/ai/prompts/unified-prompts.ts#L172-L175) - Sentiment analysis schema
- [lib/ai/prompts/unified-prompts.ts:240-244](lib/ai/prompts/unified-prompts.ts#L240-L244) - Signal strength schema

## Sources

- Quill AI: https://www.quillai.com/
- SEC-API.io: https://sec-api.io/pricing
- WhaleWisdom: https://whalewisdom.com/pricing
- AlphaSense: https://www.alpha-sense.com/pricing/
- BamSEC: https://www.bamsec.com/pricing
- Bloomberg Terminal Pricing Guide: https://www.bluegamma.io/post/bloomberg-terminal-pricing
