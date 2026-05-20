/**
 * Manual Lifetime Seat revoke escape hatch.
 *
 * Usage:
 *   bun run scripts/founding/revoke-lifetime-seat.ts --user-id <id> --reason "support_request"
 *   bun run scripts/founding/revoke-lifetime-seat.ts --email <email> --reason "manual_refund"
 *
 * The primary revoke path is the `charge.refunded` webhook handler in
 * `app/api/webhook/route.ts`, which auto-fires when a Stripe refund is
 * issued in the dashboard. This script exists for cases where the webhook
 * did not fire (e.g., a manual Stripe refund on an old payment that
 * predates this code, or a support-driven revocation independent of
 * Stripe state).
 *
 * Runs the same atomic transaction as the webhook via `revokeLifetimeSeat`
 * in `lib/stripe/sync-subscription.ts`, ensuring consistent state.
 */

import { revokeLifetimeSeat } from '@/lib/stripe/sync-subscription';
import { getPrismaClient } from '@/lib/db/prisma';

interface CliArgs {
  userId?: string;
  email?: string;
  reason: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const userIdIdx = args.indexOf('--user-id');
  const emailIdx = args.indexOf('--email');
  const reasonIdx = args.indexOf('--reason');

  const userId = userIdIdx >= 0 ? args[userIdIdx + 1] : undefined;
  const email = emailIdx >= 0 ? args[emailIdx + 1] : undefined;
  const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : 'manual_revoke';

  if (!userId && !email) {
    throw new Error('One of --user-id or --email is required');
  }
  return { userId, email, reason };
}

async function main() {
  const { userId: cliUserId, email, reason } = parseArgs(process.argv);
  const prisma = getPrismaClient();

  let userId = cliUserId;
  if (!userId && email) {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true, foundingMember: true, subscriptionTier: true },
    });
    if (!user) {
      throw new Error(`No user found with email ${email}`);
    }
    if (!user.foundingMember) {
      console.warn(
        `Warning: user ${user.id} (${email}) is not currently a Founding Member ` +
          `(foundingMember=false, tier=${user.subscriptionTier}). Revoke will still run ` +
          `(idempotent) but this may indicate a stale request.`,
      );
    }
    userId = user.id;
  }

  if (!userId) {
    throw new Error('Could not resolve userId. Pass --user-id or --email.');
  }

  console.log(`Revoking Lifetime Seat for user ${userId} (reason: ${reason})...`);
  await revokeLifetimeSeat(userId, reason);
  console.log('Done.');

  const after = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, foundingMember: true, subscriptionTier: true },
  });
  console.log('Post-revoke state:', JSON.stringify(after, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
