-- Migration: Add foundingMember column to User
-- Source plan: docs/adr/0004-lifetime-seat-entitlement-and-one-time-payment.md
--
-- Adds a boolean column to `app.User` indicating whether the user holds one of
-- the 25 Lifetime Seats (one-time $499 payment for permanent MAX access). See
-- ADR-0004 for the full rationale on why this is a boolean flag rather than a
-- new SubscriptionTier value or a separate model.
--
-- Performance characteristics:
--   - `ADD COLUMN ... NOT NULL DEFAULT false` is fast in PostgreSQL 11+. The
--     default is stored as table metadata, no row rewrite required.
--   - All existing rows logically read `false`; no backfill needed.
--   - Field is set true only via the Stripe webhook handler when a Lifetime
--     Seat is claimed, and set false via the `charge.refunded` webhook within
--     the 30-day refund window.

ALTER TABLE "app"."User"
  ADD COLUMN IF NOT EXISTS "foundingMember" BOOLEAN NOT NULL DEFAULT false;
