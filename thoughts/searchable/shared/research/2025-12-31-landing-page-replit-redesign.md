---
date: 2025-12-31T14:45:00+11:00
researcher: Claude
git_commit: 7ee733d5ee01566c29b1ec9344d8e01733bef870
branch: feature/email-template-fixes-8k-form144
repository: wilfred-py/tldrsec-ai
topic: "Landing Page Redesign - Replit Mockup Analysis"
tags: [research, codebase, landing-page, redesign, ui, components]
status: complete
last_updated: 2025-12-31
last_updated_by: Claude
---

# Research: Landing Page Redesign - Replit Mockup Analysis

**Date**: 2025-12-31T14:45:00+11:00
**Researcher**: Claude
**Git Commit**: 7ee733d5ee01566c29b1ec9344d8e01733bef870
**Branch**: feature/email-template-fixes-8k-form144
**Repository**: wilfred-py/tldrsec-ai

## Research Question

Document the current landing page implementation and compare it with the Replit mockup design to understand what exists today and what the target design looks like.

## Summary

The codebase contains a comprehensive landing page implementation with modular section-based components. The Replit mockup represents a cleaner, more minimalist design with a light theme, single filing preview card, and simplified feature grid. The current implementation uses a dark hero section while the mockup uses a white/light blue theme throughout.

---

## Replit Mockup Analysis

### Visual Design Captured

The Replit mockup (screenshot saved at `.playwright-mcp/replit-mockup-hero.png`) shows:

#### Color Palette
- **Primary Blue**: `#0079F2` (used for buttons, accent text, icons)
- **Background**: White (`#FFFFFF`) with subtle light blue gradient sections
- **Text Primary**: Dark charcoal/black for headings
- **Text Secondary**: Gray for descriptions
- **Card Backgrounds**: White with light gray borders
- **Footer CTA**: Light blue gradient background (`#EBF5FF` to `#E3F2FD`)

#### Typography
- **Headline**: Large bold sans-serif "SEC Filings, Simplified" with "Simplified" in blue gradient
- **Badge**: "AI-Powered SEC Intelligence" pill badge above headline
- **Body Text**: Clean sans-serif for descriptions

#### Layout Structure
1. **Hero Section** (White background with gradient orbs)
   - Badge: "AI-Powered SEC Intelligence"
   - Headline: "SEC Filings, Simplified"
   - Subheadline: "Transform 300+ page regulatory documents..."
   - Two CTAs: "Start Free Trial" (filled blue), "View Pricing" (outlined)
   - Trust indicators: "2,500+ investors", "99.9% uptime", "<5 min delivery"
   - **Single Filing Preview Card** (right side): Apple Inc. 10-K example with key highlights

2. **Features Section** (White background)
   - Title: "Built for Modern Investors"
   - 6 feature cards in 3x2 grid with icons:
     - 300+ Pages → 2 Minutes
     - Real-Time Monitoring
     - Smart Notifications
     - Filing-Type Analysis
     - Investment-Grade Quality
     - Save 10+ Hours Weekly

3. **Pricing Section** (White background)
   - Title: "Simple, Transparent Pricing"
   - 3 pricing cards: Free ($0), Pro ($15/mo), Premium ($40/mo)
   - "Most Popular" badge on Pro plan
   - Feature lists with checkmarks

4. **CTA Section** (Light blue gradient)
   - Title: "Start Monitoring SEC Filings Today"
   - Email input + "Join Waitlist" button
   - Trust text: "No credit card required • Start with 3 free tickers"

5. **Footer** (White background)
   - Simple footer with copyright

---

## Current Implementation Analysis

### Entry Point

**File**: `app/page.tsx` (lines 1-66)
- Uses feature flag `NEXT_PUBLIC_LANDING_PAGE_ENABLED`
- When disabled, redirects to `/waitlist`
- When enabled, renders `<LandingPage>` component with curated filings

### Main Landing Page Component

**File**: `components/landing/new-landing-page.tsx` (lines 1-38)
- Composes 6 sections in order:
  1. `NewHeroSection`
  2. `FilingPreviewGrid`
  3. `NewFeaturesSection`
  4. `NewPricingSection`
  5. `NewCTASection`
  6. `NewFooterSection`

### Section Components

#### 1. Hero Section
**File**: `components/landing/sections/hero-section.tsx` (lines 1-124)

Current design elements:
- **Background**: Dark slate gradient (`from-slate-900 via-slate-900 to-slate-800`)
- Grid pattern overlay with mask gradient
- Gradient orbs (blue/indigo blurred circles)
- Badge: "AI-Powered SEC Filing Analysis" with blue tint
- Headline: "Stop Spending Weekends Reading SEC Filings" (gradient text)
- Stats row: "Save 10+ hours/week", "All major filing types", "AI-powered insights"
- CTAs: "Start Free Trial" (gradient blue button), "View Pricing" (outline)
- Trust signal: "No credit card required. Cancel anytime."
- Uses Framer Motion for animations

#### 2. Filing Preview Grid
**File**: `components/landing/sections/filing-preview-card.tsx` (lines 1-209)

Current design:
- Section background: `bg-slate-50`
- Grid: 3-column responsive grid
- Each card has:
  - Company icon, ticker, name
  - Filing type badge (color-coded: 10-K blue, 10-Q green, 8-K amber, etc.)
  - Filed date
  - Key highlights (bullet points)
  - "Read full analysis" link
- Dialog modal for full summary view
- Uses Framer Motion for staggered animations

#### 3. Features Section
**File**: `components/landing/sections/features-section.tsx` (lines 1-114)

Current design:
- Background: White (`bg-white`)
- 6 features in 3-column grid
- Each feature card:
  - Icon with colored background
  - Title and description
  - Hover effects (shadow, border change)
- Features: All Major Filing Types, AI-Powered Insights, Real-Time Alerts, Save 10+ Hours Weekly, Track Your Portfolio, Reliable & Secure

#### 4. Pricing Section
**File**: `components/landing/sections/pricing-section.tsx` (lines 1-262)

Current design:
- Background: White (`bg-white`)
- Monthly/Annual toggle with Switch component
- 3 pricing cards with gradients:
  - FREE: slate gradient, Zap icon
  - PRO: blue gradient, Sparkles icon, "Most Popular" badge
  - MAX: amber/orange gradient, Crown icon
- Features lists with Check icons
- Annual billing shows savings percentage
- Uses `SUBSCRIPTION_PLANS` from `@/lib/stripe`

#### 5. CTA Section
**File**: `components/landing/sections/cta-section.tsx` (lines 1-57)

Current design:
- Background: Blue-to-indigo gradient
- Grid pattern overlay
- Headline: "Ready to Save 10+ Hours Every Week?"
- Two CTAs: "Start Free Trial", "Compare Plans"
- Trust text below

#### 6. Footer Section
**File**: `components/landing/sections/footer-section.tsx` (lines 1-93)

Current design:
- Background: Dark slate (`bg-slate-900`)
- 4-column grid:
  - Brand with logo and description
  - Product links (Pricing, Sign Up, Sign In)
  - Legal links (Privacy, Terms)
- Copyright and SEC disclaimer

### Waitlist Page (Alternative Landing)

**File**: `app/waitlist/page.tsx` (lines 1-74)
- Renders `FocusedInvestorHero` component
- Fetches subscriber count for counter animation

**File**: `components/landing/focused-investor-hero.tsx` (lines 1-54)
- Light theme using fintech colors
- Grid background pattern
- Floating animated elements
- `WaitlistForm` component for email capture
- `WaitlistCounter` for social proof

---

## Design System Analysis

### CSS Variables (globals.css)

**Light Mode Colors**:
```css
--background: oklch(1 0 0);
--foreground: oklch(0.145 0 0);
--primary: oklch(0.205 0 0);
--fintech-primary: oklch(0.45 0.15 232);
--fintech-bg-subtle: oklch(0.99 0.002 232);
```

**Dark Mode Colors**:
```css
--background: oklch(0.145 0 0);
--foreground: oklch(0.985 0 0);
```

### Tailwind Configuration

**File**: `tailwind.config.ts`
- Extends colors with CSS variable references
- Custom fintech color palette for light theme
- Standard shadcn/ui color mappings

### Typography

**File**: `app/layout.tsx` (lines 12-19)
- **Sans-serif**: Geist (`--font-geist-sans`)
- **Monospace**: Geist Mono (`--font-geist-mono`)
- Both loaded via Google Fonts

### UI Components (shadcn/ui)

| Component | File | Description |
|-----------|------|-------------|
| Button | `components/ui/button.tsx` | 6 variants (default, destructive, outline, secondary, ghost, link), 4 sizes |
| Card | `components/ui/card.tsx` | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Badge | `components/ui/badge.tsx` | 4 variants (default, secondary, destructive, outline) |
| Input | `components/ui/input.tsx` | Standard input with focus states |
| Dialog | `components/ui/dialog.tsx` | Modal dialog for filing previews |
| Switch | `components/ui/switch.tsx` | Toggle for billing interval |

---

## Component Mapping: Current vs Replit Mockup

### Visual Differences

| Element | Current Implementation | Replit Mockup |
|---------|----------------------|---------------|
| Hero Background | Dark slate gradient | White with light blue gradients |
| Hero Layout | Centered, text only | Two-column with filing card on right |
| Badge Style | Blue tint on dark | Blue pill on white |
| Headline | "Stop Spending Weekends..." | "SEC Filings, Simplified" |
| Filing Previews | Grid of 3+ cards below hero | Single card in hero section |
| Features | 6 features in colored cards | 6 features with blue icons, white cards |
| Pricing Cards | Gradient backgrounds | White cards with subtle borders |
| CTA Section | Blue gradient | Light blue gradient |
| Footer | Dark slate | White |

### Structural Differences

1. **Hero Section**
   - Current: Full-width centered content
   - Mockup: Split layout with content left, filing preview right

2. **Filing Previews**
   - Current: Separate section with multiple cards
   - Mockup: Single card integrated into hero

3. **Color Theme**
   - Current: Dark hero, white middle, dark footer
   - Mockup: Consistent light theme throughout

4. **Trust Indicators**
   - Current: Icon + text in hero
   - Mockup: Checkmark icons with metrics

---

## Code References

### Core Landing Page Files
- `app/page.tsx:1-66` - Landing page entry point with feature flag
- `components/landing/new-landing-page.tsx:1-38` - Main component composition
- `components/landing/sections/hero-section.tsx:1-124` - Hero section with dark theme
- `components/landing/sections/filing-preview-card.tsx:1-209` - Filing cards grid
- `components/landing/sections/features-section.tsx:1-114` - Features grid
- `components/landing/sections/pricing-section.tsx:1-262` - Pricing with toggle
- `components/landing/sections/cta-section.tsx:1-57` - CTA section
- `components/landing/sections/footer-section.tsx:1-93` - Footer

### Styling
- `app/globals.css:1-175` - CSS variables and base styles
- `tailwind.config.ts:1-72` - Tailwind configuration

### UI Components
- `components/ui/button.tsx:1-60` - Button variants
- `components/ui/card.tsx:1-93` - Card components
- `components/ui/badge.tsx:1-47` - Badge variants
- `components/ui/input.tsx:1-22` - Input component

### Alternative Landing (Waitlist)
- `app/waitlist/page.tsx:1-74` - Waitlist page
- `components/landing/focused-investor-hero.tsx:1-54` - Light-themed hero
- `components/waitlist/waitlist-form.tsx:1-194` - Email signup form

---

## Directory Structure

```
components/landing/
├── sections/
│   ├── hero-section.tsx
│   ├── filing-preview-card.tsx
│   ├── features-section.tsx
│   ├── pricing-section.tsx
│   ├── cta-section.tsx
│   └── footer-section.tsx
├── counter/
│   ├── counter-display.tsx
│   ├── digit-roller.tsx
│   ├── index.ts
│   ├── types.ts
│   └── utils.ts
├── new-landing-page.tsx
├── focused-investor-hero.tsx
├── waitlist-counter.tsx
├── floating-elements.tsx
├── mouse-follow-effect.tsx
├── animated-gradient.tsx
├── comprehensive-insights.tsx
├── testimonials.tsx
├── professional-footer.tsx
├── hero-section.tsx (legacy)
├── features-section.tsx (legacy)
├── pricing-section.tsx (legacy)
├── cta-section.tsx (legacy)
└── how-it-works.tsx (legacy)
```

---

## Open Questions

1. Should the redesign create new section components or modify existing ones?
2. Should the waitlist page (`focused-investor-hero.tsx`) be updated to match the new design as well?
3. What should happen to the legacy components in `components/landing/` (non-sections folder)?
4. Should the feature flag behavior change - should the Replit design become the default?
5. Are there mobile-specific designs in the mockup that need consideration?
