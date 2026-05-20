/**
 * Pre-populate User rows for waitlist members so the Founding Lifetime Seat
 * webhook can grant entitlement on payment.
 *
 * Background: ~122 of 124 waitlist members in `newsletter_subscribers`
 * (Supabase) have no matching `User` row in the Prisma DB. They signed up
 * to the waitlist via the landing page but never completed Clerk signup.
 * When they pay Wednesday, `handlePaymentModeCheckout` looks them up by
 * email and currently logs `Manual reconciliation required` if no User
 * row exists.
 *
 * This script creates placeholder User rows with:
 *   - id:              auto-generated UUID (NOT a Clerk ID)
 *   - email:           lowercased waitlist email
 *   - authProvider:    'pending'  (sentinel; Clerk webhook upgrades on signup)
 *   - authProviderId:  'pending-<random>' (sentinel that won't collide)
 *   - subscriptionTier: FREE       (entitlement granted later by webhook)
 *   - foundingMember:   false      (set true by webhook on payment)
 *
 * When the customer later signs up via Clerk using the same email, the
 * patched Clerk `user.created` handler finds the existing row by email
 * and updates `authProvider`, `authProviderId`, and `name`. Existing FK
 * relations (UserSubscription, AuditLog, etc.) stay attached to the
 * original UUID `id`, so no cascading rewrites are needed.
 *
 * Idempotent. Safe to re-run. Will skip emails that already have a User
 * row (regardless of who created it).
 *
 * Usage:
 *   bun run scripts/founding/pre-populate-waitlist-users.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@/lib/db/prisma';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) required',
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: subs, error } = await supabase
    .from('newsletter_subscribers')
    .select('email, subscribed_at');
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  const subscribers = (subs ?? [])
    .map((s) => ({
      email: (s.email as string).toLowerCase().trim(),
      subscribedAt: s.subscribed_at,
    }))
    .filter((s) => s.email);

  const prisma = getPrismaClient();
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: subscribers.map((s) => s.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  const toCreate = subscribers.filter((s) => !existingEmails.has(s.email));

  console.log(`Total waitlist subscribers: ${subscribers.length}`);
  console.log(`Already have User row:      ${subscribers.length - toCreate.length}`);
  console.log(`Will create User rows for:  ${toCreate.length}`);
  console.log('');

  if (toCreate.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log('DRY RUN. Sample of emails that would get pre-populated rows:');
    for (const s of toCreate.slice(0, 10)) console.log(`  - ${s.email}`);
    if (toCreate.length > 10) console.log(`  ... and ${toCreate.length - 10} more`);
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let failed = 0;
  for (const s of toCreate) {
    const placeholderClerkId = `pending-${randomUUID()}`;
    try {
      await prisma.user.create({
        data: {
          email: s.email,
          authProvider: 'pending',
          authProviderId: placeholderClerkId,
          subscriptionTier: 'FREE',
          foundingMember: false,
          onboardingCompleted: false,
        },
      });
      created++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${s.email}: ${msg}`);
    }
  }

  console.log('');
  console.log(`Created: ${created}`);
  console.log(`Failed:  ${failed}`);
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
