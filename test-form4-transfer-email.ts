/**
 * Test script for Form 4 Email Template - All 7 Transaction Buckets
 *
 * Sends test emails showcasing all 7 classification buckets:
 * purchase (green), sale (red), award (amber), exercise (teal),
 * gift (purple), transfer (blue), other (slate)
 */

import 'dotenv/config';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import React from 'react';
import { Form4MinimalistTemplate } from './components/ui/email/templates/form4-minimalist-template';
import { FilingTemplateData } from './lib/email/types';

// Create Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Test 1: Pure trust transfer (blue bucket)
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

// Test 2: Mixed transactions (sale + transfer)
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

// Test 3: Award + Tax Withholding (showcases amber "award" + slate "other" buckets)
const mockAwardFiling: FilingTemplateData = {
  companyName: 'Johnson & Johnson',
  symbol: 'JNJ',
  ticker: 'JNJ',
  filingType: 'Form 4',
  filingDate: new Date().toISOString().split('T')[0],
  filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000200406&type=4&dateb=&owner=include&count=40',
  summaryText: `Robert Chen, SVP and General Counsel of Johnson & Johnson, received a PSU award of 15,000 shares as part of annual equity compensation. 4,500 shares were withheld for tax obligations.

Post-transaction, the reporting person holds 125,000 shares directly.`,
  summaryData: {
    filerName: 'Robert Chen',
    relationship: 'SVP & General Counsel',
    signalStrength: 'Weak - Equity Compensation',
    transactions: [
      {
        type: 'Award',
        code: 'A',
        shares: '15,000',
        pricePerShare: '$0',
        totalValue: '$0',
        acquisitionDisposition: 'A',
      },
      {
        type: 'Tax Withholding',
        code: 'F',
        shares: '4,500',
        pricePerShare: '$155.20',
        totalValue: '$698,400',
        acquisitionDisposition: 'D',
      },
    ],
    percentageChange: '+8.4%',
    previousStake: '114,500 shares',
    newStake: '125,000 shares',
  },
};

// Test 4: Option Exercise (showcases teal "exercise" bucket)
const mockExerciseFiling: FilingTemplateData = {
  companyName: 'Alphabet Inc.',
  symbol: 'GOOGL',
  ticker: 'GOOGL',
  filingType: 'Form 4',
  filingDate: new Date().toISOString().split('T')[0],
  filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001652044&type=4&dateb=&owner=include&count=40',
  summaryText: `Sarah Johnson, VP of Engineering at Alphabet Inc., exercised stock options to acquire 8,000 shares at $95.00 per share (grant price), and gifted 2,000 shares to a charitable foundation.

Post-transaction ownership: 45,000 shares.`,
  summaryData: {
    filerName: 'Sarah Johnson',
    relationship: 'VP of Engineering',
    signalStrength: 'Moderate',
    transactions: [
      {
        type: 'Exercise',
        code: 'M',
        shares: '8,000',
        pricePerShare: '$95.00',
        totalValue: '$760,000',
        acquisitionDisposition: 'A',
      },
      {
        type: 'Gift',
        code: 'G',
        shares: '2,000',
        pricePerShare: '$0',
        totalValue: '$0',
        acquisitionDisposition: 'D',
      },
    ],
    percentageChange: '+15.4%',
    previousStake: '39,000 shares',
    newStake: '45,000 shares',
  },
};

// Test 5: Open market purchase (showcases green "purchase" bucket)
const mockPurchaseFiling: FilingTemplateData = {
  companyName: 'Coinbase Global Inc.',
  symbol: 'COIN',
  ticker: 'COIN',
  filingType: 'Form 4',
  filingDate: new Date().toISOString().split('T')[0],
  filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001679788&type=4&dateb=&owner=include&count=40',
  summaryText: `Brian Armstrong, CEO of Coinbase Global Inc., purchased 25,000 shares on the open market at an average price of $205.30 per share, totaling approximately $5.1 million.

This is a notable insider buy, signaling confidence in the company's direction. Post-transaction ownership: 1,250,000 shares.`,
  summaryData: {
    filerName: 'Brian Armstrong',
    relationship: 'CEO',
    signalStrength: 'Strong - Large Position Change',
    transactions: [
      {
        type: 'Purchase',
        code: 'P',
        shares: '25,000',
        pricePerShare: '$205.30',
        totalValue: '$5,132,500',
        acquisitionDisposition: 'A',
      },
    ],
    percentageChange: '+2.0%',
    previousStake: '1,225,000 shares',
    newStake: '1,250,000 shares',
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

  console.log('===== FORM 4 ALL 7 BUCKETS EMAIL TEST =====\n');
  console.log(`Sending test emails to: ${testEmail}\n`);

  const testCases = [
    { name: 'Trust Transfer (blue)', filing: mockTrustTransferFiling, subject: '[TEST] Form 4 Transfer: Apple (AAPL) - Blue bucket' },
    { name: 'Sale + Transfer (red + blue)', filing: mockMixedTransactionFiling, subject: '[TEST] Form 4 Sale+Transfer: NVIDIA (NVDA) - Red+Blue buckets' },
    { name: 'Award + Tax Withholding (amber + slate)', filing: mockAwardFiling, subject: '[TEST] Form 4 Award+Tax: JNJ - Amber+Slate buckets' },
    { name: 'Exercise + Gift (teal + purple)', filing: mockExerciseFiling, subject: '[TEST] Form 4 Exercise+Gift: GOOGL - Teal+Purple buckets' },
    { name: 'Purchase (green)', filing: mockPurchaseFiling, subject: '[TEST] Form 4 Purchase: COIN - Green bucket' },
  ];

  try {
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      console.log(`${i + 1}. Generating ${tc.name} email...`);

      const html = await render(
        React.createElement(Form4MinimalistTemplate, { filing: tc.filing })
      );

      console.log('   Sending email...');
      const result = await resend.emails.send({
        from: 'tldrsec <notifications@tldrsec.app>',
        to: testEmail,
        subject: tc.subject,
        html,
      });

      if (result.error) {
        console.error(`   ERROR:`, result.error);
      } else {
        console.log(`   SUCCESS: Email sent with ID ${result.data?.id}`);
      }

      // Brief pause between sends
      if (i < testCases.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log('\n===== TEST COMPLETED =====');
    console.log('\nPlease check your inbox and verify all 7 buckets:');
    console.log('  1. Transfer (blue) - AAPL trust transfer');
    console.log('  2. Sale (red) + Transfer (blue) - NVDA mixed');
    console.log('  3. Award (amber) + Other/Tax (slate) - JNJ PSU award');
    console.log('  4. Exercise (teal) + Gift (purple) - GOOGL options');
    console.log('  5. Purchase (green) - COIN open market buy');

  } catch (error) {
    console.error('Error sending test email:', error);
    process.exit(1);
  }
}

// Run the test
sendTestEmail();
