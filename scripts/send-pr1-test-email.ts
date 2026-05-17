#!/usr/bin/env npx tsx
/**
 * PR1 test-email script — sends 10-K (HIGH materiality) + 10-Q (MEDIUM
 * materiality) rendered with the new badge slot to a recipient inbox.
 *
 * Usage:
 *   npx tsx scripts/send-pr1-test-email.ts --to wilfredchen1@gmail.com
 *   npx tsx scripts/send-pr1-test-email.ts --to ... --dry-run
 *
 * Requires: .env.local with RESEND_API_KEY (or --dry-run to skip the API).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';
config({ path: resolve(process.cwd(), '.env.local') });

import { render } from '@react-email/render';
import * as React from 'react';
import { Resend } from 'resend';

import { Form10KMinimalistTemplate } from '../components/ui/email/templates/10k-minimalist-template';
import { Form10QMinimalistTemplate } from '../components/ui/email/templates/10q-minimalist-template';

const args = process.argv.slice(2);
const toArg = args.find(a => a.startsWith('--to='))?.split('=')[1]
  ?? args[args.indexOf('--to') + 1];
const dryRun = args.includes('--dry-run');
const TO = toArg || 'wilfredchen1@gmail.com';
const FROM = process.env.EMAIL_FROM || 'notifications@tldrsec.app';

// NVDA 10-K test fixture — HIGH materiality
const nvdaFiling = {
  companyName: 'NVIDIA Corporation',
  ticker: 'NVDA',
  symbol: 'NVDA',
  filingType: '10-K',
  filingDate: '2026-02-25',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm',
  summaryText: '',
  summaryData: {
    headline: 'NVIDIA FY26 revenue +65% YoY to $215.9B; $4.5B H20 export-control charge',
    summary: 'NVIDIA reported fiscal year 2026 revenue of $215.9 billion, up 65% from a year ago, driven by Data Center compute and networking platforms for accelerated computing and AI. Blackwell architectures represented the majority of Data Center revenue. Gross margin compressed 3.9 percentage points to 71.1% as the business transitioned from Hopper HGX systems to Blackwell full-scale datacenter solutions, and absorbed a $4.5 billion charge associated with H20 excess inventory and purchase obligations after the April 2025 US export licensing requirement diminished H20 demand. Operating income grew 60% to $130.4 billion; net income grew 65% to $120.1 billion; diluted EPS reached $4.90, up 67%. In FY26 NVIDIA invested $17.5 billion in private companies and infrastructure funds, primarily AI model makers, and provided $3.5 billion in land/power/shell guarantees to early-stage data center partners.',
    fiscalYear: 'FY2026',
    whyItMatters: 'A 65% YoY revenue beat plus the largest single-product write-down in NVIDIA history (H20 export controls) makes this filing materially different from the prior year — and signals that US-China export policy is now a Tier-1 risk for the entire AI infrastructure thesis.',
    keyPoints: [
      'Data Center revenue grew 68% YoY to roughly $185B — majority Blackwell-driven, with Blackwell Ultra (GB300) shipping production volumes from Q2 FY26',
      'NVIDIA committed $17.5B to private AI model makers + infrastructure funds in FY26, plus $3.5B in land/power guarantees to early-stage data center partners',
      'Rubin platform on track for one-year product cadence; new collaboration with Samsung to manufacture advanced semiconductors for AI inference/training in the US',
      'Open-source frontier models flagged as a new risk vector in Item 1A — first appearance in FY26 10-K',
    ],
    financialHighlights: [
      { label: 'Revenue',          value: '$215.94B', priorValue: '$130.50B', change: '+65.4%' },
      { label: 'Gross Margin',     value: '71.1%',    priorValue: '75.0%',    change: '-3.9pp' },
      { label: 'Operating Income', value: '$130.39B', priorValue: '$81.45B',  change: '+60.1%' },
      { label: 'Net Income',       value: '$120.07B', priorValue: '$72.88B',  change: '+64.7%' },
      { label: 'Diluted EPS',      value: '$4.90',    priorValue: '$2.94',    change: '+66.7%' },
    ],
    segments: [
      { name: 'Data Center', revenue: '$185B', growth: '+68%' },
      { name: 'Gaming',      revenue: '$15B',  growth: '+41%' },
      { name: 'Pro Viz',     revenue: '$3B',   growth: '+70%' },
      { name: 'Automotive',  revenue: '$2B',   growth: '+39%' },
    ],
    riskFactors: [
      'US export licensing for H20 / H200 GPUs to China limits addressable market and triggered a $4.5B FY26 charge',
      'Customer concentration in hyperscalers (CSPs) creates demand-cyclicality risk',
      'Open-source frontier models could reduce demand for NVIDIA accelerators if competitors adopt them at scale',
    ],
    materialitySignal: {
      score: 'high',
      rationale: 'FY26 revenue +65% YoY to $215.9B; $4.5B H20 inventory charge Q1 FY26 from April 2025 US export licensing; new H200 license regime with 25% US import tariff (Item 7).',
    },
    xSentiment: {
      direction: 'bullish',
      shift: 'shifting_bullish',
      confidence: 'high',
      factClaims: [
        'Data Center revenue of $185B handily beat the $172B Street consensus[1]',
        'Blackwell Ultra (GB300) shipped production volume in Q2 FY26[2]',
        'H20 export-control charge of $4.5B was already pre-announced in May 2025; in-line with expectations[3]',
      ],
      opinionClaims: [],
      discussionSynthesis:
        'Bulls focused on the data-center beat and Blackwell Ultra ramp[1][2]; bears mostly conceded the H20 charge was a known issue but flagged the H200 China licensing path (25% US import tariff) as a new structural headwind[3].',
      citationUrls: [
        'https://x.com/Stephanie_Link/status/1860000000000000001',
        'https://x.com/CNBC/status/1860000000000000002',
        'https://x.com/Bloomberg/status/1860000000000000003',
      ],
      windowHours: 24,
    },
  },
};

// CMG 10-Q test fixture — MEDIUM materiality
const cmgFiling = {
  companyName: 'Chipotle Mexican Grill, Inc.',
  ticker: 'CMG',
  symbol: 'CMG',
  filingType: '10-Q',
  filingDate: '2026-04-30',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/1058090/000105809026000028/cmg-20260331.htm',
  summaryText: '',
  summaryData: {
    headline: 'CMG Q1 2026: comp-store -1.7%, two senior executive departures, $700M Q1 buyback',
    summary: 'Chipotle reported Q1 fiscal 2026 results showing comparable restaurant sales of -1.7% (vs +7.4% in the year-ago quarter), with transactions declining 2.9% partially offset by a 1.2% average check increase. The Company filed Transition Agreements for Chris Brandt (Chief Marketing Officer) on January 27, 2026 and Roger Theodoredis (General Counsel) on January 30, 2026 — two senior officers departing within three days of each other. CEO Scott Boatwright adopted a 10b5-1 trading plan on February 6, 2026 covering up to 100,000 shares between May 4 and December 31, 2026. The Company repurchased approximately 19.4 million shares for $701 million during Q1 at an average price of $36.14, continuing the aggressive buyback pace announced in December 2025.',
    fiscalQuarter: 'Q1 FY2026',
    whyItMatters: 'Two C-suite departures plus a sharp inversion in comp-store sales (+7.4% → -1.7% YoY) and CEO insider-selling adoption — all in the same 60-day window — suggest the leadership team is repositioning for a slower-growth phase.',
    keyPoints: [
      'CMO Chris Brandt and GC Roger Theodoredis filed Transition Agreements 3 days apart (1/27 and 1/30/26)',
      'CEO Scott Boatwright adopted a 10b5-1 plan 2/6/26 covering up to 100,000 shares — first insider-sale plan under his tenure',
      'Q1 buyback of $701M at avg $36.14 — continuing the December-2025-announced aggressive repurchase posture',
      '2025 tariffs estimated to add 0.2pp to food/beverage/packaging costs; expected to scale to ~15 basis points in 2026',
    ],
    financialHighlights: [
      { label: 'Comp restaurant sales', value: '-1.7%', priorValue: '+7.4%',  change: '-9.1pp', qoqChange: '-1.7%' },
      { label: 'Transactions',          value: '-2.9%', priorValue: '+5.3%',  change: '-8.2pp' },
      { label: 'Average check',         value: '+1.2%', priorValue: '+2.1%',  change: '-0.9pp' },
      { label: 'Q1 buyback',             value: '$701M', priorValue: '$378M',  change: '+85%' },
    ],
    materialitySignal: {
      score: 'medium',
      rationale: 'Q1 2026 Transition Agreements for Chris Brandt (CMO, 1/27/26) and Roger Theodoredis (GC, 1/30/26) per Exhibit Index; comp-store sales -1.7% vs +7.4% YoY; continued $700M Q1 buyback amid known comp pressure.',
    },
    xSentiment: {
      direction: 'mixed',
      shift: 'stable',
      confidence: 'medium',
      factClaims: [
        'CMO and GC Transition Agreements filed within 3 days[1]',
        'Q1 comp sales -1.7% vs Street estimate of +1.2%[2]',
        'CEO Boatwright adopted first 10b5-1 plan since taking the role[3]',
      ],
      opinionClaims: [],
      discussionSynthesis:
        'Sentiment split: bears flagged the C-suite reshuffle plus negative comps as confirming a slower-growth chapter for CMG[1][2]; bulls pointed to the aggressive $701M buyback as management signaling confidence in earnings power at current price[3].',
      citationUrls: [
        'https://x.com/jimcramer/status/1861000000000000001',
        'https://x.com/CNBC/status/1861000000000000002',
        'https://x.com/business/status/1861000000000000003',
      ],
      windowHours: 168,
    },
  },
};

/**
 * Remove the StalenessBanner row from rendered email HTML. PR1 fixtures use
 * real (older) filing dates, so the banner fires; we strip it so the test
 * inbox shows the summary unobstructed.
 */
function stripStalenessBanner(html: string): string {
  const stripped = html.replace(
    /<table[^>]*>[\s\S]*?This summary was delayed[\s\S]*?<\/table>/i,
    '',
  );
  if (stripped === html) {
    console.warn('  ⚠ stripStalenessBanner: no banner found to strip');
  }
  return stripped;
}

async function main(): Promise<void> {
  console.log(`Recipient: ${TO}`);
  console.log(`From:      ${FROM}`);
  console.log(`Dry run:   ${dryRun}`);
  console.log('');

  // Render both templates
  const html10KRaw = await render(React.createElement(Form10KMinimalistTemplate, { filing: nvdaFiling as never }));
  const html10QRaw = await render(React.createElement(Form10QMinimalistTemplate, { filing: cmgFiling as never }));

  // PR1 test fixtures use real (old) filing dates so the badge + numbers stay
  // grounded, but for the test inbox we want users immersed in the summary —
  // not reminded the filing is weeks stale. Drop the StalenessBanner row.
  const html10K = stripStalenessBanner(html10KRaw);
  const html10Q = stripStalenessBanner(html10QRaw);

  // Sanity-check: badge content + new fixture content present
  const checks = [
    // Materiality badge (PR1 deliverable)
    { name: '10-K HIGH MATERIALITY pill', got: html10K.includes('HIGH MATERIALITY') },
    { name: '10-K rationale present', got: html10K.includes('FY26 revenue +65%') },
    { name: '10-K "Wrong call?" mailto', got: html10K.includes('Wrong call?') },
    { name: '10-K does NOT render ANNUAL REPORT fallback', got: !html10K.includes('ANNUAL REPORT') },
    // Story / summary prose (was missing in v1 test)
    { name: '10-K summary prose mentions Blackwell', got: html10K.includes('Blackwell') },
    { name: '10-K segments rendered (Data Center)', got: html10K.includes('Data Center') },
    // X-sentiment block (was missing in v1 test — already wired in template, just needs data)
    { name: '10-K X-sentiment block rendered', got: html10K.toLowerCase().includes('bulls focused') || html10K.toLowerCase().includes('bullish') },
    // v3: side-by-side prior → current values (new in this iteration)
    { name: '10-K renders prior-year value $130.50B before current $215.94B', got: html10K.includes('$130.50B') && html10K.includes('$215.94B') },
    { name: '10-K side-by-side arrow → present', got: html10K.includes('→') },
    { name: '10-K "Segment mix:" bar-chart header present', got: html10K.includes('Segment mix:') },
    { name: '10-Q prior → current rendering', got: html10Q.includes('+7.4%') && html10Q.includes('-1.7%') },
    { name: '10-Q "Why it matters" uses pills, not ↓/↑ arrows next to numbers', got: !html10Q.match(/Why it matters:[\s\S]{0,400}[↑↓]/m) },
    // 10-Q materiality
    { name: '10-Q MEDIUM MATERIALITY pill', got: html10Q.includes('MEDIUM MATERIALITY') },
    { name: '10-Q rationale present', got: html10Q.includes('Chris Brandt') },
    { name: '10-Q "Wrong call?" mailto', got: html10Q.includes('Wrong call?') },
    // 10-Q X-sentiment
    { name: '10-Q X-sentiment rendered', got: html10Q.toLowerCase().includes('boatwright') || html10Q.toLowerCase().includes('mixed') },
    // StalenessBanner suppression — PR1 fixtures use older filing dates, but the
    // test inbox should not surface the "summary was delayed" warning.
    { name: '10-K does NOT show staleness banner', got: !html10K.includes('This summary was delayed') },
    { name: '10-Q does NOT show staleness banner', got: !html10Q.includes('This summary was delayed') },
  ];
  console.log('=== Pre-send sanity checks ===');
  for (const c of checks) {
    console.log(`  ${c.got ? '✓' : '✗'}  ${c.name}`);
  }
  if (checks.some(c => !c.got)) {
    console.error('\nFAIL: one or more rendering checks failed. Aborting send.');
    process.exit(1);
  }
  console.log('');

  // Optionally write rendered HTML to disk for review
  const out10K = '/tmp/pr1-test-10k-nvda.html';
  const out10Q = '/tmp/pr1-test-10q-cmg.html';
  writeFileSync(out10K, html10K, 'utf8');
  writeFileSync(out10Q, html10Q, 'utf8');
  console.log(`Wrote rendered HTML:\n  ${out10K}\n  ${out10Q}`);
  console.log('');

  if (dryRun) {
    console.log('--dry-run: skipping Resend send.');
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('FAIL: RESEND_API_KEY not set in .env.local. Use --dry-run to skip send.');
    process.exit(1);
  }

  const resend = new Resend(apiKey);

  console.log('Sending 10-K (NVDA, HIGH materiality)...');
  const r10K = await resend.emails.send({
    from: FROM,
    to: TO,
    subject: '[PR1 TEST] NVIDIA 10-K — HIGH materiality',
    html: html10K,
  });
  console.log('  result:', r10K);

  console.log('Sending 10-Q (CMG, MEDIUM materiality)...');
  const r10Q = await resend.emails.send({
    from: FROM,
    to: TO,
    subject: '[PR1 TEST] Chipotle 10-Q — MEDIUM materiality',
    html: html10Q,
  });
  console.log('  result:', r10Q);

  console.log('\n✓ Both emails sent. Check inbox.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
