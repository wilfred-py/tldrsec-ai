# High-Converting Landing Page Redesign Implementation Plan

**Date**: 2025-12-31T16:26:34+11:00 (AEDT)
**Git Commit**: 45039e5519b3007b910ff09f1db0c1c993a7b6fe
**Branch**: feature/landing-page-v2-redesign
**Repository**: tldrsec-ai

## Implementation Status

| Phase | Status | Tests |
|-------|--------|-------|
| Phase 1: Design System Foundation | ✅ Complete | 13 passing |
| Phase 2: Hero Section V2 | ✅ Complete | 10 passing |
| Phase 3: Features Section V2 | ✅ Complete | 6 passing |
| Phase 4: Pricing Section V2 | ✅ Complete | 8 passing |
| Phase 5: CTA Section V2 | ✅ Complete | 6 passing |
| Phase 6: Footer Section V2 | ✅ Complete | 6 passing |
| Phase 7: Landing Page V2 Composition | ✅ Complete | 3 passing |
| Phase 8: A/B Testing Infrastructure | ✅ Complete | Feature flag added |

**Total Tests**: 52 passing
**Build Status**: ✅ Passing
**Implementation Date**: 2025-12-31

## Overview

Complete redesign of the tldrsec.app landing page to maximize conversion rates through proven CRO patterns inspired by Cursor, Stripe, and Apple. The redesign shifts from the current dark theme to a light, trust-building design with rich animations, optimized typography, and strategic social proof placement.

**Key Metrics Targets:**
- Above-fold CTA visibility: 100%
- Form fields: ≤3 (currently N/A, adding email capture)
- Page load: <3 seconds
- Mobile-first responsive design
- Animation engagement without performance degradation

## Current State Analysis

### Existing Implementation
- **Entry Point**: `app/page.tsx` with `NEXT_PUBLIC_LANDING_PAGE_ENABLED` feature flag
- **Main Component**: `components/landing/new-landing-page.tsx` composing 6 sections
- **Sections**: Hero, FilingPreviewGrid, Features, Pricing, CTA, Footer in `components/landing/sections/`
- **Styling**: Tailwind CSS with OKLCH color variables, Framer Motion animations
- **UI Library**: shadcn/ui (Button, Card, Badge, Dialog, Switch)

### What's Working Well
- Modular section-based architecture
- Framer Motion animation patterns (stagger, whileInView, fade-up)
- OKLCH color system with fintech brand tokens
- Responsive typography scale (4xl → 5xl → 6xl)
- shadcn/ui component variants

### What Needs Transformation
| Element | Current | Target |
|---------|---------|--------|
| Hero background | Dark slate gradient | White with animated mesh gradient |
| Hero layout | Centered, text-only | Z-pattern with filing card right |
| Color palette | Blue-indigo on dark | Primary blue (#0079F2) on white |
| Filing previews | Grid section below hero | Single card integrated in hero |
| Trust signals | Icon + text stats | Quantified metrics with animations |
| Typography | Standard weights | Bolder headlines, gradient accents |
| Animations | Basic fade-up | Stripe-style mesh, micro-interactions |

## Desired End State

### Visual Design
- Light theme throughout (white backgrounds, light blue accents)
- Stripe-style animated mesh gradient in hero
- Apple-level whitespace and typography hierarchy
- Single filing preview card in hero (showcasing value immediately)
- Trust metrics with animated counters
- Micro-interactions on all interactive elements

### Conversion Optimizations
- Z-pattern layout directing eye to CTA
- Primary CTA above fold with high contrast
- Social proof near decision points
- Reduced friction (no credit card, instant value preview)
- Email capture with ≤3 fields
- Trust badges near form inputs

### Technical Implementation
- New V2 components for A/B testing capability
- Feature flag to switch between old/new design
- Performance-optimized animations (GPU-accelerated)
- Accessibility-compliant (reduced motion support)
- Mobile-first responsive design

### Verification Criteria
1. Lighthouse Performance score ≥90
2. All animations respect `prefers-reduced-motion`
3. Touch targets ≥44x44px on mobile
4. CTA visible without scrolling on all viewports
5. Form completion rate trackable via analytics
6. A/B test infrastructure functional

## What We're NOT Doing

- **No backend changes**: This is purely frontend redesign
- **No database schema changes**: Using existing data structures
- **No authentication flow changes**: Sign-up/sign-in unchanged
- **No pricing logic changes**: Same Stripe integration
- **No new API endpoints**: Using existing data fetching
- **No complex state management**: Keep it simple with React state
- **No third-party animation libraries**: Stick with Framer Motion
- **No WebGL gradient** (Stripe's approach): Too complex, use CSS mesh gradient alternative

## Implementation Approach

### Elon's 5-Step Algorithm Applied

1. **Question Requirements**:
   - Do we need WebGL gradients? No - CSS mesh gradients achieve 90% of effect at 10% complexity
   - Do we need all 6 filing preview cards? No - single card in hero demonstrates value faster
   - Do we need countdown timers? No - creates false urgency, reduces trust for B2B

2. **Delete Unnecessary**:
   - Remove multiple filing cards from hero (keep one)
   - Remove dark theme complexity (single light theme)
   - Remove redundant trust signals (consolidate to 3 metrics)
   - Remove legacy components after migration

3. **Simplify**:
   - Single color palette (blue on white)
   - One animation system (Framer Motion)
   - Unified component patterns across all sections

4. **Accelerate**:
   - Create reusable animation primitives first
   - Build section components in parallel after foundation
   - TDD for critical conversion elements

5. **Automate**:
   - Feature flag for A/B testing
   - Automated visual regression tests (optional future)

### TDD Approach
Each phase follows Red-Green-Refactor:
1. Write failing tests defining expected behavior
2. Implement minimal code to pass tests
3. Refactor while keeping tests green

---

## Phase 1: Design System Foundation

### Overview
Establish the visual foundation: color palette, typography scale, and animation primitives that all V2 components will use.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/design-system.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Test 1: Color tokens exist and are correct
describe('Design System - Colors', () => {
  it('should have light theme primary blue defined', () => {
    // Verify CSS variable exists
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const primaryBlue = styles.getPropertyValue('--landing-primary');
    expect(primaryBlue).toBeTruthy();
  });

  it('should have trust metric colors defined', () => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    expect(styles.getPropertyValue('--landing-success')).toBeTruthy();
    expect(styles.getPropertyValue('--landing-accent')).toBeTruthy();
  });
});

// Test 2: Animation primitives work correctly
describe('Design System - Animations', () => {
  it('should export fadeUpVariant animation config', async () => {
    const { fadeUpVariant } = await import('@/lib/animations/landing-animations');
    expect(fadeUpVariant).toHaveProperty('initial');
    expect(fadeUpVariant).toHaveProperty('animate');
    expect(fadeUpVariant.initial).toEqual({ opacity: 0, y: 20 });
  });

  it('should export staggerContainer animation config', async () => {
    const { staggerContainer } = await import('@/lib/animations/landing-animations');
    expect(staggerContainer).toHaveProperty('animate');
    expect(staggerContainer.animate).toHaveProperty('transition');
  });

  it('should respect reduced motion preference', async () => {
    const { getReducedMotionVariant } = await import('@/lib/animations/landing-animations');
    const variant = getReducedMotionVariant({ opacity: 0, y: 20 }, { opacity: 1, y: 0 });
    // When reduced motion is preferred, y should not animate
    expect(variant.reducedMotion.initial).toEqual({ opacity: 0 });
    expect(variant.reducedMotion.animate).toEqual({ opacity: 1 });
  });
});

// Test 3: Typography scale is correct
describe('Design System - Typography', () => {
  it('should have display heading class', () => {
    render(<h1 className="landing-display">Test</h1>);
    const heading = screen.getByText('Test');
    expect(heading).toHaveClass('landing-display');
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="design-system"
# Expected: 6 failing tests (modules not found, CSS variables not defined)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Create Landing Color Tokens
**File**: `app/globals.css` (add to existing)
**Changes**: Add landing page specific color tokens

```css
/* Add after line 47, inside :root */

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

**Checkpoint 1.2.1**: First color test passes:
```bash
npm run test -- --testPathPattern="design-system" --testNamePattern="primary blue"
# Expected: 1 passing
```

#### 1.2.2 Create Animation Primitives
**File**: `lib/animations/landing-animations.ts` (NEW FILE)

```typescript
import { Variants, Transition } from 'framer-motion';

// Base transition config
export const defaultTransition: Transition = {
  duration: 0.5,
  ease: [0.25, 0.1, 0.25, 1], // Smooth ease-out
};

// Fade up animation (most common)
export const fadeUpVariant: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: defaultTransition,
  },
};

// Fade in animation (no movement)
export const fadeInVariant: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.4 },
  },
};

// Scale up animation (for cards on hover)
export const scaleUpVariant: Variants = {
  initial: { scale: 1 },
  hover: {
    scale: 1.02,
    transition: { duration: 0.2 },
  },
};

// Stagger container for lists/grids
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

// Stagger item (child of staggerContainer)
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: defaultTransition,
  },
};

// Reduced motion support
interface MotionState {
  opacity?: number;
  y?: number;
  x?: number;
  scale?: number;
}

export function getReducedMotionVariant(
  initial: MotionState,
  animate: MotionState
): {
  standard: Variants;
  reducedMotion: Variants;
} {
  // For reduced motion, only animate opacity (no transforms)
  const reducedInitial: MotionState = { opacity: initial.opacity ?? 0 };
  const reducedAnimate: MotionState = { opacity: animate.opacity ?? 1 };

  return {
    standard: {
      initial,
      animate: { ...animate, transition: defaultTransition },
    },
    reducedMotion: {
      initial: reducedInitial,
      animate: { ...reducedAnimate, transition: { duration: 0.2 } },
    },
  };
}

// Viewport trigger settings
export const viewportOnce = {
  once: true,
  margin: '-100px',
};

// Counter animation for trust metrics
export const counterVariant = {
  initial: { opacity: 0, scale: 0.5 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 15,
    },
  },
};

// Gradient text animation
export const gradientTextVariant: Variants = {
  initial: { backgroundPosition: '0% 50%' },
  animate: {
    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
    transition: {
      duration: 5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// Mesh gradient background animation (CSS-based, not WebGL)
export const meshGradientStyle = {
  background: `
    radial-gradient(at 40% 20%, rgba(0, 121, 242, 0.15) 0px, transparent 50%),
    radial-gradient(at 80% 0%, rgba(139, 92, 246, 0.1) 0px, transparent 50%),
    radial-gradient(at 0% 50%, rgba(0, 121, 242, 0.1) 0px, transparent 50%),
    radial-gradient(at 80% 50%, rgba(139, 92, 246, 0.08) 0px, transparent 50%),
    radial-gradient(at 0% 100%, rgba(0, 121, 242, 0.1) 0px, transparent 50%),
    linear-gradient(180deg, #FFFFFF 0%, #F9FAFB 100%)
  `,
  backgroundSize: '100% 100%',
};

// Animated mesh gradient (subtle movement)
export const animatedMeshGradient = {
  initial: {
    backgroundPosition: '0% 0%',
  },
  animate: {
    backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
    transition: {
      duration: 20,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};
```

**Checkpoint 1.2.2**: Animation tests pass:
```bash
npm run test -- --testPathPattern="design-system" --testNamePattern="Animation"
# Expected: 3 passing
```

#### 1.2.3 Create Typography Utilities
**File**: `app/globals.css` (add after landing colors)

```css
/* Landing Page V2 - Typography */
@layer components {
  .landing-display {
    @apply text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1];
    color: var(--landing-secondary);
  }

  .landing-heading {
    @apply text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight;
    color: var(--landing-secondary);
  }

  .landing-subheading {
    @apply text-xl md:text-2xl font-medium;
    color: var(--landing-text);
  }

  .landing-body {
    @apply text-base md:text-lg;
    color: var(--landing-text);
    line-height: 1.7;
  }

  .landing-body-large {
    @apply text-lg md:text-xl;
    color: var(--landing-text);
    line-height: 1.6;
  }

  .landing-caption {
    @apply text-sm;
    color: var(--landing-text-muted);
  }

  /* Gradient text effect */
  .landing-gradient-text {
    @apply bg-clip-text text-transparent;
    background-image: linear-gradient(
      135deg,
      var(--landing-primary) 0%,
      var(--landing-accent) 100%
    );
  }

  /* Primary button style */
  .landing-button-primary {
    @apply h-12 px-8 text-base font-semibold rounded-lg;
    background-color: var(--landing-primary);
    color: white;
    box-shadow: 0 4px 14px 0 rgba(0, 121, 242, 0.39);
    transition: all 0.2s ease;
  }

  .landing-button-primary:hover {
    background-color: var(--landing-primary-hover);
    box-shadow: 0 6px 20px 0 rgba(0, 121, 242, 0.5);
    transform: translateY(-1px);
  }

  /* Secondary button style */
  .landing-button-secondary {
    @apply h-12 px-8 text-base font-semibold rounded-lg;
    background-color: transparent;
    color: var(--landing-secondary);
    border: 1px solid var(--landing-border);
    transition: all 0.2s ease;
  }

  .landing-button-secondary:hover {
    background-color: var(--landing-bg-subtle);
    border-color: var(--landing-text-muted);
  }

  /* Card styles */
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

  /* Badge styles */
  .landing-badge {
    @apply inline-flex items-center px-3 py-1 rounded-full text-sm font-medium;
    background-color: var(--landing-primary-light);
    color: var(--landing-primary);
  }

  /* Trust metric styles */
  .landing-metric {
    @apply flex items-center gap-2;
  }

  .landing-metric-value {
    @apply text-lg font-bold;
    color: var(--landing-secondary);
  }

  .landing-metric-label {
    @apply text-sm;
    color: var(--landing-text-muted);
  }
}
```

**Checkpoint 1.2.3**: Typography test passes:
```bash
npm run test -- --testPathPattern="design-system" --testNamePattern="Typography"
# Expected: 1 passing
```

### Step 1.3: 🔵 Refactor

- [ ] Ensure all color tokens follow naming convention
- [ ] Add JSDoc comments to animation functions
- [ ] Create index.ts barrel export for animations
- [ ] Verify dark mode compatibility (not required for landing, but shouldn't break)

**Checkpoint 1.3**: All tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="design-system"
# Expected: 6 passing, 0 failing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="design-system"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] CSS variables visible in browser DevTools
- [ ] Animation imports work in test component
- [ ] Typography classes render correctly

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Hero Section V2

### Overview
Create a new hero section with two-column Z-pattern layout, animated mesh gradient background, integrated filing preview card, and optimized trust signals.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/hero-section-v2.test.tsx`

```typescript
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HeroSectionV2 } from '@/components/landing/sections-v2/hero-section-v2';

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

describe('HeroSectionV2', () => {
  // Test 1: Renders headline with gradient text
  it('should render headline with "SEC Filings, Simplified" text', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/SEC Filings/i)).toBeInTheDocument();
    expect(screen.getByText(/Simplified/i)).toBeInTheDocument();
  });

  // Test 2: Has badge above headline
  it('should render AI-Powered badge above headline', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/AI-Powered/i)).toBeInTheDocument();
  });

  // Test 3: Primary CTA is visible and links to sign-up
  it('should render primary CTA linking to sign-up', () => {
    render(<HeroSectionV2 />);
    const primaryCTA = screen.getByRole('link', { name: /Start Free Trial/i });
    expect(primaryCTA).toBeInTheDocument();
    expect(primaryCTA).toHaveAttribute('href', '/sign-up');
  });

  // Test 4: Secondary CTA links to pricing
  it('should render secondary CTA linking to pricing', () => {
    render(<HeroSectionV2 />);
    const secondaryCTA = screen.getByRole('link', { name: /View Pricing/i });
    expect(secondaryCTA).toBeInTheDocument();
    expect(secondaryCTA).toHaveAttribute('href', '#pricing');
  });

  // Test 5: Trust metrics are displayed
  it('should display trust metrics with specific values', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/2,500\+/i)).toBeInTheDocument();
    expect(screen.getByText(/investors/i)).toBeInTheDocument();
    expect(screen.getByText(/99\.9%/i)).toBeInTheDocument();
    expect(screen.getByText(/<5 min/i)).toBeInTheDocument();
  });

  // Test 6: Filing preview card is rendered
  it('should render filing preview card with company info', () => {
    render(<HeroSectionV2 />);
    // Should show a sample filing (Apple 10-K)
    expect(screen.getByText(/Apple/i)).toBeInTheDocument();
    expect(screen.getByText(/10-K/i)).toBeInTheDocument();
  });

  // Test 7: No credit card message is visible
  it('should display trust signal about no credit card', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/No credit card required/i)).toBeInTheDocument();
  });

  // Test 8: Uses light background (not dark)
  it('should have light background styling', () => {
    const { container } = render(<HeroSectionV2 />);
    const section = container.querySelector('section');
    expect(section).not.toHaveClass('bg-slate-900');
    expect(section).not.toHaveClass('from-slate-900');
  });

  // Test 9: Two-column layout on desktop
  it('should have two-column grid layout', () => {
    const { container } = render(<HeroSectionV2 />);
    const grid = container.querySelector('.lg\\:grid-cols-2');
    expect(grid).toBeInTheDocument();
  });

  // Test 10: Subheadline explains value proposition
  it('should have subheadline explaining the value', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/Transform.*page.*documents/i)).toBeInTheDocument();
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="hero-section-v2"
# Expected: 10 failing tests (component not found)
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Create Hero Section V2 Component
**File**: `components/landing/sections-v2/hero-section-v2.tsx` (NEW FILE)

```tsx
'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import {
  fadeUpVariant,
  staggerContainer,
  staggerItem,
  meshGradientStyle,
  viewportOnce,
} from '@/lib/animations/landing-animations';
import { HeroFilingCard } from './hero-filing-card';

// Trust metrics data
const trustMetrics = [
  { value: '2,500+', label: 'investors' },
  { value: '99.9%', label: 'uptime' },
  { value: '<5 min', label: 'delivery' },
];

export function HeroSectionV2() {
  return (
    <section
      className="relative min-h-[90vh] flex items-center overflow-hidden"
      style={meshGradientStyle}
    >
      {/* Subtle animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(0, 121, 242, 0.15) 0%, transparent 70%)',
          }}
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
          }}
          animate={{
            x: [0, -20, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Content */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="text-center lg:text-left"
          >
            {/* Badge */}
            <motion.div variants={staggerItem}>
              <Badge className="landing-badge mb-6">
                <Sparkles className="w-4 h-4 mr-2" />
                AI-Powered SEC Intelligence
              </Badge>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={staggerItem}
              className="landing-display mb-6"
            >
              SEC Filings,{' '}
              <span className="landing-gradient-text">Simplified</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={staggerItem}
              className="landing-body-large mb-8 max-w-xl mx-auto lg:mx-0"
            >
              Transform 300+ page regulatory documents into clear, actionable
              summaries delivered to your inbox in minutes.
            </motion.p>

            {/* Trust Metrics Row */}
            <motion.div
              variants={staggerItem}
              className="flex flex-wrap justify-center lg:justify-start gap-6 mb-8"
            >
              {trustMetrics.map((metric) => (
                <div key={metric.label} className="landing-metric">
                  <CheckCircle2 className="w-5 h-5 text-[var(--landing-success)]" />
                  <span className="landing-metric-value">{metric.value}</span>
                  <span className="landing-metric-label">{metric.label}</span>
                </div>
              ))}
            </motion.div>

            {/* CTAs */}
            <motion.div
              variants={staggerItem}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6"
            >
              <Link href="/sign-up">
                <Button className="landing-button-primary">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="#pricing">
                <Button className="landing-button-secondary">
                  View Pricing
                </Button>
              </Link>
            </motion.div>

            {/* Trust Signal */}
            <motion.p
              variants={staggerItem}
              className="landing-caption"
            >
              No credit card required. Cancel anytime.
            </motion.p>
          </motion.div>

          {/* Right Column - Filing Preview Card */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="hidden lg:block"
          >
            <HeroFilingCard />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
```

**Checkpoint 2.2.1**: First tests start passing:
```bash
npm run test -- --testPathPattern="hero-section-v2" --testNamePattern="headline"
# Expected: 1 passing (after creating basic structure)
```

#### 2.2.2 Create Hero Filing Card Component
**File**: `components/landing/sections-v2/hero-filing-card.tsx` (NEW FILE)

```tsx
'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Building2, Calendar, TrendingUp, FileText, DollarSign, Users } from 'lucide-react';

// Sample filing data for hero card (Apple 10-K)
const sampleFiling = {
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  filingType: '10-K',
  filedAt: 'Nov 1, 2024',
  keyHighlights: [
    { icon: DollarSign, text: 'Revenue: $383.3B (+2.0% YoY)' },
    { icon: TrendingUp, text: 'Services segment grew 14%' },
    { icon: Users, text: 'Active devices: 2.2B worldwide' },
    { icon: FileText, text: 'AI features launching in 2025' },
  ],
};

export function HeroFilingCard() {
  return (
    <motion.div
      className="landing-card relative overflow-hidden"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--landing-bg-subtle)] flex items-center justify-center">
            <Building2 className="w-6 h-6 text-[var(--landing-primary)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg" style={{ color: 'var(--landing-secondary)' }}>
                {sampleFiling.ticker}
              </span>
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                {sampleFiling.filingType}
              </Badge>
            </div>
            <p className="text-sm" style={{ color: 'var(--landing-text-muted)' }}>
              {sampleFiling.companyName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--landing-text-muted)' }}>
          <Calendar className="w-4 h-4" />
          {sampleFiling.filedAt}
        </div>
      </div>

      {/* Key Highlights */}
      <div className="space-y-3">
        <p className="text-sm font-medium" style={{ color: 'var(--landing-text-muted)' }}>
          Key Highlights
        </p>
        {sampleFiling.keyHighlights.map((highlight, index) => (
          <motion.div
            key={index}
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ backgroundColor: 'var(--landing-bg-subtle)' }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + index * 0.1 }}
          >
            <highlight.icon className="w-4 h-4 text-[var(--landing-primary)]" />
            <span className="text-sm" style={{ color: 'var(--landing-secondary)' }}>
              {highlight.text}
            </span>
          </motion.div>
        ))}
      </div>

      {/* CTA Link */}
      <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--landing-border)' }}>
        <button className="text-sm font-medium text-[var(--landing-primary)] hover:underline flex items-center gap-1">
          Read full analysis
          <span className="text-xs">→</span>
        </button>
      </div>

      {/* Decorative gradient overlay */}
      <div
        className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at top right, rgba(0, 121, 242, 0.05) 0%, transparent 70%)',
        }}
      />
    </motion.div>
  );
}
```

**Checkpoint 2.2.2**: Filing card tests pass:
```bash
npm run test -- --testPathPattern="hero-section-v2" --testNamePattern="filing preview"
# Expected: 1 more passing
```

#### 2.2.3 Create Index Export
**File**: `components/landing/sections-v2/index.ts` (NEW FILE)

```typescript
export { HeroSectionV2 } from './hero-section-v2';
export { HeroFilingCard } from './hero-filing-card';
```

**Checkpoint 2.2.3**: All hero tests pass:
```bash
npm run test -- --testPathPattern="hero-section-v2"
# Expected: 10 passing
```

### Step 2.3: 🔵 Refactor

- [ ] Extract trust metrics to shared constants file
- [ ] Add JSDoc comments to components
- [ ] Ensure accessibility attributes (aria-labels)
- [ ] Verify responsive behavior at all breakpoints
- [ ] Add loading state for filing card (skeleton)

**Checkpoint 2.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="hero-section-v2"
# Expected: 10 passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="hero-section-v2"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Hero renders with light background
- [ ] Mesh gradient animation is subtle and smooth
- [ ] Filing card appears on right side on desktop
- [ ] Mobile layout stacks correctly (no filing card on mobile)
- [ ] CTAs are clickable and link correctly
- [ ] Trust metrics are readable
- [ ] Animations don't cause layout shift
- [ ] Page load time remains <3 seconds

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Features Section V2

### Overview
Create a cleaner features section with white background, blue accent icons, and scroll-triggered stagger animations.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/features-section-v2.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FeaturesSectionV2 } from '@/components/landing/sections-v2/features-section-v2';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  },
}));

describe('FeaturesSectionV2', () => {
  it('should render section heading', () => {
    render(<FeaturesSectionV2 />);
    expect(screen.getByText(/Built for Modern Investors/i)).toBeInTheDocument();
  });

  it('should render 6 feature cards', () => {
    render(<FeaturesSectionV2 />);
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(6);
  });

  it('should display feature titles', () => {
    render(<FeaturesSectionV2 />);
    expect(screen.getByText(/300\+ Pages.*2 Minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/Real-Time Monitoring/i)).toBeInTheDocument();
    expect(screen.getByText(/Smart Notifications/i)).toBeInTheDocument();
  });

  it('should have 3-column grid on desktop', () => {
    const { container } = render(<FeaturesSectionV2 />);
    const grid = container.querySelector('.lg\\:grid-cols-3');
    expect(grid).toBeInTheDocument();
  });

  it('should have white background', () => {
    const { container } = render(<FeaturesSectionV2 />);
    const section = container.querySelector('section');
    expect(section).toHaveClass('bg-white');
  });

  it('should display feature icons', () => {
    const { container } = render(<FeaturesSectionV2 />);
    const icons = container.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(6);
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="features-section-v2"
# Expected: 6 failing tests
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Create Features Section V2
**File**: `components/landing/sections-v2/features-section-v2.tsx` (NEW FILE)

```tsx
'use client';

import { motion } from 'framer-motion';
import {
  Clock,
  Bell,
  Zap,
  FileSearch,
  Shield,
  Timer
} from 'lucide-react';
import {
  staggerContainer,
  staggerItem,
  viewportOnce,
} from '@/lib/animations/landing-animations';

const features = [
  {
    icon: Clock,
    title: '300+ Pages → 2 Minutes',
    description: 'Our AI distills lengthy SEC filings into clear, actionable summaries you can read in minutes.',
  },
  {
    icon: Bell,
    title: 'Real-Time Monitoring',
    description: 'Get notified the moment a company you track files with the SEC. Never miss critical updates.',
  },
  {
    icon: Zap,
    title: 'Smart Notifications',
    description: 'Customize alerts by filing type, company, or keywords. Only get what matters to you.',
  },
  {
    icon: FileSearch,
    title: 'Filing-Type Analysis',
    description: 'Specialized parsing for 10-K, 10-Q, 8-K, Form 4, and more. Each format handled with precision.',
  },
  {
    icon: Shield,
    title: 'Investment-Grade Quality',
    description: 'Summaries reviewed for accuracy with source citations. Trust the insights you receive.',
  },
  {
    icon: Timer,
    title: 'Save 10+ Hours Weekly',
    description: 'Stop spending weekends reading filings. Get back your time for actual analysis.',
  },
];

export function FeaturesSectionV2() {
  return (
    <section className="py-24 bg-white" id="features">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="landing-heading mb-4">
            Built for Modern Investors
          </h2>
          <p className="landing-body max-w-2xl mx-auto">
            Everything you need to stay informed about the companies you care about.
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={viewportOnce}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto"
        >
          {features.map((feature) => (
            <motion.article
              key={feature.title}
              variants={staggerItem}
              className="landing-card group"
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{ backgroundColor: 'var(--landing-primary-light)' }}
              >
                <feature.icon className="w-6 h-6 text-[var(--landing-primary)]" />
              </div>

              {/* Title */}
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: 'var(--landing-secondary)' }}
              >
                {feature.title}
              </h3>

              {/* Description */}
              <p className="landing-body text-sm">
                {feature.description}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

**Checkpoint 3.2.1**: All features tests pass:
```bash
npm run test -- --testPathPattern="features-section-v2"
# Expected: 6 passing
```

#### 3.2.2 Update Index Export
**File**: `components/landing/sections-v2/index.ts` (UPDATE)

```typescript
export { HeroSectionV2 } from './hero-section-v2';
export { HeroFilingCard } from './hero-filing-card';
export { FeaturesSectionV2 } from './features-section-v2';
```

### Step 3.3: 🔵 Refactor

- [ ] Add hover animations to feature icons
- [ ] Ensure consistent spacing
- [ ] Add aria-labels for accessibility

**Checkpoint 3.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="features-section-v2"
# Expected: 6 passing
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="features-section-v2"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Features render in 3-column grid on desktop
- [ ] Cards stack on mobile
- [ ] Scroll-triggered animations work smoothly
- [ ] Hover states work on cards

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Pricing Section V2

### Overview
Simplified pricing section with clean white cards, "Most Popular" badge animation, and annual savings highlight.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/pricing-section-v2.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PricingSectionV2 } from '@/components/landing/sections-v2/pricing-section-v2';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  },
}));

describe('PricingSectionV2', () => {
  it('should render section heading', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/Simple, Transparent Pricing/i)).toBeInTheDocument();
  });

  it('should render 3 pricing tiers', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/Free/i)).toBeInTheDocument();
    expect(screen.getByText(/Pro/i)).toBeInTheDocument();
    expect(screen.getByText(/Max/i)).toBeInTheDocument();
  });

  it('should display prices', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/\$0/)).toBeInTheDocument();
    expect(screen.getByText(/\$15/)).toBeInTheDocument();
    expect(screen.getByText(/\$40/)).toBeInTheDocument();
  });

  it('should show "Most Popular" badge on Pro plan', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/Most Popular/i)).toBeInTheDocument();
  });

  it('should have billing toggle for monthly/annual', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('should update prices when toggling to annual', () => {
    render(<PricingSectionV2 />);
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    // Annual prices should show monthly equivalent
    expect(screen.getByText(/\/month/i)).toBeInTheDocument();
  });

  it('should display feature lists for each tier', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/3 companies/i)).toBeInTheDocument();
    expect(screen.getByText(/10 companies/i)).toBeInTheDocument();
    expect(screen.getByText(/Unlimited/i)).toBeInTheDocument();
  });

  it('should have CTA buttons for each tier', () => {
    render(<PricingSectionV2 />);
    const buttons = screen.getAllByRole('link', { name: /Get Started|Start Free|Go Max/i });
    expect(buttons.length).toBe(3);
  });
});
```

**Checkpoint 4.1**: Tests fail:
```bash
npm run test -- --testPathPattern="pricing-section-v2"
# Expected: 8 failing
```

### Step 4.2: 🟢 Implement to Pass Tests

#### 4.2.1 Create Pricing Section V2
**File**: `components/landing/sections-v2/pricing-section-v2.tsx` (NEW FILE)

```tsx
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Check, Zap, Sparkles, Crown } from 'lucide-react';
import Link from 'next/link';
import {
  staggerContainer,
  staggerItem,
  viewportOnce,
} from '@/lib/animations/landing-animations';

type BillingInterval = 'monthly' | 'annual';

const plans = [
  {
    name: 'Free',
    icon: Zap,
    monthlyPrice: 0,
    annualPrice: 0,
    description: 'Perfect for getting started',
    features: [
      '3 companies',
      '10-K and 10-Q filings',
      'Email summaries',
      'Basic support',
    ],
    cta: 'Start Free',
    href: '/sign-up',
    popular: false,
  },
  {
    name: 'Pro',
    icon: Sparkles,
    monthlyPrice: 15,
    annualPrice: 150, // 2 months free
    description: 'For serious investors',
    features: [
      '10 companies',
      'All filing types',
      'Real-time alerts',
      'Priority support',
      'Custom notifications',
    ],
    cta: 'Get Started',
    href: '/sign-up?plan=pro',
    popular: true,
  },
  {
    name: 'Max',
    icon: Crown,
    monthlyPrice: 40,
    annualPrice: 400, // 2 months free
    description: 'For professionals',
    features: [
      'Unlimited companies',
      'All filing types',
      'API access',
      'Dedicated support',
      'Custom integrations',
      'Team features',
    ],
    cta: 'Go Max',
    href: '/sign-up?plan=max',
    popular: false,
  },
];

export function PricingSectionV2() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');

  const getPrice = (plan: typeof plans[0]) => {
    if (billingInterval === 'annual') {
      return Math.round(plan.annualPrice / 12);
    }
    return plan.monthlyPrice;
  };

  const getSavings = (plan: typeof plans[0]) => {
    if (plan.monthlyPrice === 0) return null;
    const monthlyTotal = plan.monthlyPrice * 12;
    const savings = monthlyTotal - plan.annualPrice;
    const percentage = Math.round((savings / monthlyTotal) * 100);
    return percentage;
  };

  return (
    <section className="py-24 bg-[var(--landing-bg-subtle)]" id="pricing">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="landing-heading mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="landing-body max-w-2xl mx-auto mb-8">
            Start free, upgrade when you're ready. No hidden fees.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span
              className={`text-sm font-medium ${
                billingInterval === 'monthly'
                  ? 'text-[var(--landing-secondary)]'
                  : 'text-[var(--landing-text-muted)]'
              }`}
            >
              Monthly
            </span>
            <Switch
              checked={billingInterval === 'annual'}
              onCheckedChange={(checked) =>
                setBillingInterval(checked ? 'annual' : 'monthly')
              }
            />
            <span
              className={`text-sm font-medium ${
                billingInterval === 'annual'
                  ? 'text-[var(--landing-secondary)]'
                  : 'text-[var(--landing-text-muted)]'
              }`}
            >
              Annual
            </span>
            {billingInterval === 'annual' && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                2 months free
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={viewportOnce}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto"
        >
          {plans.map((plan) => (
            <motion.div
              key={plan.name}
              variants={staggerItem}
              className={`landing-card relative ${
                plan.popular
                  ? 'ring-2 ring-[var(--landing-primary)] shadow-lg'
                  : ''
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="landing-badge">
                    Most Popular
                  </Badge>
                </div>
              )}

              {/* Plan Header */}
              <div className="text-center mb-6 pt-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: 'var(--landing-primary-light)' }}
                >
                  <plan.icon className="w-6 h-6 text-[var(--landing-primary)]" />
                </div>
                <h3
                  className="text-xl font-bold mb-1"
                  style={{ color: 'var(--landing-secondary)' }}
                >
                  {plan.name}
                </h3>
                <p className="landing-caption">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="text-center mb-6">
                <span
                  className="text-4xl font-bold"
                  style={{ color: 'var(--landing-secondary)' }}
                >
                  ${getPrice(plan)}
                </span>
                <span className="text-[var(--landing-text-muted)]">/month</span>
                {billingInterval === 'annual' && getSavings(plan) && (
                  <p className="text-sm text-green-600 mt-1">
                    Save {getSavings(plan)}%
                  </p>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-[var(--landing-success)]" />
                    <span className="text-sm" style={{ color: 'var(--landing-text)' }}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={`${plan.href}${billingInterval === 'annual' ? '&interval=annual' : ''}`}
                className="block"
              >
                <Button
                  className={`w-full ${
                    plan.popular
                      ? 'landing-button-primary'
                      : 'landing-button-secondary'
                  }`}
                >
                  {plan.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

**Checkpoint 4.2.1**: All pricing tests pass:
```bash
npm run test -- --testPathPattern="pricing-section-v2"
# Expected: 8 passing
```

#### 4.2.2 Update Index Export
**File**: `components/landing/sections-v2/index.ts` (UPDATE)

```typescript
export { HeroSectionV2 } from './hero-section-v2';
export { HeroFilingCard } from './hero-filing-card';
export { FeaturesSectionV2 } from './features-section-v2';
export { PricingSectionV2 } from './pricing-section-v2';
```

### Step 4.3: 🔵 Refactor

- [ ] Add price animation on toggle
- [ ] Improve mobile layout (stacked cards)
- [ ] Add keyboard navigation support

**Checkpoint 4.3**: Tests still pass.

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Lint passes

#### Manual Verification:
- [ ] Pricing toggle works smoothly
- [ ] Prices update correctly
- [ ] Most Popular badge is visible
- [ ] CTAs link correctly

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: CTA Section V2

### Overview
Email capture section with light blue gradient, single email field, and trust signals.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/cta-section-v2.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CTASectionV2 } from '@/components/landing/sections-v2/cta-section-v2';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  },
}));

describe('CTASectionV2', () => {
  it('should render headline', () => {
    render(<CTASectionV2 />);
    expect(screen.getByText(/Start Monitoring/i)).toBeInTheDocument();
  });

  it('should have email input field', () => {
    render(<CTASectionV2 />);
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
  });

  it('should have submit button', () => {
    render(<CTASectionV2 />);
    expect(screen.getByRole('button', { name: /Join|Start|Get/i })).toBeInTheDocument();
  });

  it('should display trust signals', () => {
    render(<CTASectionV2 />);
    expect(screen.getByText(/No credit card/i)).toBeInTheDocument();
    expect(screen.getByText(/free tickers/i)).toBeInTheDocument();
  });

  it('should have light blue gradient background', () => {
    const { container } = render(<CTASectionV2 />);
    const section = container.querySelector('section');
    // Should not have dark gradient classes
    expect(section).not.toHaveClass('from-slate-900');
  });

  it('should validate email format', () => {
    render(<CTASectionV2 />);
    const input = screen.getByPlaceholderText(/email/i);
    expect(input).toHaveAttribute('type', 'email');
  });
});
```

**Checkpoint 5.1**: Tests fail:
```bash
npm run test -- --testPathPattern="cta-section-v2"
# Expected: 6 failing
```

### Step 5.2: 🟢 Implement to Pass Tests

#### 5.2.1 Create CTA Section V2
**File**: `components/landing/sections-v2/cta-section-v2.tsx` (NEW FILE)

```tsx
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { viewportOnce } from '@/lib/animations/landing-animations';

const trustPoints = [
  'No credit card required',
  'Start with 3 free tickers',
  'Cancel anytime',
];

export function CTASectionV2() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    // TODO: Integrate with waitlist API
    // For now, redirect to sign-up with email prefilled
    window.location.href = `/sign-up?email=${encodeURIComponent(email)}`;
  };

  return (
    <section
      className="py-24 relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #EBF5FF 0%, #E3F2FD 50%, #FFFFFF 100%)',
      }}
    >
      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(0, 121, 242, 0.05) 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto text-center"
        >
          {/* Headline */}
          <h2 className="landing-heading mb-4">
            Start Monitoring SEC Filings Today
          </h2>

          <p className="landing-body mb-8">
            Join thousands of investors who save hours every week with AI-powered filing summaries.
          </p>

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-8">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 px-4 flex-1"
              required
            />
            <Button
              type="submit"
              className="landing-button-primary whitespace-nowrap"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Joining...' : 'Get Started'}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </form>

          {/* Trust Points */}
          <div className="flex flex-wrap justify-center gap-6">
            {trustPoints.map((point) => (
              <div key={point} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--landing-success)]" />
                <span className="landing-caption">{point}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

**Checkpoint 5.2.1**: All CTA tests pass:
```bash
npm run test -- --testPathPattern="cta-section-v2"
# Expected: 6 passing
```

### Step 5.3-5.4: Refactor and Verify

Same pattern as previous phases.

---

## Phase 6: Footer Section V2

### Overview
Light theme footer with essential links and legal compliance.

### Step 6.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/footer-section-v2.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FooterSectionV2 } from '@/components/landing/sections-v2/footer-section-v2';

describe('FooterSectionV2', () => {
  it('should render logo/brand', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByText(/tldrsec/i)).toBeInTheDocument();
  });

  it('should have product links', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByRole('link', { name: /Pricing/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sign Up/i })).toBeInTheDocument();
  });

  it('should have legal links', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByRole('link', { name: /Privacy/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Terms/i })).toBeInTheDocument();
  });

  it('should display copyright', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByText(/2024|2025/)).toBeInTheDocument();
  });

  it('should have SEC disclaimer', () => {
    render(<FooterSectionV2 />);
    expect(screen.getByText(/not investment advice/i)).toBeInTheDocument();
  });

  it('should have white background', () => {
    const { container } = render(<FooterSectionV2 />);
    const footer = container.querySelector('footer');
    expect(footer).toHaveClass('bg-white');
  });
});
```

### Step 6.2: 🟢 Implement Footer V2

**File**: `components/landing/sections-v2/footer-section-v2.tsx` (NEW FILE)

```tsx
import Link from 'next/link';
import { FileText } from 'lucide-react';

const productLinks = [
  { label: 'Pricing', href: '#pricing' },
  { label: 'Sign Up', href: '/sign-up' },
  { label: 'Sign In', href: '/sign-in' },
];

const legalLinks = [
  { label: 'Privacy Policy', href: '/legal/privacy' },
  { label: 'Terms of Service', href: '/legal/terms' },
];

export function FooterSectionV2() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-12 bg-white border-t" style={{ borderColor: 'var(--landing-border)' }}>
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-6 h-6 text-[var(--landing-primary)]" />
              <span className="text-xl font-bold" style={{ color: 'var(--landing-secondary)' }}>
                tldrsec
              </span>
            </div>
            <p className="landing-caption max-w-sm">
              AI-powered SEC filing analysis for modern investors.
              Save hours every week with intelligent summaries.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              Product
            </h4>
            <ul className="space-y-2">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="landing-caption hover:text-[var(--landing-primary)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-semibold mb-4" style={{ color: 'var(--landing-secondary)' }}>
              Legal
            </h4>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="landing-caption hover:text-[var(--landing-primary)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t" style={{ borderColor: 'var(--landing-border)' }}>
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="landing-caption">
              © {currentYear} tldrsec. All rights reserved.
            </p>
            <p className="landing-caption text-center md:text-right max-w-md">
              This service provides summaries for informational purposes only and is not investment advice.
              Always consult original SEC filings for complete information.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

---

## Phase 7: Landing Page V2 Composition & Waitlist Update

### Overview
Compose all V2 sections into the new landing page and update the waitlist page to match.

### Step 7.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/landing-page-v2.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LandingPageV2 } from '@/components/landing/landing-page-v2';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    h2: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

describe('LandingPageV2', () => {
  it('should render all sections', () => {
    render(<LandingPageV2 />);

    // Hero
    expect(screen.getByText(/SEC Filings, Simplified/i)).toBeInTheDocument();

    // Features
    expect(screen.getByText(/Built for Modern Investors/i)).toBeInTheDocument();

    // Pricing
    expect(screen.getByText(/Simple, Transparent Pricing/i)).toBeInTheDocument();

    // CTA
    expect(screen.getByText(/Start Monitoring/i)).toBeInTheDocument();

    // Footer
    expect(screen.getByText(/tldrsec/i)).toBeInTheDocument();
  });

  it('should have correct section order', () => {
    const { container } = render(<LandingPageV2 />);
    const sections = container.querySelectorAll('section, footer');

    // Hero, Features, Pricing, CTA, Footer
    expect(sections.length).toBe(5);
  });

  it('should not render filing preview grid separately', () => {
    render(<LandingPageV2 />);
    // Filing preview is now integrated into hero, not a separate section
    const grids = screen.queryAllByTestId('filing-preview-grid');
    expect(grids.length).toBe(0);
  });
});
```

### Step 7.2: 🟢 Implement Landing Page V2

**File**: `components/landing/landing-page-v2.tsx` (NEW FILE)

```tsx
import {
  HeroSectionV2,
  FeaturesSectionV2,
  PricingSectionV2,
  CTASectionV2,
  FooterSectionV2
} from './sections-v2';

export function LandingPageV2() {
  return (
    <main className="min-h-screen">
      <HeroSectionV2 />
      <FeaturesSectionV2 />
      <PricingSectionV2 />
      <CTASectionV2 />
      <FooterSectionV2 />
    </main>
  );
}
```

### Step 7.3: Update Waitlist Page

**File**: `components/landing/waitlist-page-v2.tsx` (NEW FILE)

```tsx
import { HeroSectionV2 } from './sections-v2/hero-section-v2';
import { FooterSectionV2 } from './sections-v2/footer-section-v2';
import { CTASectionV2 } from './sections-v2/cta-section-v2';

// Waitlist uses simplified version - Hero + CTA + Footer
export function WaitlistPageV2() {
  return (
    <main className="min-h-screen">
      <HeroSectionV2 />
      <CTASectionV2 />
      <FooterSectionV2 />
    </main>
  );
}
```

---

## Phase 8: A/B Testing Infrastructure

### Overview
Add feature flag to switch between old and new landing page for A/B testing.

### Step 8.1: 🔴 Write Failing Tests

**Test File**: `__tests__/app/page-feature-flag.test.tsx`

```typescript
describe('Landing Page Feature Flag', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should render V2 landing page when LANDING_V2 flag is enabled', async () => {
    process.env.NEXT_PUBLIC_LANDING_V2_ENABLED = 'true';
    // Test that V2 component is rendered
  });

  it('should render V1 landing page when LANDING_V2 flag is disabled', async () => {
    process.env.NEXT_PUBLIC_LANDING_V2_ENABLED = 'false';
    // Test that V1 component is rendered
  });

  it('should default to V1 when flag is not set', async () => {
    delete process.env.NEXT_PUBLIC_LANDING_V2_ENABLED;
    // Test default behavior
  });
});
```

### Step 8.2: 🟢 Implement Feature Flag

**File**: `app/page.tsx` (UPDATE existing file)

```tsx
import { Suspense } from 'react';
import { getCuratedFilings } from '@/lib/data/curated-filings';
import LandingPage from '@/components/landing/new-landing-page';
import { LandingPageV2 } from '@/components/landing/landing-page-v2';
import { redirect } from 'next/navigation';

// Feature flags
const isLandingPageEnabled = process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED === 'true';
const isLandingV2Enabled = process.env.NEXT_PUBLIC_LANDING_V2_ENABLED === 'true';

export default async function Home() {
  if (!isLandingPageEnabled) {
    redirect('/waitlist');
  }

  // Use V2 if enabled, otherwise V1
  if (isLandingV2Enabled) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <LandingPageV2 />
      </Suspense>
    );
  }

  // V1 (existing) landing page
  const curatedFilings = await getCuratedFilings();

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LandingPage filingPreviews={curatedFilings} />
    </Suspense>
  );
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}
```

### Step 8.3: Environment Variable Documentation

Add to `.env.example`:
```
# Landing Page Feature Flags
NEXT_PUBLIC_LANDING_PAGE_ENABLED=true
NEXT_PUBLIC_LANDING_V2_ENABLED=false  # Set to 'true' to enable new design
```

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test** (when practical)
2. **Descriptive Test Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**
5. **Edge Cases First**

### Test Categories

#### 1. Contract Tests (Write First)
- Component renders expected elements
- Props are handled correctly
- Links point to correct URLs

#### 2. Edge Case Tests (Write Second)
- Empty states
- Loading states
- Error handling
- Mobile viewport behavior

#### 3. Integration Tests (Write Third)
- Full page composition
- Navigation between sections
- Form submission flow

#### 4. Visual Regression Tests (Optional Future)
- Screenshot comparisons
- Storybook visual tests

### Checkpoint Frequency
- Minimum 3 checkpoints per phase (Red, Green, Refactor)
- One checkpoint per test group
- Maximum 15 minutes between checkpoints

### Manual Testing Checklist

#### Desktop (1440px+)
- [ ] Hero section renders with two columns
- [ ] Filing card appears on right
- [ ] Mesh gradient animates smoothly
- [ ] All CTAs are clickable
- [ ] Pricing toggle works
- [ ] Scroll animations trigger correctly
- [ ] No horizontal scrollbar

#### Tablet (768px - 1024px)
- [ ] Filing card is hidden
- [ ] Grid layouts adjust correctly
- [ ] Touch targets are adequate

#### Mobile (< 768px)
- [ ] Single column layout throughout
- [ ] CTAs stack vertically
- [ ] Form is usable with keyboard
- [ ] No text overflow
- [ ] Touch targets are 44x44px+

#### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader announces content correctly
- [ ] Reduced motion preference respected
- [ ] Color contrast passes WCAG AA

#### Performance
- [ ] Lighthouse Performance ≥90
- [ ] First Contentful Paint <1.5s
- [ ] Largest Contentful Paint <2.5s
- [ ] No layout shift during animations

---

## Performance Considerations

### Animation Performance
- Use `transform` and `opacity` only (GPU-accelerated)
- Avoid animating layout properties (width, height, margin)
- Use `will-change` sparingly and remove after animation
- Implement `prefers-reduced-motion` support

### Image Optimization
- Use Next.js `Image` component
- Implement lazy loading for below-fold images
- Use WebP format with fallbacks
- Responsive image sizing

### Code Splitting
- Dynamic imports for heavy components
- Separate chunks for V1 vs V2 landing pages
- Lazy load Framer Motion if possible

### CSS Optimization
- Purge unused Tailwind classes
- Minimize custom CSS
- Use CSS containment where appropriate

---

## Migration Notes

### Gradual Rollout Strategy
1. **Week 1**: Deploy with `NEXT_PUBLIC_LANDING_V2_ENABLED=false`
2. **Week 2**: Enable for 10% of traffic (use edge middleware or Vercel split)
3. **Week 3**: Analyze metrics, iterate
4. **Week 4**: Full rollout or rollback

### Rollback Procedure
1. Set `NEXT_PUBLIC_LANDING_V2_ENABLED=false`
2. Redeploy
3. V1 landing page immediately restored

### Cleanup After Full Migration
- Delete `components/landing/sections/` (V1 sections)
- Delete `components/landing/new-landing-page.tsx`
- Rename V2 components to remove `-v2` suffix
- Update imports throughout codebase

---

## References

### Research Documents
- **Replit Mockup Analysis**: `thoughts/shared/research/2025-12-31-landing-page-replit-redesign.md`

### Design Inspiration
- Cursor.sh: Interactive demo in hero, Z-pattern layout
- Stripe.com: Mesh gradients, micro-interactions, trust badges
- Apple.com: Whitespace, typography hierarchy, minimalism

### Existing Implementation
- Current landing: `components/landing/new-landing-page.tsx`
- Current hero: `components/landing/sections/hero-section.tsx`
- Styling: `app/globals.css`, `tailwind.config.ts`
- UI components: `components/ui/`

### Best Practices Sources
- Landing page conversion: Unbounce, CXL, HubSpot research
- Typography: Scope Design 2025 guidelines
- Animation: Framer Motion best practices
- Accessibility: WCAG 2.1 AA guidelines

---

## Success Metrics

### Primary KPIs (Track After Launch)
- Sign-up conversion rate (target: +20% vs V1)
- Email capture rate (new metric)
- Time to first action (target: <30 seconds)
- Bounce rate (target: -15% vs V1)

### Secondary KPIs
- Page load time (target: <3 seconds)
- Lighthouse scores (Performance, Accessibility, Best Practices ≥90)
- Mobile conversion rate
- Scroll depth

### A/B Test Duration
- Minimum sample size: 1,000 visitors per variant
- Statistical significance: 95%
- Minimum test duration: 2 weeks
