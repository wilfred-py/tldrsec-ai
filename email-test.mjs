// Direct test script for email client using ES modules
import { emailClient } from './lib/email/index.js';

async function testEmailDirectly() {
  console.log('Testing direct email sending with Resend client...');
  
  try {
    const result = await emailClient.sendEmail({
      to: 'test@example.com', // Replace with your test email
      subject: 'Test Email from tldrSEC',
      html: '<h1>This is a test email</h1><p>If you receive this, the email client is working correctly!</p>',
      text: 'This is a test email. If you receive this, the email client is working correctly!',
      tags: ['type:test', 'content:verification'],
      replyTo: 'no-reply@tldrsec.app'
    });
    
    console.log('Email send result:', result);
  } catch (error) {
    console.error('Error sending test email:', error);
  }
}

// Run the test
testEmailDirectly().catch(error => {
  console.error('Unhandled error in test script:', error);
  process.exit(1);
});
