# Master Timeline - Project History Archive

This file provides a chronological index of all completed projects. For detailed implementation context, see `PROGRESS.md`.

## Navigation
- **Current Active Work + Details**: See main `PROGRESS.md`
- **Recent Completed (Last 30 Days)**: Listed below with dates
- **Historical Archives**: See weekly files for full technical details

---

## Recent Activity (Last 30 Days)

| Date | Project | Status |
|------|---------|--------|
| 2026-02-24 | E2E Pipeline Script Alignment (rewrite test-e2e-email.ts to use production 3-phase pipeline code) | In Progress |
| 2026-02-24 | Fix Subscription State Not Updating (webhook tier sync, checkout verification fallback, trial banner props, subscribe UI, PR #352) | ✅ |
| 2026-02-20 | Fix Subscribe Page Bugs + Downgrade Support (abandoned checkout planType, back nav, downgrade dialog) | ✅ |
| 2026-02-20 | Redirect Upgrade Links to /subscribe (dashboard-client.tsx upgrade button + toast) | ✅ |
| 2026-02-19 | Back to Dashboard Button on Billing Page | ✅ |
| 2026-02-19 | Tutorial Overlay Bug Fixes (spotlight effect, skip for existing users, tooltip contrast) | ✅ |
| 2026-02-19 | Dashboard Skeleton Refinement (match actual DOM layout) | ✅ |
| 2026-02-19 | Sign-Up Page Skeleton + Auth Nav Cleanup (Clerk hydration shimmer, hide nav on auth) | ✅ |
| 2026-02-19 | Fix Dashboard Slow Load After Sign-In (remove ProtectedRoute, server-side ticker fetch) | ✅ |
| 2026-02-19 | Auth Redirect for Logged-In Users (middleware redirect to /dashboard) | ✅ |
| 2026-02-18 | Worktree Manager Create-and-Open Option (--open flag, interactive menu option 4) | ✅ |
| 2026-02-18 | Landing Page Auth-Aware Test Coverage (42 tests: navbar, PricingCard, integration, E2E journeys, fixtures) | ✅ |
| 2026-02-14 | Email Summary Quality Improvements (PR #349: summaryJSON storage, quality gates, staleness detection) | ✅ |
| 2026-02-14 | Skeleton Loading States for Billing & Subscribe (route-level loading.tsx, 12 tests) | ✅ |
| 2026-02-14 | Personalized Pricing Experience (auth/subscription contexts, PricingCard, subscription-aware CTAs) | ✅ |
| 2026-02-12 | TrialService User Lookup Fix (findFirst with authProviderId, graceful fallback) | ✅ |
| 2026-02-12 | Cloudflare Cron Schedule Consolidation (fit free tier limit) | ✅ |
| 2026-02-11 | Engineering Process Improvements + Dashboard Refactoring (PR #346: DashboardShell split, review_plan) | ✅ |
| 2026-02-11 | FREE Plan to 7-Day Trial Migration (database-managed trial, 8 phases, email gates) | ✅ |
| 2026-02-10 | Pipeline Job Processing Improvements (DLQ cleanup automation, retry pattern docs, test fixes) | ✅ |
| 2026-02-07 | Subscription Management UX Redesign (Grok-inspired interface, PR #343) | ✅ |
| 2026-02-07 | Dashboard Loading Skeleton Enhancement (animations, shimmer, Card components) | ✅ |
| 2026-02-07 | Dashboard UI Polish (Manage Subscription button border removal) | ✅ |
| 2026-02-07 | Orphaned UserSubscription Database Cleanup (dashboard loading fix, 2 orphaned records deleted) | ✅ |
| 2026-02-07 | Form 4 Preference Sync Fix (60 missed emails, centralized sync utilities) | ✅ |
| 2026-02-07 | CLAUDE.md Agent Guidelines + intentional-compact feedback loop (prevent agent mistakes) | ✅ |
| 2026-01-28 | Unified Subscription Tiers + Billing Downgrade Fix (enum consolidation, PUT handler) | ✅ |
| 2026-01-28 | Pipeline Stall Recovery + Throughput Optimization (vercel.json fix, */3 summarize cron) | ✅ |
| 2026-01-27 | Unsent Email Recovery (47 completed summaries resent, scripts created) | ✅ |
| 2026-01-27 | TickerMonitoring Root Cause Fix (3-phase pipeline missing upsert, health endpoint enhancement) | ✅ |
| 2026-01-27 | GitHub Actions Minutes Optimization (watchdog */30, path filters for quality-gates + pr-validation) | ✅ |
| 2026-01-26 | Stripe Webhook planType Sync Fix (PR #339, checkout UX improvements) | ✅ |
| 2026-01-26 | Pipeline Resilience Zero-Intervention (CRON_SECRET sanitization, orphan detection, GitHub Action watchdog) | ✅ |

*See PROGRESS.md for detailed implementation notes on current work*

---

## 2026

### January 2026

| Date | Project | Status |
|------|---------|--------|
| 2026-01-25 | BAC 424B2 Filtering Breach Investigation (NULL preferences, 87% tickers affected) | ✅ |
| 2026-01-25 | Stripe Dashboard Integration Fixes (lib/stripe split, PlanType migration) | ✅ |
| 2026-01-23 | Prospectus Filing Type Preferences (PR #335, 424B2 filtering) | ✅ |
| 2026-01-21 | Cloudflare Build Fix - Onboarding Dynamic Rendering | ✅ |
| 2026-01-20 | Pipeline Health Connection Pool Exhaustion Fix | ✅ |
| 2026-01-19 | Onboarding Redirect Race Condition Fix | ✅ |
| 2026-01-16 | Pipeline Stall Recovery and Prevention (926 jobs cleared) | ✅ |
| 2026-01-16 | Email Template Type Errors Fix | ✅ |
| 2026-01-15 | SEC Summary Quality Phase 2-4: Grokipedia Research | ✅ |
| 2026-01-15 | 8-K Email Template Registry Fix | ✅ |
| 2026-01-15 | Auto-Recovery Authentication Fix (CRON_SECRET) | ✅ |
| 2026-01-15 | Pipeline Stall Recovery - Cloudflare Worker CRON_SECRET Fix | ✅ |
| 2026-01-13 | Pipeline Recovery - Database Migration Fix (aws-0 → aws-1) | ✅ |
| 2026-01-12 | Pipeline Stall Investigation - Database Connection Pool Fix | ✅ |
| 2026-01-12 | GitHub Actions Workflow Updates (Phase 5-8 docs) | ✅ |
| 2026-01-11 | clerkMiddleware API Fix (v6 pattern) | ✅ |
| 2026-01-11 | Eliminate Manual Pipeline Intervention - Phases 5-8 | ✅ |
| 2026-01-10 | Critical Job Queue Database Bug Fix (getPrismaClient()) | ✅ |
| 2026-01-10 | Auth-First Onboarding Flow (6 phases) | ✅ |
| 2026-01-10 | Pipeline Redeployment & Backlog Recovery | ✅ |
| 2026-01-10 | Eliminate Manual Pipeline Intervention - Phases 1-4 | ✅ |
| 2026-01-09 | Summary Generation Quality - Phase 5: SC 13G/SC 13D/424B2 | ✅ |
| 2026-01-09 | Fix Orphaned Filings Pipeline | ✅ |
| 2026-01-08 | Summary Generation Quality - Phases 2-4 | ✅ |
| 2026-01-08 | 100% Cron Pipeline Uptime - Zero Silent Failures | ✅ |
| 2026-01-08 | Dashboard Table Height Stability Fix | ✅ |
| 2026-01-07 | Summary Generation Quality - Phase 1 + Accuracy Phases 1-4 | ✅ |
| 2026-01-07 | 100% Pipeline Uptime - Phase 2: Self-Healing Auto-Recovery | ✅ |
| 2026-01-06 | 100% Pipeline Uptime - Phases 3-5 | ✅ |
| 2026-01-06 | Waitlist Payment Integration | ✅ |
| 2026-01-05 | Dashboard Redesign - Inline Ticker Addition | ✅ |
| 2026-01-03 | Pipeline Resilience + Stalling Fix + Stripe Deployment + DB Upsert + Pricing | ✅ |
| 2026-01-02 | Auto-Recover 401 Fix + Remove Budget System | ✅ |
| 2026-01-01 | Passwordless Onboarding + Gmail Hero Fix + Dashboard V2 + Pricing Fix + CF Recovery | ✅ |

---

### December 2025

*See weekly archive files in `.claude/history/2025/Dec/` for full details*

- `29-Dec-2025.md` - Cloudflare Cron Fix, Email Quality, Form 4 Templates, JSON Parsing Phase 5
- `22-Dec-2025.md` - Supabase cutover, Email link fixes, Test data integrity
- `15-Dec-2025.md` - Pipeline fixes, Cloudflare Worker validation, Slack monitor
- `08-Dec-2025.md` - Job fixes, Live Counter SSR, Dev environment
- `01-Dec-2025.md` - Email summarization phases 1-3, Digest markdown

### November 2025

*See `.claude/history/2025/Nov/` for full details*

### October 2025

*See `.claude/history/2025/Oct/` for full details*

---

## Archive Statistics
- **Total Archived Projects**: 11 weekly archives (Oct-Dec 2025) + Jan 2026 consolidated
- **Current PROGRESS.md Lines**: 473 (threshold: 500) ✅ HEALTHY
- **Last Sync**: 2026-02-24
- **Archive System**: ✅ ACTIVE
- **Last Compaction**: 2026-02-24 (Bidirectional sync, E2E pipeline alignment added)

---

## How to Use

1. **For current work details**: Read `PROGRESS.md`
2. **For timeline overview**: Scan table above
3. **For archived project details**: Click weekly archive links
4. **For specific implementation**: Search `PROGRESS.md` first, then archives
