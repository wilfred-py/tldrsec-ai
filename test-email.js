// Simple test script to verify email sending with Resend
import { emailClient } from './lib/email/index.js';

async function testEmailSending() {
  try {
    console.log('Testing email sending with fixed tag format...');
    
    const result = await emailClient.sendEmail({
      to: process.env.TEST_EMAIL, // Replace with your test email if you want to actually send
      subject: 'Test Email with Fixed Tags',
      html: '<h1>Test Email</h1><p>This is a test email to verify tag format fix.</p>',
      text: 'Test Email\n\nThis is a test email to verify tag format fix.',
      tags: ['test:email', 'type:verification'],
      replyTo: 'no-reply@tldrsec.app'
    });
    
    console.log('Email send result:', result);
    console.log('Email sending test completed successfully!');
  } catch (error) {
    console.error('Error sending test email:', error);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
  }
}

// Run the test
testEmailSending();
