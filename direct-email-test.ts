/**
 * Direct test for email functionality in the tldrSEC application
 * Run with: npx ts-node --project tsconfig.json --require tsconfig-paths/register direct-email-test.ts
 */

import { emailClient } from './lib/email';

async function testDirectEmailSending() {
  console.log('Testing email sending with Resend...');
  
  try {
    console.log('Sending test email...');
    const result = await emailClient.sendEmail({
      to: 'test@example.com', // Replace with your test email
      subject: 'Test Email from tldrSEC',
      html: '<h1>This is a test email</h1><p>If you receive this, the email client is working correctly!</p>',
      text: 'This is a test email. If you receive this, the email client is working correctly!',
      tags: ['type:test', 'content:verification'],
      replyTo: 'no-reply@tldrsec.app'
    });
    
    console.log('Email sent successfully:', result);
  } catch (error) {
    console.error('Error sending test email:', error);
  }
}

// Run the test
console.log('Starting email test...');
testDirectEmailSending()
  .then(() => console.log('Test completed'))
  .catch((error) => {
    console.error('Unhandled error in test:', error);
    process.exit(1);
  });
