/**
 * Test script for Form 4 Trust Transfer Email Template
 *
 * This script generates and sends a test email with a Form 4 trust transfer
 * to verify that transfers are displayed with blue color coding instead of
 * being misclassified as purchases or gifts.
 */

import 'dotenv/config';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import React from 'react';
import { Form4MinimalistTemplate } from './components/ui/email/templates/form4-minimalist-template';
import { FilingTemplateData } from './lib/email/types';

// Create Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Mock Form 4 trust transfer filing data
const mockTrustTransferFiling: FilingTemplateData = {
  companyName: 'Apple Inc.',
  symbol: 'AAPL',
  ticker: 'AAPL',
  filingType: 'Form 4',
  filingDate: new Date().toISOString().split('T')[0],
  filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=4&dateb=&owner=include&count=40',
  summaryText: `John Appleseed, Chief Financial Officer of Apple Inc., transferred 50,000 shares to the Appleseed Family Trust.

This transaction represents a change in the form of beneficial ownership from direct holdings to indirect holdings through a revocable trust structure. No shares were sold on the open market.

The transfer was executed at $0 per share as it represents an internal restructuring of ownership rather than a market transaction. Post-transaction, the reporting person holds 150,000 shares indirectly through the trust.

This type of estate planning transaction is common among executives and does not indicate any change in the insider's investment thesis regarding Apple.`,
  summaryData: {
    filerName: 'John Appleseed',
    relationship: 'CFO',
    signalStrength: 'Neutral - Trust/Family Transfer',
    transactions: [
      {
        type: 'Trust Transfer',
        code: 'J',
        shares: '50,000',
        pricePerShare: '$0',
        totalValue: '$0',
        acquisitionDisposition: 'D',
      },
    ],
    percentageChange: '-25%',
    previousStake: '200,000 shares (direct)',
    newStake: '150,000 shares (indirect via trust)',
  },
};

// Mock Form 4 with mixed transactions (sale + trust transfer)
const mockMixedTransactionFiling: FilingTemplateData = {
  companyName: 'NVIDIA Corporation',
  symbol: 'NVDA',
  ticker: 'NVDA',
  filingType: 'Form 4',
  filingDate: new Date().toISOString().split('T')[0],
  filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001045810&type=4&dateb=&owner=include&count=40',
  summaryText: `Jane Smith, Director of NVIDIA Corporation, reported two transactions:

1. Sale of 5,000 shares at $890.50 per share for gross proceeds of $4,452,500
2. Transfer of 10,000 shares to the Smith Family Trust

The sale was executed under a Rule 10b5-1 pre-planned trading arrangement. The trust transfer represents an estate planning measure and does not indicate any change in investment outlook.

Post-transaction ownership: 95,000 shares (85,000 direct + 10,000 indirect via trust).`,
  summaryData: {
    filerName: 'Jane Smith',
    relationship: 'Director',
    signalStrength: 'Weak - 10b5-1 Plan',
    transactions: [
      {
        type: 'Sale',
        code: 'S',
        shares: '5,000',
        pricePerShare: '$890.50',
        totalValue: '$4,452,500',
        acquisitionDisposition: 'D',
      },
      {
        type: 'Trust Transfer',
        code: 'J',
        shares: '10,000',
        pricePerShare: '$0',
        totalValue: '$0',
        acquisitionDisposition: 'D',
      },
    ],
    percentageChange: '-5%',
    previousStake: '110,000 shares',
    newStake: '95,000 shares (direct) + 10,000 (trust)',
  },
};

async function sendTestEmail() {
  const testEmail = process.env.TEST_EMAIL;

  if (!testEmail) {
    console.error('ERROR: TEST_EMAIL environment variable is not set');
    console.log('Please set TEST_EMAIL in your .env file');
    process.exit(1);
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('ERROR: RESEND_API_KEY environment variable is not set');
    process.exit(1);
  }

  console.log('===== FORM 4 TRUST TRANSFER EMAIL TEST =====\n');
  console.log(`Sending test emails to: ${testEmail}\n`);

  try {
    // Test 1: Pure trust transfer
    console.log('1. Generating pure trust transfer email (AAPL)...');
    const trustTransferHtml = await render(
      React.createElement(Form4MinimalistTemplate, { filing: mockTrustTransferFiling })
    );

    console.log('   Sending email...');
    const result1 = await resend.emails.send({
      from: 'tldrsec <notifications@tldrsec.app>',
      to: testEmail,
      subject: `[TEST] Form 4 Trust Transfer: Apple Inc. (AAPL)`,
      html: trustTransferHtml,
    });

    if (result1.error) {
      console.error('   ERROR:', result1.error);
    } else {
      console.log(`   SUCCESS: Email sent with ID ${result1.data?.id}`);
    }

    // Test 2: Mixed transactions (sale + transfer)
    console.log('\n2. Generating mixed transaction email (NVDA - Sale + Transfer)...');
    const mixedHtml = await render(
      React.createElement(Form4MinimalistTemplate, { filing: mockMixedTransactionFiling })
    );

    console.log('   Sending email...');
    const result2 = await resend.emails.send({
      from: 'tldrsec <notifications@tldrsec.app>',
      to: testEmail,
      subject: `[TEST] Form 4 Mixed Transactions: NVIDIA (NVDA)`,
      html: mixedHtml,
    });

    if (result2.error) {
      console.error('   ERROR:', result2.error);
    } else {
      console.log(`   SUCCESS: Email sent with ID ${result2.data?.id}`);
    }

    console.log('\n===== TEST COMPLETED =====');
    console.log('\nPlease check your inbox and verify:');
    console.log('1. Trust Transfer shows with BLUE color coding and icon');
    console.log('2. Trust Transfer is NOT categorized as Purchase or Gift');
    console.log('3. Signal strength shows "Neutral - Trust/Family Transfer"');
    console.log('4. Mixed transaction email shows both Sale (red) and Transfer (blue)');

  } catch (error) {
    console.error('Error sending test email:', error);
    process.exit(1);
  }
}

// Run the test
sendTestEmail();
