/**
 * Send Founding Lifetime Seat outreach to a batch of waitlist members.
 *
 * Usage:
 *   bun run scripts/founding/send-founding-batch.ts --batch us [--dry-run] [--limit 25]
 *   bun run scripts/founding/send-founding-batch.ts --batch eu [--dry-run] [--limit 8]
 *
 * Reads `newsletter_subscribers` from Supabase, filters by region heuristic
 * (us vs eu by email domain), skips addresses already in
 * `scripts/founding/sent.jsonl`, and sends one-to-one Resend emails from the
 * founder address. Each email includes a unique link with batch + UTM params
 * the webhook can correlate back via `client_reference_id` and
 * `session.metadata.batch`.
 *
 * Dry-run prints the recipient list and the rendered email body for one
 * recipient without sending anything.
 */

import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface CliArgs {
  batch: 'us' | 'eu';
  dryRun: boolean;
  limit?: number;
}

const SENT_LOG_PATH = 'scripts/founding/sent.jsonl';
const SENDER = 'Wilf <wilfred@tldrsec.app>';
const REPLY_TO = 'wilfred@tldrsec.app';
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://tldrsec.app';

const EU_DOMAINS = new Set([
  'btinternet.com', 'hotmail.co.uk', 'yahoo.co.uk', 'live.co.uk',
  'googlemail.com', 'live.fr', 'live.de', 'web.de', 'gmx.de',
  'wanadoo.fr', 'orange.fr', 'free.fr',
]);
const EU_TLDS = new Set([
  'co.uk', 'uk', 'de', 'fr', 'it', 'es', 'nl', 'se', 'no', 'fi',
  'dk', 'pl', 'ch', 'at', 'be', 'ie', 'pt', 'cz', 'gr',
]);

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const batch = args.includes('--batch') ? args[args.indexOf('--batch') + 1] : null;
  if (batch !== 'us' && batch !== 'eu') {
    throw new Error('Required: --batch us|eu');
  }
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;
  return { batch, dryRun, limit };
}

function classifyRegion(email: string): 'us' | 'eu' {
  const lower = email.toLowerCase();
  const domain = lower.split('@')[1] || '';
  if (EU_DOMAINS.has(domain)) return 'eu';
  for (const tld of EU_TLDS) {
    if (domain.endsWith('.' + tld)) return 'eu';
  }
  return 'us';
}

function loadSentEmails(): Set<string> {
  if (!existsSync(SENT_LOG_PATH)) return new Set();
  const lines = readFileSync(SENT_LOG_PATH, 'utf-8').split('\n').filter(Boolean);
  const sent = new Set<string>();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.email) sent.add(entry.email.toLowerCase());
    } catch {
      // skip malformed lines
    }
  }
  return sent;
}

function recordSent(email: string, batch: string, resendId: string | null, error?: string) {
  if (!existsSync(dirname(SENT_LOG_PATH))) {
    mkdirSync(dirname(SENT_LOG_PATH), { recursive: true });
  }
  const entry = {
    email: email.toLowerCase(),
    batch,
    resendId,
    error,
    ts: new Date().toISOString(),
  };
  appendFileSync(SENT_LOG_PATH, JSON.stringify(entry) + '\n');
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

  const sentAlready = loadSentEmails();

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
        replyTo: REPLY_TO,
        subject,
        text,
        html,
      });
      const id = (res as { data?: { id?: string } }).data?.id ?? null;
      recordSent(r.email, args.batch, id);
      sent++;
      console.log(`  ✓ ${r.email} (resend id: ${id})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      recordSent(r.email, args.batch, null, msg);
      failed++;
      console.error(`  ✗ ${r.email}: ${msg}`);
    }
  }

  console.log(`\nBatch ${args.batch} complete: ${sent} sent, ${failed} failed.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
