---
date: 2025-12-31T21:22:32+11:00
researcher: Claude
git_commit: dd4a6f259ab9e8de35112d7c387454ac08fc8838
branch: feature/landing-page-v2-redesign
repository: tldrsec-ai
topic: "Dashboard Redesign to Match Landing Page V2 Design System"
tags: [research, codebase, dashboard, design-system, landing-page-v2, stripe-billing]
status: complete
last_updated: 2025-12-31
last_updated_by: Claude
---

# Research: Dashboard Redesign to Match Landing Page V2 Design System

**Date**: 2025-12-31T21:22:32+11:00 (AEDT)
**Researcher**: Claude
**Git Commit**: dd4a6f259ab9e8de35112d7c387454ac08fc8838
**Branch**: feature/landing-page-v2-redesign
**Repository**: tldrsec-ai

## Research Question

How should the `/dashboard` be redesigned to align with the Landing Page V2 design system, and how should the Stripe billing portal (https://billing.stripe.com/p/login/28EdR9aMO5XC2Sz3Dvf3a00) be integrated?

## Summary

The research identified the complete structure of both the existing dashboard implementation and the Landing Page V2 design system. The dashboard currently uses a dark-themed, generic shadcn/ui styling while the Landing Page V2 implements a Stripe-inspired light theme with custom CSS tokens, typography classes, and animation primitives. The redesign will require:

1. Applying the Landing Page V2 color tokens (`--landing-*`) to dashboard components
2. Updating typography to use the `.landing-*` classes
3. Converting card styles to use `.landing-card` patterns
4. Adding the Stripe customer portal link for billing management
5. Maintaining the existing functional architecture while updating visual presentation

## Detailed Findings

### 1. Current Dashboard Architecture

#### Dashboard Layout Structure
**File**: [app/dashboard/layout.tsx](app/dashboard/layout.tsx)

```tsx
// Current implementation:
<div className="flex min-h-screen flex-col">
  <div className="flex flex-1">
    <Sidebar className="fixed inset-y-0 z-30 w-64 border-r" />
    <main className="flex-1 md:pl-64">
      <div className="container max-w-7xl mx-auto py-8 md:py-10 px-6 md:px-8 space-y-8">
        {children}
      </div>
    </main>
  </div>
</div>
```

**Current Styling Issues**:
- Uses generic `border-r` without branded color
- No mesh gradient or subtle background patterns
- Standard container without Landing V2 spacing tokens

#### Dashboard Pages

| Page | File | Purpose |
|------|------|---------|
| Main Dashboard | [app/dashboard/page.tsx](app/dashboard/page.tsx) | Tracked tickers management |
| Settings | [app/dashboard/settings/page.tsx](app/dashboard/settings/page.tsx) | User preferences |
| Summaries | [app/dashboard/summaries/page.tsx](app/dashboard/summaries/page.tsx) | Filing summaries list |
| Usage | [app/dashboard/usage/page.tsx](app/dashboard/usage/page.tsx) | Usage statistics |
| Email Logs | [app/dashboard/email-logs/page.tsx](app/dashboard/email-logs/page.tsx) | Email delivery logs |
| Monitoring | [app/dashboard/monitoring/page.tsx](app/dashboard/monitoring/page.tsx) | System monitoring (Admin) |
| Billing | [app/dashboard/billing/page.tsx](app/dashboard/billing/page.tsx) | Subscription management |

#### Sidebar Component
**File**: [components/layout/sidebar.tsx](components/layout/sidebar.tsx)

**Current Features**:
- Logo: `<span className="text-blue-600 font-bold">tldr</span><span className="font-bold">SEC</span>`
- Nav item active state: `bg-blue-100 text-blue-800`
- User section with Clerk UserButton
- Admin section with monitoring link
- Mobile sheet navigation

**Styling Gap Analysis**:
- Uses hardcoded `blue-600`/`blue-100` instead of design tokens
- No hover animations (Landing V2 uses transform effects)
- Border uses generic border color, not `--landing-border`

#### Dashboard Client Component
**File**: [components/dashboard/dashboard-client.tsx](components/dashboard/dashboard-client.tsx)

**Key Components**:
- `DashboardHeader` - Page heading component
- `SystemHealthBanner` - System status notifications
- `ProcessingStatus` - Processing status indicator
- `Card` - Generic shadcn/ui card (not Landing V2 styled)
- `Table` - Data table with sorting
- `TutorialGuide` - Onboarding tutorial overlay

**Current Card Usage** (line 321):
```tsx
<Card className="p-6">
```
- Uses generic Card component
- No Landing V2 card effects (hover shadow, border transition)

### 2. Landing Page V2 Design System

#### Color Tokens
**File**: [app/globals.css:48-62](app/globals.css#L48-L62)

```css
/* Landing Page V2 - Light Theme */
--landing-primary: #0079F2;           /* Stripe-inspired blue */
--landing-primary-hover: #0066CC;     /* Darker on hover */
--landing-primary-light: #E8F4FD;     /* Light blue backgrounds */
--landing-secondary: #1A1A2E;         /* Dark text */
--landing-text: #374151;              /* Body text gray */
--landing-text-muted: #6B7280;        /* Muted text */
--landing-bg: #FFFFFF;                /* White background */
--landing-bg-subtle: #F9FAFB;         /* Subtle gray background */
--landing-border: #E5E7EB;            /* Light borders */
--landing-success: #10B981;           /* Green for positive metrics */
--landing-accent: #8B5CF6;            /* Purple accent */
--landing-gradient-start: #0079F2;    /* Gradient start */
--landing-gradient-end: #8B5CF6;      /* Gradient end */
```

#### Typography Classes
**File**: [app/globals.css:118-158](app/globals.css#L118-L158)

| Class | Responsive Sizes | Weight | Use Case |
|-------|-----------------|--------|----------|
| `.landing-display` | 5xl → 6xl → 7xl | bold | Hero headlines |
| `.landing-heading` | 3xl → 4xl → 5xl | bold | Section headings |
| `.landing-subheading` | xl → 2xl | medium | Section subtitles |
| `.landing-body` | base → lg | normal | Body text |
| `.landing-body-large` | lg → xl | normal | Hero subheadline |
| `.landing-caption` | sm | normal | Secondary text |
| `.landing-gradient-text` | - | - | Gradient text effect |

#### Button Styles
**File**: [app/globals.css:161-221](app/globals.css#L161-L221)

| Class | Background | Text | Shadow | Hover Effect |
|-------|-----------|------|--------|--------------|
| `.landing-button-primary` | `--landing-primary` | white | Blue glow | Lift + darker |
| `.landing-button-secondary` | transparent | `--landing-secondary` | none | Subtle fill |
| `.landing-button-gradient` | Blue→Purple gradient | white | Blue glow | Lift + brighten |
| `.landing-button-outline` | transparent | `--landing-text` | none | Fill + darker border |

#### Card Style
**File**: [app/globals.css:224-235](app/globals.css#L224-L235)

```css
.landing-card {
  @apply rounded-2xl p-6 md:p-8;
  background-color: var(--landing-bg);
  border: 1px solid var(--landing-border);
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.landing-card:hover {
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1);
  border-color: var(--landing-primary-light);
}
```

#### Animation Primitives
**File**: [lib/animations/landing-animations.ts](lib/animations/landing-animations.ts)

**Key Exports**:
- `fadeUpVariant` - Fade in with upward movement
- `fadeInVariant` - Simple opacity fade
- `staggerContainer` - Parent for staggered children
- `staggerItem` - Child animation for lists
- `scaleUpVariant` - Hover scale effect
- `hoverLiftVariant` - Vertical lift on hover
- `viewportOnce` - Scroll trigger settings
- `meshGradientStyle` - Hero background pattern

### 3. Stripe Billing Portal Integration

#### Stripe Customer Portal URL
**URL**: `https://billing.stripe.com/p/login/28EdR9aMO5XC2Sz3Dvf3a00`

**Portal Capabilities**:
- Customer authentication via magic links
- Subscription management (upgrade/downgrade/cancel)
- Payment method management
- Invoice viewing and history
- Billing address updates

#### Current Billing Implementation
**File**: [app/dashboard/billing/page.tsx](app/dashboard/billing/page.tsx)

**Existing Features**:
- Fetches subscription from `/api/user/subscription`
- Shows current plan status
- Plan change via internal API
- Cancellation toggle
- Stripe portal redirect function (lines 178-198):

```tsx
const openStripePortal = async () => {
  if (!subscription?.stripeCustomerId) return;

  const response = await fetch('/api/billing/portal', {
    method: 'POST'
  });
  const { url } = await response.json();
  window.location.href = url;
};
```

**Integration Approach**:
The direct Stripe billing portal URL can be used as a fallback or primary link:
```tsx
// Option 1: Direct link (simpler)
<a href="https://billing.stripe.com/p/login/28EdR9aMO5XC2Sz3Dvf3a00">
  Manage Billing
</a>

// Option 2: Via API (current approach, creates session)
<Button onClick={openStripePortal}>
  Manage Payment Methods
</Button>
```

### 4. Auth/Onboarding Page Patterns

#### Onboarding Page
**File**: [app/(auth)/onboarding/page.tsx](app/(auth)/onboarding/page.tsx)

**Current Styling**:
- Background: `bg-gradient-to-br from-blue-50 via-white to-indigo-50`
- Cards: `border-0 shadow-lg`
- Active states: `border-primary bg-primary/10 shadow-md`
- Color-coded sector cards

**Gap**: Uses different gradient pattern than Landing V2's `meshGradientStyle`

#### Auth Layout
**File**: [app/(auth)/layout.tsx](app/(auth)/layout.tsx)

**Current State**: Empty layout (no custom styling)
- Sign-in/Sign-up use Clerk's default component styling
- No Landing V2 design integration

### 5. Component Inventory for Redesign

#### High Priority (User-Facing)
| Component | File | Redesign Needs |
|-----------|------|----------------|
| Sidebar | `components/layout/sidebar.tsx` | Colors, hover states, logo styling |
| Dashboard Header | `components/dashboard/header.tsx` | Typography classes |
| Dashboard Card | `components/dashboard/card.tsx` | `.landing-card` pattern |
| Company Search | `components/dashboard/company-search.tsx` | Input styling, dropdown |
| Subscription Status | `components/dashboard/subscription-status.tsx` | Badge styling |
| Tier Status Widget | `components/dashboard/tier-status-widget.tsx` | Card + badge styling |

#### Medium Priority (Settings)
| Component | File | Redesign Needs |
|-----------|------|----------------|
| Settings Form | `components/settings/SettingsForm.tsx` | Form inputs, switches, cards |
| Subscription Manager | `components/settings/SubscriptionManager.tsx` | Plan cards, CTAs |
| User Profile Section | `components/settings/UserProfileSection.tsx` | Form styling |

#### Lower Priority (Status/Monitoring)
| Component | File | Redesign Needs |
|-----------|------|----------------|
| System Health Banner | `components/dashboard/system-health-banner.tsx` | Alert styling |
| Processing Status | `components/dashboard/processing-status.tsx` | Status badges |
| Filing Status Indicator | `components/dashboard/filing-status-indicator.tsx` | Status colors |

## Code References

### Landing V2 Design System Files
- [app/globals.css:48-258](app/globals.css#L48-L258) - All Landing V2 CSS tokens and classes
- [lib/animations/landing-animations.ts](lib/animations/landing-animations.ts) - Animation primitives

### Dashboard Files to Update
- [app/dashboard/layout.tsx](app/dashboard/layout.tsx) - Layout wrapper
- [components/layout/sidebar.tsx](components/layout/sidebar.tsx) - Sidebar navigation
- [components/dashboard/dashboard-client.tsx](components/dashboard/dashboard-client.tsx) - Main dashboard
- [components/dashboard/card.tsx](components/dashboard/card.tsx) - Card component
- [app/dashboard/billing/page.tsx](app/dashboard/billing/page.tsx) - Billing page

### Landing V2 Section Components (Reference)
- [components/landing/sections-v2/hero-section-v2.tsx](components/landing/sections-v2/hero-section-v2.tsx)
- [components/landing/sections-v2/features-section-v2.tsx](components/landing/sections-v2/features-section-v2.tsx)
- [components/landing/sections-v2/pricing-section-v2.tsx](components/landing/sections-v2/pricing-section-v2.tsx)

## Architecture Documentation

### Design Token Flow
```
globals.css (CSS Variables)
    ↓
Landing V2 Classes (.landing-*)
    ↓
Component Styles (via className or style={})
    ↓
Framer Motion (animations from landing-animations.ts)
```

### Dashboard Layout Hierarchy
```
app/layout.tsx (Root)
    ↓
app/dashboard/layout.tsx (Dashboard)
    ↓
├── Sidebar (fixed, left)
└── Main Content (flex-1, right)
        ↓
    Page Content (e.g., DashboardClient)
```

## Implementation Recommendations

### Phase 1: Foundation Updates

1. **Create Dashboard-Specific Design Tokens**
   Add to `globals.css`:
   ```css
   /* Dashboard V2 - Extends Landing V2 */
   .dashboard-container {
     background-color: var(--landing-bg);
   }

   .dashboard-sidebar {
     background-color: var(--landing-bg);
     border-right: 1px solid var(--landing-border);
   }
   ```

2. **Update Sidebar Colors**
   Replace hardcoded blues with design tokens in `sidebar.tsx`

3. **Update Dashboard Layout**
   Apply light background and subtle pattern to main container

### Phase 2: Component Updates

1. **Card Components** - Apply `.landing-card` class
2. **Button Components** - Use `.landing-button-*` variants
3. **Typography** - Apply `.landing-heading`, `.landing-body` classes
4. **Form Inputs** - Style to match Landing V2 input patterns

### Phase 3: Stripe Integration

1. **Add Direct Billing Link**
   Add to sidebar or settings:
   ```tsx
   <a
     href="https://billing.stripe.com/p/login/28EdR9aMO5XC2Sz3Dvf3a00"
     className="landing-button-secondary"
   >
     Manage Billing
   </a>
   ```

2. **Update Billing Page**
   Style plan cards using `.landing-card` with pricing section patterns from Landing V2

### Phase 4: Animation Integration

1. Add Framer Motion animations to dashboard cards
2. Implement stagger animations for ticker list
3. Add hover lift effects to interactive cards

## Open Questions

1. **Dark Mode Support**: Should the dashboard maintain dark mode support, or fully commit to light theme like Landing V2?

2. **Sidebar Design**: Should the sidebar adopt the Landing V2 footer styling, or create a distinct dashboard navigation pattern?

3. **Stripe Portal Access**: Should users be linked directly to the Stripe portal URL, or always go through the API session creation?

4. **Animation Performance**: Should all dashboard animations respect `prefers-reduced-motion`, and how much animation is appropriate for a data-heavy dashboard?

5. **Mobile Navigation**: Should the mobile sidebar sheet adopt the Landing V2 styling patterns?

## Related Research

- [docs/plans/2025-12-31-landing-page-high-converting-redesign.md](docs/plans/2025-12-31-landing-page-high-converting-redesign.md) - Landing Page V2 implementation plan (source of design system)

## Screenshots

The following screenshots were captured during research:
- `.playwright-mcp/landing-page-v2-current.png` - Full Landing Page V2
- `.playwright-mcp/sign-in-page-current.png` - Current sign-in page
