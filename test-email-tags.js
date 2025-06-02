// Simple script to test the ResendClient tag formatting

// Import the ResendClient class
const { ResendClient } = require('./lib/email/resend-client');

async function testEmailTags() {
  console.log('Testing email tags formatting...');
  
  const emailClient = new ResendClient();
  
  try {
    // Test with tags to verify they're formatted correctly
    const result = await emailClient.sendEmail({
      to: 'test@example.com',
      subject: 'Test Email Tags',
      html: '<p>This is a test email to verify tags formatting</p>',
      text: 'This is a test email to verify tags formatting',
      tags: ['type:test', 'content:verification'],
      replyTo: 'no-reply@tldrsec.app'
    });
    
    console.log('Email send result:', result);
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error sending test email:', error);
  }
}

// Run the test
testEmailTags();
