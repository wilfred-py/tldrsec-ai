/**
 * Send Founding Lifetime Seat outreach to a batch of waitlist members.
 *
 * Usage:
 *   FOUNDING_ARMED=true bun run scripts/founding/send-founding-batch.ts --batch us [--limit 25]
 *   FOUNDING_ARMED=true bun run scripts/founding/send-founding-batch.ts --batch eu [--limit 8]
 *   bun run scripts/founding/send-founding-batch.ts --batch us --dry-run
 *
 * Reads `newsletter_subscribers` from Supabase, filters by region heuristic
 * (us vs eu by email domain — uses the canonical `classifyRegion` from
 * `lib/email/region-classifier.ts` so EU/US splits stay aligned with the
 * cron-fired VRT 10-Q campaign), skips addresses already in
 * `scripts/founding/sent.jsonl`, and sends one-to-one Resend emails from
 * the founder address. Each email includes a unique link with batch + UTM
 * params the webhook can correlate back via `client_reference_id` and
 * `session.metadata.batch`.
 *
 * Dry-run prints the recipient list and the rendered email body for one
 * recipient without sending anything. `--dry-run` bypasses the
 * `FOUNDING_ARMED` env gate; real sends require `FOUNDING_ARMED=true`.
 *
 * REGION TIMING (derived from the 2026-05 waitlist audience analysis;
 * see lib/email/region-classifier.ts:1-28 for the full rationale):
 *
 *   124-person waitlist, ~75% US prior, Boomer-leaning audience that
 *   reads email first-thing-in-the-morning. Email domain is the only
 *   reliable geo signal we have — the stored subscriber_ip column is
 *   broken (every value is a Cloudflare edge IP; see waitlist-route.ts).
 *
 *   - EU batch:  07:30 UTC = 09:30 CEST (~mid-morning EU). ~8 recipients.
 *   - US batch:  11:00 UTC = 07:00 AM EDT (peak Boomer open window).
 *                ~116 recipients.
 *
 *   Mis-classification budget: ~4 EU users hidden in gmail.com /
 *   yahoo.com default to US. They'll read at lunchtime in their TZ —
 *   acceptable.
 *
 *   NOTE: an earlier draft of the PR 563 runbook claimed "12 UTC = 7 AM
 *   ET", which was correct in EST (UTC-5) but wrong in EDT (UTC-4).
 *   May 2026 is EDT. Use 11 UTC for the US batch to land at 7 AM EDT —
 *   matches PR 562's cron-fired VRT send and the lib classifier's
 *   documented audience analysis.
 */

import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { classifyRegion } from '@/lib/email/region-classifier';
import { FOUNDER_REPLY_TO } from '@/lib/email/config';

interface CliArgs {
  batch: 'us' | 'eu';
  dryRun: boolean;
  limit?: number;
}

const SENT_LOG_PATH = 'scripts/founding/sent.jsonl';
const SENDER = `Wilf <${FOUNDER_REPLY_TO}>`;
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://tldrsec.app';

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  // Reject unknown flags. Without this, a typo like `--dryrun` (missing
  // dash) silently evaluates to dryRun=false; combined with an exported
  // FOUNDING_ARMED=true in the operator's shell from a prior session,
  // that fires a live send to 124 people. Hard-fail on the typo instead.
  const knownFlags = new Set(['--batch', '--dry-run', '--limit']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    if (!knownFlags.has(a)) {
      throw new Error(
        `Unknown flag: ${a}. Known flags: ${[...knownFlags].join(', ')}`,
      );
    }
    if (a === '--batch' || a === '--limit') i++; // skip value
  }

  const batch = args.includes('--batch') ? args[args.indexOf('--batch') + 1] : null;
  if (batch !== 'us' && batch !== 'eu') {
    throw new Error('Required: --batch us|eu');
  }
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;
  return { batch, dryRun, limit };
}

// Supabase-backed dedup. Replaces the prior local-jsonl approach so CI runs
// (and any re-run after a crash) can correctly skip already-sent recipients.
// Local jsonl is still appended as a best-effort forensic trail.
//
// Schema (lib/supabase/migrations/create-founding-sends.sql):
//   founding_sends(email PK, batch, resend_id, error, sent_at)
//
// Dedup rule: only rows with error IS NULL count as "already sent". Failed
// rows can retry (upsert replaces them) so a transient Resend 429 / 5xx
// doesn't permanently drop a $499 Lifetime target.

// Use a relaxed structural type — the strict generic SupabaseClient signature
// shifts between minor versions and would force this script to thread generics
// it doesn't care about. The from('founding_sends') call sites only need the
// query builder surface (.select/.upsert), so unknown is the lowest-friction fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

async function loadSentEmails(supabase: SupabaseLike): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('founding_sends')
    .select('email')
    .is('error', null);
  if (error) throw new Error(`founding_sends read failed: ${error.message}`);
  return new Set((data ?? []).map((r: { email: string }) => r.email.toLowerCase()));
}

async function recordSent(
  supabase: SupabaseLike,
  email: string,
  batch: string,
  resendId: string | null,
  error?: string,
) {
  const normalizedEmail = email.toLowerCase();
  const { error: upsertErr } = await supabase
    .from('founding_sends')
    .upsert(
      {
        email: normalizedEmail,
        batch,
        resend_id: resendId,
        error: error ?? null,
        sent_at: new Date().toISOString(),
      },
      { onConflict: 'email' },
    );
  if (upsertErr) {
    // Don't throw — we'd rather a duplicate-send risk than dropping the send
    // log entirely. Log loudly so the operator sees it.
    console.error(`  ✗ founding_sends upsert failed for ${normalizedEmail}: ${upsertErr.message}`);
  }

  // Local forensic trail. Best-effort — kept gitignored.
  try {
    if (!existsSync(dirname(SENT_LOG_PATH))) {
      mkdirSync(dirname(SENT_LOG_PATH), { recursive: true });
    }
    appendFileSync(
      SENT_LOG_PATH,
      JSON.stringify({ email: normalizedEmail, batch, resendId, error, ts: new Date().toISOString() }) + '\n',
    );
  } catch {
    // Local file I/O may fail in CI / read-only FS. Supabase row above is the
    // source of truth; ignore.
  }
}

function buildEmailBody(email: string, batch: string): { subject: string; text: string; html: string } {
  const link = `${SITE_ORIGIN}/founding?email=${encodeURIComponent(email)}&batch=${encodeURIComponent(batch)}&utm_source=founder_email&utm_campaign=founding_analyst&utm_content=batch_${batch}`;
  const subject = 'Pay once. Read SEC filings for life.';
  const text = [
    'You signed up to the tldrSEC waitlist. Today I am opening 25 lifetime seats.',
    '',
    'One payment of $499. MAX access for life. No subscription, no renewal, no price hikes.',
    '',
    'What you get:',
    '  1. Unlimited tickers',
    '  2. Real-time alerts on every SEC filing',
    '  3. Enriched summaries with live X search',
    '  4. First priority in the queue (MAX users see new filings before PRO users)',
    '',
    'Our promise: not the right fit in the first 30 days? Full refund.',
    '',
    'After these 25 fill, the offer closes. First-come from the waitlist.',
    '',
    `Claim your seat: ${link}`,
    '',
    'Wilf',
    'tldrSEC',
  ].join('\n');
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:560px;margin:0 auto;padding:24px;">
<p>You signed up to the tldrSEC waitlist. Today I am opening <b>25 lifetime seats</b>.</p>
<p>One payment of <b>$499</b>. MAX access for life. No subscription, no renewal, no price hikes.</p>
<p><b>What you get:</b></p>
<ol style="padding-left:20px;">
  <li>Unlimited tickers</li>
  <li>Real-time alerts on every SEC filing</li>
  <li>Enriched summaries with live X search</li>
  <li>First priority in the queue (MAX users see new filings before PRO users)</li>
</ol>
<p><b>Our promise:</b> not the right fit in the first 30 days? Full refund.</p>
<p>After these 25 fill, the offer closes. First-come from the waitlist.</p>
<p><a href="${link}" style="display:inline-block;background:#7C3AED;color:#ffffff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Claim your seat</a></p>
<p>Wilf<br>tldrSEC</p>
</body></html>`;
  return { subject, text, html };
}

async function main() {
  const args = parseArgs(process.argv);

  // Kill-switch gate. The $499 Lifetime offer is irreversible and goes to
  // 124 people — require explicit FOUNDING_ARMED=true on real sends so a
  // half-typed command can't fire. --dry-run bypasses this. Independent
  // from LAUNCH_ARMED (which gates the cron-fired VRT campaign) so the
  // two campaigns can be armed and disarmed separately.
  if (!args.dryRun && process.env.FOUNDING_ARMED !== 'true') {
    throw new Error(
      'FOUNDING_ARMED=true required for non-dry-run sends. ' +
      'Re-run with FOUNDING_ARMED=true prefix, or add --dry-run.',
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) are required');
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey && !args.dryRun) {
    throw new Error('RESEND_API_KEY is required (unless --dry-run)');
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const resend = resendKey ? new Resend(resendKey) : null;

  const { data: subscribers, error } = await supabase
    .from('newsletter_subscribers')
    .select('email, subscribed_at')
    .order('subscribed_at', { ascending: true });
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  if (!subscribers || subscribers.length === 0) {
    console.log('No subscribers found. Nothing to send.');
    return;
  }

  const sentAlready = await loadSentEmails(supabase);

  const recipients = subscribers
    .filter((s) => typeof s.email === 'string' && s.email)
    .filter((s) => classifyRegion(s.email) === args.batch)
    .filter((s) => !sentAlready.has(s.email.toLowerCase()));

  const targetCount = args.limit ?? recipients.length;
  const slice = recipients.slice(0, targetCount);

  console.log(`Batch: ${args.batch}`);
  console.log(`Total ${args.batch.toUpperCase()} subscribers: ${recipients.length + sentAlready.size} (${sentAlready.size} previously sent)`);
  console.log(`Unsent ${args.batch.toUpperCase()} recipients: ${recipients.length}`);
  console.log(`Will send to: ${slice.length}`);
  console.log('Recipients:');
  for (const r of slice) console.log(`  - ${r.email}`);
  console.log('');

  if (args.dryRun) {
    if (slice[0]) {
      const { subject, text } = buildEmailBody(slice[0].email, args.batch);
      console.log('--- Sample email (first recipient) ---');
      console.log(`Subject: ${subject}`);
      console.log('');
      console.log(text);
      console.log('--- end sample ---');
    }
    console.log('\nDry run complete. No emails sent.');
    return;
  }

  if (!resend) throw new Error('Resend client not initialized');

  let sent = 0;
  let failed = 0;
  for (const r of slice) {
    const { subject, text, html } = buildEmailBody(r.email, args.batch);
    try {
      const res = await resend.emails.send({
        from: SENDER,
        to: r.email,
        replyTo: FOUNDER_REPLY_TO,
        subject,
        text,
        html,
      });
      // Resend SDK returns { data, error } — it does NOT throw on API
      // errors (429 rate-limit, 4xx validation, 5xx). Check res.error
      // explicitly so a transient failure doesn't get recorded as a
      // "successful" send (which would poison the dedup set in
      // loadSentEmails and permanently skip that recipient on retry).
      const resErr = (res as { error?: { message?: string; name?: string } | null }).error;
      if (resErr) {
        const msg = resErr.message ?? resErr.name ?? JSON.stringify(resErr);
        await recordSent(supabase, r.email, args.batch, null, msg);
        failed++;
        console.error(`  ✗ ${r.email}: ${msg}`);
      } else {
        const id = (res as { data?: { id?: string } }).data?.id ?? null;
        await recordSent(supabase, r.email, args.batch, id);
        sent++;
        console.log(`  ✓ ${r.email} (resend id: ${id})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordSent(supabase, r.email, args.batch, null, msg);
      failed++;
      console.error(`  ✗ ${r.email}: ${msg}`);
    }
    // Inter-send delay keeps us under Resend's default 10 req/s rate
    // limit with margin. 250ms = 4 req/s. ~30 seconds total for 116
    // US recipients — fine for an operator-watched send.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(`\nBatch ${args.batch} complete: ${sent} sent, ${failed} failed.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
