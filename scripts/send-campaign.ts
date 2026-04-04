#!/usr/bin/env npx tsx
/**
 * Email Campaign Send Script
 *
 * Sends campaign emails to waitlist subscribers in cohorts.
 * Usage:
 *   npx tsx scripts/send-campaign.ts --cohort 1 --email 1 [--variant A|B] [--dry-run]
 *   npx tsx scripts/send-campaign.ts --warmup [--dry-run]
 *
 * Requires: .env.local with RESEND_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 *           SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, CRON_SECRET
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Load env before any other imports
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { render } from '@react-email/render';
import React from 'react';
import { Resend } from 'resend';
import { getPrismaClient } from '../lib/db/prisma';
import { generateUnsubscribeToken } from '../lib/email/feedback-tokens';
import { CampaignDemoTemplate } from '../components/ui/email/templates/campaign-demo-template';
import { CampaignInviteTemplate } from '../components/ui/email/templates/campaign-invite-template';

// --- Types ---

interface CampaignLogEntry {
  emailHash: string;
  cohort: number;
  emailNumber: number;
  variant?: string;
  resendId?: string;
  sentAt: string;
  status: 'sent' | 'skipped' | 'failed';
  skipReason?: string;
  error?: string;
}

interface WaitlistContact {
  email: string;
  subscribed_at: string;
  unsubscribed?: boolean;
}

// --- Config ---

const COHORT_SIZES = [40, 40, 45]; // cohort 1, 2, 3
const SEND_DELAY_MS = 1000; // 1 second between sends
const LOG_FILE = resolve(process.cwd(), 'scripts/campaign-log.json');
const FROM_ADDRESS = 'tldrSEC <notifications@tldrsec.app>';
const UNSUBSCRIBE_BASE = 'https://tldrsec.app/api/unsubscribe';

const SUBJECT_LINES: Record<string, Record<string, string>> = {
  '1': {
    A: 'the form 4 filing most investors missed',
    B: 'Nike\'s CEO just bought $1M of stock at a 4-year low',
  },
  '2': {
    A: 'your 7-day trial is ready',
    B: 'your 7-day trial is ready',
  },
  warmup: {
    A: 'thanks for joining the tldrSEC waitlist',
    B: 'thanks for joining the tldrSEC waitlist',
  },
};

// --- Helpers ---

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16);
}

function loadLog(): CampaignLogEntry[] {
  if (!existsSync(LOG_FILE)) return [];
  try {
    return JSON.parse(readFileSync(LOG_FILE, 'utf-8'));
  } catch {
    console.warn('Warning: campaign-log.json is corrupted, starting fresh');
    return [];
  }
}

function saveLog(entries: CampaignLogEntry[]): void {
  writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      parsed[key] = val;
      if (val !== 'true') i++;
    }
  }
  return parsed;
}

// --- Core Logic ---

async function getWaitlistContacts(): Promise<WaitlistContact[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
  );

  // Try with unsubscribed column first, fall back without it
  let result = await supabase
    .from('newsletter_subscribers')
    .select('email, subscribed_at, unsubscribed')
    .order('subscribed_at', { ascending: false });

  if (result.error?.message?.includes('does not exist')) {
    // Column not added yet, query without it
    result = await supabase
      .from('newsletter_subscribers')
      .select('email, subscribed_at')
      .order('subscribed_at', { ascending: false });
  }

  if (result.error) throw new Error(`Supabase query failed: ${result.error.message}`);
  return (result.data || []) as WaitlistContact[];
}

async function getExistingUserEmails(): Promise<Set<string>> {
  const prisma = getPrismaClient();
  const users = await prisma.user.findMany({ select: { email: true } });
  return new Set(users.map(u => u.email.toLowerCase().trim()));
}

function assignCohort(contacts: WaitlistContact[], cohortNum: number): WaitlistContact[] {
  // Contacts are already sorted by subscribed_at DESC (most recent first)
  // Cohort 1: first 40 (most recent), Cohort 2: next 40, Cohort 3: remaining
  const starts = [0, COHORT_SIZES[0], COHORT_SIZES[0] + COHORT_SIZES[1]];
  const start = starts[cohortNum - 1] || 0;
  const size = COHORT_SIZES[cohortNum - 1] || contacts.length - start;
  return contacts.slice(start, start + size);
}

async function renderWarmupEmail(email: string): Promise<{ html: string; text: string }> {
  const text = `Hey,

Thanks for signing up for tldrSEC. We're putting the finishing touches on your early access.

You'll be one of the first to get AI-powered SEC filing summaries delivered to your inbox within minutes of every filing.

More soon.

— The tldrSEC team

---
tldrSEC | AI-Powered SEC Filing Summaries
Unsubscribe: ${UNSUBSCRIBE_BASE}?token=${generateUnsubscribeToken(email)}`;

  return { html: '', text };
}

async function renderCampaignEmail(
  emailNum: number,
  recipientEmail: string,
): Promise<{ html: string; text: string; }> {
  const unsubscribeUrl = `${UNSUBSCRIBE_BASE}?token=${generateUnsubscribeToken(recipientEmail)}`;

  if (emailNum === 1) {
    // Email 1: Demo - single filing showcase
    // Nike CEO Elliott Hill open-market purchase at multi-year low (Dec 2025)
    // Uses same signal-first layout as production Form 4 emails
    const html = await render(
      React.createElement(CampaignDemoTemplate, {
        ticker: 'NKE',
        companyName: 'Nike, Inc.',
        filingType: 'FORM 4',
        filingDate: 'Dec 29, 2025',
        filerName: 'Elliott Hill',
        filerRole: 'President & CEO',
        signalLevel: 'HIGH',
        signalVerdict: 'Notable Buy',
        signalDescription: 'This transaction may warrant attention for your investment thesis.',
        summaryText: 'Elliott Hill bought **16,388 shares** at $61.10 for **$1M** of his own money. Insiders sell for many reasons, but they only buy for one. Hill returned to Nike in Oct 2024 after 32 years. This is a personal bet on his own turnaround plan. Two other directors (including Apple CEO Tim Cook, who bought **$2.95M**) purchased the same week. Combined insider buying: **$4.45M** at a 4-year low.',
        transactions: [
          { label: 'Transaction Type', value: 'Open Market Purchase', isBold: true },
          { label: 'Shares Acquired', value: '16,388', isMonospace: true },
          { label: 'Price Per Share', value: '$61.10', isMonospace: true },
          { label: 'Total Value', value: '$1.0M', isBold: true, isMonospace: true },
          { label: 'Post-Purchase Holdings', value: '241,587 shares', isMonospace: true },
          { label: 'Same-Week Insider Buying', value: '$4.45M (3 insiders)', isBold: true, isMonospace: true },
        ],
        unsubscribeUrl,
        founderNote: "I built tldrSEC because I got tired of reading SEC filings manually. A single 10-K runs 100-200 pages. 10-Qs are 50-80. Even Form 4s pile up fast when you're tracking multiple companies. This is what our AI does with all of them, minutes after they hit EDGAR.",
      })
    );
    return { html, text: 'View this email in a browser that supports HTML.' };
  }

  if (emailNum === 2) {
    // Email 2: Trial invite (was Email 3 in original 3-act plan, digest removed)
    const html = await render(
      React.createElement(CampaignInviteTemplate, {
        unsubscribeUrl,
      })
    );
    return { html, text: 'View this email in a browser that supports HTML.' };
  }

  throw new Error(`Unknown email number: ${emailNum}`);
}

// --- Main ---

async function main() {
  const args = parseArgs();
  const isWarmup = args.warmup === 'true';
  const isDryRun = args['dry-run'] === 'true';
  const cohortNum = parseInt(args.cohort || '0', 10);
  const emailNum = parseInt(args.email || '0', 10);
  const variant = (args.variant || 'A').toUpperCase();

  if (!isWarmup && (!cohortNum || !emailNum)) {
    console.error('Usage: npx tsx scripts/send-campaign.ts --cohort 1 --email 1 [--variant A|B] [--dry-run]');
    console.error('       npx tsx scripts/send-campaign.ts --warmup [--dry-run]');
    process.exit(1);
  }

  if (!isWarmup && (cohortNum < 1 || cohortNum > 3)) {
    console.error('Cohort must be 1, 2, or 3');
    process.exit(1);
  }

  if (!isWarmup && (emailNum < 1 || emailNum > 2)) {
    console.error('Email must be 1 or 2');
    process.exit(1);
  }

  console.log(`\n📧 Campaign Send Script`);
  console.log(`Mode: ${isWarmup ? 'WARM-UP' : `Cohort ${cohortNum}, Email ${emailNum}, Variant ${variant}`}`);
  console.log(`Dry run: ${isDryRun ? 'YES' : 'NO'}\n`);

  // Load dedup log
  const log = loadLog();
  const sentKeys = new Set(log.filter(e => e.status === 'sent').map(e => `${e.emailHash}:${e.cohort}:${e.emailNumber}`));

  // Get contacts
  console.log('Fetching waitlist contacts...');
  const allContacts = await getWaitlistContacts();
  console.log(`Total waitlist contacts: ${allContacts.length}`);

  // Filter unsubscribed
  const activeContacts = allContacts.filter(c => !c.unsubscribed);
  const unsubscribedCount = allContacts.length - activeContacts.length;
  if (unsubscribedCount > 0) console.log(`Filtered out ${unsubscribedCount} unsubscribed contacts`);

  // Get existing users to exclude
  console.log('Cross-referencing with existing users...');
  const existingEmails = await getExistingUserEmails();
  const eligibleContacts = activeContacts.filter(c => !existingEmails.has(c.email.toLowerCase().trim()));
  const existingUserCount = activeContacts.length - eligibleContacts.length;
  if (existingUserCount > 0) console.log(`Filtered out ${existingUserCount} existing users`);

  console.log(`Eligible contacts: ${eligibleContacts.length}\n`);

  // Select cohort (or all for warmup)
  let recipients: WaitlistContact[];
  if (isWarmup) {
    // Warm-up: send to first 15 most recent contacts
    recipients = eligibleContacts.slice(0, 15);
  } else {
    recipients = assignCohort(eligibleContacts, cohortNum);
  }

  console.log(`Recipients for this run: ${recipients.length}`);

  // Initialize Resend
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Get subject line
  const emailKey = isWarmup ? 'warmup' : String(emailNum);
  const subject = SUBJECT_LINES[emailKey]?.[variant] || SUBJECT_LINES[emailKey]?.A || 'Update from tldrSEC';

  // Send
  const newEntries: CampaignLogEntry[] = [];
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const contact of recipients) {
    const hash = hashEmail(contact.email);
    const logCohort = isWarmup ? 0 : cohortNum;
    const logEmailNum = isWarmup ? 0 : emailNum;
    const dedupKey = `${hash}:${logCohort}:${logEmailNum}`;

    // Dedup check
    if (sentKeys.has(dedupKey)) {
      console.log(`  SKIP (already sent): ${hash}`);
      skippedCount++;
      continue;
    }

    try {
      let emailContent: { html: string; text: string };
      if (isWarmup) {
        emailContent = await renderWarmupEmail(contact.email);
      } else {
        emailContent = await renderCampaignEmail(emailNum, contact.email);
      }

      if (isDryRun) {
        console.log(`  DRY RUN: would send to ${hash} (subject: "${subject}")`);
        if (isWarmup) {
          console.log(`  Preview (text): ${emailContent.text.slice(0, 100)}...`);
        } else {
          console.log(`  Preview (html): ${emailContent.html.slice(0, 100)}...`);
        }
        sentCount++;
        continue;
      }

      // Send via Resend
      const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: contact.email,
        subject,
        ...(isWarmup ? { text: emailContent.text } : { html: emailContent.html }),
        tags: [
          { name: 'campaign', value: isWarmup ? 'warmup' : 'launch' },
          { name: 'cohort', value: String(logCohort) },
          { name: 'email_number', value: String(logEmailNum) },
          { name: 'variant', value: variant },
        ],
      });

      newEntries.push({
        emailHash: hash,
        cohort: logCohort,
        emailNumber: logEmailNum,
        variant,
        resendId: result.data?.id,
        sentAt: new Date().toISOString(),
        status: 'sent',
      });

      console.log(`  SENT: ${hash} (resend: ${result.data?.id})`);
      sentCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      newEntries.push({
        emailHash: hash,
        cohort: logCohort,
        emailNumber: logEmailNum,
        variant,
        sentAt: new Date().toISOString(),
        status: 'failed',
        error: errMsg,
      });

      console.error(`  FAILED: ${hash} — ${errMsg}`);
      failedCount++;
    }

    // Rate limiting delay
    await sleep(SEND_DELAY_MS);
  }

  // Save log (append new entries)
  if (!isDryRun && newEntries.length > 0) {
    saveLog([...log, ...newEntries]);
    console.log(`\nLog saved to ${LOG_FILE}`);
  }

  // Summary
  console.log(`\n========== SUMMARY ==========`);
  console.log(`Sent:    ${sentCount}`);
  console.log(`Skipped: ${skippedCount} (dedup)`);
  console.log(`Failed:  ${failedCount}`);
  console.log(`Total:   ${recipients.length}`);
  console.log(`==============================\n`);

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
