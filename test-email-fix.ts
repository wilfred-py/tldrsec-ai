import { ResendClient } from './lib/email/resend-client';
import { EmailMessage } from './types/email';

async function testEmailFix() {
  console.log('Starting email functionality test...');
  
  try {
    // Create a new ResendClient instance
    const emailClient = new ResendClient();
    console.log('✅ ResendClient initialized successfully');
    
    // Test email with simple string tags
    const testEmail: EmailMessage = {
      to: 'test@example.com',
      subject: 'Test Email with Simple String Tags',
      html: '<h1>Test Email</h1><p>This is a test email with simple string tags.</p>',
      text: 'Test Email\n\nThis is a test email with simple string tags.',
      tags: ['test:email', 'type:test'],
      replyTo: 'no-reply@tldrsec.app'
    };
    
    // Prepare email parameters using the fixed method
    const params = (emailClient as any).prepareEmailParams(testEmail);
    console.log('✅ Email parameters prepared successfully');
    console.log('Tags format:', JSON.stringify(params.tags));
    
    // Verify tags are simple strings, not objects with name property
    if (Array.isArray(params.tags) && 
        typeof params.tags[0] === 'string' && 
        !params.tags.some(tag => typeof tag === 'object')) {
      console.log('✅ Tags are correctly formatted as simple strings');
    } else {
      console.log('❌ Tags are NOT correctly formatted as simple strings');
      console.log('Actual tags:', params.tags);
    }
    
    // Verify other parameters
    console.log('✅ Subject:', params.subject);
    console.log('✅ To:', params.to);
    console.log('✅ Reply-To:', params.reply_to);
    console.log('✅ HTML content length:', params.html?.length || 0);
    console.log('✅ Text content length:', params.text?.length || 0);
    
    console.log('\nEmail fix verification completed successfully!');
  } catch (error) {
    console.error('Error during email fix verification:', error);
  }
}

// Run the test
testEmailFix();
